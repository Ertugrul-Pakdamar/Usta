import { describe, expect, it } from "vitest";
import { acceptTerms, fetchTerms } from "./terms.js";

const config = { apiKey: "k", baseUrl: "https://x/v1", model: "m", maxTokens: undefined };

describe("terms", () => {
  it("fetches the terms text", async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ version: 1, content: "metin" }))) as typeof fetch;
    expect(await fetchTerms(config, fake)).toEqual({ version: 1, content: "metin" });
  });

  it("posts the version to /terms/accept with the bearer key", async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const fake = (async (url: string, init?: RequestInit) => {
      seen = { url: String(url), init };
      return new Response("{}");
    }) as typeof fetch;
    await acceptTerms(config, 1, fake);
    expect(seen?.url).toBe("https://x/v1/terms/accept");
    expect(seen?.init?.method).toBe("POST");
    expect(seen?.init?.body).toBe('{"version":1}');
    expect((seen?.init?.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("surfaces gateway errors", async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ error: { message: "yetkisiz" } }), {
        status: 403,
      })) as typeof fetch;
    await expect(acceptTerms(config, 1, fake)).rejects.toThrow("yetkisiz");
  });
});
