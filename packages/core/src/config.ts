import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface UstaConfig {
  apiKey: string | undefined;
  /** Gateway address without trailing slash; empty when EVREN_BASE_URL is not set. */
  baseUrl: string;
  model: string;
  maxTokens: number | undefined;
  /** Sent with agent requests (not with the classifier's) to curb repetition; unset = the model's default. */
  frequencyPenalty?: number;
}

/**
 * Loads KEY=VALUE files into process.env without overriding variables that are
 * already set. Order = priority: real environment, ./.env, ~/.usta/credentials.
 */
export function loadEnvFiles(cwd = process.cwd(), home = homedir()): void {
  for (const file of [join(cwd, ".env"), join(home, ".usta", "credentials")]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

/** Reads configuration from the environment (EVREN_* variables). */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): UstaConfig {
  const maxTokens = Number.parseInt(env.EVREN_DEFAULT_MAX_TOKENS ?? "", 10);
  const penalty = Number.parseFloat(env.EVREN_FREQUENCY_PENALTY ?? "");
  return {
    apiKey: env.EVREN_API_KEY || undefined,
    // No built-in default: the gateway address is deployment-specific and never ships in the repo.
    baseUrl: (env.EVREN_BASE_URL ?? "").trim().replace(/\/+$/, ""),
    model: env.EVREN_DEFAULT_MODEL || "qwen3-vl-30b",
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : undefined,
    ...(Number.isFinite(penalty) && { frequencyPenalty: penalty }),
  };
}
