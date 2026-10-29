#!/usr/bin/env node
// Runs the evaluation tasks with Claude Code (the CLI) pointed at the EVREN gateway's Anthropic-format
// endpoint (`/v1/messages`), so the SAME model can be compared with usta.
//   CLAUDE_BIN=/path/to/claude node evals/run-claude-code.mjs [--reps 3] [--tasks id,id] [--max-turns 30] --out evals/results/x.jsonl
// Notes: the gateway rejects Claude Code's `thinking` parameter (HTTP 400), so it is disabled with
// MAX_THINKING_TOKENS=0; telemetry/auto-update are off; permission mode is acceptEdits with a fixed
// allow-list of shell commands (bypass mode is not used). Every run has its own temp directory and HOME.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CL = process.env.CLAUDE_BIN ?? "claude";
const { configFromEnv, loadEnvFiles } = await import(join(root, "packages/core/dist/index.js"));
loadEnvFiles(root);
const config = configFromEnv();
const { tasks } = await import(join(root, "evals/tasks/index.mjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const reps = Number(arg("reps", 3));
const only = (arg("tasks", "") ?? "").split(",").filter(Boolean);
const out = resolve(arg("out"));
mkdirSync(dirname(out), { recursive: true });
const ALLOWED = [
  "Read",
  "Glob",
  "Grep",
  "Write",
  "Edit",
  "Bash(node:*)",
  "Bash(python3:*)",
  "Bash(ls:*)",
  "Bash(cat:*)",
  "Bash(grep:*)",
  "Bash(wc:*)",
  "Bash(head:*)",
  "Bash(tail:*)",
  "Bash(sed:*)",
  "Bash(sort:*)",
  "Bash(find:*)",
  "Bash(mkdir:*)",
  "Bash(echo:*)",
  "Bash(awk:*)",
  "Bash(perl:*)",
  "Bash(cp:*)",
  "Bash(mv:*)",
  "Bash(xargs:*)",
];

const jobs = [];
for (let rep = 1; rep <= reps; rep++)
  for (const task of tasks.filter((t) => !only.length || only.includes(t.id)))
    jobs.push({ task, rep });

function runOne({ task, rep }) {
  const dir = mkdtempSync(join(tmpdir(), "cc-eval-"));
  task.setup(dir);
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn(
      CL,
      [
        "-p",
        task.prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        ...ALLOWED,
        "--max-turns",
        arg("max-turns", "30"),
      ],
      {
        cwd: dir,
        env: {
          PATH: process.env.PATH,
          HOME: dir,
          CLAUDE_CONFIG_DIR: join(dir, ".cfg"),
          ANTHROPIC_BASE_URL: config.baseUrl.replace(/\/v1$/, ""),
          ANTHROPIC_AUTH_TOKEN: config.apiKey,
          ANTHROPIC_MODEL: "qwen3-vl-30b",
          ANTHROPIC_SMALL_FAST_MODEL: "qwen3-vl-30b",
          MAX_THINKING_TOKENS: "0",
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
          DISABLE_TELEMETRY: "1",
          DISABLE_AUTOUPDATER: "1",
          DISABLE_ERROR_REPORTING: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    child.stdout.on("data", (b) => (stdout += b));
    child.stderr.on("data", () => {});
    const timer = setTimeout(() => child.kill("SIGKILL"), 300_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      let result;
      const tools = {};
      for (const line of stdout.split("\n")) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === "result") result = ev;
          if (ev.type === "assistant")
            for (const c of ev.message?.content ?? [])
              if (c.type === "tool_use") tools[c.name] = (tools[c.name] ?? 0) + 1;
        } catch {}
      }
      const u = result?.usage ?? {};
      const verdict = result
        ? task.check(dir, result.result ?? "")
        : { ok: false, detail: `no result (exit ${code})` };
      const calls = Object.values(tools).reduce((a, b) => a + b, 0);
      const rec = {
        task: task.id,
        category: task.category,
        variant: "claude-code",
        rep,
        ok: verdict.ok,
        detail: verdict.detail,
        exit: code,
        stop: result?.terminal_reason,
        error: result?.is_error ? String(result.result).slice(0, 160) : undefined,
        turns: result?.num_turns,
        prompt_tokens:
          (u.input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0),
        fresh_prompt_tokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        cache_read_tokens: u.cache_read_input_tokens ?? 0,
        completion_tokens: u.output_tokens,
        tool_calls: calls,
        tools,
        denials: result?.permission_denials?.length ?? 0,
        seconds: Math.round((Date.now() - started) / 1000),
      };
      appendFileSync(out, `${JSON.stringify(rec)}\n`);
      console.log(
        `${rec.ok ? "✓" : "✗"} ${task.id} [cc#${rep}] ${rec.prompt_tokens}+${rec.completion_tokens} tok, ${calls} calls, ${rec.denials} denied, ${rec.seconds}s${rec.ok ? "" : ` — ${rec.detail ?? rec.error}`}`,
      );
      rmSync(dir, { recursive: true, force: true });
      done();
    });
  });
}
console.log(`${jobs.length} runs → ${out}`);
let next = 0;
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (next < jobs.length) await runOne(jobs[next++]);
  }),
);
console.log("done");
