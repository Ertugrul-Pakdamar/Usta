import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  credentialsFile,
  maskKey,
  readCredentials,
  saveCredentials,
  validateBaseUrl,
} from "./credentials.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "usta-cred-"));
});

describe("saveCredentials", () => {
  it("creates a private file and directory", () => {
    const file = saveCredentials(
      { EVREN_BASE_URL: "https://gw.example/v1", EVREN_API_KEY: "sk-test-1234567890" },
      home,
    );
    expect(file).toBe(credentialsFile(home));
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(home, ".usta")).mode & 0o777).toBe(0o700);
    expect(readCredentials(home)).toEqual({
      EVREN_BASE_URL: "https://gw.example/v1",
      EVREN_API_KEY: "sk-test-1234567890",
    });
  });

  it("updates in place, keeps other variables/comments, and null removes a variable", () => {
    saveCredentials({ EVREN_BASE_URL: "https://a/v1", EVREN_API_KEY: "old" }, home);
    const file = credentialsFile(home);
    const text = readFileSync(file, "utf8");
    // simulate a hand-edited file
    const withExtras = `# my notes\nOTHER=keep\n${text}`;
    writeFileSync(file, withExtras);
    saveCredentials({ EVREN_API_KEY: "new", EVREN_DEFAULT_MODEL: "m" }, home);
    expect(readFileSync(file, "utf8")).toBe(
      "# my notes\nOTHER=keep\nEVREN_BASE_URL=https://a/v1\nEVREN_API_KEY=new\nEVREN_DEFAULT_MODEL=m\n",
    );
    saveCredentials({ EVREN_API_KEY: null }, home);
    expect(readCredentials(home)).toEqual({
      OTHER: "keep",
      EVREN_BASE_URL: "https://a/v1",
      EVREN_DEFAULT_MODEL: "m",
    });
  });

  it("tightens the permissions of an existing, too-open file", () => {
    saveCredentials({ EVREN_API_KEY: "x" }, home);
    chmodSync(credentialsFile(home), 0o644);
    saveCredentials({ EVREN_API_KEY: "y" }, home);
    expect(statSync(credentialsFile(home)).mode & 0o777).toBe(0o600);
  });

  it("reads quoted values and `export` lines", () => {
    mkdirSync(dirname(credentialsFile(home)), { recursive: true });
    writeFileSync(
      credentialsFile(home),
      "export EVREN_API_KEY=\"quoted-key\"\nEVREN_BASE_URL='https://x/v1'\n",
    );
    expect(readCredentials(home)).toEqual({
      EVREN_API_KEY: "quoted-key",
      EVREN_BASE_URL: "https://x/v1",
    });
  });
});

describe("maskKey / validateBaseUrl", () => {
  it("shows only the ends of a key", () => {
    expect(maskKey("sk-abcdefghijklmnop")).toBe("sk-…mnop");
    expect(maskKey("short")).toBe("••••");
  });

  it("accepts https and local http, rejects the rest", () => {
    expect(validateBaseUrl("https://gw.example/v1")).toBeUndefined();
    expect(validateBaseUrl("http://localhost:8080/v1")).toBeUndefined();
    expect(validateBaseUrl("http://gw.example/v1")).toBe("insecure");
    expect(validateBaseUrl("gw.example")).toBe("invalid");
    expect(validateBaseUrl("ftp://gw.example")).toBe("invalid");
  });
});
