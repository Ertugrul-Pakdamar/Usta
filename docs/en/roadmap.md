# Roadmap

usta is in **alpha**. Milestones go in order; each one aims for a working product and measured results at its end. This page is updated together with the code.

| Milestone             | Status | Scope                                                                                                                                                                                                                                                                                   |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** Skeleton       | ✅     | Monorepo, Biome, Vitest, CI, `doctor`, ADRs                                                                                                                                                                                                                                             |
| **M1** Core           | ✅     | Provider, agent loop, 6 file/shell tools, headless `-p`, `.env` loading, terms-of-use flow                                                                                                                                                                                              |
| **M2** Interface      | ✅     | Ink TUI, streaming, markdown, diff-based approval, slash commands, session records and resume                                                                                                                                                                                           |
| **M3** Security       | ✅     | Permission engine and modes, layered settings, project trust gate, plan mode, checkpoints/`/rewind`, hooks                                                                                                                                                                              |
| **M4** Token economy  | ✅     | Model registry, token estimation/counting, cost and quota, budgets, cache-friendly prompt, output limiter, read cache, automatic summary, `/context` `/cost` `/compact`, `rg`, `Script`, heuristics                                                                                     |
| **M4.5** Localization | ✅     | `t()` + TR/EN catalogs (complete at compile time), language selection (`--lang`/`USTA_LANG`/setting/locale), `/lang`, all user-facing text, `Intl` number/date formats, model-facing text fixed English, English documentation                                                          |
| **M5** Subagents      | ✅     | `Task`/`TaskOutput`, built-in (`explore`, `plan`, `general`) and custom agents (`agents/*.md`, trust gate for project agents), shared permission gate and a one-box approval queue, background tasks and `/tasks`, the `SubagentStop` hook, `models.fast` routing, subagent transcripts |
| **M5.5** Auto mode    | ✅     | A classifier-backed permission mode: a fast model classifies each changing call with its context as "safe / risky / unsure"; deny rules and protected paths stay above it; circuit breaker; audit log                                                                                   |
| **M6** Extensibility  | 🔜     | Skills, slash commands, plugin manifest and `usta plugin`, MCP connectors, TS-module hooks, continuing from a `Stop` hook, example plugins                                                                                                                                              |
| **M7** Release        | 🔜     | Single-file binary (`bun build --compile`), a real A/B **evaluation report** (success, tokens, CR), `@file` completion, syntax-highlighted diff, `v0.1.0`                                                                                                                               |

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

For contributing see [CONTRIBUTING](contributing.md); open an issue for ideas.
