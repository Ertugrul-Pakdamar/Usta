import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  commandCoveredByAllow,
  commandMatchesAny,
  PermissionEngine,
  type PermissionMode,
  parseRule,
} from "./permissions.js";
import {
  bashTool,
  editTool,
  exitPlanModeTool,
  globTool,
  readTool,
  writeTool,
} from "./tools/index.js";

describe("parseRule", () => {
  it("parses bare and scoped rules", () => {
    expect(parseRule("Read")).toEqual({ raw: "Read", tool: "Read" });
    expect(parseRule("Bash(git status:*)")).toEqual({
      raw: "Bash(git status:*)",
      tool: "Bash",
      spec: "git status:*",
    });
    expect(parseRule("mcp__srv__tool")?.tool).toBe("mcp__srv__tool");
  });

  it("rejects malformed rules", () => {
    expect(parseRule("Bash(")).toBeUndefined();
    expect(parseRule("")).toBeUndefined();
  });
});

describe("Bash allow rules", () => {
  const allow = ["git status:*", "git diff:*"];

  it.each([
    ["git status", true],
    ["git status -s", true],
    ["git status && git diff HEAD", true],
    ["git status 2>&1", true],
    ["git statusx", false],
    ["git status; rm -rf /", false],
    ["git status && rm x", false],
    ["git status\nrm x", false],
    ["git status | sh", false],
    ["git status $(rm x)", false],
    ["git status `rm x`", false],
    ["git status > ~/.bashrc", false],
    ["(git status)", false],
    ["FOO=1 git status", false],
    ["", false],
  ])("allow-covered(%j) = %s", (cmd, expected) => {
    expect(commandCoveredByAllow(allow, cmd)).toBe(expected);
  });

  it("exact rules match only the exact command", () => {
    expect(commandCoveredByAllow(["npm test"], "npm test")).toBe(true);
    expect(commandCoveredByAllow(["npm test"], "npm test --foo")).toBe(false);
  });
});

describe("Bash deny/ask rules", () => {
  it.each([
    ["rm -rf x", true],
    ["ls && rm a", true],
    ["echo $(rm -rf x)", true],
    ["echo `rm x`", true],
    ["ls | xargs rm", false], // `xargs rm` is not the prefix `rm`; known limit of prefix rules
    ["rmdir x", false],
    ["echo rm", false],
  ])("deny(rm:*) vs %j = %s", (cmd, expected) => {
    expect(commandMatchesAny(["rm:*"], cmd)).toBe(expected);
  });
});

let cwd: string;
let home: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "usta-perm-"));
  home = await mkdtemp(join(tmpdir(), "usta-perm-home-"));
});

const engine = (
  mode: PermissionMode,
  extra: { allow?: string[]; deny?: string[]; ask?: string[] } = {},
) => new PermissionEngine({ cwd, home, mode, ...extra });

describe("MCP tool rules", () => {
  const mcpTool = (name: string, mutating = true) =>
    ({ name, mutating, description: "", input: {} }) as never;

  it("`mcp__server` covers every tool of that server, and only that server", () => {
    const e = engine("default", { allow: ["mcp__gh"], deny: ["mcp__gh__delete_repo"] });
    expect(e.decide(mcpTool("mcp__gh__create_issue"), {}).decision).toBe("allow");
    expect(e.decide(mcpTool("mcp__gh__delete_repo"), {}).decision).toBe("deny");
    expect(e.decide(mcpTool("mcp__ghost__x"), {}).decision).toBe("ask");
    expect(e.decide(mcpTool("mcp__other__x"), {}).decision).toBe("ask");
  });

  it("a specific tool rule does not cover its siblings; unknown MCP tools ask by default", () => {
    const e = engine("default", { allow: ["mcp__gh__list_issues"] });
    expect(e.decide(mcpTool("mcp__gh__list_issues"), {}).decision).toBe("allow");
    expect(e.decide(mcpTool("mcp__gh__create_issue"), {}).decision).toBe("ask");
  });
});

describe("path rules", () => {
  it("deny Read(.env) matches in any directory and via ./", () => {
    const e = engine("default", { deny: ["Read(.env)"] });
    for (const p of [".env", "./.env", "sub/dir/.env", join(cwd, ".env"), "/elsewhere/.env"]) {
      expect(e.decide(readTool, { path: p }).decision, p).toBe("deny");
    }
    expect(e.decide(readTool, { path: ".env.example" }).decision).toBe("allow");
  });

  it("deny follows symlinks to the protected file", async () => {
    await writeFile(join(cwd, ".env"), "SECRET=1");
    await symlink(join(cwd, ".env"), join(cwd, "innocent.txt"));
    const e = engine("default", { deny: ["Read(.env)"] });
    expect(e.decide(readTool, { path: "innocent.txt" }).decision).toBe("deny");
  });

  it("a symlink pointing outside the project counts as outside", async () => {
    const outside = await mkdtemp(join(tmpdir(), "usta-out-"));
    await writeFile(join(outside, "x.txt"), "hi");
    await symlink(outside, join(cwd, "link"));
    expect(engine("default").decide(readTool, { path: "link/x.txt" }).decision).toBe("ask");
  });

  it("scoped globs: Edit(src/**)", async () => {
    await mkdir(join(cwd, "src"));
    const e = engine("default", { allow: ["Edit(src/**)"] });
    expect(e.decide(editTool, { path: "src/a/b.ts" }).decision).toBe("allow");
    expect(e.decide(editTool, { path: "lib/b.ts" }).decision).toBe("ask");
  });

  it("~ expands to the home directory", () => {
    const e = engine("default", { deny: ["Read(~/.ssh/**)"] });
    expect(e.decide(readTool, { path: join(home, ".ssh", "id_rsa") }).decision).toBe("deny");
  });
});

describe("modes", () => {
  it("default: reads allowed, writes and bash ask, outside-cwd reads ask", () => {
    const e = engine("default");
    expect(e.decide(readTool, { path: "a.ts" }).decision).toBe("allow");
    expect(e.decide(globTool, { pattern: "*" }).decision).toBe("allow");
    expect(e.decide(writeTool, { path: "a.ts", content: "" }).decision).toBe("ask");
    expect(e.decide(bashTool, { command: "ls" }).decision).toBe("ask");
    expect(e.decide(readTool, { path: "/etc/hostname" }).decision).toBe("ask");
  });

  it("acceptEdits: edits inside cwd pass; bash and outside paths still ask", () => {
    const e = engine("acceptEdits");
    expect(e.decide(editTool, { path: "a.ts", old_string: "a", new_string: "b" }).decision).toBe(
      "allow",
    );
    expect(e.decide(writeTool, { path: "/tmp/outside-usta.txt", content: "" }).decision).toBe(
      "ask",
    );
    expect(e.decide(bashTool, { command: "ls" }).decision).toBe("ask");
  });

  it("auto: edits inside cwd pass; bash and outside paths go to the classifier", () => {
    const e = engine("auto");
    expect(e.decide(writeTool, { path: "a.ts", content: "" }).decision).toBe("allow");
    expect(e.decide(readTool, { path: "a.ts" }).decision).toBe("allow");
    expect(e.decide(bashTool, { command: "pnpm test" }).decision).toBe("classify");
    expect(e.decide(writeTool, { path: "/tmp/outside-usta.txt", content: "" }).decision).toBe(
      "classify",
    );
    expect(e.decide(readTool, { path: "/etc/hostname" }).decision).toBe("classify");
  });

  it("auto: deny rules, ask rules and protected paths never reach the classifier", () => {
    const e = engine("auto", { deny: ["Bash(rm:*)"], ask: ["Bash(git push:*)"] });
    expect(e.decide(bashTool, { command: "rm -rf x" }).decision).toBe("deny");
    expect(e.decide(bashTool, { command: "git push" }).decision).toBe("ask");
    expect(e.decide(writeTool, { path: ".git/config", content: "" }).decision).toBe("ask");
    expect(e.decide(writeTool, { path: ".usta/settings.json", content: "" }).decision).toBe("ask");
  });

  it("plan: mutating tools are denied, reads allowed, ExitPlanMode asks", () => {
    const e = engine("plan", { allow: ["Bash", "Write"] });
    expect(e.decide(writeTool, { path: "a", content: "" })).toMatchObject({ decision: "deny" });
    expect(e.decide(bashTool, { command: "ls" })).toMatchObject({ decision: "deny" });
    expect(e.decide(readTool, { path: "a" }).decision).toBe("allow");
    expect(e.decide(exitPlanModeTool, { plan: "x" }).decision).toBe("ask");
  });

  it("ExitPlanMode is rejected outside plan mode", () => {
    expect(engine("default").decide(exitPlanModeTool, { plan: "x" }).decision).toBe("deny");
  });

  it("bypass allows everything except deny rules", () => {
    const e = engine("bypass", { deny: ["Bash(rm:*)", "Read(.env)"] });
    expect(e.decide(bashTool, { command: "ls" }).decision).toBe("allow");
    expect(e.decide(bashTool, { command: "rm -rf x" }).decision).toBe("deny");
    expect(e.decide(readTool, { path: ".env" }).decision).toBe("deny");
  });

  it("deny beats allow; ask beats allow", () => {
    const e = engine("default", {
      allow: ["Bash"],
      deny: ["Bash(rm:*)"],
      ask: ["Bash(git push:*)"],
    });
    expect(e.decide(bashTool, { command: "ls" }).decision).toBe("allow");
    expect(e.decide(bashTool, { command: "rm a" }).decision).toBe("deny");
    expect(e.decide(bashTool, { command: "git push origin" }).decision).toBe("ask");
  });

  it("writes to .usta/ and .git/ always ask, except in bypass", () => {
    const e = engine("acceptEdits", { allow: ["Write"] });
    expect(e.decide(writeTool, { path: ".usta/settings.json", content: "" }).decision).toBe("ask");
    expect(
      e.decide(editTool, { path: "x/.git/hooks/pre-commit", old_string: "a", new_string: "b" })
        .decision,
    ).toBe("ask");
    expect(
      engine("bypass").decide(writeTool, { path: ".usta/settings.json", content: "" }).decision,
    ).toBe("allow");
  });

  it("session rules and mode changes take effect and notify", () => {
    const e = engine("default");
    const seen: string[] = [];
    e.onModeChange((m) => seen.push(m));
    e.addRule("allow", "Bash(npm test)");
    expect(e.decide(bashTool, { command: "npm test" }).decision).toBe("allow");
    e.setMode("plan");
    expect(seen).toEqual(["plan"]);
  });
});

describe("saved tool outputs", () => {
  it("can be re-read without a prompt, but not written to", () => {
    const e = engine("default");
    const saved = join(home, ".usta", "outputs", "s1", "call_1.txt");
    expect(e.decide(readTool, { path: saved }).decision).toBe("allow");
    expect(e.decide(writeTool, { path: saved, content: "" }).decision).toBe("ask");
    expect(e.decide(readTool, { path: join(home, ".usta", "settings.json") }).decision).toBe("ask");
  });
});
