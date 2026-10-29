#!/usr/bin/env node
// Runs the evaluation tasks against the built CLI, once per variant and repetition.
//   node evals/run.mjs [--reps 3] [--variants baseline,no-script] [--tasks id,id] [--concurrency 3] [--out evals/results/x.jsonl]
// Every run happens in a fresh temp directory with a fresh HOME, in bypass mode (nothing outside it is touched).
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tasks } from "./tasks/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { configFromEnv, loadEnvFiles } = await import(join(root, "packages/core/dist/index.js"));
loadEnvFiles(root);
configFromEnv(); // fails early with a clear message when the gateway is not configured

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const VARIANTS = {
  baseline: [],
  "no-script": ["--disable-tools", "Script"],
  "no-task": ["--disable-tools", "Task", "TaskOutput"],
};
const reps = Number(arg("reps", 3));
const variantNames = arg("variants", "baseline,no-script").split(",");
const only = arg("tasks", "")?.split(",").filter(Boolean);
const concurrency = Number(arg("concurrency", 3));
const out = resolve(
  arg(
    "out",
    join(
      root,
      "evals/results",
      `run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jsonl`,
    ),
  ),
);
mkdirSync(dirname(out), { recursive: true });

const jobs = [];
for (let rep = 1; rep <= reps; rep++)
  for (const task of tasks.filter((t) => !only.length || only.includes(t.id)))
    for (const v of variantNames) jobs.push({ task, variant: v, rep });

function runOne({ task, variant, rep }) {
  const dir = mkdtempSync(join(tmpdir(), "usta-eval-"));
  const home = mkdtempSync(join(tmpdir(), "usta-eval-home-"));
  task.setup(dir);
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [
        join(root, "packages/cli/dist/bin.js"),
        ...VARIANTS[variant],
        "-p",
        task.prompt,
        "--output-format",
        "json",
        "-y",
        "--max-turns",
        "30",
        "--lang",
        "en",
      ],
      { cwd: dir, env: { ...process.env, HOME: home }, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b));
    child.stderr.on("data", (b) => (stderr += b));
    const timer = setTimeout(() => child.kill("SIGKILL"), 300_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      let json;
      try {
        json = JSON.parse(stdout.trim().split("\n").at(-1));
      } catch {}
      const calls = [...stderr.matchAll(/^⏺ (\S+)/gm)].map((m) => m[1]);
      const verdict = json
        ? task.check(dir, json.result ?? "")
        : { ok: false, detail: `no result (exit ${code})` };
      const record = {
        task: task.id,
        category: task.category,
        variant,
        rep,
        ok: verdict.ok,
        detail: verdict.detail,
        exit: code,
        stop: json?.stop_reason,
        turns: json?.turns,
        prompt_tokens: json?.session_usage?.prompt_tokens,
        completion_tokens: json?.session_usage?.completion_tokens,
        requests: json?.session_usage?.requests,
        cache_ratio: json?.usage?.cache_ratio,
        tool_calls: calls.length,
        tools: Object.fromEntries(calls.reduce((m, c) => m.set(c, (m.get(c) ?? 0) + 1), new Map())),
        seconds: Math.round((Date.now() - started) / 1000),
        ...(verdict.ok ? {} : { stderr_tail: stderr.slice(-1500) }),
      };
      appendFileSync(out, `${JSON.stringify(record)}\n`);
      console.log(
        `${record.ok ? "✓" : "✗"} ${task.id} [${variant}#${rep}] ${record.prompt_tokens ?? "?"}+${record.completion_tokens ?? "?"} tok, ${record.tool_calls} calls, ${record.seconds}s${record.ok ? "" : ` — ${record.detail}`}`,
      );
      rmSync(dir, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
      done();
    });
  });
}

console.log(`${jobs.length} runs → ${out}`);
let next = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < jobs.length) await runOne(jobs[next++]);
  }),
);
console.log(`done: ${out}`);
