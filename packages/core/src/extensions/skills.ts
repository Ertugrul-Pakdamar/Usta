import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineTool, ToolError, z } from "@usta/sdk";
import { splitFrontmatter } from "../agents/definitions.js";
import { t } from "../i18n/index.js";
import { loadPlugins } from "../plugins.js";
import { isDigestTrusted } from "../settings.js";

const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_BODY = 20_000;

/** Instructions the model loads on demand (`Skill` tool); only name + description are always visible. */
export interface SkillDefinition {
  name: string;
  description: string;
  body: string;
  source: "user" | "project";
}

/** A prompt template the user runs with `/name args`. */
export interface CommandDefinition {
  name: string;
  description: string;
  template: string;
  source: "user" | "project";
}

export interface ProjectExtensionsInfo {
  dir: string;
  hash: string;
  trusted: boolean;
  /** One line per skill/command for the trust prompt. */
  summary: string[];
}

export interface LoadedExtensions {
  skills: SkillDefinition[];
  commands: CommandDefinition[];
  warnings: string[];
  project?: ProjectExtensionsInfo;
}

export const extensionsTrustKey = (cwd: string) => `${cwd}::skills`;

type Raw = { id: string; kind: "skill" | "command"; text: string };

function readRaw(root: string, label: string): Raw[] {
  const out: Raw[] = [];
  const skills = join(root, "skills");
  if (existsSync(skills)) {
    for (const dir of readdirSync(skills).sort()) {
      const file = join(skills, dir, "SKILL.md");
      if (existsSync(file))
        out.push({ id: `${label}/skills/${dir}`, kind: "skill", text: readFileSync(file, "utf8") });
    }
  }
  const commands = join(root, "commands");
  if (existsSync(commands)) {
    for (const f of readdirSync(commands).sort()) {
      if (f.endsWith(".md"))
        out.push({
          id: `${label}/commands/${f}`,
          kind: "command",
          text: readFileSync(join(commands, f), "utf8"),
        });
    }
  }
  return out;
}

/** Name used when the file has no `name:`: the directory (skill) or file name (command). */
const fallbackName = (id: string) => (id.split("/").pop() ?? "").replace(/\.md$/, "").toLowerCase();

export function parseExtension(
  raw: Raw,
  source: "user" | "project",
): { skill: SkillDefinition } | { command: CommandDefinition } | { error: string } {
  const parts = splitFrontmatter(raw.text);
  const meta = parts?.meta ?? {};
  const body = (parts?.body ?? raw.text).trim();
  const name = meta.name ?? fallbackName(raw.id);
  if (!NAME.test(name)) return { error: t("ext.invalidName", { label: raw.id, name }) };
  if (!body) return { error: t("ext.emptyBody", { label: raw.id }) };
  const description = (meta.description ?? "").trim();
  if (raw.kind === "skill") {
    if (!description) return { error: t("ext.noDescription", { label: raw.id }) };
    return { skill: { name, description, body: body.slice(0, MAX_BODY), source } };
  }
  return { command: { name, description: description || name, template: body, source } };
}

/**
 * `~/.usta` then `<project>/.usta` (project wins by name). Project files come from the
 * repository and steer the model, so they only load once the user trusted their exact content.
 */
export function loadExtensions(
  cwd: string,
  home: string | undefined,
  opts: { trustProject?: boolean } = {},
): LoadedExtensions {
  const homeDir = home ?? homedir();
  const warnings: string[] = [];
  const skills = new Map<string, SkillDefinition>();
  const commands = new Map<string, CommandDefinition>();
  const add = (files: Raw[], source: "user" | "project") => {
    for (const raw of files) {
      const res = parseExtension(raw, source);
      if ("error" in res) warnings.push(res.error);
      else if ("skill" in res) skills.set(res.skill.name, res.skill);
      else commands.set(res.command.name, res.command);
    }
  };
  // Installed, still-approved plugins come first, so the user's and the project's own files win.
  for (const p of loadPlugins(homeDir).plugins) add(readRaw(p.root, `plugin:${p.name}`), "user");
  add(readRaw(join(homeDir, ".usta"), "~/.usta"), "user");

  const projectRoot = join(cwd, ".usta");
  const projectFiles = readRaw(projectRoot, ".usta");
  let project: ProjectExtensionsInfo | undefined;
  if (projectFiles.length) {
    const hash = createHash("sha256")
      .update(projectFiles.map((f) => `${f.id}\0${f.text}`).join("\0\0"))
      .digest("hex");
    const trusted =
      opts.trustProject === true || isDigestTrusted(extensionsTrustKey(cwd), hash, homeDir);
    const summary = projectFiles.map((f) => {
      const res = parseExtension(f, "project");
      if ("error" in res) return `${f.id} (invalid)`;
      return "skill" in res
        ? `skill ${res.skill.name}: ${res.skill.description.slice(0, 80)}`
        : `command /${res.command.name}`;
    });
    project = { dir: projectRoot, hash, trusted, summary };
    if (trusted) add(projectFiles, "project");
    else warnings.push(t("ext.untrusted", { dir: projectRoot, count: projectFiles.length }));
  }
  return { skills: [...skills.values()], commands: [...commands.values()], warnings, project };
}

/** Fills `$ARGUMENTS`; without the placeholder the arguments are appended. */
export function expandCommand(cmd: CommandDefinition, args: string): string {
  if (cmd.template.includes("$ARGUMENTS")) return cmd.template.replaceAll("$ARGUMENTS", args);
  return args ? `${cmd.template}\n\n${args}` : cmd.template;
}

/**
 * The `Skill` tool. Its description lists every skill, so it is fixed for the session
 * (stable cacheable prefix). Returns no tool at all when there are no skills.
 */
export function createSkillTool(skills: SkillDefinition[]) {
  if (!skills.length) return undefined;
  const list = skills.map((s) => `${s.name} (${s.description.slice(0, 90)})`).join("; ");
  return defineTool({
    name: "Skill",
    description: `Load the full instructions of a skill, then follow them. Use when a skill's description matches the task. Skills: ${list}.`,
    mutating: false,
    input: z.object({ name: z.string().min(1) }),
    async run({ name }) {
      const skill = skills.find((s) => s.name === name);
      if (!skill) {
        throw new ToolError(
          `Unknown skill "${name}". Available: ${skills.map((s) => s.name).join(", ")}`,
        );
      }
      return skill.body;
    },
  });
}
