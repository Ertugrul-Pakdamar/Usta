import type { UstaConfig } from "./config.js";
import type { ModelInfo } from "./models.js";
import type { Usage } from "./types.js";

export interface Quota {
  remainingCr?: number;
  heldCr?: number;
  dailyUsedTokens?: number;
  dailyLimitTokens?: number;
  dailyRemainingTokens?: number;
  windowUsedTokens?: number;
  windowCapTokens?: number;
  /** "ok" | "warn" | … as reported by the gateway. */
  level?: string;
  resetAt?: string;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : undefined;
};

/** `GET /v1/quota`. Undefined on any failure: quota is informational, never blocking. */
export async function fetchQuota(
  config: Pick<UstaConfig, "apiKey" | "baseUrl">,
  fetchImpl: typeof fetch = fetch,
): Promise<Quota | undefined> {
  try {
    const res = await fetchImpl(`${config.baseUrl}/quota`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return undefined;
    const q = (await res.json()) as Record<string, unknown>;
    return {
      remainingCr: num(q.remaining_cr),
      heldCr: num(q.held_cr),
      dailyUsedTokens: num(q.daily_used_tokens),
      dailyLimitTokens: num(q.daily_limit_tokens),
      dailyRemainingTokens: num(q.daily_remaining_tokens),
      windowUsedTokens: num(q.used_tokens),
      windowCapTokens: num(q.cap),
      level: typeof q.level === "string" ? q.level : undefined,
      resetAt: typeof q.reset_at === "string" ? q.reset_at : undefined,
    };
  } catch {
    return undefined;
  }
}

export interface BudgetLimits {
  /** Credits. */
  cr?: number;
  /** Total tokens processed (prompt + completion, summed over requests). */
  tokens?: number;
}

export class BudgetExceededError extends Error {}

/** Running totals for one session. */
export class CostTracker {
  promptTokens = 0;
  completionTokens = 0;
  cachedTokens = 0;
  requests = 0;
  /** Sum of price × tokens; an estimate (the gateway's balance delta is the ground truth). */
  estimatedCr = 0;
  quota?: Quota;
  private startRemainingCr?: number;

  add(usage: Usage, model?: ModelInfo): void {
    this.requests++;
    this.promptTokens += usage.promptTokens;
    this.completionTokens += usage.completionTokens;
    this.cachedTokens += usage.cachedTokens ?? 0;
    if (model) this.estimatedCr += estimateCr(model, usage.promptTokens, usage.completionTokens);
  }

  setQuota(q: Quota): void {
    this.quota = q;
    this.startRemainingCr ??= q.remainingCr;
  }

  get totalTokens(): number {
    return this.promptTokens + this.completionTokens;
  }

  /** Share of prompt tokens served from the gateway cache (0..1). */
  get cacheRatio(): number {
    return this.promptTokens ? this.cachedTokens / this.promptTokens : 0;
  }

  /** Credits actually spent this session, from the balance delta. */
  get spentCr(): number | undefined {
    const now = this.quota?.remainingCr;
    return this.startRemainingCr !== undefined && now !== undefined
      ? this.startRemainingCr - now
      : undefined;
  }
}

export function estimateCr(
  model: ModelInfo,
  promptTokens: number,
  completionTokens: number,
): number {
  return promptTokens * model.promptPrice + completionTokens * model.completionPrice;
}

export interface BudgetCheck {
  level: "ok" | "warn" | "exceeded";
  /** What was exceeded or approached, for display (English: i18n layer localizes later). */
  kind?: "tokens" | "cr";
  used?: number;
  limit?: number;
}

/** Checks the session against its limits as if one more request of `projectedPrompt` tokens ran. */
export function checkBudget(
  limits: BudgetLimits,
  tracker: CostTracker,
  projectedPrompt: number,
  model: ModelInfo,
): BudgetCheck {
  const checks: BudgetCheck[] = [];
  if (limits.tokens !== undefined) {
    checks.push({
      kind: "tokens",
      used: tracker.totalTokens + projectedPrompt,
      limit: limits.tokens,
      level: "ok",
    });
  }
  if (limits.cr !== undefined) {
    const sofar = Math.max(tracker.estimatedCr, tracker.spentCr ?? 0);
    checks.push({
      kind: "cr",
      used: sofar + estimateCr(model, projectedPrompt, 0),
      limit: limits.cr,
      level: "ok",
    });
  }
  let worst: BudgetCheck = { level: "ok" };
  for (const c of checks) {
    const ratio = (c.used as number) / (c.limit as number);
    const level = ratio > 1 ? "exceeded" : ratio >= 0.8 ? "warn" : "ok";
    if (level === "exceeded" || (level === "warn" && worst.level === "ok")) worst = { ...c, level };
  }
  return worst;
}
