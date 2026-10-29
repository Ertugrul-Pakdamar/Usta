# Comparison with Claude Code on the same model

<p align="center"><img src="../assets/chart-vs-claude-code.en.svg" alt="usta and Claude Code on the same model: success and tokens" width="760"></p>

**In short:** With **the same model (`qwen3-vl-30b`)** on the EVREN gateway, on our own 10-task eval set, usta had **higher success (91% vs 80%)** and used **about 13.5× fewer tokens** per run (7.9× fewer uncached tokens). This is **not** an "better at everything" claim: read the [limits](#limits-honestly) and the [areas where Claude Code is ahead](comparison.md) together with it.

## How we measured

- **Same model, same gateway:** The gateway also speaks the Anthropic format (`/v1/messages`); Claude Code (2.1.312) was pointed at EVREN with `ANTHROPIC_BASE_URL`. The gateway rejects Claude Code's `thinking` parameter (HTTP 400), so it was turned off with `MAX_THINKING_TOKENS=0`; telemetry and auto-update were off.
- **Same tasks and checks:** the 10 tasks of the [`evals/`](../../evals/README.md) suite (4 bulk edits, a bug fix, a feature, reading/answering, a review), each run 3 times; results are checked automatically and the checks themselves are tested.
- **Measured:** success, total tokens (prompt + completion, including prompt tokens served from the cache), uncached tokens, tool calls, duration. For usta the results of this version were used.
- **Permissions:** the usta eval ran in bypass mode in an isolated temp directory. Claude Code's bypass mode (`--dangerously-skip-permissions`) was refused by the execution environment's safety classifier, so Claude Code ran in **`acceptEdits` with a fixed allow-list of shell commands** (no permission denial occurred).
- **Turn-cap correction (after the fact):** In the first round every run was capped at 30 turns and Claude Code's two bulk tasks (one call per turn) hit the cap and looked like failures. Those two were re-run with a 90-turn cap (6/6 success) and **they** are in the table; both raw files are in the repository.

## Result

|                           |            usta |         Claude Code |
| ------------------------- | --------------: | ------------------: |
| Success                   | **30/33 (91%)** |         24/30 (80%) |
| Tokens per run (total)    |          13,095 | 176,563 (**13.5×**) |
| Tokens per run (uncached) |           2,750 |   21,654 (**7.9×**) |

| Task           | usta ok | usta tokens | usta calls | usta s | Claude Code ok | CC tokens | CC calls | CC s |
| -------------- | ------: | ----------: | ---------: | -----: | -------------: | --------: | -------: | ---: |
| bulk-header    |     3/3 |       5,361 |          2 |      4 |            3/3 |   460,063 |       31 |   28 |
| bulk-version   |     3/3 |       7,970 |          5 |      6 |            3/3 |   312,310 |       22 |   23 |
| fix-bug        |     3/3 |       9,100 |          4 |      5 |            3/3 |    62,141 |        4 |    8 |
| bulk-rename    |     3/3 |      36,316 |         11 |     11 |            3/3 |   550,205 |       33 |   38 |
| big-log-count  |     3/3 |       4,653 |          1 |      1 |            2/3 |    24,158 |        1 |    2 |
| add-feature    |     3/3 |       8,992 |          4 |      5 |            3/3 |    75,395 |        5 |    9 |
| find-answer    |     3/3 |       7,715 |          4 |      2 |            0/3 |    12,050 |        0 |    1 |
| create-cli     |     3/3 |       5,054 |          2 |      4 |            3/3 |    37,037 |        2 |    5 |
| csv-to-json    |     3/3 |       6,542 |          2 |      4 |            3/3 |    53,557 |        3 |   20 |
| review-project |     3/6 |      13,631 |          7 |     16 |            1/3 |    12,253 |        0 |    3 |

_Medians are per task; the top table is the mean over all runs. Raw data: [`evals/results/`](../../evals/results/) (`*-claude-code-*.jsonl`). To regenerate the table: `node evals/compare.mjs`._

## Why the difference?

- **Fixed payload:** Claude Code sends about 12 thousand tokens with every request (88% of it read from the cache); usta's system prompt and tool schemas are about 1.3 thousand tokens. Over many turns the gap multiplies.
- **`Script` for bulk work:** Claude Code edits files one by one (e.g. a header in 15 files: 31 calls); usta does it with one script (2 calls). This matches the [Script A/B measurement](evals.md).
- **Reliability of using tools:** With this model Claude Code answered the `find-answer` and `review-project` tasks **without calling any tool** and made up file names (0/3 and 1/3). usta's prompt is tuned to this model's habits ("investigate with tools first").
- **Output detail:** usta's `Grep` states the total match count; in the counting task Claude Code said 46 instead of 42.

## Limits (honestly)

- **Home advantage:** The tasks were written by usta's developer and usta's prompt/tools were tuned to this model and these tasks. Claude Code's tools and prompts are designed for Claude models; this comparison does **not** measure its main use case. With tasks written by an independent person the result may change.
- **Small sample:** 10 tasks × 3 runs, one model, one day; percentages can move by a few points. usta's own `review-project` result is only 3/6.
- **Conditions are not perfectly equal:** different permission modes (above), a different turn cap for two tasks (after the fact, stated openly). Token counts were summed from Claude Code's `usage` field (input + cache creation + cache read + output).
- **This model only:** EVREN has no other model; with a strong Claude model Claude Code's result would be very different and that was not measured.
- **Not a feature comparison:** in memory, IDE, sandbox, web and maturity Claude Code is **far ahead**: [Comparison and next steps](comparison.md).

## Reproducing

```bash
pnpm build
# usta
node evals/run.mjs --reps 3 --variants baseline --out evals/results/mine-usta.jsonl
# Claude Code (same gateway; CLAUDE_BIN is Claude Code's executable)
CLAUDE_BIN=$(which claude) node evals/run-claude-code.mjs --reps 3 --out evals/results/mine-cc.jsonl
```

`evals/compare.mjs` reads the published files; for your own results change the file names inside it. Gateway settings are read from `.env`; the runs make real requests.
