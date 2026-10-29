import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Variables `usta login` manages. Anything else in the file is kept as it is. */
export const CREDENTIAL_KEYS = [
  "EVREN_BASE_URL",
  "EVREN_API_KEY",
  "EVREN_DEFAULT_MODEL",
  "EVREN_DEFAULT_MAX_TOKENS",
] as const;
export type CredentialKey = (typeof CREDENTIAL_KEYS)[number];

export const credentialsFile = (home = homedir()) => join(home, ".usta", "credentials");

function parse(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out.set(m[1] as string, (m[2] as string).replace(/^(["'])(.*)\1$/, "$2"));
  }
  return out;
}

/** The saved variables (empty when the file does not exist). */
export function readCredentials(home = homedir()): Record<string, string> {
  const file = credentialsFile(home);
  return existsSync(file) ? Object.fromEntries(parse(readFileSync(file, "utf8"))) : {};
}

/**
 * Merges `values` into `~/.usta/credentials` (private: directory 0700, file 0600). A `null`
 * value removes the variable. Other variables and the order of the file are preserved.
 */
export function saveCredentials(
  values: Partial<Record<CredentialKey, string | null>>,
  home = homedir(),
): string {
  const file = credentialsFile(home);
  const existing = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
  const pending = new Map(Object.entries(values));
  const lines: string[] = [];
  for (const line of existing) {
    const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
    if (key && pending.has(key)) {
      const v = pending.get(key);
      pending.delete(key);
      if (v !== null && v !== undefined) lines.push(`${key}=${v}`);
    } else if (line !== "" || lines.length) lines.push(line);
  }
  while (lines.at(-1) === "") lines.pop();
  for (const [key, v] of pending) if (v !== null && v !== undefined) lines.push(`${key}=${v}`);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${lines.join("\n")}\n`, { mode: 0o600 });
  chmodSync(file, 0o600); // writeFileSync keeps the mode of an existing file
  return file;
}

/** `sk-ab…wxyz`: enough to recognise a key, never enough to use it. */
export function maskKey(key: string): string {
  return key.length <= 8 ? "••••" : `${key.slice(0, 3)}…${key.slice(-4)}`;
}

/** Checks the shape of a gateway address; returns an error text or undefined. */
export function validateBaseUrl(value: string): "invalid" | "insecure" | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "invalid";
  }
  if (url.protocol === "https:") return undefined;
  if (url.protocol === "http:") {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return local ? undefined : "insecure";
  }
  return "invalid";
}
