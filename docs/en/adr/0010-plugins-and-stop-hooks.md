# ADR-0010: Plugins, module hooks and continuing on Stop

**Status:** Accepted · **Date:** 2026-10-29

## Context

Skills, commands, agents, hooks and MCP existed separately; distributing them to a team needed one package. Also, hooks were only shell commands and `Stop` was informational (you could not write "do not stop while the tests are still failing").

## Decision

1. **Plugin = folder + `usta-plugin.json`.** It joins the existing loaders as an extra root (skills/commands/agents); hooks and MCP servers live in the manifest. No new loading mechanism; precedence plugin < user < project.
2. **The install consent is bound to the content and cannot be skipped.** The contents are shown and an interactive terminal is required (no `--yes`). A digest of all files is stored at install; a plugin that changes afterwards is skipped and asks for approval again. Reason: plugin code runs with the user's privileges (same principle as [ADR-0004](0004-project-trust-gate.md); the difference is that consent is tied to an explicit install action, not to a project).
3. **Sources:** folder and git. npm was deliberately deferred (air-gapped use, an extra dependency).
4. **Module hooks** (`{"module": …}`): in-process, same protocol (block/context), errors and timeouts are warnings. Read **only from user settings and plugins**; ignored in project settings because code in a repository can change after approval.
5. **`Stop` can block:** if a hook blocks, the reason is added as a `[Stop hook] …` user message and the agent continues. Loop checking via `stopHookActive` is left to the hook; at most 3 continuations per run is the hard limit.
6. Hooks still only restrict; they cannot loosen permission rules.

## Consequences

- With the real model, `guard-rails`: the model wrote `TODO(usta)` and said done, the hook made it continue, the model cleaned the marker. Side effect: `Stop` means one more model turn (tokens); the hook itself should be cheap.
- Plugins are not a sandbox; the documentation says so plainly.
- A gap found while testing: the first `no-open-todos` hook did not see new (untracked) files (`git diff HEAD`); noticed while preparing the real-model run (before testing it), untracked files are now scanned too.
