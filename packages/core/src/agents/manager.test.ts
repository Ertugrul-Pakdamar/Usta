import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Economy } from "../economy.js";
import { HookRunner } from "../hooks.js";
import { ModelRegistry } from "../models.js";
import { PermissionEngine, type PermissionMode } from "../permissions.js";
import { MockProvider, type MockTurn } from "../provider/mock.js";
import { builtinTools } from "../tools/index.js";
import type { ChatRequest, Provider, ProviderEvent } from "../types.js";
import { type AgentDefinition, BUILTIN_AGENTS } from "./definitions.js";
import { TaskManager } from "./manager.js";
import type { SubagentRuntime } from "./runner.js";
import { createTaskTools } from "./task-tool.js";

const config = { apiKey: "k", baseUrl: "http://gw/v1" };
const agent = (name: string) => BUILTIN_AGENTS.find((a) => a.name === name) as AgentDefinition;
let cwd: string;
let home: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "usta-tm-cwd-"));
  home = await mkdtemp(join(tmpdir(), "usta-tm-home-"));
});

interface Setup {
  manager: TaskManager;
  economy: Economy;
  engine: PermissionEngine;
  rt: SubagentRuntime;
  tools: ReturnType<typeof createTaskTools>;
}

function setup(
  provider: Provider,
  extra: {
    mode?: PermissionMode;
    ask?: SubagentRuntime["ask"];
    maxConcurrent?: number;
    hooks?: HookRunner;
    budget?: { tokens: number };
    allowBackground?: boolean;
  } = {},
): Setup {
  const economy = new Economy({
    config,
    provider,
    registry: new ModelRegistry(config, { home }),
    model: () => "main-model",
    fastModel: () => "fast-model",
    quota: false,
    home,
    budget: extra.budget,
  });
  const engine = new PermissionEngine({ cwd, home, mode: extra.mode });
  const rt: SubagentRuntime = {
    provider,
    cwd,
    engine,
    economy,
    tools: () => [...builtinTools],
    hooks: extra.hooks,
    ask: extra.ask,
    logDir: () => join(home, ".usta", "subagents", "s1"),
  };
  const manager = new TaskManager({
    runtime: rt,
    agents: () => BUILTIN_AGENTS,
    maxConcurrent: extra.maxConcurrent,
    allowBackground: extra.allowBackground,
  });
  return { manager, economy, engine, rt, tools: createTaskTools(manager, BUILTIN_AGENTS) };
}

const run = async (s: Setup, name: string, prompt = "do it", background = false) => {
  const { id, done } = s.manager.start({
    description: "d",
    prompt,
    agent: agent(name),
    background,
  });
  return { id, result: await done };
};

describe("a subagent works in its own context", () => {
  it("sees only its own system prompt and the delegated prompt, with its allowlisted tools and model", async () => {
    const provider = new MockProvider([{ text: "REPORT" }]);
    const s = setup(provider);
    const { result } = await run(s, "explore", "find the auth code");
    const req = provider.requests[0] as ChatRequest;
    expect(req.messages).toHaveLength(2);
    expect(req.messages[0]?.content).toContain("code-exploration subagent");
    expect(req.messages[1]).toEqual({ role: "user", content: "find the auth code" });
    expect(req.tools?.map((t) => t.name)).toEqual(["Read", "Glob", "Grep"]);
    expect(req.model).toBe("fast-model"); // explore routes to models.fast
    expect(result.text).toBe("REPORT");
  });

  it("only the final report goes back to the parent, with a cost note", async () => {
    const s = setup(
      new MockProvider([
        { toolCalls: [{ name: "Glob", args: { pattern: "*" } }] },
        { text: "Found it in src/auth.ts:12" },
      ]),
    );
    const out = await s.tools[0]!.run(
      { description: "find auth", prompt: "where is auth", agent: "explore" },
      { cwd },
    );
    expect(out).toMatch(/^Found it in src\/auth\.ts:12\n\[subagent: 2 turns, 30 tokens\.\]$/);
  });

  it("counts its usage in the session totals without touching the main context measurement", async () => {
    const s = setup(new MockProvider([{ text: "ok" }]));
    await run(s, "explore");
    expect(s.economy.tracker.promptTokens).toBe(10);
    expect(s.economy.tracker.requests).toBe(1);
    expect(s.economy.usageRatio()).toBe(0);
  });

  it("general gets every tool except Task, TaskOutput and ExitPlanMode (no recursion)", async () => {
    const provider = new MockProvider([{ text: "ok" }]);
    await run(setup(provider), "general");
    const names = provider.requests[0]?.tools?.map((t) => t.name) ?? [];
    expect(names).toEqual(["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Script"]);
  });

  it("writes a private transcript with the key masked", async () => {
    process.env.EVREN_API_KEY = "sk-subagent-secret-1234";
    const s = setup(new MockProvider([{ text: "token sk-subagent-secret-1234 leaked?" }]));
    const { id } = await run(s, "explore");
    delete process.env.EVREN_API_KEY;
    const dir = join(home, ".usta", "subagents", "s1");
    expect(await readdir(dir)).toEqual([`${id}.jsonl`]);
    expect(await readFile(join(dir, `${id}.jsonl`), "utf8")).not.toContain("subagent-secret");
  });
});

describe("a subagent goes through the session's permission gate", () => {
  const write = { toolCalls: [{ name: "Write", args: { path: "a.txt", content: "x" } }] };

  it("explore cannot even see Write", async () => {
    const provider = new MockProvider([write, { text: "done" }]);
    await run(setup(provider), "explore");
    expect(JSON.stringify(provider.requests[1]?.messages.at(-1))).toContain("Unknown tool: Write");
  });

  it("plan mode of the main session also binds a general subagent", async () => {
    const provider = new MockProvider([write, { text: "done" }]);
    const s = setup(provider, { mode: "plan" });
    await run(s, "general");
    expect(JSON.stringify(provider.requests[1]?.messages.at(-1))).toContain(
      "Plan mode: changes are not allowed",
    );
    await expect(readFile(join(cwd, "a.txt"))).rejects.toThrow();
  });

  it("a foreground subagent asks the user; a background one cannot and is denied", async () => {
    const asked: string[] = [];
    const ask: SubagentRuntime["ask"] = async (req) => (asked.push(req.tool.name), { allow: true });
    const fg = new MockProvider([write, { text: "done" }]);
    await run(setup(fg, { ask }), "general");
    expect(asked).toEqual(["Write"]);
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("x");

    await writeFile(join(cwd, "a.txt"), "orig");
    const bg = new MockProvider([write, { text: "done" }]);
    const s = setup(bg, { ask });
    asked.length = 0;
    const { id } = s.manager.start({
      description: "d",
      prompt: "p",
      agent: agent("general"),
      background: true,
    });
    await s.manager.wait(id, 5000);
    expect(asked).toEqual([]);
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("orig");
    expect(JSON.stringify(bg.requests[1]?.messages.at(-1))).toContain("approval is needed");
  });

  it("stops at its own turn limit and says so in the report", async () => {
    const loop: MockTurn = { toolCalls: [{ name: "Glob", args: { pattern: "*" } }] };
    const provider = new MockProvider([loop, loop, loop, loop]);
    const s = setup(provider);
    const def = { ...agent("explore"), maxTurns: 2 };
    const { done } = s.manager.start({
      description: "d",
      prompt: "p",
      agent: def,
      background: false,
    });
    const r = await done;
    expect(r.stopReason).toBe("max_turns");
    expect(r.text).toContain("turn limit");
  });

  it("stops when the session budget would be exceeded (it cannot ask)", async () => {
    const provider = new MockProvider([{ text: "never" }]);
    const s = setup(provider, { budget: { tokens: 5 } });
    const { result } = await run(s, "explore");
    expect(result.stopReason).toBe("budget");
    expect(provider.requests).toHaveLength(0);
  });
});

/** A provider that tracks how many streams are open at once. */
function concurrencyProbe(ms = 30) {
  const state = { active: 0, peak: 0 };
  const provider: Provider = {
    async *stream(): AsyncGenerator<ProviderEvent> {
      state.active++;
      state.peak = Math.max(state.peak, state.active);
      await new Promise((r) => setTimeout(r, ms));
      state.active--;
      yield { type: "text", delta: "ok" };
      yield { type: "finish", toolCalls: [], usage: { promptTokens: 1, completionTokens: 1 } };
    },
  };
  return { provider, state };
}

describe("concurrency", () => {
  it("read-only agents run in parallel, up to the limit", async () => {
    const { provider, state } = concurrencyProbe();
    const s = setup(provider, { maxConcurrent: 2 });
    await Promise.all([1, 2, 3, 4].map((n) => run(s, "explore", `q${n}`)));
    expect(state.peak).toBe(2);
  });

  it("agents that can change files take turns, even when slots are free", async () => {
    const { provider, state } = concurrencyProbe();
    const s = setup(provider, { maxConcurrent: 3 });
    await Promise.all([1, 2, 3].map((n) => run(s, "general", `q${n}`)));
    expect(state.peak).toBe(1);
  });

  it("a task waits as 'queued' until a slot frees up", async () => {
    const { provider } = concurrencyProbe(60);
    const s = setup(provider, { maxConcurrent: 1 });
    const a = s.manager.start({
      description: "a",
      prompt: "p",
      agent: agent("explore"),
      background: true,
    });
    const b = s.manager.start({
      description: "b",
      prompt: "p",
      agent: agent("explore"),
      background: true,
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(s.manager.get(a.id)?.status).toBe("running");
    expect(s.manager.get(b.id)?.status).toBe("queued");
    await s.manager.wait(b.id, 5000);
    expect(s.manager.get(b.id)?.status).toBe("done");
  });
});

describe("background tasks", () => {
  it("start returns at once; the finished result is delivered once as a notice", async () => {
    const { provider } = concurrencyProbe(40);
    const s = setup(provider);
    const t0 = Date.now();
    const out = await s.tools[0]!.run(
      { description: "scan", prompt: "p", agent: "explore", background: true },
      { cwd },
    );
    expect(Date.now() - t0).toBeLessThan(30);
    expect(out).toContain("Started background task t1");
    expect(s.manager.drainNotices()).toEqual([]); // still running
    await s.manager.wait("t1", 5000);
    const notices = s.manager.drainNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]?.content).toContain(
      '<task-notification id="t1" agent="explore" status="done"',
    );
    expect(s.manager.drainNotices()).toEqual([]); // not repeated
  });

  it("TaskOutput can wait for a task and marks it as reported", async () => {
    const { provider } = concurrencyProbe(40);
    const s = setup(provider);
    await s.tools[0]!.run(
      { description: "scan", prompt: "p", agent: "explore", background: true },
      { cwd },
    );
    const waiting = await s.tools[1]!.run({ id: "t1" }, { cwd });
    expect(waiting).toContain("is running");
    const out = await s.tools[1]!.run({ id: "t1", wait_seconds: 5 }, { cwd });
    expect(out).toContain("is done");
    expect(out).toContain("ok");
    expect(s.manager.drainNotices()).toEqual([]);
    expect(await s.tools[1]!.run({ id: "nope" }, { cwd })).toContain('No task with id "nope"');
  });

  it("can be stopped, and stopping a finished task does nothing", async () => {
    const provider: Provider = {
      async *stream(req): AsyncGenerator<ProviderEvent> {
        await new Promise((resolve) =>
          req.signal?.addEventListener("abort", resolve, { once: true }),
        );
        throw new Error("aborted");
      },
    };
    const s = setup(provider);
    const { id } = s.manager.start({
      description: "d",
      prompt: "p",
      agent: agent("explore"),
      background: true,
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(s.manager.stop(id)).toBe(true);
    await s.manager.wait(id, 5000);
    expect(s.manager.get(id)?.status).toBe("cancelled");
    expect(s.manager.stop(id)).toBe(false);
    expect(s.manager.stop("nope")).toBe(false);
  });

  it("is not cancelled when the parent run is aborted, but a foreground task is", async () => {
    const blocker: Provider = {
      async *stream(req): AsyncGenerator<ProviderEvent> {
        await new Promise((r) => setTimeout(r, 40));
        if (req.signal?.aborted) throw new Error("aborted");
        yield { type: "text", delta: "ok" };
        yield { type: "finish", toolCalls: [] };
      },
    };
    const s = setup(blocker);
    const parent = new AbortController();
    const bg = s.manager.start(
      { description: "bg", prompt: "p", agent: agent("explore"), background: true },
      parent.signal,
    );
    const fg = s.manager.start(
      { description: "fg", prompt: "p", agent: agent("explore"), background: false },
      parent.signal,
    );
    parent.abort();
    await s.manager.wait(bg.id, 5000);
    await s.manager.wait(fg.id, 5000);
    expect(s.manager.get(bg.id)?.status).toBe("done");
    expect(s.manager.get(fg.id)?.status).toBe("cancelled");
  });

  it("headless mode ignores `background` and runs in the foreground", async () => {
    const s = setup(new MockProvider([{ text: "REPORT" }]), { allowBackground: false });
    const out = await s.tools[0]!.run(
      { description: "d", prompt: "p", agent: "explore", background: true },
      { cwd },
    );
    expect(out).toContain("REPORT");
  });
});

describe("the Task tool", () => {
  it("lists the agents in its description and rejects an unknown agent", async () => {
    const s = setup(new MockProvider([]));
    const [task] = s.tools;
    expect(task?.description).toMatch(/explore \(read-only code search/);
    expect(task?.description).toMatch(/general \(all tools/);
    await expect(
      task!.run({ description: "d", prompt: "p", agent: "ghost" }, { cwd }),
    ).rejects.toThrow('Unknown agent "ghost". Available: explore, plan, general');
  });

  it("permission rules match the agent name, and it is not 'mutating' so explorers run in parallel", () => {
    const s = setup(new MockProvider([]));
    const engine = new PermissionEngine({ cwd, home, deny: ["Task(general)"] });
    const task = s.tools[0]!;
    expect(task.mutating).toBe(false);
    expect(engine.decide(task, { description: "d", prompt: "p", agent: "general" }).decision).toBe(
      "deny",
    );
    expect(engine.decide(task, { description: "d", prompt: "p", agent: "explore" }).decision).toBe(
      "allow",
    );
    expect(engine.decide(task, { description: "d", prompt: "p" }).decision).toBe("deny"); // default agent is general
  });

  it("reports the subagent's progress while it runs", async () => {
    const s = setup(
      new MockProvider([
        { toolCalls: [{ name: "Glob", args: { pattern: "*.ts" } }] },
        { text: "ok" },
      ]),
    );
    const seen: string[] = [];
    await s.tools[0]!.run(
      { description: "d", prompt: "p", agent: "explore" },
      { cwd, progress: (t) => seen.push(t) },
    );
    expect(seen).toContain("Glob(*.ts)");
  });
});

describe("SubagentStop hook", () => {
  it("runs when a subagent finishes, with its agent, description and report", async () => {
    const out = join(home, "hook.json");
    const hooks = new HookRunner({ SubagentStop: [{ command: `cat > ${out}` }] }, cwd);
    const s = setup(new MockProvider([{ text: "THE REPORT" }]), { hooks });
    await run(s, "explore");
    for (let i = 0; i < 50; i++) {
      try {
        const payload = JSON.parse(await readFile(out, "utf8"));
        expect(payload).toMatchObject({
          event: "SubagentStop",
          agent: "explore",
          description: "d",
          result: "THE REPORT",
        });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 40));
      }
    }
    throw new Error("hook did not run");
  });
});
