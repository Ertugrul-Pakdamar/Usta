import { t } from "../i18n/index.js";
import type { AutoClassifier } from "./classifier.js";

/** What auto mode decided so far: counts, then the latest decisions (the `/auto` command). */
export function formatAutoReport(auto: AutoClassifier): string {
  if (!auto.recent.length) return t("auto.none");
  const { safe, risky, unsure, modelCalls } = auto.stats;
  const lines = auto.recent.slice(-10).map((r) =>
    t("auto.line", {
      verdict: r.verdict.padEnd(6),
      tool: r.tool,
      input: r.input.slice(0, 60),
      reason: r.reason,
      outcome: r.outcome ? t(`auto.outcome.${r.outcome}`) : "",
    }),
  );
  return [t("auto.stats", { safe, risky, unsure, calls: modelCalls }), ...lines].join("\n");
}
