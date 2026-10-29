import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { t } from "../i18n/index.js";
import { loadPlugins } from "../plugins.js";
import { isDigestTrusted } from "../settings.js";

/** A subagent: its own instructions, tool allowlist and model. */
export interface AgentDefinition {
  name: string;
  /** When to use it; listed in the Task tool description (English, short). */
  description: string;
  tools: string[];
  /** `fast` / `main` or a concrete model id. */
  model: string;
  maxTurns: number;
  prompt: string;
  source: "builtin" | "user" | "project";
}

/** Tools a subagent may never get: no recursion, and plan approval belongs to the main agent. */
export const FORBIDDEN_AGENT_TOOLS = ["Task", "TaskOutput", "ExitPlanMode"];
export const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];
export const DEFAULT_AGENT_MAX_TURNS = 20;
const NAME = /^[a-z][a-z0-9-]{0,39}$/;

const SHARED =
  "Your final message is the ONLY thing the parent agent will see, so make it self-contained.";

export const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    name: "explore",
    description: "read-only code search and exploration",
    tools: READ_ONLY_TOOLS,
    model: "fast",
    maxTurns: DEFAULT_AGENT_MAX_TURNS,
    source: "builtin",
    prompt: `You are a fast code-exploration subagent working for a parent agent. You can only read: use Glob and Grep to locate code and Read to inspect it. You cannot modify anything.
Be efficient: run several searches in parallel and avoid re-reading files. Finish with a concise report of what you found, each point with a file path and line number. Quote at most a few lines of code; never paste whole files.
${SHARED}`,
  },
  {
    name: "plan",
    description: "read-only research that returns an implementation plan",
    tools: READ_ONLY_TOOLS,
    model: "main",
    maxTurns: DEFAULT_AGENT_MAX_TURNS,
    source: "builtin",
    prompt: `You are a planning subagent working for a parent agent. You are read-only: explore the code with Glob, Grep and Read, then return a concrete implementation plan with numbered steps and real file paths, the key design decisions and why, the risks, and how to verify the result. Do not implement anything.
${SHARED}`,
  },
  {
    name: "general",
    description: "all tools, for self-contained multi-step work",
    tools: ["*"],
    model: "main",
    maxTurns: DEFAULT_AGENT_MAX_TURNS,
    source: "builtin",
    prompt: `You are a general-purpose subagent working for a parent agent. Complete the delegated task fully with your tools, then report the outcome concisely: what you did, which files you changed, and anything left unresolved.
${SHARED}`,
  },
];

/** `---` frontmatter (`key: value` lines) and the body after it. */
export function splitFrontmatter(
  text: string,
): { meta: Record<string, string>; body: string } | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return undefined;
  const meta: Record<string, string> = {};
  for (const line of (m[1] as string).split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) meta[kv[1] as string] = (kv[2] as string).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return { meta, body: (m[2] as string).trim() };
}

export type ParseResult = { def: AgentDefinition } | { error: string };

/**
 * Parses one `agents/<name>.md` file. `knownTools` are the tool names that exist; unknown
 * ones are dropped with a warning so a typo cannot silently widen or break an agent.
 */
export function parseAgentFile(
  text: string,
  source: "user" | "project",
  knownTools: readonly string[],
  warnings: string[] = [],
  label = "agent",
): ParseResult {
  const parts = splitFrontmatter(text);
  if (!parts) return { error: t("agents.noFrontmatter", { label }) };
  const { meta, body } = parts;
  const name = meta.name ?? "";
  if (!NAME.test(name)) return { error: t("agents.invalidName", { label, name }) };
  if (!body) return { error: t("agents.emptyBody", { label }) };

  const forbidden = new Set(FORBIDDEN_AGENT_TOOLS);
  const requested =
    meta.tools === undefined
      ? READ_ONLY_TOOLS
      : meta.tools
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  let tools: string[];
  if (requested.length === 1 && (requested[0] === "*" || requested[0] === "all")) {
    tools = ["*"];
  } else {
    tools = [];
    for (const tool of requested) {
      if (forbidden.has(tool)) warnings.push(t("agents.toolForbidden", { label, tool }));
      else if (!knownTools.includes(tool)) warnings.push(t("agents.toolUnknown", { label, tool }));
      else tools.push(tool);
    }
    if (!tools.length) return { error: t("agents.noTools", { label }) };
  }

  const turns =
    meta.maxTurns === undefined ? DEFAULT_AGENT_MAX_TURNS : Number.parseInt(meta.maxTurns, 10);
  if (!Number.isInteger(turns) || turns < 1 || turns > 50) {
    return { error: t("agents.badMaxTurns", { label }) };
  }
  return {
    def: {
      name,
      description: meta.description || `Custom agent "${name}".`,
      tools,
      model: meta.model || "main",
      maxTurns: turns,
      prompt: body,
      source,
    },
  };
}

export interface ProjectAgentsInfo {
  dir: string;
  /** Digest of every agent file, for the trust gate. */
  hash: string;
  count: number;
  trusted: boolean;
  /** One line per agent for the trust prompt. */
  summary: string[];
}

export interface LoadedAgents {
  agents: AgentDefinition[];
  warnings: string[];
  project?: ProjectAgentsInfo;
}

interface RawFile {
  file: string;
  text: string;
}

function readAgentFiles(dir: string): RawFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }));
}

export const agentsTrustKey = (cwd: string) => `${cwd}::agents`;

/**
 * Built-in agents, then `~/.usta/agents`, then `<project>/.usta/agents` (later ones win by name).
 * Project agents come from the repository, so they are only used once the user trusted their
 * exact content (same reasoning as the settings trust gate).
 */
export function loadAgents(
  cwd: string,
  home: string | undefined,
  opts: { knownTools: readonly string[]; trustProject?: boolean },
): LoadedAgents {
  const homeDir = home ?? homedir();
  const warnings: string[] = [];
  const byName = new Map(BUILTIN_AGENTS.map((a) => [a.name, a]));
  const add = (files: RawFile[], source: "user" | "project", where: string) => {
    for (const { file, text } of files) {
      const res = parseAgentFile(text, source, opts.knownTools, warnings, `${where}/${file}`);
      if ("error" in res) warnings.push(res.error);
      else byName.set(res.def.name, res.def);
    }
  };

  for (const p of loadPlugins(homeDir).plugins) {
    add(readAgentFiles(join(p.root, "agents")), "user", `plugin:${p.name}/agents`);
  }
  add(readAgentFiles(join(homeDir, ".usta", "agents")), "user", "~/.usta/agents");

  const projectDir = join(cwd, ".usta", "agents");
  const projectFiles = readAgentFiles(projectDir);
  let project: ProjectAgentsInfo | undefined;
  if (projectFiles.length) {
    const hash = createHash("sha256")
      .update(projectFiles.map((f) => `${f.file}\0${f.text}`).join("\0\0"))
      .digest("hex");
    const trusted =
      opts.trustProject === true || isDigestTrusted(agentsTrustKey(cwd), hash, homeDir);
    const summary = projectFiles.map((f) => {
      const res = parseAgentFile(f.text, "project", opts.knownTools);
      return "def" in res
        ? `agent ${res.def.name}: tools ${res.def.tools.join(", ")}; model ${res.def.model}`
        : `${f.file} (invalid)`;
    });
    project = { dir: projectDir, hash, count: projectFiles.length, trusted, summary };
    if (trusted) add(projectFiles, "project", ".usta/agents");
    else warnings.push(t("agents.untrusted", { dir: projectDir, count: projectFiles.length }));
  }
  return { agents: [...byName.values()], warnings, project };
}

/** The tool allowlist of an agent resolved against the tools that exist (no forbidden ones). */
export function resolveAgentTools<T extends { name: string }>(
  def: AgentDefinition,
  all: readonly T[],
): T[] {
  const forbidden = new Set(FORBIDDEN_AGENT_TOOLS);
  return all.filter(
    (t) => !forbidden.has(t.name) && (def.tools.includes("*") || def.tools.includes(t.name)),
  );
}
