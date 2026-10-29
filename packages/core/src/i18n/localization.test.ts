import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineTool, z } from "@usta/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { type AgentEvent, runAgent } from "../agent/loop.js";
import { runDoctor } from "../doctor.js";
import { PermissionEngine } from "../permissions.js";
import { MockProvider } from "../provider/mock.js";
import { OpenAICompatibleProvider } from "../provider/openai-compatible.js";
import { loadSettings } from "../settings.js";
import { builtinTools } from "../tools/index.js";
import { DEFAULT_LANGUAGE, setLanguage, tl } from "./index.js";

afterEach(() => setLanguage(DEFAULT_LANGUAGE));

describe("user-facing messages follow the language", () => {
  it("doctor", async () => {
    const config = { apiKey: undefined, baseUrl: "", model: "m", maxTokens: undefined };
    setLanguage("en");
    const en = await runDoctor(config);
    expect(en.map((c) => c.detail)).toEqual([
      "EVREN_API_KEY is not set (run `usta login`)",
      "EVREN_BASE_URL is not set (run `usta login`)",
    ]);
    setLanguage("tr");
    const tr = await runDoctor(config);
    expect(tr[0]?.detail).toBe("EVREN_API_KEY tanımlı değil (`usta login` çalıştırın)");
  });

  it("gateway configuration errors", () => {
    setLanguage("en");
    expect(() => new OpenAICompatibleProvider({ apiKey: undefined, baseUrl: "x" })).toThrow(
      "EVREN_API_KEY is not set.",
    );
    setLanguage("tr");
    expect(() => new OpenAICompatibleProvider({ apiKey: "k", baseUrl: "" })).toThrow(
      "EVREN_BASE_URL tanımlı değil",
    );
  });

  it("settings errors", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "usta-l10n-"));
    const home = await mkdtemp(join(tmpdir(), "usta-l10n-home-"));
    await writeFile(join(cwd, ".usta-bad"), "");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(cwd, ".usta"));
    await writeFile(join(cwd, ".usta", "settings.local.json"), "{oops");
    setLanguage("en");
    expect(() => loadSettings(cwd, home)).toThrow("is not valid JSON");
    setLanguage("tr");
    expect(() => loadSettings(cwd, home)).toThrow("geçerli JSON değil");
  });

  it("reads the language setting from a settings file", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "usta-l10n-"));
    const home = await mkdtemp(join(tmpdir(), "usta-l10n-home-"));
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(home, ".usta"));
    await writeFile(join(home, ".usta", "settings.json"), JSON.stringify({ language: "en" }));
    expect(loadSettings(cwd, home).language).toBe("en");
    await writeFile(join(home, ".usta", "settings.json"), JSON.stringify({ language: "xx" }));
    expect(() => loadSettings(cwd, home)).toThrow();
  });
});

describe("permission decisions", () => {
  it("carry an English reason for the model and a translatable key for the user", () => {
    const engine = new PermissionEngine({ cwd: "/tmp", deny: ["Bash(rm:*)"] });
    const bash = builtinTools.find((t) => t.name === "Bash") as (typeof builtinTools)[number];
    const verdict = engine.decide(bash, { command: "rm x" });
    expect(verdict).toMatchObject({ decision: "deny", reason: "Denied by rule: Bash(rm:*)" });
    const key = (verdict as { reasonKey: Parameters<typeof tl>[0] }).reasonKey;
    setLanguage("en");
    expect(tl(key)).toBe("Blocked by rule: Bash(rm:*)");
    setLanguage("tr");
    expect(tl(key)).toBe("Kural engelledi: Bash(rm:*)");
  });
});

describe("denied tool calls", () => {
  const probe = defineTool({
    name: "Probe",
    description: "",
    mutating: true,
    input: z.object({}),
    run: async () => "x",
  });

  async function denied(lang: "tr" | "en") {
    setLanguage(lang);
    const events: AgentEvent[] = [];
    const provider = new MockProvider([
      { toolCalls: [{ name: "Probe", args: {} }] },
      { text: "ok" },
    ]);
    await runAgent("x", {
      provider,
      model: "m",
      tools: [probe],
      cwd: "/tmp",
      approve: async () => ({
        allow: false,
        reason: "the user declined",
        reasonKey: { key: "perm.userDeclined" },
      }),
      onEvent: (e) => events.push(e),
    });
    const result = events.find((e) => e.type === "tool_result") as Extract<
      AgentEvent,
      { type: "tool_result" }
    >;
    return { result, sent: JSON.stringify(provider.requests[1]?.messages.at(-1)) };
  }

  it("the model always gets English; the user sees their language", async () => {
    const en = await denied("en");
    expect(en.result.display).toBe("Probe was not allowed: You declined.");
    expect(en.sent).toContain("Probe was not allowed: the user declined");
    const tr = await denied("tr");
    expect(tr.result.display).toBe("Probe çağrısına izin verilmedi: Reddettiniz.");
    expect(tr.sent).toContain("Probe was not allowed: the user declined"); // unchanged by the UI language
  });
});
