import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { loadAgents } from "./agents/definitions.js";
import { loadExtensions } from "./extensions/skills.js";
import { HookRunner } from "./hooks.js";
import {
  installPlugin,
  loadPlugins,
  mergePluginHooks,
  readPluginState,
  removePlugin,
  setPluginEnabled,
} from "./plugins.js";

const repoPlugins = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "plugins");
let home: string;
let src: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "usta-pl-home-"));
  src = await mkdtemp(join(tmpdir(), "usta-pl-src-"));
});

const put = (rel: string, text: string) => {
  const file = join(src, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const yes = async () => true;
const manifest = (extra: object = {}) =>
  put(
    "usta-plugin.json",
    JSON.stringify({ name: "demo", version: "1.0.0", description: "d", ...extra }),
  );

describe("installPlugin", () => {
  it("shows what the plugin contains and installs nothing without a yes", async () => {
    manifest({
      hooks: { Stop: [{ command: "echo stop" }, { module: "h.mjs" }] },
      mcpServers: { db: { command: "node", args: ["db.js"] } },
    });
    put("skills/review/SKILL.md", "---\ndescription: Review\n---\nBody");
    put("commands/go.md", "Go $ARGUMENTS");
    put("agents/helper.md", "---\nname: helper\n---\nPrompt");
    let lines: string[] = [];
    const declined = await installPlugin(src, {
      home,
      confirm: async (info) => {
        lines = info.lines;
        return false;
      },
    });
    expect(declined).toBeUndefined();
    expect(readPluginState(home)).toEqual({});
    expect(lines).toEqual(
      expect.arrayContaining([
        "skill review",
        "command /go",
        "agent helper",
        "hook Stop: echo stop",
        "hook Stop: module h.mjs",
        "mcp db: runs node db.js",
      ]),
    );
  });

  it("copies the plugin (without .git, node_modules or symlinks) and records a digest", async () => {
    manifest();
    put("commands/go.md", "Go");
    put(".git/config", "secret");
    put("node_modules/x/index.js", "x");
    const done = await installPlugin(src, { home, confirm: yes });
    expect(done).toEqual({ name: "demo" });
    const state = readPluginState(home).demo;
    expect(state).toMatchObject({ enabled: true });
    expect(state?.digest).toMatch(/^[0-9a-f]{64}$/);
    const loaded = loadPlugins(home);
    expect(loaded.plugins.map((p) => p.name)).toEqual(["demo"]);
    expect(loaded.warnings).toEqual([]);
  });

  it("rejects a folder with no valid manifest", async () => {
    await expect(installPlugin(src, { home, confirm: yes })).rejects.toThrow("usta-plugin.json");
    put("usta-plugin.json", JSON.stringify({ name: "Bad Name" }));
    await expect(installPlugin(src, { home, confirm: yes })).rejects.toThrow("name");
  });

  it("rejects something that is neither a folder nor a git address", async () => {
    await expect(installPlugin(join(src, "nope"), { home, confirm: yes })).rejects.toThrow("nope");
  });
});

describe("loadPlugins", () => {
  const install = async () => {
    manifest({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", module: "hooks/h.mjs" },
          { command: "${PLUGIN_ROOT}/run.sh" },
        ],
      },
      mcpServers: { db: { command: "node" } },
    });
    put("skills/review/SKILL.md", "---\ndescription: Review things\n---\nBody");
    put("commands/go.md", "---\ndescription: Go\n---\nGo $ARGUMENTS");
    put("agents/helper.md", "---\nname: helper\ndescription: Helps\ntools: Read\n---\nYou help.");
    put("hooks/h.mjs", "export default () => ({ context: 'from-plugin' });");
    await installPlugin(src, { home, confirm: yes });
  };

  it("fills ${PLUGIN_ROOT}, makes module paths absolute and prefixes MCP server names", async () => {
    await install();
    const [p] = loadPlugins(home).plugins;
    expect(p?.hooks.PreToolUse?.[0]?.module).toBe(join(p?.root as string, "hooks", "h.mjs"));
    expect(p?.hooks.PreToolUse?.[1]?.command).toBe(`${p?.root}/run.sh`);
    expect(Object.keys(p?.mcpServers ?? {})).toEqual(["demo-db"]);
  });

  it("feeds skills, commands, agents and hooks into the normal loaders", async () => {
    await install();
    const cwd = await mkdtemp(join(tmpdir(), "usta-pl-cwd-"));
    const ext = loadExtensions(cwd, home);
    expect(ext.skills.map((s) => s.name)).toEqual(["review"]);
    expect(ext.commands.map((c) => c.name)).toEqual(["go"]);
    const agents = loadAgents(cwd, home, { knownTools: ["Read"] });
    expect(agents.agents.map((a) => a.name)).toContain("helper");
    const hooks = mergePluginHooks(loadPlugins(home).plugins);
    const r = await new HookRunner(hooks, cwd).run("PreToolUse", { toolName: "Bash" });
    expect(r.context).toEqual(["from-plugin"]);
  });

  it("a plugin changed on disk after install is skipped with a warning (until reinstalled)", async () => {
    await install();
    appendFileSync(join(home, ".usta", "plugins", "demo", "commands", "go.md"), "\nrm -rf /");
    const r = loadPlugins(home);
    expect(r.plugins).toEqual([]);
    expect(r.warnings[0]).toContain("demo");
    expect(loadExtensions(await mkdtemp(join(tmpdir(), "usta-pl-cwd-")), home).commands).toEqual(
      [],
    );
  });

  it("disable / enable / remove", async () => {
    await install();
    expect(setPluginEnabled("demo", false, home)).toBe(true);
    expect(loadPlugins(home).plugins).toEqual([]);
    expect(setPluginEnabled("demo", true, home)).toBe(true);
    expect(loadPlugins(home).plugins).toHaveLength(1);
    expect(setPluginEnabled("ghost", true, home)).toBe(false);
    expect(removePlugin("demo", home)).toBe(true);
    expect(removePlugin("demo", home)).toBe(false);
    expect(loadPlugins(home).plugins).toEqual([]);
  });

  it("reinstalling replaces the old content and re-approves the new digest", async () => {
    await install();
    put("commands/go.md", "---\ndescription: Go v2\n---\nNew");
    const seen: boolean[] = [];
    await installPlugin(src, {
      home,
      confirm: async (i) => {
        seen.push(i.replacing);
        return true;
      },
    });
    expect(seen).toEqual([true]);
    expect(loadPlugins(home).plugins).toHaveLength(1);
    expect(
      loadExtensions(await mkdtemp(join(tmpdir(), "usta-pl-cwd-")), home).commands[0]?.description,
    ).toBe("Go v2");
  });
});

describe("the example plugins in this repository", () => {
  it("guard-rails: blocks --no-verify, and asks the agent to resolve TODO(usta) markers once", async () => {
    const done = await installPlugin(join(repoPlugins, "guard-rails"), { home, confirm: yes });
    expect(done).toEqual({ name: "guard-rails" });
    const hooks = mergePluginHooks(loadPlugins(home).plugins);
    const cwd = await mkdtemp(join(tmpdir(), "usta-pl-git-"));
    const r = new HookRunner(hooks, cwd);

    const bad = await r.run("PreToolUse", {
      toolName: "Bash",
      toolInput: { command: "git commit --no-verify -m x" },
    });
    expect(bad.blocked?.reason).toContain("--no-verify");
    expect(
      (await r.run("PreToolUse", { toolName: "Bash", toolInput: { command: "git commit -m x" } }))
        .blocked,
    ).toBeUndefined();

    const { execFileSync } = await import("node:child_process");
    const git = (...a: string[]) => execFileSync("git", a, { cwd, stdio: "pipe" });
    git("init", "-q");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
    writeFileSync(join(cwd, "a.txt"), "x");
    git("add", "-N", "a.txt");
    expect((await r.run("Stop", {})).blocked).toBeUndefined();
    writeFileSync(join(cwd, "a.txt"), "x // TODO(usta) fix me\n");
    expect((await r.run("Stop", {})).blocked?.reason).toContain("TODO(usta)");
    expect((await r.run("Stop", { stopHookActive: true })).blocked).toBeUndefined();
    // A brand-new (untracked) file counts too.
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "x");
    writeFileSync(join(cwd, "new.txt"), "TODO(usta) later\n");
    expect((await r.run("Stop", {})).blocked?.reason).toContain("1 TODO(usta)");
  });

  it("commit-helper installs and adds /commit and the commit-style skill", async () => {
    await installPlugin(join(repoPlugins, "commit-helper"), { home, confirm: yes });
    const ext = loadExtensions(await mkdtemp(join(tmpdir(), "usta-pl-cwd-")), home);
    expect(ext.commands.map((c) => c.name)).toEqual(["commit"]);
    expect(ext.skills.map((s) => s.name)).toEqual(["commit-style"]);
  });
});
