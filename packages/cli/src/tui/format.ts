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
  if (lines.length > maxLines) shown.push(`… +${lines.length - maxLines} satır`);
  return shown.join("\n");
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

import { type ContextReport, type Economy, isFree } from "@usta/core";

const bar = (share: number, width = 24) =>
  "█".repeat(Math.max(share > 0 ? 1 : 0, Math.round(share * width)));

export function formatContextReport(r: ContextReport, model: string, compactAt: number): string {
  const row = (name: string, n: number) =>
    `  ${name.padEnd(14)} ${formatTokens(n).padStart(7)}  ${bar(n / r.limit)}`;
  return [
    `Bağlam penceresi: ${formatTokens(r.limit)} token (${model})`,
    row("Sistem istemi", r.system),
    row("Araçlar", r.tools),
    row("Mesajlar", r.messages),
    row("Boş", r.free),
    `Kullanılan: ${formatTokens(r.total)} (%${Math.round((r.total / r.limit) * 100)}) · otomatik özet eşiği %${Math.round(compactAt * 100)} · ${r.exact ? "gateway sayımı" : "tahmin"}`,
  ].join("\n");
}

export function formatCostReport(economy: Economy): string {
  const t = economy.tracker;
  const m = economy.model;
  const lines = [
    `Bu oturum: ${t.requests} istek · girdi ${formatTokens(t.promptTokens)} · çıktı ${formatTokens(t.completionTokens)} · önbellekten %${Math.round(t.cacheRatio * 100)}`,
    isFree(m)
      ? `Fiyat: ücretsiz${m.freeUntil ? ` (${m.freeUntil} tarihine kadar)` : ""}`
      : `Fiyat: girdi ${m.promptPrice} · çıktı ${m.completionPrice} ${m.currency}/token · tahmini harcama ${t.estimatedCr.toFixed(4)} ${m.currency}`,
  ];
  const q = t.quota;
  if (q?.remainingCr !== undefined) {
    const spent = t.spentCr;
    lines.push(
      `Kalan kredi: ${q.remainingCr} CR${spent !== undefined ? ` (bu oturumda ${spent.toFixed(4)} harcandı)` : ""}`,
    );
  }
  if (q?.dailyRemainingTokens !== undefined && q.dailyLimitTokens) {
    lines.push(
      `Günlük kota: ${formatTokens(q.dailyRemainingTokens)} / ${formatTokens(q.dailyLimitTokens)} token kaldı`,
    );
  }
  const b = economy.budget;
  if (b?.tokens !== undefined)
    lines.push(`Token bütçesi: ${formatTokens(t.totalTokens)} / ${formatTokens(b.tokens)}`);
  if (b?.cr !== undefined)
    lines.push(`CR bütçesi: ${Math.max(t.estimatedCr, t.spentCr ?? 0).toFixed(4)} / ${b.cr}`);
  return lines.join("\n");
}
