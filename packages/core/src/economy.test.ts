import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { BudgetExceededError } from "./cost.js";
import { Economy, type EconomyOptions } from "./economy.js";
import { ModelRegistry } from "./models.js";
import { MockProvider, type MockTurn } from "./provider/mock.js";
import type { Message, ToolSpec } from "./types.js";

const config = { apiKey: "k", baseUrl: "http://gw/v1" };
let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "usta-eco-"));
});

async function make(
  contextLength: number,
  turns: MockTurn[] = [],
  extra: Partial<EconomyOptions> = {},
) {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({ data: [{ id: "m", context_length: contextLength }] }),
    )) as typeof fetch;
  const registry = new ModelRegistry(config, { home, fetchImpl });
  await registry.load();
  const provider = new MockProvider(turns);
  const warnings: string[] = [];
  const compacted: number[] = [];
  const eco = new Economy({
    config,
    provider,
    registry,
    model: () => "m",
    quota: false,
    home,
    onWarning: (t) => warnings.push(t),
    onCompact: (r) => compacted.push(r.keepFrom),
    ...extra,
  });
  return { eco, provider, warnings, compacted };
}

const sys: Message = { role: "system", content: "sys" };
const convo = (turns: number, size = 400): Message[] =>
  Array.from(
    { length: turns },
    (_, i) =>
      [
        { role: "user", content: `q${i} ${"x".repeat(size)}` },
        { role: "assistant", content: `a${i} ${"y".repeat(size)}` },
      ] as Message[],
  ).flat();
const tools: ToolSpec[] = [];

describe("Economy.project", () => {
  it("estimates from scratch, then builds on the last exact usage", async () => {
    const { eco } = await make(100_000);
    const msgs = [sys, ...convo(2)];
    const scratch = eco.project(msgs, tools);
    expect(scratch).toBeGreaterThan(100);
    eco.recordUsage({ promptTokens: 1000, completionTokens: 50 }, 3);
    expect(eco.project(msgs, tools)).toBe(1050 + eco.estimator.messages(msgs.slice(4)));
    expect(eco.usageRatio()).toBeCloseTo(1050 / 100_000);
  });

  it("falls back to a full estimate when the history got shorter (rewind)", async () => {
    const { eco } = await make(100_000);
    eco.recordUsage({ promptTokens: 9000, completionTokens: 50 }, 20);
    expect(eco.project([sys, ...convo(1)], tools)).toBeLessThan(9000);
  });
});

describe("Economy.beforeRequest compaction", () => {
  it("compacts when the projection crosses the threshold, clears the read cache and reports it", async () => {
    const { eco, compacted } = await make(1_000, [{ text: "SUMMARY" }]);
    eco.state.set("read:/a:1:1", "stamp");
    const msgs = [sys, ...convo(5)];
    const out = await eco.beforeRequest({ messages: msgs, tools });
    expect(out?.messages[0]).toBe(sys);
    expect(out?.messages[1]?.content).toContain("SUMMARY");
    expect(out?.messages.length).toBe(1 + 1 + 4); // sys + summary + last 2 turns
    expect(compacted).toEqual([6]);
    expect(eco.state.has("read:/a:1:1")).toBe(false);
  });

  it("does nothing while under the threshold", async () => {
    const { eco, provider } = await make(1_000_000, [{ text: "x" }]);
    expect(await eco.beforeRequest({ messages: [sys, ...convo(5)], tools })).toBeUndefined();
    expect(provider.requests).toHaveLength(0);
  });

  it("warns and carries on when summarizing fails, without retrying every turn", async () => {
    const failing = {
      async *stream() {
        throw new Error("kota");
      },
    };
    const { eco, warnings } = await make(1_000, [], { provider: failing as never });
    const msgs = [sys, ...convo(5)];
    expect(await eco.beforeRequest({ messages: msgs, tools })).toBeUndefined();
    expect(warnings[0]).toContain("kota");
    await eco.beforeRequest({ messages: msgs, tools });
    expect(warnings).toHaveLength(1);
  });
});

describe("Economy budget", () => {
  const msgs = [sys, ...convo(1, 50)];

  it("stops the run when the token budget would be exceeded", async () => {
    const { eco } = await make(100_000, [], { budget: { tokens: 10 } });
    await expect(eco.beforeRequest({ messages: msgs, tools })).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
  });

  it("asks once; a yes lets the session continue without asking again", async () => {
    let asked = 0;
    const { eco } = await make(100_000, [], {
      budget: { tokens: 10 },
      askBudget: async () => (asked++, true),
    });
    await eco.beforeRequest({ messages: msgs, tools });
    await eco.beforeRequest({ messages: msgs, tools });
    expect(asked).toBe(1);
  });

  it("warns once at 80%", async () => {
    const { eco, warnings } = await make(100_000);
    const projected = eco.project(msgs, tools);
    const limited = await make(100_000, [], { budget: { tokens: Math.ceil(projected / 0.9) } });
    await limited.eco.beforeRequest({ messages: msgs, tools });
    await limited.eco.beforeRequest({ messages: msgs, tools });
    expect(limited.warnings).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });
});

describe("Economy.recordUsage", () => {
  it("calibrates the estimator from the real prompt size", async () => {
    const { eco } = await make(100_000);
    const msgs = [sys, ...convo(10, 1000)];
    await eco.beforeRequest({ messages: msgs, tools });
    const before = eco.estimator.ratio;
    eco.recordUsage({ promptTokens: 8000, completionTokens: 10, cachedTokens: 500 }, msgs.length);
    expect(eco.estimator.ratio).not.toBe(before);
    expect(eco.tracker.cachedTokens).toBe(500);
  });
});

describe("Economy.report", () => {
  const counted = (fail: boolean) =>
    (async (_url: string, init?: RequestInit) => {
      if (fail) throw new Error("offline");
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          input_tokens: body.tools ? (body.messages.length > 1 ? 1000 : 300) : 100,
        }),
      );
    }) as typeof fetch;

  it("splits the window into system, tools and messages using exact counts", async () => {
    const { eco } = await make(10_000, [], { fetchImpl: counted(false) });
    const toolSpec: ToolSpec[] = [{ name: "Read", description: "d", parameters: {} }];
    const r = await eco.report("sys", convo(2), toolSpec);
    expect(r).toMatchObject({
      exact: true,
      system: 100,
      tools: 200,
      messages: 700,
      total: 1000,
      free: 9000,
    });
  });

  it("falls back to estimates when the gateway cannot count", async () => {
    const { eco } = await make(10_000, [], { fetchImpl: counted(true) });
    const r = await eco.report("sys", convo(2), []);
    expect(r.exact).toBe(false);
    expect(r.total).toBe(r.system + r.tools + r.messages);
  });
});

describe("Economy.refreshQuota", () => {
  it("records the balance and warns once when the daily quota is nearly gone", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          remaining_cr: "9.5",
          daily_remaining_tokens: 1000,
          daily_limit_tokens: 100_000,
        }),
      )) as typeof fetch;
    const { eco, warnings } = await make(10_000, [], { fetchImpl, quota: true });
    await eco.refreshQuota();
    await eco.refreshQuota();
    expect(eco.tracker.quota?.remainingCr).toBe(9.5);
    expect(warnings).toHaveLength(1);
  });
});

describe("Economy model and session", () => {
  it("a /model override wins and the output limiter saves under the session directory", async () => {
    const { eco } = await make(10_000);
    expect(eco.modelId).toBe("m");
    eco.setModel("other");
    expect(eco.modelId).toBe("other");
    const call = { id: "c1", name: "Bash", arguments: "{}" };
    const tool = { name: "Bash" } as never;
    expect(eco.limitOutput(tool, call, "z".repeat(20_000))).toContain("characters omitted. ]"); // no session yet
    eco.setSession("sess1");
    expect(eco.limitOutput(tool, call, "z".repeat(20_000))).toContain(
      join(home, ".usta", "outputs", "sess1", "c1.txt"),
    );
  });
});
