import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { HookRunner } from "./hooks.js";

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "usta-hook-"));
});

const runner = (def: object, event = "PreToolUse") =>
  new HookRunner({ [event]: [def] } as never, cwd);

describe("HookRunner", () => {
  it("passes the event as JSON on stdin", async () => {
    const r = runner({ command: "cat > payload.json" });
    await r.run("PreToolUse", { toolName: "Bash", toolInput: { command: "ls" } });
    const payload = JSON.parse(await readFile(join(cwd, "payload.json"), "utf8"));
    expect(payload).toMatchObject({
      event: "PreToolUse",
      toolName: "Bash",
      toolInput: { command: "ls" },
    });
  });

  it("exit 2 blocks with stderr as the reason", async () => {
    const r = await runner({ command: "echo yasak >&2; exit 2" }).run("PreToolUse", {
      toolName: "Bash",
    });
    expect(r.blocked).toEqual({ reason: "yasak" });
  });

  it("stdout JSON can block or add context", async () => {
    expect(
      (await runner({ command: `echo '{"decision":"block","reason":"x"}'` }).run("PreToolUse", {}))
        .blocked?.reason,
    ).toBe("x");
    expect(
      (await runner({ command: `echo '{"context":"bilgi"}'` }).run("PreToolUse", {})).context,
    ).toEqual(["bilgi"]);
  });

  it("plain stdout becomes context only for prompt/session events", async () => {
    const r = await runner({ command: "echo merhaba" }, "UserPromptSubmit").run(
      "UserPromptSubmit",
      { prompt: "x" },
    );
    expect(r.context).toEqual(["merhaba"]);
    expect((await runner({ command: "echo merhaba" }).run("PreToolUse", {})).context).toEqual([]);
  });

  it("other failures are warnings, not blocks", async () => {
    const r = await runner({ command: "exit 1" }).run("PreToolUse", {});
    expect(r.blocked).toBeUndefined();
    expect(r.warnings[0]).toContain("çıkış 1");
  });

  it("kills a hook that exceeds its timeout", async () => {
    const r = await runner({ command: "sleep 30", timeout: 0.2 }).run("PreToolUse", {});
    expect(r.warnings[0]).toContain("zaman aşımı");
  });

  it("matcher is an anchored regex on the tool name", async () => {
    const r = runner({ matcher: "Write|Edit", command: "exit 2" });
    expect((await r.run("PreToolUse", { toolName: "Write" })).blocked).toBeDefined();
    expect((await r.run("PreToolUse", { toolName: "Bash" })).blocked).toBeUndefined();
    expect((await r.run("PreToolUse", { toolName: "WriteX" })).blocked).toBeUndefined();
  });

  it("survives a hook that never reads stdin", async () => {
    const r = await runner({ command: "exit 0" }).run("PreToolUse", {
      toolInput: "x".repeat(1_000_000),
    });
    expect(r.blocked).toBeUndefined();
  });
});

describe("module hooks", () => {
  const mod = async (body: string, name = "hook.mjs") => {
    await writeFile(join(cwd, name), body);
    return name;
  };

  it("get the event object, can add context, and resolve relative to the working directory", async () => {
    const file = await mod(
      "export default (e) => ({ context: `saw ${e.toolName} in ${e.event}` });",
    );
    const r = await runner({ module: file }).run("PreToolUse", { toolName: "Bash" });
    expect(r.context).toEqual(["saw Bash in PreToolUse"]);
    expect(r.blocked).toBeUndefined();
  });

  it("can block (sync or async)", async () => {
    const file = await mod(
      'export default async (e) => (e.toolInput.command.includes("--no-verify") ? { decision: "block", reason: "no skipping hooks" } : undefined);',
    );
    const r = runner({ module: file });
    expect(
      (
        await r.run("PreToolUse", {
          toolName: "Bash",
          toolInput: { command: "git commit --no-verify" },
        })
      ).blocked?.reason,
    ).toBe("no skipping hooks");
    expect(
      (await r.run("PreToolUse", { toolName: "Bash", toolInput: { command: "git commit" } }))
        .blocked,
    ).toBeUndefined();
  });

  it("a throwing, missing, export-less or hanging module is a warning, never a crash", async () => {
    const bad = await mod('export default () => { throw new Error("kaboom"); };', "bad.mjs");
    const none = await mod("export const x = 1;", "none.mjs");
    const hang = await mod("export default () => new Promise(() => {});", "hang.mjs");
    expect((await runner({ module: bad }).run("PreToolUse", {})).warnings[0]).toContain("kaboom");
    expect((await runner({ module: none }).run("PreToolUse", {})).warnings[0]).toContain(
      "default export",
    );
    expect((await runner({ module: "missing.mjs" }).run("PreToolUse", {})).warnings).toHaveLength(
      1,
    );
    const t = await runner({ module: hang, timeout: 0.05 }).run("PreToolUse", {});
    expect(t.warnings).toHaveLength(1);
  });

  it("the Stop event carries stopHookActive", async () => {
    const file = await mod("export default (e) => ({ context: String(e.stopHookActive) });");
    const r = await runner({ module: file }, "Stop").run("Stop", { stopHookActive: true });
    expect(r.context).toEqual(["true"]);
  });
});
