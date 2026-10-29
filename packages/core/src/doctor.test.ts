import { describe, expect, it } from "vitest";
import { runDoctor } from "./doctor.js";

const config = { apiKey: "k", baseUrl: "https://x/v1", model: "m", maxTokens: undefined };

describe("runDoctor", () => {
  it("reports unaccepted terms without calling accept", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ error: { code: "terms_not_accepted" } }), {
        status: 403,
      });
    }) as typeof fetch;
    const checks = await runDoctor(config, fake);
    expect(checks.find((c) => c.name === "Kullanım şartları")?.ok).toBe(false);
    expect(calls.every((u) => !u.includes("/terms/accept"))).toBe(true);
  });

  it("stops early and says so when the gateway address is missing", async () => {
    const never = (async () => {
      throw new Error("must not be called");
    }) as typeof fetch;
    const checks = await runDoctor({ ...config, baseUrl: "" }, never);
    expect(checks.find((c) => c.name === "Gateway adresi")?.ok).toBe(false);
  });
});
