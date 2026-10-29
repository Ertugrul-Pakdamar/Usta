import { describe, expect, it } from "vitest";
import type { Message } from "./types.js";
import { analyzeAssistantText, repeatedShare, VerbosityGuard } from "./verbosity.js";

const long = (seed: string, n = 80) =>
  Array.from({ length: n }, (_, i) => `${seed}${i % 17}`).join(" ");
const asst = (content: string, tools = false): Message => ({
  role: "assistant",
  content,
  ...(tools && { toolCalls: [{ id: "1", name: "Read", arguments: "{}" }] }),
});

describe("repeatedShare", () => {
  it("is 1 for a restatement, ~0 for new text, 0 for short text", () => {
    const a = long("alpha");
    expect(repeatedShare(a, [a])).toBe(1);
    expect(repeatedShare(long("zeta", 90), [a])).toBeLessThan(0.1);
    expect(repeatedShare("too short", [a])).toBe(0);
  });
});

describe("analyzeAssistantText", () => {
  it("counts characters and the share that repeats earlier messages", () => {
    const a = long("alpha");
    const r = analyzeAssistantText([asst(a), asst(a), asst(long("zeta"))]);
    expect(r.chars).toBe(a.length * 2 + long("zeta").length);
    expect(r.repeatRatio).toBeGreaterThan(0.3);
    expect(r.repeatRatio).toBeLessThan(0.4);
    expect(analyzeAssistantText([asst(a)]).repeatRatio).toBe(0);
  });
});

describe("VerbosityGuard", () => {
  it("flags a repeated message once, then stays quiet for one call", () => {
    const g = new VerbosityGuard();
    const a = long("alpha");
    g.observe(asst(a, true));
    expect(g.take()).toBeUndefined();
    g.observe(asst(a, true));
    expect(g.take()).toContain("repeated");
    g.observe(asst(a, true));
    expect(g.take()).toBeUndefined(); // cooldown
    expect(g.take()).toContain("repeated");
  });

  it("flags long commentary between tool calls, but not a long final answer", () => {
    const g = new VerbosityGuard();
    g.observe(asst(long("beta", 400), false));
    expect(g.take()).toBeUndefined();
    g.observe(asst(long("gamma", 400), true));
    expect(g.take()).toContain("between tool calls");
  });

  it("ignores user and tool messages", () => {
    const g = new VerbosityGuard();
    g.observe({ role: "user", content: long("u", 400) });
    expect(g.take()).toBeUndefined();
  });
});
