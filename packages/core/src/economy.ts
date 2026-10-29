import { homedir } from "node:os";
import { join } from "node:path";
import { type CompactResult, compactMessages } from "./compaction.js";
import type { UstaConfig } from "./config.js";
import {
  BudgetExceededError,
  type BudgetLimits,
  CostTracker,
  checkBudget,
  fetchQuota,
  type Quota,
} from "./cost.js";
import type { ModelInfo, ModelRegistry } from "./models.js";
import { createOutputLimiter } from "./output-limit.js";
import { GatewayTokenCounter, messageChars, TokenEstimator } from "./tokens.js";
import { clearReadCache } from "./tools/read.js";
import type { Message, Provider, ToolSpec, Usage } from "./types.js";

export interface EconomyOptions {
  config: Pick<UstaConfig, "apiKey" | "baseUrl">;
  provider: Provider;
  registry: ModelRegistry;
  model: () => string;
  /** Cheap model for summaries. Defaults to the main model. */
  fastModel?: () => string;
  budget?: BudgetLimits;
  /** Fraction of the context window at which history is compacted (default 0.8). */
  compactAt?: number;
  keepTurns?: number;
  /** Home directory for saved outputs (tests). */
  home?: string;
  fetchImpl?: typeof fetch;
  /** Set false to never call /v1/quota (tests, offline). */
  quota?: boolean;
  onWarning?: (text: string) => void;
  /** Asked once when the budget would be exceeded; true lets the session continue. */
  askBudget?: (message: string) => Promise<boolean>;
  /** Called after any compaction (automatic or `/compact`) so callers can persist it. */
  onCompact?: (result: CompactResult) => void;
}

/** UI-facing callbacks; the front end (TUI/headless) replaces them after construction. */
export interface EconomyCallbacks {
  onWarning?: (text: string) => void;
  askBudget?: (message: string) => Promise<boolean>;
  onCompact?: (result: CompactResult) => void;
}

export interface ContextReport {
  limit: number;
  system: number;
  tools: number;
  messages: number;
  total: number;
  free: number;
  /** True when the numbers come from the gateway rather than the estimator. */
  exact: boolean;
}

/**
 * Everything about spending tokens wisely for one conversation: usage and cost tracking,
 * context-window projection, automatic compaction, budget checks and output limiting.
 */
export class Economy {
  readonly estimator = new TokenEstimator();
  readonly tracker = new CostTracker();
  readonly counter: GatewayTokenCounter;
  /** Handed to tools as `ctx.state`. */
  state = new Map<string, unknown>();
  readonly limitOutput: ReturnType<typeof createOutputLimiter>;

  callbacks: EconomyCallbacks;
  private modelOverride?: string;
  private sessionId?: string;
  private last?: { prompt: number; completion: number; sent: number };
  private lastChars = 0;
  private budgetWarned = false;
  private budgetAllowed = false;
  private quotaWarned = false;
  private compactFailedAt = -1;

  constructor(private readonly opts: EconomyOptions) {
    this.callbacks = {
      onWarning: opts.onWarning,
      askBudget: opts.askBudget,
      onCompact: opts.onCompact,
    };
    this.counter = new GatewayTokenCounter(opts.config, opts.fetchImpl);
    this.limitOutput = createOutputLimiter({
      dir: () =>
        this.sessionId
          ? join(opts.home ?? homedir(), ".usta", "outputs", this.sessionId)
          : undefined,
      perTool: { Read: 30_000 },
    });
  }

  /** The model requests go to (a `/model` override wins over the configured one). */
  get modelId(): string {
    return this.modelOverride ?? this.opts.model();
  }

  setModel(id: string): void {
    this.modelOverride = id;
  }

  /** Full tool outputs are saved under this session's directory. */
  setSession(id: string | undefined): void {
    this.sessionId = id;
  }

  get model(): ModelInfo {
    return this.opts.registry.get(this.modelId);
  }

  /** Fraction of the window at which history is compacted. */
  get compactAt(): number {
    return this.opts.compactAt ?? 0.8;
  }

  get budget(): BudgetLimits | undefined {
    return this.opts.budget;
  }

  /** Tokens the next request will carry: last exact usage plus an estimate of what was added. */
  project(messages: readonly Message[], tools: readonly ToolSpec[]): number {
    const last = this.last;
    if (last && last.sent <= messages.length) {
      return last.prompt + last.completion + this.estimator.messages(messages.slice(last.sent + 1));
    }
    return this.estimator.messages(messages) + this.estimator.tools(tools);
  }

  /** Fraction of the context window currently in use (0..1+). */
  usageRatio(): number {
    return this.last ? (this.last.prompt + this.last.completion) / this.model.contextLength : 0;
  }

  /** Wire this into `runAgent({ beforeRequest })`. */
  beforeRequest = async (info: { messages: Message[]; tools: ToolSpec[] }) => {
    let { messages } = info;
    let replaced: { messages: Message[] } | undefined;
    let projected = this.project(messages, info.tools);

    const limit = this.model.contextLength;
    const threshold = this.compactAt * limit;
    if (
      projected >= threshold &&
      messages.length > 3 &&
      messages.length - this.compactFailedAt > 4
    ) {
      try {
        const result = await this.compactNow(messages.slice(1));
        if (result) {
          messages = [messages[0] as Message, ...result.messages];
          replaced = { messages };
          projected = this.project(messages, info.tools);
        }
      } catch (err) {
        this.compactFailedAt = messages.length;
        this.callbacks.onWarning?.(`Bağlam özetlenemedi: ${(err as Error).message}`);
      }
    }

    if (this.opts.budget) {
      const check = checkBudget(this.opts.budget, this.tracker, projected, this.model);
      if (check.level === "exceeded" && !this.budgetAllowed) {
        const what = check.kind === "cr" ? `${check.limit} CR` : `${check.limit} token`;
        const message = `Bütçe aşılacak (${what}); sıradaki istek yaklaşık ${projected} token taşıyor.`;
        if (!(await this.callbacks.askBudget?.(message))) throw new BudgetExceededError(message);
        this.budgetAllowed = true;
      } else if (check.level === "warn" && !this.budgetWarned) {
        this.budgetWarned = true;
        this.callbacks.onWarning?.(
          `Bütçenin %80'ine ulaşıldı (${check.kind === "cr" ? "CR" : "token"}).`,
        );
      }
    }

    this.lastChars =
      messages.reduce((n, m) => n + messageChars(m), 0) + JSON.stringify(info.tools).length;
    return replaced;
  };

  /** Feed every `usage` event of the agent loop here. */
  recordUsage(usage: Usage, sentMessages: number): void {
    this.tracker.add(usage, this.model);
    this.estimator.calibrate(this.lastChars, usage.promptTokens);
    this.last = {
      prompt: usage.promptTokens,
      completion: usage.completionTokens,
      sent: sentMessages,
    };
  }

  /** Summarizes older turns. `messages` excludes the system message. */
  async compactNow(
    messages: readonly Message[],
    instruction?: string,
  ): Promise<CompactResult | undefined> {
    const result = await compactMessages({
      provider: this.opts.provider,
      model: this.opts.fastModel?.() ?? this.modelId,
      messages,
      keepTurns: this.opts.keepTurns,
      instruction,
    });
    if (result) {
      this.last = undefined;
      clearReadCache(this.state); // the file contents they refer to just left the conversation
      this.callbacks.onCompact?.(result);
    }
    return result;
  }

  /** Forget everything tied to the current conversation (`/clear`, resume of another one). */
  reset(): void {
    this.last = undefined;
    this.state = new Map();
    this.compactFailedAt = -1;
  }

  /** After a rewind the conversation shrank; cached reads and the last measurement are stale. */
  invalidate(): void {
    this.last = undefined;
    clearReadCache(this.state);
  }

  async refreshQuota(): Promise<Quota | undefined> {
    if (this.opts.quota === false) return undefined;
    const quota = await fetchQuota(this.opts.config, this.opts.fetchImpl);
    if (!quota) return undefined;
    this.tracker.setQuota(quota);
    const { dailyRemainingTokens: left, dailyLimitTokens: cap } = quota;
    if (!this.quotaWarned && left !== undefined && cap && left / cap < 0.1) {
      this.quotaWarned = true;
      this.callbacks.onWarning?.(
        `Günlük token kotasının %${Math.round((left / cap) * 100)}'i kaldı.`,
      );
    }
    return quota;
  }

  /** Where the context window goes. Exact when the gateway can count; estimated otherwise. */
  async report(
    system: string,
    messages: readonly Message[],
    tools: readonly ToolSpec[],
  ): Promise<ContextReport> {
    const model = this.modelId;
    const probe: Message[] = [{ role: "user", content: "." }];
    const spec = [...tools];
    const [a, b, c] = await Promise.all([
      this.counter.count({ model, system, messages: probe }),
      this.counter.count({ model, system, messages: probe, tools: spec }),
      this.counter.count({ model, system, messages: [...messages], tools: spec }),
    ]);
    const limit = this.model.contextLength;
    if (a !== undefined && b !== undefined && c !== undefined && messages.length > 0) {
      return {
        limit,
        system: a,
        tools: b - a,
        messages: Math.max(0, c - b),
        total: c,
        free: limit - c,
        exact: true,
      };
    }
    const sys = this.estimator.text(system);
    const tl = this.estimator.tools(spec);
    const ms = this.estimator.messages(messages);
    return {
      limit,
      system: sys,
      tools: tl,
      messages: ms,
      total: sys + tl + ms,
      free: limit - sys - tl - ms,
      exact: false,
    };
  }
}
