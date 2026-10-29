# Comparison with Claude Code and next steps

This page does two jobs: it shows honestly where usta stands **at the feature level compared with Claude Code** (a tool comparison, not a language-model one), and it gathers **what to do next** in one place for contributors. Milestones M0–M7 in the roadmap are done; what is listed here are candidates for `v0.2` and later.

> **Note:** The lines about Claude Code rest on the author's knowledge and may be out of date; the product changes quickly. If you see a wrong line, a correcting PR is very valuable. Every "yes/no" about usta was verified in the code (2026-10-29).

Legend: ✅ present · 🟡 partial/different · ❌ absent.

## Feature comparison

### Core

| Feature                                           | usta | Note                                                                             |
| ------------------------------------------------- | ---- | -------------------------------------------------------------------------------- |
| File/shell/search tools, parallel read-only calls | ✅   | `Read` `Write` `Edit` `Glob` `Grep` `Bash`                                       |
| Permission modes, rule syntax, layered settings   | ✅   | `default` `acceptEdits` `auto` `plan` `bypass`; [Permissions](permissions.md)    |
| Plan mode                                         | ✅   |                                                                                  |
| Classifier-backed automatic mode                  | 🟡   | Present but **experimental**, measured on a small set: [Auto mode](auto-mode.md) |
| Hooks (shell + module), continuing on `Stop`      | ✅   | [Permissions → Hooks](permissions.md#hooks)                                      |
| Subagents, background tasks                       | ✅   | [Subagents](subagents.md)                                                        |
| Checkpoints and `/rewind`                         | 🟡   | Only `Write`/`Edit`/`Script`; **changes made through `Bash` are not tracked**    |
| Session resume, automatic summary (compaction)    | ✅   | `-c` / `-r`, `/compact`                                                          |
| Headless `-p`                                     | 🟡   | `text` and `json`; **no `stream-json`**                                          |

### Extensibility

| Feature                            | usta | Note                                                                              |
| ---------------------------------- | ---- | --------------------------------------------------------------------------------- |
| Skills, custom commands            | ✅   | [Skills](skills.md)                                                               |
| MCP (stdio, HTTP)                  | 🟡   | **Tools** only; no prompts, resources or **OAuth flow** ([MCP](mcp.md))           |
| Plugins                            | 🟡   | Folder and git sources; **no npm, no marketplace** ([Plugins](plugins.md))        |
| Programmatic use (SDK)             | ❌   | `@usta/sdk` is only for writing tools/plugins; there is no API to embed the agent |
| IDE extension                      | ❌   | No VS Code / JetBrains                                                            |
| CI/PR integration (GitHub Actions) | ❌   |                                                                                   |

### Context and tools (the most visible gaps)

| Feature                                        | usta | Note                                                                                                  |
| ---------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| Project instruction file and persistent memory | ❌   | `USTA.md` / `AGENTS.md` / `CLAUDE.md` are not read; no `/memory` or `#` shortcut (it was in the plan) |
| Web access (`WebFetch`, search)                | ❌   | Deliberately deferred for air-gapped environments; should be added switchable off                     |
| Task list (`TodoWrite`)                        | ❌   |                                                                                                       |
| The model asking the user (`AskUser`)          | ❌   |                                                                                                       |
| Background shell (`BashOutput`/`KillShell`)    | ❌   | Every `Bash` call is a new shell; long-running processes cannot be managed                            |
| Image input / screenshots                      | ❌   | The gateway model (`qwen3-vl`) supports images; the interface and tool side are missing               |
| Jupyter notebook editing                       | ❌   |                                                                                                       |

### Security and enterprise

| Feature                                       | usta | Note                                                                                            |
| --------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| Trust gate (settings/agents/MCP from a repo)  | ✅   | Approval bound to the content; [ADR-0004](adr/0004-project-trust-gate.md)                       |
| OS-level sandbox (`bubblewrap`…)              | ❌   | `Bash` rules are **not a sandbox** ([Permissions](permissions.md)); it was optional in the plan |
| Centrally managed settings (corporate policy) | ❌   | Only user/project/local layers exist                                                            |
| Telemetry                                     | ✅   | None at all; data goes only to your gateway                                                     |

### Interface comfort

| Feature                                            | usta | Note                                                |
| -------------------------------------------------- | ---- | --------------------------------------------------- |
| `@file` completion, colored diffs                  | ✅   | Diff coloring is a small, dependency-free tokenizer |
| Vim mode, output styles, status-line customization | ❌   |                                                     |
| Parallel sessions with git worktrees               | ❌   |                                                     |
| Scheduled/remote sessions, voice input             | ❌   |                                                     |
| Themes (light/dark) and rich markdown view         | 🟡   | `NO_COLOR` is respected; there is no theme picker   |

## Where usta differs (what Claude Code does not have, or does differently)

- **A measured advantage on the same model (on this eval set):** with `qwen3-vl-30b` usta had 91% success against Claude Code's 80% and used **13.5× fewer tokens**; method, raw data and limits: [Comparison with Claude Code on the same model](vs-claude-code.md). This does not make up for the gaps listed above.
- **Token and credit economy at the center:** up-front cost estimate, credit budget (`--budget`), gateway quota, cache-hit display, `/cost` and `/context`. Measurements: [Token economy](token-economy.md).
- **The `Script` tool:** makes a bulk change with one script and a diff approval; in the evals **−56% tokens** on bulk edits ([report](evals.md)).
- **EVREN-specific:** only the user can accept the terms of use, the credit balance comes from `/v1/quota`, and the API key and address are entered inside the app (`usta login`).
- **Defense context:** zero telemetry, the gateway as the only outside target, secret-file protection, a single file you can copy into an offline environment.
- **Open and auditable:** Apache-2.0, every decision in the [ADRs](adr/README.md), measurements and bugs in the docs.

## Maturity and known limits

- usta is **0.1.0**, a single developer; its usage and test breadth are far below a mature product. Our eval is small (9 tasks, one model): [its limits](evals.md#limits-honestly).
- The binary was hand-tested only on Linux x64; macOS, Windows and arm64 builds are produced in CI but not yet exercised in real use.
- One model (`qwen3-vl-30b`): model routing is still ineffective; tool-calling reliability depends on the model ([experiences](roadmap.md#known-limits-today)).

## Next steps (candidate list)

Size: **S** (a few hours–1 day), **M** (a few days), **L** (a week+). Priority follows "how much it is felt in daily use" and "how much it blocks users"; it is open to discussion. Announce the item you want to work on with an [issue](https://github.com/Ertugrul-Pakdamar/Usta/issues/new/choose) first ([CONTRIBUTING](contributing.md)).

### High priority

| #   | Item                                                 | Size | Design note                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **`USTA.md` / `AGENTS.md` / `CLAUDE.md` and memory** | M    | `~/.usta/USTA.md` + project `USTA.md` (+ the other names for compatibility) enter the system prompt as a **stable prefix** (cache: [ADR-0005](adr/0005-stable-prompt-prefix.md)); `/memory`, the `#` shortcut. A file from a repository must go through the **trust gate**. |
| N2  | **Image input**                                      | M    | `Read` sends an image (png/jpg) as `image_url`; paste/`@image` in the TUI. First measure how the gateway handles images together with tool calls. Token cost and `count_tokens` behavior must be documented.                                                                |
| N3  | **`--output-format stream-json`**                    | S–M  | Line-by-line JSON event stream (text, tool start/result, usage); the basis for IDEs/automation. The schema must be documented and versioned.                                                                                                                                |
| N4  | **`bubblewrap` sandbox (Linux)**                     | L    | Optional for `Bash`/`Script`: read-only root, only the project writable, network can be cut. It does not replace permission rules, it is an extra layer. `doctor` should show its state.                                                                                    |
| N5  | **Tracking `Bash` changes**                          | M    | Include a project-directory snapshot before/after a command in the checkpoint (the cost/false-positive trade-off must be measured).                                                                                                                                         |

### Medium priority

| #   | Item                                            | Size | Design note                                                                                                                                                                                              |
| --- | ----------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N6  | `TodoWrite` and `AskUser` tools                 | S    | Small, state-only tools; a task list in the TUI. `AskUser` must be refused in automation (nobody to ask).                                                                                                |
| N7  | `WebFetch` (switchable off)                     | S–M  | Fully disableable by a setting; allow/deny domain rules; output goes through the limiter; **internal-network/SSRF** protection is a must.                                                                |
| N8  | Background shell (`BashOutput`, `KillShell`)    | M    | Long-running processes (dev server, watcher); cleanup at session end; consistent with [subagent](subagents.md) background tasks.                                                                         |
| N9  | MCP: OAuth, prompts, resources                  | M–L  | Resources and prompts first (via `@`), then OAuth. Token cost and trust-gate effects in the line of [ADR-0009](adr/0009-mcp.md).                                                                         |
| N10 | Plugins: npm source and a corporate marketplace | M    | `marketplace.json` (an internal list of repositories); source verification and signature/digest binding; the install consent must **stay unskippable** ([ADR-0010](adr/0010-plugins-and-stop-hooks.md)). |
| N11 | Centrally managed settings                      | M    | An unchangeable layer above user/project (e.g. `/etc/usta/managed.json`): `deny` rules, disabled features (web, bypass), mandatory hooks.                                                                |
| N12 | A broader, independent eval                     | M    | 9 tasks are not enough; tasks from real repositories, `no-task` and auto-mode variants, other models. Update the report with the new numbers.                                                            |

### Low priority / ideas

- Vim mode, a theme picker, output styles, a customizable status line.
- Parallel sessions with git worktrees.
- IDE extensions (they need N3 `stream-json`/an SDK first) and GitHub Actions integration.
- A Jupyter notebook editing tool.
- Diff coloring with a real parser (multi-line comments/strings).
- Model-specific routing: let `models.fast`/`main` really differ once the gateway offers several models.

### Technical debt and verification

- Trying the macOS/Windows/arm64 binaries on real machines; documenting and testing the Git Bash/WSL assumption for `bash` hooks and the `Bash` tool on Windows.
- A larger labelled set and regular regression measurement for the auto-mode classifier.
- Automatic release notes for `CHANGELOG` with Changesets (it was in the plan).
- A documentation site (VitePress) — plain Markdown for now.

## How to contribute

1. Pick an item and open an [issue](https://github.com/Ertugrul-Pakdamar/Usta/issues/new/choose) describing the scope (which item, how you will measure it).
2. Follow the workflow in [CONTRIBUTING](contributing.md): a branch, tests (`pnpm test`), a docs update, an ADR if needed.
3. If you make a behavior claim ("saves X tokens", "Y is safe") **measure it** ([the eval suite](../../evals/README.md)); write the bad results down too.
4. If you touch security-sensitive areas (permissions, the trust gate, the sandbox) discuss the design in the issue first.

This page is updated together with the code: when an item is finished, mark it ✅ and link the relevant doc.
