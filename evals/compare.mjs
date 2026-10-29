#!/usr/bin/env node
// usta vs Claude Code on the SAME model: builds the comparison table from the raw result files.
//   node evals/compare.mjs            (Markdown)      node evals/compare.mjs --json   (numbers for the charts)
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(resolve(dirname(fileURLToPath(import.meta.url))), "results");
const load = (f) =>
  readFileSync(join(dir, f), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

// usta: the nine standard tasks after the prompt change + the review task (baseline variant only).
const usta = [
  ...load("2026-10-29-regression-after-prompt.jsonl"),
  ...load("2026-10-29-verbosity-after.jsonl").filter((r) => r.variant === "baseline"),
];
// Claude Code: the first round capped every run at 30 turns, which cut off the two bulk tasks (one tool call
// per turn); those two were re-run with a 90-turn cap and replace the capped rows (stated in the report).
const RERUN = new Set(["bulk-header", "bulk-rename"]);
const cc = [
  ...load("2026-10-29-claude-code-full.jsonl").filter((r) => !RERUN.has(r.task)),
  ...load("2026-10-29-claude-code-bulk90.jsonl"),
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const total = (r) => (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0);
const fresh = (r) =>
  r.fresh_prompt_tokens !== undefined
    ? r.fresh_prompt_tokens + (r.completion_tokens ?? 0)
    : (r.prompt_tokens ?? 0) * (1 - (r.cache_ratio ?? 0)) + (r.completion_tokens ?? 0);
const fmt = (n) => Math.round(n).toLocaleString("en-US");

const tasks = [...new Set(usta.map((r) => r.task))];
const rows = tasks.map((t) => {
  const a = usta.filter((r) => r.task === t);
  const b = cc.filter((r) => r.task === t);
  return {
    task: t,
    usta: {
      ok: a.filter((r) => r.ok).length,
      n: a.length,
      tokens: median(a.map(total)),
      calls: median(a.map((r) => r.tool_calls)),
      seconds: median(a.map((r) => r.seconds)),
    },
    cc: {
      ok: b.filter((r) => r.ok).length,
      n: b.length,
      tokens: median(b.map(total)),
      calls: median(b.map((r) => r.tool_calls)),
      seconds: median(b.map((r) => r.seconds)),
    },
  };
});
const overall = (rs) => ({
  ok: rs.filter((r) => r.ok).length,
  n: rs.length,
  tokensPerRun: sum(rs.map(total)) / rs.length,
  freshPerRun: sum(rs.map(fresh)) / rs.length,
});
const o = { usta: overall(usta), cc: overall(cc) };
o.tokenRatio = o.cc.tokensPerRun / o.usta.tokensPerRun;
o.freshRatio = o.cc.freshPerRun / o.usta.freshPerRun;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ rows, overall: o }, null, 2));
} else {
  const L = [];
  L.push("| | usta | Claude Code |", "| --- | ---: | ---: |");
  L.push(
    `| Success | **${o.usta.ok}/${o.usta.n} (${Math.round((100 * o.usta.ok) / o.usta.n)}%)** | ${o.cc.ok}/${o.cc.n} (${Math.round((100 * o.cc.ok) / o.cc.n)}%) |`,
  );
  L.push(
    `| Tokens per run (total) | ${fmt(o.usta.tokensPerRun)} | ${fmt(o.cc.tokensPerRun)} (**${o.tokenRatio.toFixed(1)}×**) |`,
  );
  L.push(
    `| Tokens per run (uncached) | ${fmt(o.usta.freshPerRun)} | ${fmt(o.cc.freshPerRun)} (**${o.freshRatio.toFixed(1)}×**) |`,
    "",
  );
  L.push(
    "| Task | usta ok | usta tokens | usta calls | usta s | Claude Code ok | CC tokens | CC calls | CC s |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const r of rows) {
    L.push(
      `| ${r.task} | ${r.usta.ok}/${r.usta.n} | ${fmt(r.usta.tokens)} | ${fmt(r.usta.calls)} | ${fmt(r.usta.seconds)} | ${r.cc.ok}/${r.cc.n} | ${fmt(r.cc.tokens)} | ${fmt(r.cc.calls)} | ${fmt(r.cc.seconds)} |`,
    );
  }
  console.log(L.join("\n"));
}
