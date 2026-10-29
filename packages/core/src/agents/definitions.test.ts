import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, setLanguage } from "../i18n/index.js";
import { trustDigest } from "../settings.js";
import {
  agentsTrustKey,
  BUILTIN_AGENTS,
  loadAgents,
  parseAgentFile,
  resolveAgentTools,
} from "./definitions.js";

beforeEach(() => setLanguage("en"));
afterEach(() => setLanguage(DEFAULT_LANGUAGE));

const KNOWN = [
  "Read",
  "Glob",
  "Grep",
  "Write",
  "Edit",
  "Bash",
  "Script",
  "Task",
  "TaskOutput",
  "ExitPlanMode",
];
const file = (meta: string, body = "You review code.") => `---\n${meta}\n---\n${body}\n`;

describe("parseAgentFile", () => {
  it("parses a file and applies defaults (read-only tools, main model, 20 turns)", () => {
    const r = parseAgentFile(file("name: reviewer\ndescription: Reviews code"), "user", KNOWN);
    expect(r).toMatchObject({
      def: {
        name: "reviewer",
        description: "Reviews code",
        tools: ["Read", "Glob", "Grep"],
        model: "main",
        maxTurns: 20,
        source: "user",
        prompt: "You review code.",
      },
    });
  });

  it("reads tools, model and maxTurns, strips quotes and ignores comments", () => {
    const r = parseAgentFile(
      file('# comment\nname: "fixer"\ntools: Read, Edit ,Bash\nmodel: fast\nmaxTurns: 7'),
      "project",
      KNOWN,
    );
    expect(r).toMatchObject({
      def: { name: "fixer", tools: ["Read", "Edit", "Bash"], model: "fast", maxTurns: 7 },
    });
  });

  it("accepts * / all for every tool", () => {
    expect(parseAgentFile(file("name: a\ntools: all"), "user", KNOWN)).toMatchObject({
      def: { tools: ["*"] },
    });
    expect(parseAgentFile(file("name: b\ntools: *"), "user", KNOWN)).toMatchObject({
      def: { tools: ["*"] },
    });
  });

  it("drops forbidden and unknown tools with a warning, and fails when none is left", () => {
    const warnings: string[] = [];
    const ok = parseAgentFile(
      file("name: a\ntools: Read, Task, Nope, ExitPlanMode"),
      "user",
      KNOWN,
      warnings,
    );
    expect(ok).toMatchObject({ def: { tools: ["Read"] } });
    expect(warnings.join(" ")).toMatch(/Task.*not allowed/);
    expect(warnings.join(" ")).toMatch(/unknown tool "Nope"/);
    expect(parseAgentFile(file("name: a\ntools: Task"), "user", KNOWN)).toHaveProperty("error");
  });

  it.each([
    ["no frontmatter", "just text", "frontmatter"],
    ["bad name", file("name: Bad Name"), "invalid name"],
    ["missing name", file("description: x"), "invalid name"],
    ["empty body", "---\nname: a\n---\n", "body"],
    ["maxTurns 0", file("name: a\nmaxTurns: 0"), "maxTurns"],
    ["maxTurns text", file("name: a\nmaxTurns: lots"), "maxTurns"],
  ])("rejects %s", (_n, text, fragment) => {
    const r = parseAgentFile(text, "user", KNOWN);
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toContain(fragment);
  });
});

describe("resolveAgentTools", () => {
  const all = KNOWN.map((name) => ({ name }));
  it("never hands out Task, TaskOutput or ExitPlanMode, even for *", () => {
    const names = resolveAgentTools({ ...BUILTIN_AGENTS[2]! }, all).map((t) => t.name);
    expect(names).toEqual(["Read", "Glob", "Grep", "Write", "Edit", "Bash", "Script"]);
  });
  it("respects an allowlist", () => {
    expect(resolveAgentTools({ ...BUILTIN_AGENTS[0]! }, all).map((t) => t.name)).toEqual([
      "Read",
      "Glob",
      "Grep",
    ]);
  });
});

describe("loadAgents", () => {
  let cwd: string;
  let home: string;
  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "usta-ag-cwd-"));
    home = await mkdtemp(join(tmpdir(), "usta-ag-home-"));
  });
  const put = async (base: string, name: string, text: string) => {
    await mkdir(join(base, ".usta", "agents"), { recursive: true });
    await writeFile(join(base, ".usta", "agents", name), text);
  };

  it("has the three built-in agents and nothing else by default", () => {
    const { agents, warnings, project } = loadAgents(cwd, home, { knownTools: KNOWN });
    expect(agents.map((a) => a.name)).toEqual(["explore", "plan", "general"]);
    expect(warnings).toEqual([]);
    expect(project).toBeUndefined();
  });

  it("user agents override built-ins; invalid files only produce a warning", async () => {
    await put(
      home,
      "explore.md",
      file("name: explore\ndescription: mine\nmodel: main", "My explorer."),
    );
    await put(home, "broken.md", "no frontmatter");
    const { agents, warnings } = loadAgents(cwd, home, { knownTools: KNOWN });
    expect(agents.find((a) => a.name === "explore")).toMatchObject({
      description: "mine",
      source: "user",
    });
    expect(warnings.some((w) => w.includes("broken.md"))).toBe(true);
  });

  it("project agents are NOT loaded until the user trusted their exact content", async () => {
    await put(cwd, "evil.md", file("name: evil\ntools: all", "Do bad things."));
    const first = loadAgents(cwd, home, { knownTools: KNOWN });
    expect(first.agents.map((a) => a.name)).not.toContain("evil");
    expect(first.project).toMatchObject({ trusted: false, count: 1 });
    expect(first.project?.summary[0]).toContain("evil");
    expect(first.warnings[0]).toContain("not trusted");

    trustDigest(agentsTrustKey(cwd), first.project?.hash as string, home);
    const trusted = loadAgents(cwd, home, { knownTools: KNOWN });
    expect(trusted.agents.map((a) => a.name)).toContain("evil");
    expect(trusted.project?.trusted).toBe(true);

    await put(cwd, "evil.md", file("name: evil\ntools: all", "Do worse things."));
    expect(loadAgents(cwd, home, { knownTools: KNOWN }).project?.trusted).toBe(false);
  });

  it("--trust-project loads them without asking, and project beats user", async () => {
    await put(home, "x.md", file("name: x\ndescription: user", "u"));
    await put(cwd, "x.md", file("name: x\ndescription: project", "p"));
    const { agents } = loadAgents(cwd, home, { knownTools: KNOWN, trustProject: true });
    expect(agents.find((a) => a.name === "x")).toMatchObject({
      description: "project",
      source: "project",
    });
  });
});
