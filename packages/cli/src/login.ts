import {
  type Check,
  type CredentialKey,
  credentialsFile,
  maskKey,
  readCredentials,
  saveCredentials,
  t,
  validateBaseUrl,
} from "@usta/core";

export interface LoginIO {
  ask(question: string, fallback?: string): Promise<string>;
  /** Reads a secret without echoing it. */
  askSecret(question: string): Promise<string>;
  print(text: string): void;
}

export interface LoginOptions {
  home?: string;
  /** Values given as flags; they are not asked for again. */
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: string;
  /** Probes the gateway with the saved values (the doctor checks). Skipped when absent. */
  verify?: () => Promise<Check[]>;
}

/**
 * `usta login`: asks for the gateway address and API key, saves them privately in
 * `~/.usta/credentials` and checks the connection. The key is never printed.
 * Returns false when the user gave up.
 */
export async function runLogin(io: LoginIO, opts: LoginOptions = {}): Promise<boolean> {
  const current = readCredentials(opts.home);
  const currentEnv = (k: string) => current[k] ?? process.env[k];
  io.print(t("login.intro", { file: credentialsFile(opts.home) }));

  let baseUrl = opts.baseUrl;
  for (let tries = 0; baseUrl === undefined && tries < 3; tries++) {
    const answer = (await io.ask(t("login.baseUrl"), currentEnv("EVREN_BASE_URL"))).trim();
    const problem = answer ? validateBaseUrl(answer) : "invalid";
    if (!problem) baseUrl = answer;
    else if (problem === "insecure") {
      io.print(t("login.insecure"));
      if (/^(e|evet|y|yes)$/i.test((await io.ask(t("login.insecureConfirm"))).trim())) {
        baseUrl = answer;
      }
    } else io.print(t("login.invalidUrl"));
  }
  if (!baseUrl) {
    io.print(t("login.cancelled"));
    return false;
  }
  const urlProblem = validateBaseUrl(baseUrl);
  if (urlProblem === "invalid") {
    io.print(t("login.invalidUrl"));
    return false;
  }

  let apiKey = opts.apiKey;
  if (apiKey === undefined) {
    const existing = currentEnv("EVREN_API_KEY");
    const hint = existing ? t("login.keepKey", { key: maskKey(existing) }) : "";
    apiKey = (await io.askSecret(`${t("login.apiKey")}${hint}`)).trim() || existing;
  }
  if (!apiKey) {
    io.print(t("login.cancelled"));
    return false;
  }

  const values: Partial<Record<CredentialKey, string>> = {
    EVREN_BASE_URL: baseUrl.replace(/\/+$/, ""),
    EVREN_API_KEY: apiKey,
  };
  if (opts.model) values.EVREN_DEFAULT_MODEL = opts.model;
  if (opts.maxTokens) values.EVREN_DEFAULT_MAX_TOKENS = opts.maxTokens;
  const file = saveCredentials(values, opts.home);
  // The running process uses the new values from now on.
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
  io.print(t("login.saved", { file, key: maskKey(apiKey) }));

  if (opts.verify) {
    const checks = await opts.verify();
    for (const c of checks) io.print(`${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);
    if (checks.some((c) => !c.ok && c.name === t("doctor.terms.name")))
      io.print(t("login.termsHint"));
  }
  return true;
}

/** `usta logout`: forgets the saved API key (and, with `all`, the address and defaults too). */
export function runLogout(all: boolean, home?: string): boolean {
  const had = Object.keys(readCredentials(home));
  if (!had.length) return false;
  saveCredentials(
    all
      ? {
          EVREN_API_KEY: null,
          EVREN_BASE_URL: null,
          EVREN_DEFAULT_MODEL: null,
          EVREN_DEFAULT_MAX_TOKENS: null,
        }
      : { EVREN_API_KEY: null },
    home,
  );
  return true;
}
