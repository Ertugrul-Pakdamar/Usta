# Roadmap

usta is in **alpha**. Milestones go in order; each one aims for a working product and measured results at its end. This page is updated together with the code.

<p align="center"><img src="../assets/roadmap.en.svg" alt="Roadmap: M0–M7 done" width="760"></p>

| Milestone             | Status | Scope                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** Skeleton       | ✅     | Monorepo, Biome, Vitest, CI, `doctor`, ADRs                                                                                                                                                                                                                                                                                                                                           |
| **M1** Core           | ✅     | Provider, agent loop, 6 file/shell tools, headless `-p`, `.env` loading, terms-of-use flow                                                                                                                                                                                                                                                                                            |
| **M2** Interface      | ✅     | Ink TUI, streaming, markdown, diff-based approval, slash commands, session records and resume                                                                                                                                                                                                                                                                                         |
| **M3** Security       | ✅     | Permission engine and modes, layered settings, project trust gate, plan mode, checkpoints/`/rewind`, hooks                                                                                                                                                                                                                                                                            |
| **M4** Token economy  | ✅     | Model registry, token estimation/counting, cost and quota, budgets, cache-friendly prompt, output limiter, read cache, automatic summary, `/context` `/cost` `/compact`, `rg`, `Script`, heuristics                                                                                                                                                                                   |
| **M4.5** Localization | ✅     | `t()` + TR/EN catalogs (complete at compile time), language selection (`--lang`/`USTA_LANG`/setting/locale), `/lang`, all user-facing text, `Intl` number/date formats, model-facing text fixed English, English documentation                                                                                                                                                        |
| **M5** Subagents      | ✅     | `Task`/`TaskOutput`, built-in (`explore`, `plan`, `general`) and custom agents (`agents/*.md`, trust gate for project agents), shared permission gate and a one-box approval queue, background tasks and `/tasks`, the `SubagentStop` hook, `models.fast` routing, subagent transcripts                                                                                               |
| **M5.5** Auto mode    | ✅     | A classifier-backed permission mode: a fast model classifies each changing call with its context as "safe / risky / unsure"; deny rules and protected paths stay above it; circuit breaker; audit log                                                                                                                                                                                 |
| **M6** Extensibility  | ✅     | **6a skills + custom commands; 6b MCP; 6c plugins, module hooks, continuing on `Stop`.** Scope: Skills, slash commands, plugin manifest and `usta plugin`, MCP connectors, TS-module hooks, continuing from a `Stop` hook, example plugins                                                                                                                                            |
| **M7** Release        | ✅     | **7a ✅ `@file` completion and colored diffs**; **7b ✅ evaluation report**; **7c ✅ binary (Node SEA) and `usta login`**; **`v0.1.0` is released.** Scope: Single-file binary (Node SEA instead of `bun build --compile`, [ADR-0011](adr/0011-single-file-binary.md)), a real A/B **evaluation report** (success, tokens, CR), `@file` completion, syntax-highlighted diff, `v0.1.0` |

## Why this order

- **M4.5 before M5:** every new screen text makes a later migration more expensive.
- **M5.5 after M5:** the classifier needs the `models.fast` routing and the subagent infrastructure.
- **Evaluation in M7:** to publish the "fewer tokens" claim (for example Script-first's saving) as a measurement, not an estimate.

## Known limits (today)

- File changes made through Bash are not checkpointed.
- Bash prefix rules cannot see indirect calls (`xargs rm`, `bash -c`); they are not a sandbox.
- The Script copy is not a security isolation.
- The CR spending estimate cannot be tested during the free period (until 2026-12-01).
- The gateway has a single model; model routing has no effect yet.
- Auto mode is experimental: the classifier is a model and can be wrong; the measurement used a small set ([Auto mode](auto-mode.md#measured-accuracy)).
- Subagents have no automatic summarization; delegating is more expensive for one small search ([Subagents](subagents.md#cost-when-to-use-it)).
- The section headings in the command-line help (`Usage:`, `Options:`) come from the library and stay English.

For the candidate list of next steps and the feature comparison with Claude Code see [Comparison and next steps](comparison.md). For contributing see [CONTRIBUTING](contributing.md); open an issue for ideas.
