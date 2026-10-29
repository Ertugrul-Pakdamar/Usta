import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { runAgent } from "./agent/loop.js";
import { CheckpointStore } from "./checkpoint.js";
import { type AskAnswer, type AskRequest, createAfterTool, createToolGate } from "./gate.js";
import { HookRunner } from "./hooks.js";
import { PermissionEngine } from "./permissions.js";
import { MockProvider } from "./provider/mock.js";
import { builtinTools } from "./tools/index.js";

let cwd: string;
let home: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "usta-gate-"));
  home = await mkdtemp(join(tmpdir(), "usta-gate-home-"));
});

const setup = (
  opts: {
    mode?: "default" | "plan" | "acceptEdits";
    deny?: string[];
    allow?: string[];
    hooks?: object;
    answer?: AskAnswer;
  } = {},
) => {
  const engine = new PermissionEngine({
    cwd,
    home,
    mode: opts.mode,
    deny: opts.deny,
    allow: opts.allow,
  });
  const asked: AskRequest[] = [];
  const hooks = new HookRunner((opts.hooks ?? {}) as never, cwd);
  const gate = createToolGate({
    engine,
    hooks,
    ask: opts.answer ? async (r) => (asked.push(r), opts.answer as AskAnswer) : undefined,
  });
  return { engine, gate, asked, hooks };
};

const run = (turns: ConstructorParameters<typeof MockProvider>[0], s: ReturnType<typeof setup>) => {
  const provider = new MockProvider(turns);
  return runAgent("x", {
    provider,
    model: "m",
    tools: builtinTools,
    cwd,
    approve: s.gate,
    system: () => `mode:${s.engine.mode}`,
  }).then((r) => ({ r, provider }));
};

const toolOutputs = (p: MockProvider) =>
  p.requests
    .at(-1)
    ?.messages.filter((m) => m.role === "tool")
    .map((m) => m.content)
    .join("\n");

describe("createToolGate", () => {
  it("denies by rule without ever asking, and tells the model why", async () => {
    await writeFile(join(cwd, ".env"), "SECRET=1");
    const s = setup({ deny: ["Read(.env)"], answer: { allow: true } });
    const { provider } = await run(
      [{ toolCalls: [{ name: "Read", args: { path: ".env" } }] }, { text: "ok" }],
      s,
    );
    expect(s.asked).toHaveLength(0);
    expect(toolOutputs(provider)).toContain("Denied by rule: Read(.env)");
  });

  it("without an interactive asker, 'ask' becomes a denial", async () => {
    const s = setup();
    const { provider } = await run(
      [{ toolCalls: [{ name: "Write", args: { path: "a", content: "1" } }] }, { text: "ok" }],
      s,
    );
    expect(toolOutputs(provider)).toContain("approval is needed");
    await expect(readFile(join(cwd, "a"))).rejects.toThrow();
  });

  it("a PreToolUse hook can block, and cannot override a deny rule", async () => {
    const blocking = { PreToolUse: [{ matcher: "Write", command: "echo hayır >&2; exit 2" }] };
    const s1 = setup({ hooks: blocking, answer: { allow: true } });
    const { provider } = await run(
      [{ toolCalls: [{ name: "Write", args: { path: "a", content: "1" } }] }, { text: "ok" }],
      s1,
    );
    expect(toolOutputs(provider)).toContain("Blocked by a hook: hayır");

    const allowing = { PreToolUse: [{ command: `echo '{"decision":"allow"}'` }] };
    const s2 = setup({ hooks: allowing, deny: ["Bash(rm:*)"], answer: { allow: true } });
    const { provider: p2 } = await run(
      [{ toolCalls: [{ name: "Bash", args: { command: "rm -rf x" } }] }, { text: "ok" }],
      s2,
    );
    expect(toolOutputs(p2)).toContain("Denied by rule");
  });

  it("remember on a file edit switches to acceptEdits so the next edit does not ask", async () => {
    const s = setup({ answer: { allow: true, remember: true } });
    const call = (n: string) => ({
      toolCalls: [{ name: "Write", args: { path: n, content: "x" } }],
    });
    await run([call("1"), call("2"), { text: "ok" }], s);
    expect(s.asked).toHaveLength(1);
    expect(s.engine.mode).toBe("acceptEdits");
    expect(await readFile(join(cwd, "2"), "utf8")).toBe("x");
  });

  it("remember on Bash allows only that exact command", async () => {
    const s = setup({ answer: { allow: true, remember: true } });
    await run([{ toolCalls: [{ name: "Bash", args: { command: "echo hi" } }] }, { text: "ok" }], s);
    expect(s.engine.listRules().allow).toEqual(["Bash(echo hi)"]);
  });

  it("checkpoints a file right before it is modified", async () => {
    await writeFile(join(cwd, "a.txt"), "old");
    const store = CheckpointStore.open("g1", home);
    store.beginTurn(0, "edit");
    const engine = new PermissionEngine({ cwd, home, mode: "acceptEdits" });
    const gate = createToolGate({ engine, checkpoints: () => store });
    await runAgent("x", {
      provider: new MockProvider([
        { toolCalls: [{ name: "Write", args: { path: "a.txt", content: "new" } }] },
        { text: "ok" },
      ]),
      model: "m",
      tools: builtinTools,
      cwd,
      approve: gate,
    });
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("new");
    store.rewind();
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("old");
  });
});

describe("plan mode through the agent loop", () => {
  const plan = [{ name: "ExitPlanMode", args: { plan: "1. edit a.ts" } }];

  it("blocks writes in plan mode, then switches mode after the plan is approved", async () => {
    const s = setup({ mode: "plan", answer: { allow: true, mode: "acceptEdits" } });
    const { r, provider } = await run(
      [
        { toolCalls: [{ name: "Write", args: { path: "a", content: "1" } }] },
        { toolCalls: plan },
        { toolCalls: [{ name: "Write", args: { path: "a", content: "2" } }] },
        { text: "bitti" },
      ],
      s,
    );
    expect(r.stopReason).toBe("end_turn");
    expect(s.asked[0]).toMatchObject({ kind: "plan", plan: "1. edit a.ts" });
    expect(s.engine.mode).toBe("acceptEdits");
    expect(await readFile(join(cwd, "a"), "utf8")).toBe("2");
    expect(JSON.stringify(provider.requests[1]?.messages)).toContain(
      "Plan mode: changes are not allowed",
    );
  });

  it("re-evaluates the system prompt each turn, so the mode change is visible to the model", async () => {
    const s = setup({ mode: "plan", answer: { allow: true, mode: "default" } });
    const { provider } = await run([{ toolCalls: plan }, { text: "tamam" }], s);
    expect(provider.requests[0]?.messages[0]).toMatchObject({ content: "mode:plan" });
    expect(provider.requests[1]?.messages[0]).toMatchObject({ content: "mode:default" });
  });

  it("a rejected plan keeps plan mode and tells the model to revise", async () => {
    const s = setup({ mode: "plan", answer: { allow: false } });
    const { provider } = await run([{ toolCalls: plan }, { text: "revize" }], s);
    expect(s.engine.mode).toBe("plan");
    expect(toolOutputs(provider)).toContain("revise");
  });
});

describe("createAfterTool", () => {
  it("appends PostToolUse feedback to the tool result", async () => {
    const hooks = new HookRunner(
      { PostToolUse: [{ command: "echo lint hatası >&2; exit 2" }] },
      cwd,
    );
    const engine = new PermissionEngine({ cwd, home, mode: "bypass" });
    const provider = new MockProvider([
      { toolCalls: [{ name: "Glob", args: { pattern: "*" } }] },
      { text: "ok" },
    ]);
    await runAgent("x", {
      provider,
      model: "m",
      tools: builtinTools,
      cwd,
      approve: createToolGate({ engine }),
      afterTool: createAfterTool(hooks),
    });
    expect(toolOutputs(provider)).toContain("[PostToolUse hook] lint hatası");
  });
});
