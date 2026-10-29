# Evaluation report

To show usta's "fewer tokens" claim by **measurement** rather than estimate, there is a small evaluation suite: [`evals/`](../../evals/README.md). This page is its first A/B result: **the Script tool on or off**.

## Method

> The same eval suite was also used to compare usta with **Claude Code on the same model**: [Comparison with Claude Code on the same model](vs-claude-code.md).
- **Model:** `qwen3-vl-30b` (the gateway's only model); all runs on 2026-10-29.
- **9 tasks**, each starting from a fresh project in a temp directory and **checked automatically** (file contents, a test run, the answer text). The tasks: 4 bulk edits (rename across 12 files, a header in 15 files, a version in 10 JSON files, CSV→JSON), a bug fix, a feature, writing a script from scratch, finding an answer in a codebase, and counting in a 700-line log.
- **Two variants:** `baseline` (all tools) and `no-script` (`--disable-tools Script`; Script is also removed from the system prompt and the hints). Every task × variant ran **3 times** (54 runs), with `-y` (bypass) in an isolated temp directory.
- **Measured:** success (did the check pass), total tokens (prompt + completion, subagents included), tool calls, duration. The checks themselves are tested: [`evals/tasks.test.mjs`](../../evals/tasks.test.mjs) verifies that every check rejects a broken project and accepts a correct solution.

## Result

<p align="center"><img src="../assets/chart-script-ab.en.svg" alt="Script A/B result" width="760"></p>


#### Overall

| Variant   | Runs |      Success | Median tokens / run | Total tokens | Median tool calls | Median seconds |
| --------- | ---: | -----------: | ------------------: | -----------: | ----------------: | -------------: |
| baseline  |   27 | 27/27 (100%) |               8,278 |      220,665 |                 4 |              5 |
| no-script |   27 | 27/27 (100%) |               8,034 |      330,629 |                 4 |              5 |

#### Per task (median total tokens, successes out of runs)

| Task          | Category  | baseline tokens | baseline ok | no-script tokens | no-script ok |
| ------------- | --------- | --------------: | ----------: | ---------------: | -----------: |
| bulk-header   | bulk edit |           5,226 |         3/3 |            8,117 |          3/3 |
| fix-bug       | fix       |           8,278 |         3/3 |            7,496 |          3/3 |
| add-feature   | feature   |          10,187 |         3/3 |            7,164 |          3/3 |
| find-answer   | read-only |          10,793 |         3/3 |            9,596 |          3/3 |
| create-cli    | feature   |           4,785 |         3/3 |            4,230 |          3/3 |
| csv-to-json   | bulk edit |           6,288 |         3/3 |           10,682 |          3/3 |
| bulk-version  | bulk edit |           7,876 |         3/3 |           11,718 |          3/3 |
| bulk-rename   | bulk edit |          13,303 |         3/3 |           29,278 |          3/3 |
| big-log-count | read-only |           4,487 |         3/3 |            4,147 |          3/3 |

#### Tool use per variant (calls summed over all runs)

- **baseline:** Edit 34, Grep 21, Glob 19, Read 19, Bash 14, Script 13, Write 3
- **no-script:** Edit 105, Grep 21, Glob 20, Read 19, Bash 17, Write 6, Task 4

**Reading it:**

- **For bulk edits Script clearly pays off.** Across the 4 bulk tasks: baseline **102,869** tokens, with Script off **234,073** (**−56%**). The biggest gap is the rename across 12 files: median 13,303 vs 29,278 (without Script the model makes a separate `Edit` per file; over the 27 runs that is 105 `Edit` calls vs 34 in the baseline).
- **Success is equal** (27/27 and 27/27), so the saving does not cost quality. (That is after the task definitions were corrected; see below.)
- **For non-bulk tasks there is no difference, or noise.** Bug fix and answer finding are similar in both variants; in the feature task the baseline was more expensive (47,234 vs 35,843), but with N=3 that is not enough evidence to call it "the fixed cost of Script". The Script schema adds overhead to every request (see [Token economy](token-economy.md)); with no bulk work it brings nothing.
- The model mostly chose Script in the right places: 13 Script calls in the baseline, all in the bulk tasks.

## Additional measurement: long and repetitive output

In a user trial (a request to "review the security problems and optimization" of a Go + React form builder) the output was very long and repetitive. The transcript showed four problems: (1) after **one `Glob`**, without reading a single file, the model wrote eight security items in an "…might be" style; (2) after every `Read` it **rewrote** the same plan/summary/next-steps sections; (3) about `.env`, whose access was denied, it spoke as if it had seen the content (the value was actually a default in `config.go`); (4) our own bug: when the model opened a ```env code block the Markdown highlighter printed `Could not find the language 'env'` to the screen (also when loading history with `usta -c`, so **in the release binary too**).

**Fixes:** code blocks with an unknown language become `plaintext` (the error no longer leaks) and the extra blank lines in nested lists are removed; the system prompt gained the rules "do not state findings about files you have not read, label guesses as guesses", "a review/plan/list request is read-only" and "between tool calls at most a few sentences, the complete findings only in the final answer, never repeat an earlier summary"; a `VerbosityGuard` notices long commentary between tool calls or a repeat of earlier content and appends a short reminder to the next tool result (at most every other call); the JSON output gained `assistant_chars` and `repeat_ratio`.

**Measurement (the `review-project` task, real model):**

| Variant                         | Runs | Real findings in the answer | Median completion tokens | Repeated share |
| ------------------------------- | ---: | --------------------------: | -----------------------: | -------------: |
| Before (old prompt, no guard)   |    4 |                         2/4 |                    2,099 |             5% |
| After (new prompt + guard)      |    6 |                         3/6 |                    2,177 |             1% |
| After + `frequency_penalty` 0.3 |    6 |                         1/6 |                    1,858 |             1% |

The standard nine-task suite was re-run with the new prompt: **27/27 success** (before 27/27); total completion tokens 11,672 → 11,727 (the same).

**Honest reading:**

- **I could not reproduce the user's very long output.** My 11-file sample project is far smaller; the baseline output was already ~2,100 tokens with a 5% repeat share. The prompt and guard cut the repeat share from 5% to 1%, but **did not measurably change output length or success** (N = 4–6, the difference is within noise).
- **`frequency_penalty` did not help** (1/6 success, no meaningful difference in length), so it is **off by default** and only exists as an experimental `EVREN_FREQUENCY_PENALTY` setting.
- The "real findings" check is crude (at least two of four keywords must appear in the final answer) and the results are noisy; a metric for the rate of "claims written without reading" **does not exist yet**.
- In the standard suite total tokens went 220,665 → 337,154; the difference comes almost entirely from the natural variance of the `bulk-rename` task (median 13,303 → 36,316; the same task once reached 97,179) while completion tokens did not change; still, that task should be watched alongside the prompt change.
- **Next step:** re-try the same request on the real project (the user's Formexus) with the new version and share the transcript.

## Process and bugs found (fixed)

The suite also exposed flaws in the product and in the tasks. All are recorded:

1. **Product bug:** `Grep` crashed with `spawn ENOTDIR` when `path` was a single file (caught in the pilot run). Fixed, test added.
2. **Product improvement:** the model **miscounted** 42 matches as 30–37 (in 6/6 runs). `Grep` now states the total (`(42 matches)`); the same task went **0/6 → 6/6**. Note: this change was made _after_ the runs of the other 8 tasks, which ran with the old output (the effect on multi-match tasks is small).
3. **Task flaws (mine):** in the first run `bulk-version` was ambiguous (dependency versions too?), `bulk-rename` had a trap in a comment line and the 20-turn cap unfairly punished hand editing, the `big-log-count` question pushed the model toward a wrong regex, and `create-cli` was ESM/CJS-ambiguous. The tasks were corrected and the three affected ones re-run. **The raw results of the first run are in the repository too** ([`evals/results/`](../../evals/results/)): in that first round the baseline scored 20/27 and Script-off 19/27; most of the gap was task ambiguity, not the model.

## Limits (honestly)

- **Small sample:** 9 tasks × 3 repetitions. The direction is consistent but exact percentages can move by a few points; the model behaves differently every run.
- **I wrote the tasks**; they are small and synthetic and do not represent the complexity of real projects. Script's gain grows with the size of the job, but that was not measured here.
- One model, one day. When paid pricing starts the _token_ count stays the same but the cost in CR must be verified separately.
- A `no-task` variant (subagents off) is defined but was not run this round; the subagent gain still rests on [individual measurements](subagents.md#cost-when-to-use-it).

## Reproducing

```bash
pnpm build
node evals/run.mjs --reps 3 --variants baseline,no-script --out evals/results/mine.jsonl
node evals/report.mjs evals/results/mine.jsonl
```

Gateway settings (`EVREN_API_KEY`, `EVREN_BASE_URL`) are read from the root `.env` or the environment; every run uses an isolated temp directory and `HOME`. The runs make real requests (free for now).
