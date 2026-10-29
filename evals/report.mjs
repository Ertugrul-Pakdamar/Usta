#!/usr/bin/env node
// Turns a results file into a Markdown report:  node evals/report.mjs evals/results/x.jsonl > report.md
import { readFileSync } from "node:fs";

const rows = readFileSync(process.argv[2], "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));
const median = (xs) => {
  const s = xs.filter((x) => x !== undefined).sort((a, b) => a - b);
  return s.length
    ? s.length % 2
      ? s[(s.length - 1) / 2]
      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    : undefined;
};
const sum = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0);
const fmt = (n) => (n === undefined ? "–" : Math.round(n).toLocaleString("en-US"));
const total = (r) => (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0);

const variants = [...new Set(rows.map((r) => r.variant))];
const tasks = [...new Set(rows.map((r) => r.task))];
const lines = [];

lines.push(
  "### Overall",
  "",
  "| Variant | Runs | Success | Median tokens / run | Total tokens | Median tool calls | Median seconds |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
);
for (const v of variants) {
  const rs = rows.filter((r) => r.variant === v);
  const okN = rs.filter((r) => r.ok).length;
  lines.push(
    `| ${v} | ${rs.length} | ${okN}/${rs.length} (${Math.round((100 * okN) / rs.length)}%) | ${fmt(median(rs.map(total)))} | ${fmt(sum(rs.map(total)))} | ${fmt(median(rs.map((r) => r.tool_calls)))} | ${fmt(median(rs.map((r) => r.seconds)))} |`,
  );
}

lines.push(
  "",
  "### Per task (median total tokens, successes out of runs)",
  "",
  `| Task | Category | ${variants.map((v) => `${v} tokens | ${v} ok`).join(" | ")} |`,
  `| --- | --- | ${variants.map(() => "---: | ---:").join(" | ")} |`,
);
for (const t of tasks) {
  const cat = rows.find((r) => r.task === t).category;
  const cells = variants.map((v) => {
    const rs = rows.filter((r) => r.task === t && r.variant === v);
    return `${fmt(median(rs.map(total)))} | ${rs.filter((r) => r.ok).length}/${rs.length}`;
  });
  lines.push(`| ${t} | ${cat} | ${cells.join(" | ")} |`);
}

lines.push("", "### Tool use per variant (calls summed over all runs)", "");
for (const v of variants) {
  const t = new Map();
  for (const r of rows.filter((x) => x.variant === v))
    for (const [k, n] of Object.entries(r.tools ?? {})) t.set(k, (t.get(k) ?? 0) + n);
  lines.push(
    `- **${v}:** ${
      [...t.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n}`)
        .join(", ") || "–"
    }`,
  );
}
const failed = rows.filter((r) => !r.ok);
if (failed.length) {
  lines.push("", "### Failures", "");
  for (const r of failed) lines.push(`- ${r.task} [${r.variant}#${r.rep}]: ${r.detail ?? r.stop}`);
}
console.log(lines.join("\n"));
