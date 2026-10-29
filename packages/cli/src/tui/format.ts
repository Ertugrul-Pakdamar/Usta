import {
  type ContextReport,
  type Economy,
  formatDate,
  formatNumber,
  isFree,
  type LoadedExtensions,
  t,
} from "@usta/core";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** One-line description of a tool call, e.g. `Read(src/a.ts)`. */
export function summarizeCall(name: string, rawArgs: string): string {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return `${name}(${clip(rawArgs, 60)})`;
  }
  const main =
    args.command ??
    args.path ??
    args.pattern ??
    Object.values(args).find((v) => typeof v === "string");
  return `${name}(${clip(String(main ?? "").split("\n")[0] ?? "", 80)})`;
}

/** First lines of a tool result plus a count of the rest. */
export function summarizeOutput(output: string, maxLines = 3): string {
  const lines = output.split("\n");
  const shown = lines.slice(0, maxLines).map((l) => clip(l, 110));
  if (lines.length > maxLines) shown.push(t("tui.moreLines", { count: lines.length - maxLines }));
  return shown.join("\n");
}

/** Compact token count (`2.4k`); the same in every language. */
export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const bar = (share: number, width = 24) =>
  "█".repeat(Math.max(share > 0 ? 1 : 0, Math.round(share * width)));

export function formatContextReport(r: ContextReport, model: string, compactAt: number): string {
  const row = (name: string, n: number) =>
    `  ${name.padEnd(14)} ${formatTokens(n).padStart(7)}  ${bar(n / r.limit)}`;
  return [
    t("report.context.title", { limit: formatTokens(r.limit), model }),
    row(t("report.context.system"), r.system),
    row(t("report.context.tools"), r.tools),
    row(t("report.context.messages"), r.messages),
    row(t("report.context.free"), r.free),
    t("report.context.summary", {
      used: formatTokens(r.total),
      percent: Math.round((r.total / r.limit) * 100),
      threshold: Math.round(compactAt * 100),
      source: r.exact ? t("report.context.exact") : t("report.context.estimate"),
    }),
  ].join("\n");
}

export function formatCostReport(economy: Economy): string {
  const tracker = economy.tracker;
  const m = economy.model;
  const lines = [
    t("report.cost.session", {
      requests: t("unit.requests", { count: tracker.requests }),
      input: formatTokens(tracker.promptTokens),
      output: formatTokens(tracker.completionTokens),
      cache: Math.round(tracker.cacheRatio * 100),
    }),
    isFree(m)
      ? m.freeUntil
        ? t("report.cost.freeUntil", { date: formatDate(m.freeUntil) })
        : t("report.cost.free")
      : t("report.cost.priced", {
          inPrice: formatNumber(m.promptPrice, 8),
          outPrice: formatNumber(m.completionPrice, 8),
          currency: m.currency,
          spent: formatNumber(tracker.estimatedCr),
        }),
  ];
  const q = tracker.quota;
  if (q?.remainingCr !== undefined) {
    const spent = tracker.spentCr;
    lines.push(
      spent !== undefined
        ? t("report.cost.remainingSpent", {
            remaining: formatNumber(q.remainingCr),
            spent: formatNumber(spent),
          })
        : t("report.cost.remaining", { remaining: formatNumber(q.remainingCr) }),
    );
  }
  if (q?.dailyRemainingTokens !== undefined && q.dailyLimitTokens) {
    lines.push(
      t("report.cost.daily", {
        left: formatTokens(q.dailyRemainingTokens),
        limit: formatTokens(q.dailyLimitTokens),
      }),
    );
  }
  const b = economy.budget;
  if (b?.tokens !== undefined) {
    lines.push(
      t("report.cost.tokenBudget", {
        used: formatTokens(tracker.totalTokens),
        limit: formatTokens(b.tokens),
      }),
    );
  }
  if (b?.cr !== undefined) {
    lines.push(
      t("report.cost.crBudget", {
        used: formatNumber(Math.max(tracker.estimatedCr, tracker.spentCr ?? 0)),
        limit: formatNumber(b.cr),
      }),
    );
  }
  return lines.join("\n");
}

/** The loaded skills and custom commands (`/skills`). */
export function formatExtensions(ext: LoadedExtensions | undefined): string {
  if (!ext || (!ext.skills.length && !ext.commands.length)) return t("ext.none");
  return [
    ...(ext.skills.length
      ? [t("ext.skillsHeader"), ...ext.skills.map((s) => `  ${s.name} · ${s.description}`)]
      : []),
    ...(ext.commands.length
      ? [t("ext.commandsHeader"), ...ext.commands.map((c) => `  /${c.name} · ${c.description}`)]
      : []),
  ].join("\n");
}
