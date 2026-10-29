# Evaluation suite

Small, automatically checked coding tasks that run the real CLI against the real gateway and measure
success and tokens per variant. Results and method: [docs/en/evals.md](../docs/en/evals.md).

```bash
pnpm build
node evals/run.mjs --reps 3 --variants baseline,no-script --out evals/results/mine.jsonl
node evals/report.mjs evals/results/mine.jsonl
```

- `tasks/index.mjs`: the tasks (`setup`, `prompt`, `check`). Add one by appending to the list; `tasks.test.mjs` forces you to also provide a reference solution, so the check is proven to reject a broken project and accept a good one (`pnpm test`).
- `run.mjs`: variants are `baseline`, `no-script`, `no-task` (see `VARIANTS`). Each run uses a fresh temp directory and `HOME`, in bypass mode.
- `run-claude-code.mjs` / `compare.mjs`: the same tasks with Claude Code on the same gateway model, and the comparison table ([report](../docs/en/vs-claude-code.md)).
- `results/`: raw JSONL of the published runs (`2026-10-29-script-ab.jsonl` first round, `2026-10-29-rerun.jsonl` after fixing three tasks, `2026-10-29-grep-count.jsonl` after the `Grep` count change, `2026-10-29-final.jsonl` the combined table).
