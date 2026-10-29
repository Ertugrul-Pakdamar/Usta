import { describe, expect, it } from "vitest";
import { CostTracker, checkBudget, estimateCr, fetchQuota } from "./cost.js";
import { fallbackModelInfo } from "./models.js";

const model = { ...fallbackModelInfo("m"), promptPrice: 0.001, completionPrice: 0.002 };

describe("CostTracker", () => {
  it("accumulates usage, cache ratio and estimated credits", () => {
    const t = new CostTracker();
    t.add({ promptTokens: 1000, completionTokens: 100, cachedTokens: 800 }, model);
    t.add({ promptTokens: 1000, completionTokens: 100, cachedTokens: 0 }, model);
    expect(t.totalTokens).toBe(2200);
    expect(t.cacheRatio).toBe(0.4);
    expect(t.estimatedCr).toBeCloseTo(2 * estimateCr(model, 1000, 100));
  });

  it("derives real spend from the balance delta", () => {
    const t = new CostTracker();
    expect(t.spentCr).toBeUndefined();
    t.setQuota({ remainingCr: 1010 });
    t.setQuota({ remainingCr: 1009.25 });
    expect(t.spentCr).toBeCloseTo(0.75);
  });
});

describe("checkBudget", () => {
  const t = new CostTracker();
  t.add({ promptTokens: 700, completionTokens: 100 });

  it("is ok, warns at 80%, and fails over the limit", () => {
    expect(checkBudget({ tokens: 10_000 }, t, 100, model).level).toBe("ok");
    expect(checkBudget({ tokens: 1_000 }, t, 50, model).level).toBe("warn");
    expect(checkBudget({ tokens: 1_000 }, t, 300, model)).toMatchObject({
      level: "exceeded",
      kind: "tokens",
    });
  });

  it("has no opinion without limits and counts credits too", () => {
    expect(checkBudget({}, t, 10 ** 9, model).level).toBe("ok");
    expect(checkBudget({ cr: 0.5 }, t, 1000, model)).toMatchObject({
      level: "exceeded",
      kind: "cr",
    });
  });
});

describe("fetchQuota", () => {
  const config = { apiKey: "k", baseUrl: "http://gw/v1" };
  it("maps the gateway fields, accepting numeric strings", async () => {
    const fake = (async () =>
      new Response(
        JSON.stringify({
          remaining_cr: "1010.0000",
          daily_remaining_tokens: 14984085,
          daily_limit_tokens: 15000000,
          level: "ok",
        }),
      )) as typeof fetch;
    expect(await fetchQuota(config, fake)).toMatchObject({
      remainingCr: 1010,
      dailyRemainingTokens: 14984085,
      level: "ok",
    });
  });

  it("is undefined on failure", async () => {
    const off = (async () => {
      throw new Error("x");
    }) as typeof fetch;
    expect(await fetchQuota(config, off)).toBeUndefined();
  });
});
