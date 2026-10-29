import { mkdtemp, readFile } from "node:fs/promises";
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
