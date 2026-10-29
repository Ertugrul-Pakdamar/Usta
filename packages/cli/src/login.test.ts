import { readFileSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { credentialsFile, readCredentials, saveCredentials } from "@usta/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LoginIO, runLogin, runLogout } from "./login.js";

let home: string;
const saved = { ...process.env };
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "usta-login-"));
  delete process.env.EVREN_BASE_URL;
  delete process.env.EVREN_API_KEY;
});
afterEach(() => {
  process.env = { ...saved };
});

const io = (answers: string[], secrets: string[] = []) => {
  const out: string[] = [];
  const asked: string[] = [];
  const fake: LoginIO = {
    ask: async (q, fallback) => {
      asked.push(q);
      return answers.shift() ?? fallback ?? "";
    },
    askSecret: async (q) => {
      asked.push(q);
      return secrets.shift() ?? "";
    },
    print: (s) => out.push(s),
  };
  return { fake, out, asked };
};

describe("runLogin", () => {
  it("asks for address and key, saves them privately, applies them to this process, and never prints the key", async () => {
    const { fake, out } = io(["https://gw.example/v1/"], ["sk-live-SECRET-9876"]);
    expect(await runLogin(fake, { home })).toBe(true);
    expect(readCredentials(home)).toEqual({
      EVREN_BASE_URL: "https://gw.example/v1",
      EVREN_API_KEY: "sk-live-SECRET-9876",
    });
    expect(statSync(credentialsFile(home)).mode & 0o777).toBe(0o600);
    expect(process.env.EVREN_API_KEY).toBe("sk-live-SECRET-9876");
    expect(out.join("\n")).not.toContain("SECRET");
    expect(out.join("\n")).toContain("sk-…9876");
  });

  it("flags skip the questions (scripts); extra defaults are saved", async () => {
    const { fake, asked } = io([]);
    await runLogin(fake, {
      home,
      baseUrl: "https://gw/v1",
      apiKey: "k-1234567890",
      model: "m1",
      maxTokens: "4096",
    });
    expect(asked).toEqual([]);
    expect(readCredentials(home)).toMatchObject({
      EVREN_DEFAULT_MODEL: "m1",
      EVREN_DEFAULT_MAX_TOKENS: "4096",
    });
  });

  it("an empty key answer keeps the saved one; an address answer defaults to the saved one", async () => {
    saveCredentials({ EVREN_BASE_URL: "https://old/v1", EVREN_API_KEY: "old-key-123456" }, home);
    const { fake, asked } = io([""], [""]);
    expect(await runLogin(fake, { home })).toBe(true);
    expect(readCredentials(home)).toMatchObject({
      EVREN_BASE_URL: "https://old/v1",
      EVREN_API_KEY: "old-key-123456",
    });
    expect(asked.at(-1)).toContain("old…3456");
  });

  it("re-asks on an invalid address and gives up after three", async () => {
    const { fake, out } = io(["nonsense", "https://ok/v1"], ["key-1234567890"]);
    expect(await runLogin(fake, { home })).toBe(true);
    expect(out.some((l) => l.includes("https://host/v1"))).toBe(true);
    const bad = io(["x", "y", "z"], ["key"]);
    expect(await runLogin(bad.fake, { home })).toBe(false);
    expect(readCredentials(home).EVREN_BASE_URL).toBe("https://ok/v1");
  });

  it("plain http to a remote host needs an explicit yes", async () => {
    const no = io(
      ["http://gw.example/v1", "no", "http://gw.example/v1", "no", "http://gw.example/v1", "no"],
      ["k"],
    );
    expect(await runLogin(no.fake, { home })).toBe(false);
    const yes = io(["http://gw.example/v1", "yes"], ["key-1234567890"]);
    expect(await runLogin(yes.fake, { home })).toBe(true);
  });

  it("no key at all saves nothing", async () => {
    const { fake } = io(["https://gw/v1"], [""]);
    expect(await runLogin(fake, { home })).toBe(false);
    expect(readCredentials(home)).toEqual({});
  });

  it("runs the connection check and reports it; a missing terms acceptance points to `usta terms accept`", async () => {
    const { fake, out } = io([], []);
    await runLogin(fake, {
      home,
      baseUrl: "https://gw/v1",
      apiKey: "key-1234567890",
      verify: async () => [{ name: "Kullanım şartları", ok: false, detail: "kabul edilmemiş" }],
    });
    expect(out.join("\n")).toContain("✗");
  });
});

describe("runLogout", () => {
  it("removes only the key by default, everything with --all", () => {
    saveCredentials({ EVREN_BASE_URL: "https://gw/v1", EVREN_API_KEY: "k" }, home);
    expect(runLogout(false, home)).toBe(true);
    expect(readCredentials(home)).toEqual({ EVREN_BASE_URL: "https://gw/v1" });
    expect(runLogout(true, home)).toBe(true);
    expect(readFileSync(credentialsFile(home), "utf8").trim()).toBe("");
    expect(runLogout(false, home)).toBe(false);
  });
});
