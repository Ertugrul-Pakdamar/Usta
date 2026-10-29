import { describe, expect, it } from "vitest";
import { GatewayTokenCounter, TokenEstimator, toCountPayload } from "./tokens.js";

describe("TokenEstimator", () => {
  it("calibrates toward the observed chars-per-token ratio", () => {
    const e = new TokenEstimator(3.2);
    for (let i = 0; i < 20; i++) e.calibrate(4000, 1000); // real ratio is 4
    expect(e.ratio).toBeGreaterThan(3.9);
    expect(e.text("x".repeat(400))).toBeGreaterThanOrEqual(100);
    expect(e.text("x".repeat(400))).toBeLessThanOrEqual(102);
  });

  it("ignores tiny samples and clamps absurd ones", () => {
    const e = new TokenEstimator(3.2);
    e.calibrate(50, 5);
    expect(e.ratio).toBe(3.2);
    for (let i = 0; i < 50; i++) e.calibrate(100_000, 10);
    expect(e.ratio).toBeLessThanOrEqual(6);
  });
});

describe("toCountPayload", () => {
  it("separates system, merges consecutive tool results, and keeps tool calls as blocks", () => {
    const p = toCountPayload({
      model: "m",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "1", name: "Read", arguments: '{"path":"a"}' },
            { id: "2", name: "Glob", arguments: "{oops" },
          ],
        },
        { role: "tool", toolCallId: "1", content: "A" },
        { role: "tool", toolCallId: "2", content: "B" },
      ],
      tools: [{ name: "Read", description: "d", parameters: { type: "object" } }],
    });
    expect(p.system).toBe("sys");
    expect(p.messages).toHaveLength(3);
    expect(p.messages[1]?.content).toEqual([
      { type: "tool_use", id: "1", name: "Read", input: { path: "a" } },
      { type: "tool_use", id: "2", name: "Glob", input: {} },
    ]);
    expect((p.messages[2]?.content as unknown[]).length).toBe(2);
    expect(p.tools?.[0]).toMatchObject({ name: "Read", input_schema: { type: "object" } });
  });
});

describe("GatewayTokenCounter", () => {
  const config = { apiKey: "k", baseUrl: "http://gw/v1" };
  it("returns the server count", async () => {
    const fake = (async () => new Response(JSON.stringify({ input_tokens: 42 }))) as typeof fetch;
    expect(
      await new GatewayTokenCounter(config, fake).count({
        model: "m",
        messages: [{ role: "user", content: "x" }],
      }),
    ).toBe(42);
  });

  it("returns undefined instead of throwing when unavailable", async () => {
    const bad = (async () => new Response("no", { status: 500 })) as typeof fetch;
    const off = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const req = { model: "m", messages: [] };
    expect(await new GatewayTokenCounter(config, bad).count(req)).toBeUndefined();
    expect(await new GatewayTokenCounter(config, off).count(req)).toBeUndefined();
  });
});
