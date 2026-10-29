import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineTool, z } from "@usta/sdk";
import { beforeEach, describe, expect, it } from "vitest";
import { BudgetExceededError } from "../cost.js";
import { MockProvider } from "../provider/mock.js";
import { builtinTools } from "../tools/index.js";
import type { Message } from "../types.js";
import { runAgent } from "./loop.js";

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "usta-"));
});

const base = () => ({ model: "m", tools: builtinTools, cwd });

describe("runAgent", () => {
  it("runs a tool and feeds the result back", async () => {
    await writeFile(join(cwd, "a.txt"), "hello");
    const provider = new MockProvider([
      { toolCalls: [{ name: "Read", args: { path: "a.txt" } }] },
      { text: "done" },
    ]);
    const r = await runAgent("read it", { ...base(), provider });
    expect(r.text).toBe("done");
    expect(r.stopReason).toBe("end_turn");
    expect(r.usage.promptTokens).toBe(20);
    const toolMsg = provider.requests[1]?.messages.at(-1);
    expect(toolMsg).toMatchObject({ role: "tool" });
    expect(JSON.stringify(toolMsg)).toContain("hello");
  });

  it("denies mutating tools without approval", async () => {
    const provider = new MockProvider([
      { toolCalls: [{ name: "Write", args: { path: "x.txt", content: "1" } }] },
      { text: "ok" },
    ]);
    await runAgent("write", { ...base(), provider });
    await expect(readFile(join(cwd, "x.txt"))).rejects.toThrow();
    expect(JSON.stringify(provider.requests[1]?.messages.at(-1))).toContain("izin verilmedi");
  });

  it("runs mutating tools when approved", async () => {
    const provider = new MockProvider([
      { toolCalls: [{ name: "Write", args: { path: "x.txt", content: "1" } }] },
      { text: "ok" },
    ]);
    await runAgent("write", { ...base(), provider, approve: async () => true });
    expect(await readFile(join(cwd, "x.txt"), "utf8")).toBe("1");
  });

  it("returns argument errors to the model instead of throwing", async () => {
    const provider = new MockProvider([
      {
        toolCalls: [
          { name: "Read", args: "{not json" },
          { name: "Read", args: {} },
          { name: "Nope", args: {} },
        ],
      },
      { text: "ok" },
    ]);
    await runAgent("x", { ...base(), provider });
    const tools = provider.requests[1]?.messages.filter((m) => m.role === "tool") ?? [];
    expect(tools).toHaveLength(3);
    expect(JSON.stringify(tools)).toContain("geçerli JSON");
    expect(JSON.stringify(tools)).toContain("Geçersiz argümanlar");
    expect(JSON.stringify(tools)).toContain("Bilinmeyen tool");
  });

  it("runs read-only calls in parallel and keeps result order", async () => {
    const started: string[] = [];
    const slow = defineTool({
      name: "Slow",
      description: "",
      mutating: false,
      input: z.object({ id: z.string(), ms: z.number() }),
      async run({ id, ms }) {
        started.push(id);
        await new Promise((r) => setTimeout(r, ms));
        return id;
      },
    });
    const provider = new MockProvider([
      {
        toolCalls: [
          { name: "Slow", args: { id: "a", ms: 60 } },
          { name: "Slow", args: { id: "b", ms: 1 } },
        ],
      },
      { text: "ok" },
    ]);
    await runAgent("x", { ...base(), tools: [slow], provider });
    expect(started).toEqual(["a", "b"]);
    const out = provider.requests[1]?.messages
      .filter((m) => m.role === "tool")
      .map((m) => m.content);
    expect(out).toEqual(["a", "b"]);
  });

  it("falls back to <tool_call> blocks in text", async () => {
    await writeFile(join(cwd, "a.txt"), "hi");
    const provider = new MockProvider([
      { text: '<tool_call>{"name":"Read","arguments":{"path":"a.txt"}}</tool_call>' },
      { text: "done" },
    ]);
    const r = await runAgent("x", { ...base(), provider });
    expect(r.turns).toBe(2);
    expect(JSON.stringify(provider.requests[1]?.messages)).toContain("hi");
  });

  it("stops at maxTurns", async () => {
    const turn = { toolCalls: [{ name: "Glob", args: { pattern: "*" } }] };
    const r = await runAgent("loop", {
      ...base(),
      provider: new MockProvider([turn, turn, turn]),
      maxTurns: 2,
    });
    expect(r.stopReason).toBe("max_turns");
  });

  it("reports persisted messages via onMessage, excluding the prompt", async () => {
    const seen: string[] = [];
    const provider = new MockProvider([
      { toolCalls: [{ name: "Glob", args: { pattern: "*" } }] },
      { text: "ok" },
    ]);
    await runAgent("x", { ...base(), provider, onMessage: (m) => seen.push(m.role) });
    expect(seen).toEqual(["assistant", "tool", "assistant"]);
  });

  it("returns 'aborted' without the partial reply when the stream is cancelled", async () => {
    const ctl = new AbortController();
    const provider = {
      async *stream() {
        yield { type: "text" as const, delta: "par" };
        ctl.abort();
        throw new Error("aborted");
      },
    };
    const r = await runAgent("x", { ...base(), provider, signal: ctl.signal });
    expect(r.stopReason).toBe("aborted");
    expect(r.messages.at(-1)).toMatchObject({ role: "user" });
  });

  it("appends a volatile tail to each request without storing it in the history", async () => {
    const provider = new MockProvider([
      { toolCalls: [{ name: "Glob", args: { pattern: "*" } }] },
      { text: "ok" },
    ]);
    const r = await runAgent("x", { ...base(), provider, volatileTail: () => "[mode: plan]" });
    for (const req of provider.requests)
      expect(req.messages.at(-1)).toEqual({ role: "user", content: "[mode: plan]" });
    expect(JSON.stringify(r.messages)).not.toContain("[mode: plan]");
  });

  it("re-evaluates the tool list every turn", async () => {
    let plan = true;
    const provider = new MockProvider([
      { toolCalls: [{ name: "Glob", args: { pattern: "*" } }] },
      { text: "ok" },
    ]);
    await runAgent("x", {
      ...base(),
      provider,
      tools: () => (plan ? builtinTools : builtinTools.filter((t) => t.name !== "ExitPlanMode")),
      onEvent: (e) => {
        if (e.type === "tool_start") plan = false;
      },
    });
    const names = (i: number) => provider.requests[i]?.tools?.map((t) => t.name);
    expect(names(0)).toContain("ExitPlanMode");
    expect(names(1)).not.toContain("ExitPlanMode");
  });

  it("lets beforeRequest replace the history, and stops cleanly on a budget error", async () => {
    const provider = new MockProvider([{ text: "ok" }]);
    await runAgent("x", {
      ...base(),
      provider,
      beforeRequest: async ({ messages }) => ({
        messages: [messages[0] as Message, { role: "user", content: "COMPACTED" }],
      }),
    });
    expect(JSON.stringify(provider.requests[0]?.messages)).toContain("COMPACTED");
    expect(JSON.stringify(provider.requests[0]?.messages)).not.toContain('"x"');

    const blocked = new MockProvider([{ text: "never" }]);
    const r = await runAgent("x", {
      ...base(),
      provider: blocked,
      beforeRequest: async () => {
        throw new BudgetExceededError("bütçe doldu");
      },
    });
    expect(r).toMatchObject({ stopReason: "budget", stopDetail: "bütçe doldu" });
    expect(blocked.requests).toHaveLength(0);
  });

  it("limits tool output before it enters the conversation and passes shared state to tools", async () => {
    await writeFile(join(cwd, "a.txt"), "hello");
    const seen: unknown[] = [];
    const state = new Map<string, unknown>([["k", 1]]);
    const probe = defineTool({
      name: "Probe",
      description: "",
      mutating: false,
      input: z.object({}),
      async run(_, ctx) {
        seen.push(ctx.state?.get("k"));
        return "L".repeat(500);
      },
    });
    const provider = new MockProvider([
      { toolCalls: [{ name: "Probe", args: {} }] },
      { text: "ok" },
    ]);
    await runAgent("x", {
      ...base(),
      tools: [probe],
      provider,
      state,
      limitOutput: (_t, _c, out) => out.slice(0, 5),
    });
    expect(seen).toEqual([1]);
    expect(provider.requests[1]?.messages.at(-1)).toMatchObject({ role: "tool", content: "LLLLL" });
  });

  it("reports how many history messages each usage was based on", async () => {
    const sent: number[] = [];
    const provider = new MockProvider([
      { toolCalls: [{ name: "Glob", args: { pattern: "*" } }] },
      { text: "ok" },
    ]);
    await runAgent("x", {
      ...base(),
      provider,
      onEvent: (e) => e.type === "usage" && sent.push(e.sentMessages),
    });
    expect(sent).toEqual([2, 4]); // system+user, then +assistant+tool
  });

  it("hands tools a ctx.review bound to the current call", async () => {
    const seen: string[] = [];
    const batch = defineTool({
      name: "Batch",
      description: "",
      mutating: false,
      input: z.object({}),
      async run(_, ctx) {
        const verdict = await ctx.review?.({ summary: "s", diff: "d", paths: ["/x"] });
        return JSON.stringify(verdict);
      },
    });
    const provider = new MockProvider([
      { toolCalls: [{ name: "Batch", args: {} }] },
      { text: "ok" },
    ]);
    await runAgent("x", {
      ...base(),
      tools: [batch],
      provider,
      review: async (tool, call, req) => (
        seen.push(`${tool.name}:${call.name}:${req.paths[0]}`), { ok: true }
      ),
    });
    expect(seen).toEqual(["Batch:Batch:/x"]);
    expect(provider.requests[1]?.messages.at(-1)).toMatchObject({ content: '{"ok":true}' });
  });

  it("gives tools no review capability when none is configured", async () => {
    const batch = defineTool({
      name: "Batch",
      description: "",
      mutating: false,
      input: z.object({}),
      async run(_, ctx) {
        return String(ctx.review);
      },
    });
    const provider = new MockProvider([
      { toolCalls: [{ name: "Batch", args: {} }] },
      { text: "ok" },
    ]);
    await runAgent("x", { ...base(), tools: [batch], provider });
    expect(provider.requests[1]?.messages.at(-1)).toMatchObject({ content: "undefined" });
  });
});
