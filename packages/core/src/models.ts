import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { UstaConfig } from "./config.js";

export interface ModelInfo {
  id: string;
  /** Context window in tokens. */
  contextLength: number;
  maxOutputTokens: number;
  /** Credits per token (unit inferred from the field name; verified against real spend). */
  promptPrice: number;
  completionPrice: number;
  currency: string;
  /** ISO date until which usage is free, when the gateway says so. */
  freeUntil?: string;
  tools: boolean;
  vision: boolean;
}

interface RawModel {
  id?: string;
  context_length?: number;
  default_max_output_tokens?: number;
  pricing?: {
    prompt_token_price?: number;
    completion_token_price?: number;
    currency?: string;
    free_until?: string;
  };
  capabilities?: { tools?: boolean; vision?: boolean };
}

/** Conservative defaults for a model the gateway did not describe. */
export function fallbackModelInfo(id: string): ModelInfo {
  return {
    id,
    contextLength: 131_072,
    maxOutputTokens: 8_192,
    promptPrice: 0,
    completionPrice: 0,
    currency: "CR",
    tools: true,
    vision: false,
  };
}

export function parseModels(body: unknown): ModelInfo[] {
  const data = (body as { data?: RawModel[] } | undefined)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((m): m is RawModel & { id: string } => typeof m.id === "string")
    .map((m) => ({
      ...fallbackModelInfo(m.id),
      ...(m.context_length && { contextLength: m.context_length }),
      ...(m.default_max_output_tokens && { maxOutputTokens: m.default_max_output_tokens }),
      promptPrice: Number(m.pricing?.prompt_token_price ?? 0),
      completionPrice: Number(m.pricing?.completion_token_price ?? 0),
      currency: m.pricing?.currency ?? "CR",
      ...(m.pricing?.free_until && { freeUntil: m.pricing.free_until }),
      tools: m.capabilities?.tools ?? true,
      vision: m.capabilities?.vision ?? false,
    }));
}

export function isFree(model: ModelInfo): boolean {
  return model.promptPrice === 0 && model.completionPrice === 0;
}

interface CacheFile {
  fetchedAt: number;
  baseUrl: string;
  models: ModelInfo[];
}

export interface RegistryOptions {
  home?: string;
  fetchImpl?: typeof fetch;
  ttlMs?: number;
  now?: () => number;
}

/** Model metadata from `/v1/models`, cached on disk; never throws (falls back to defaults). */
export class ModelRegistry {
  private models = new Map<string, ModelInfo>();

  constructor(
    private readonly config: Pick<UstaConfig, "apiKey" | "baseUrl">,
    private readonly opts: RegistryOptions = {},
  ) {}

  private get cachePath() {
    return join(this.opts.home ?? homedir(), ".usta", "cache", "models.json");
  }

  private readCache(): CacheFile | undefined {
    try {
      const cache = JSON.parse(readFileSync(this.cachePath, "utf8")) as CacheFile;
      return cache.baseUrl === this.config.baseUrl ? cache : undefined;
    } catch {
      return undefined;
    }
  }

  async load(): Promise<void> {
    const now = (this.opts.now ?? Date.now)();
    const cache = this.readCache();
    if (cache && now - cache.fetchedAt < (this.opts.ttlMs ?? 3_600_000))
      return this.fill(cache.models);
    try {
      if (!this.config.apiKey) throw new Error("no key");
      const res = await (this.opts.fetchImpl ?? fetch)(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      const models = res.ok ? parseModels(await res.json()) : [];
      if (!models.length) throw new Error("empty");
      this.fill(models);
      mkdirSync(dirname(this.cachePath), { recursive: true, mode: 0o700 });
      writeFileSync(
        this.cachePath,
        JSON.stringify({
          fetchedAt: now,
          baseUrl: this.config.baseUrl,
          models,
        } satisfies CacheFile),
        { mode: 0o600 },
      );
    } catch {
      if (cache) this.fill(cache.models); // stale data beats defaults
    }
  }

  private fill(models: ModelInfo[]) {
    this.models = new Map(models.map((m) => [m.id, m]));
  }

  get(id: string): ModelInfo {
    return this.models.get(id) ?? fallbackModelInfo(id);
  }

  list(): ModelInfo[] {
    return [...this.models.values()];
  }
}
