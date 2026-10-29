import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { isFree, ModelRegistry, parseModels } from "./models.js";

const body = {
  data: [
    {
      id: "m1",
      context_length: 262144,
      default_max_output_tokens: 16384,
      pricing: {
        prompt_token_price: 0,
        completion_token_price: 0,
        currency: "CR",
        free_until: "2026-12-01",
      },
      capabilities: { tools: true, vision: true },
    },
  ],
};
const config = { apiKey: "k", baseUrl: "http://gw/v1" };
let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "usta-models-"));
});

describe("parseModels", () => {
  it("maps the gateway fields", () => {
    const [m] = parseModels(body);
    expect(m).toMatchObject({
      id: "m1",
      contextLength: 262144,
      maxOutputTokens: 16384,
      freeUntil: "2026-12-01",
      vision: true,
    });
    expect(isFree(m as never)).toBe(true);
  });

  it("tolerates garbage", () => {
    expect(parseModels(null)).toEqual([]);
    expect(parseModels({ data: [{ nope: 1 }] })).toEqual([]);
  });
});

describe("ModelRegistry", () => {
  const ok = (calls: string[]) =>
    (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify(body));
    }) as typeof fetch;

  it("fetches once, then serves from the disk cache", async () => {
    const calls: string[] = [];
    await new ModelRegistry(config, { home, fetchImpl: ok(calls) }).load();
    const second = new ModelRegistry(config, { home, fetchImpl: ok(calls) });
    await second.load();
    expect(calls).toHaveLength(1);
    expect(second.get("m1").contextLength).toBe(262144);
  });

  it("falls back to stale cache, then to defaults, and never throws", async () => {
    await new ModelRegistry(config, { home, fetchImpl: ok([]), now: () => 0 }).load();
    const failing = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const stale = new ModelRegistry(config, { home, fetchImpl: failing, now: () => 10 ** 12 });
    await stale.load();
    expect(stale.get("m1").contextLength).toBe(262144);
    const fresh = new ModelRegistry(config, {
      home: await mkdtemp(join(tmpdir(), "usta-m2-")),
      fetchImpl: failing,
    });
    await fresh.load();
    expect(fresh.get("unknown").contextLength).toBeGreaterThan(0);
  });
});
