<div align="center">

<img src="docs/assets/logo.svg" alt="usta" width="320">

### A token- and cost-aware coding agent for the terminal, built for the EVREN LLM Gateway

Plan, analyse code, edit files and run commands with **the fewest tokens and the least effort**.

[![CI](https://github.com/Ertugrul-Pakdamar/Usta/actions/workflows/ci.yml/badge.svg)](https://github.com/Ertugrul-Pakdamar/Usta/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)](docs/roadmap.md)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Türkçe](README.md) · **English**

<img src="docs/assets/demo.en.svg" alt="A usta session: the model changes 8 files with one script, applied after the diff is approved" width="720">

</div>

---

> The full documentation under [`docs/`](docs/README.md) is currently in Turkish; English documentation arrives with milestone M4.5 (localization). This page summarizes the project.

## Why usta?

Coding agents are powerful but can be expensive and unsupervised. **usta** tackles three things together:

- **Token economy is a feature, not an afterthought.** A stable prompt prefix lets the gateway cache 50–95% of the prompt; large tool output goes to disk instead of the context; the context is summarized automatically when it fills; and when the same change is needed in many files the model writes one script.
- **Safe by default.** Every tool call passes a permission gate: rules, plan mode, diff-based approval, protected paths, hooks. Settings that ship inside a repository do not take effect until you approve them.
- **Built for sensitive environments.** No telemetry, data only goes to your own EVREN gateway, needs nothing but access to your gateway, secret files are hidden from the model by default.

## Features

- **Agent and tools:** `Read` `Write` `Edit` `Glob` `Grep` `Bash` `Script`, parallel independent calls, streaming, repair of malformed tool calls.
- **Planning:** read-only plan mode → plan approval with `ExitPlanMode` → implementation; ⇧Tab cycles modes.
- **Permissions:** `default` · `acceptEdits` · `plan` · `bypass`; rules such as `Bash(git status:*)`, `Edit(src/**)`, `Read(.env)`; layered settings; project trust gate.
- **Undo:** a checkpoint before every Write/Edit/Script; `/rewind N` restores files **and** the conversation.
- **Hooks:** `PreToolUse` `PostToolUse` `UserPromptSubmit` `SessionStart` `Stop`.
- **Token economy:** `/cost` `/context` `/compact`, budgets (`--budget`, `--token-budget`), cache-friendly prompts, output limiter, read cache.
- **Sessions:** private JSONL files, resume with `usta -c` / `usta -r <id>`.
- **Localization:** Turkish and English interface (`--lang`, `USTA_LANG`, `/lang`); everything sent to the model stays English regardless of the interface language.
- **Headless:** `usta -p "..." --output-format json` for CI and scripts, with meaningful exit codes (`0` ok, `1` error, `2` unfinished, `3` budget).
- **Extensibility:** tools via `@usta/sdk` today; skills, plugins and MCP connectors in [M6](docs/roadmap.md).

## Quick start

**Requirements:** Node.js ≥ 22, [pnpm](https://pnpm.io) 12, an EVREN LLM Gateway account. Optional: `python3` (Script tool), `rg` (fast search).

```sh
git clone https://github.com/Ertugrul-Pakdamar/Usta.git
cd Usta
pnpm install && pnpm build

cp .env.example .env        # fill in EVREN_API_KEY and EVREN_BASE_URL
pnpm usta doctor            # connectivity, key, terms status, quota
pnpm usta terms accept      # read and accept the gateway terms yourself (never automatic)
pnpm usta                   # interactive session
```

Run `usta` from anywhere with `cd packages/cli && npm link`.

## Usage

```sh
usta                                   # interactive
usta "fix the login test"              # start with a prompt
usta -c                                # resume the latest session of this directory
usta --plan                            # start in plan mode
usta --lang en                         # English interface (or USTA_LANG=en)
usta -p "list the TODOs" --output-format json
usta --budget 5 --token-budget 200k
```

## Measured token economy

Measured with `qwen3-vl-30b` on 2026-10-29 using the gateway's own `count_tokens` and `usage`:

| Measurement                                                  | Value                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| Fixed cost of every request (system prompt + 8 tool schemas) | **~1.07k tokens** (was 1.19k before M4, despite two new tools) |
| Share served from the prompt cache on a second request       | **49% – 97%** depending on the workload                        |
| Same change in 8 files                                       | 3 model turns, one script, 3.8k prompt tokens (64% cached)     |

## Security model

- Every tool call goes through the permission engine; **deny always wins**, even in `bypass` mode.
- Allow rules for Bash check every sub-command of a compound command; commands with `$(…)`, backticks or redirection are never auto-approved by a rule.
- `.env`, `*.pem`, `*.key` are unreadable and unwritable by default; symlinks are resolved before checking.
- `allow` rules, hooks and model settings from a repository's `.usta/settings.json` are ignored until you approve its exact content.
- No telemetry. Sessions, saved outputs and checkpoints stay on your machine with private permissions.

## Roadmap

M0–M4 are done (skeleton, core, TUI, security, token economy). M4.5 (localization) is in progress: the interface is done, English documentation is next. Then M5 subagents, M5.5 auto mode, M6 skills/plugins/MCP, M7 single-file binary and v0.1.0. See [docs/roadmap.md](docs/roadmap.md).

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Licensed under [Apache-2.0](LICENSE).
