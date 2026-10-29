# Permissions and security

usta's security idea is simple: **whatever the model asks for, every tool call passes through a single gate**, and the gate consults the user's rules. This page explains how the gate works, what it guarantees and what it does **not** guarantee.

## Permission modes

| Mode          | Reads | Write/Edit in the working directory | Bash / Script | When                                                                       |
| ------------- | ----- | ----------------------------------- | ------------- | -------------------------------------------------------------------------- |
| `default`     | free  | asks                                | asks          | Default                                                                    |
| `acceptEdits` | free  | automatic                           | asks          | When you trust the edits                                                   |
| `auto`        | free  | automatic                           | classified    | Fewer prompts, same safety rules: [Auto mode](auto-mode.md) (experimental) |
| `plan`        | free  | **forbidden**                       | **forbidden** | Research and a plan first                                                  |
| `bypass`      | free  | automatic                           | automatic     | Isolated environments only; `-y` or user setting                           |

⇧Tab cycles `default → acceptEdits → auto → plan` (you cannot reach `bypass` from there). Paths **outside** the working directory ask in every mode (except bypass).

## Decision order

The permission engine decides for a tool call in this order; the first match wins:

1. A **`deny` rule** matches → denied (not even bypass can override it).
2. A changing tool in **plan mode** → denied.
3. `ExitPlanMode` → asks for approval in plan mode, otherwise denied.
4. A write to a **protected path** (`.git/`, `.usta/`, `~/.usta/`) → asks (except bypass; even an `allow` rule cannot override it).
5. An **`ask` rule** matches → asks.
6. An **`allow` rule** matches (session rules included) → allowed.
7. `bypass` → allowed.
8. A path outside the working directory → asks (except `~/.usta/outputs/**`, which may be read freely).
9. A read-only tool → allowed.
10. `acceptEdits` + a file tool → allowed.
11. Otherwise → asks. (A rule `mcp__server` covers all MCP tools of that server: [MCP](mcp.md).) (In `auto` mode this step is **classified**: `safe` is allowed, `risky`/`unsure` asks; the classifier cannot loosen any step above. See [Auto mode](auto-mode.md).)

If the decision is "ask" and no interactive approval exists (`-p` with no terminal), the call is **denied** and the reason is passed to the model.

## Rule syntax

`Tool` or `Tool(specifier)`. Tool names: `Read` `Write` `Edit` `Glob` `Grep` `Bash` `Script` `Task` `TaskOutput` `ExitPlanMode`.

```
Bash                       every Bash call
Bash(git status:*)         commands starting with "git status" (word-bounded)
Bash(npm test)             exactly this command only
Read(.env)                 .env in any directory
Edit(src/**)               every file under src/
Read(~/.ssh/**)            a path in the home directory
Script(python)             python scripts
Task(general)              delegating to the general subagent
```

**Path specifiers** work like gitignore: a pattern without `/` (`.env`) matches by name in any directory; a pattern with `/` is relative to the working directory; `~/` is the home directory; a directory name covers everything inside it. Paths are compared **with symlinks resolved**: a `harmless.txt` that points to `.env` is caught by a `Read(.env)` rule too.

### Bash rules and compound commands

A shell command can look like one command and run several. So:

- An **allow** rule requires, when the command is split by `&&`, `||`, `;`, `|`, `&` or a newline, that **every sub-command** matches an allow rule. `git status; rm -rf /` is **not** approved by `Bash(git status:*)`.
- Commands containing `$(…)`, backticks, `(`, `)`, `<`, `>` **never** match an allow rule (they ask). `2>&1` is an exception.
- `FOO=1 git status` (a leading environment assignment) does not match an allow rule.
- **deny/ask** rules split more widely: the `rm -rf x` inside `echo $(rm -rf x)` is caught by a `Bash(rm:*)` deny rule.

> **Limit:** Prefix rules cannot see through indirect calls such as `xargs rm`, `bash -c "rm …"`, `env rm` or `find -exec rm`. A prefix rule is a **convenience, not a sandbox**. If you need real isolation, run usta inside a container/VM and do not use `bypass`.

### "Always allow" inside a session

The `a` key in the approval box adds a **session-only** rule, not a permanent one: for `Bash` just that exact command, for edits in the working directory `acceptEdits`, for paths outside the working directory that directory. For `Script` the target is the script language, so `a` allows _every_ python (or node) script for that session; keep that in mind. For a permanent rule write it into a settings file.

## Secret file protection

`Read`/`Write`/`Edit` refuse `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`, `*.p12`, `*.pfx` by default; `Grep` does not scan them; `Script` never copies them into its working copy.

> **Limit:** This protection is _in the file tools_. The model can run `cat .env` with `Bash`; to block that too, add rules such as `deny: ["Bash(cat .env:*)"]` or do not allow Bash at all.

## Project trust gate

`allow` rules, hooks, `defaultMode`, `models` and `compactAt` from a repository's `.usta/settings.json` are not applied until you approve the file's content; details in [Configuration](configuration.md#project-trust-gate). `bypass` can never come from a project or local file.

## Plan mode

```
usta --plan      # or /plan inside a session, or ⇧Tab
```

1. The model only uses `Read`/`Glob`/`Grep`; write and command calls are denied.
2. When research is done it presents a concrete plan with `ExitPlanMode`. The plan is shown in the approval box.
3. `y` → approve the plan and auto-accept edits (`acceptEdits`) · `e` → approve but ask for each change (`default`) · `n` → reject, the model revises the plan.

The plan-mode reminder is added to the **end** of the prompt (so the cacheable prefix is not disturbed), and the `ExitPlanMode` tool is in the tool list only in this mode.

## Hooks

Hooks are shell commands run at certain points of the lifecycle.

| Event              | When                                                                    | Can block                    |
| ------------------ | ----------------------------------------------------------------------- | ---------------------------- |
| `PreToolUse`       | Before a tool runs (after the permission rules passed)                  | yes                          |
| `PostToolUse`      | After a tool ran                                                        | no (adds feedback)           |
| `UserPromptSubmit` | When the user submits a prompt                                          | yes                          |
| `SessionStart`     | At the first prompt of a session                                        | no (adds context)            |
| `Stop`             | When the model finishes a turn                                          | yes: the agent **continues** |
| `SubagentStop`     | When a subagent finishes (with `agent`, `description`, `result` fields) | no                           |

**Protocol.** The command gets one line of JSON on stdin and `USTA_PROJECT_DIR` in its environment:

```json
{
  "event": "PreToolUse",
  "cwd": "/…/project",
  "sessionId": "2026-10-29-ab12cd",
  "toolName": "Bash",
  "toolInput": { "command": "rm -rf build" }
}
```

`PostToolUse` also carries `toolOutput` (first 5000 characters) and `isError`; `UserPromptSubmit` carries `prompt`.

| Exit  | Meaning                                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`   | Fine. If stdout is `{"decision":"block","reason":"…"}` it blocks; `{"context":"…"}` adds context for the model. For `UserPromptSubmit`/`SessionStart` plain stdout becomes context too |
| `2`   | Block: stderr (or stdout) is returned to the model as the reason                                                                                                                       |
| other | Warning: shown, the flow continues                                                                                                                                                     |

`matcher` is a regular expression that must match the **whole** tool name (`"Write|Edit"`); empty or `*` means all. The timeout is 30 s by default and the process tree is killed.

**Continuing with `Stop`.** If a `Stop` hook blocks (exit 2 or `{"decision":"block","reason":"…"}`) the agent does not stop; the reason is added as a `[Stop hook] …` user message and the model carries on (for example "the tests are still failing"). If the event carries `stopHookActive: true` the agent is already continuing because of a hook; a hook should check it to avoid looping. As a safety net a run continues at most **3** times.

**Module hooks.** Instead of a shell command you can write `{"module": "/path/hook.mjs"}`; the module's default export is a function `(event) => void | {decision?, reason?, context?}` (may be async; the event object is the JSON above). It runs in-process with the same timeout and limits; an error or timeout is only a warning. Because module code in a repository can change under you, modules are read **only from your own settings (`~/.usta/settings.json`) and from [plugins](plugins.md) you installed**; `module` hooks in project settings are ignored with a warning.

**Hooks can only restrict.** A hook saying `allow` cannot override `deny`/`ask` rules; hooks run **after** the permission rules.

```sh
#!/usr/bin/env bash
# .usta/hooks/no-force-push.sh: PreToolUse, matcher: Bash
cmd=$(jq -r '.toolInput.command')
if [[ "$cmd" == *"git push"*"--force"* ]]; then
  echo "force-push is forbidden" >&2
  exit 2
fi
```

## Subagents

Subagents go through **the same gate**: the mode (plan mode included), rules, hooks and checkpoints apply to every tool they use; you can restrict which agents may be used with `Task(agent)` rules. Even when many subagents ask at once, only one approval box is open at a time; background tasks cannot ask, so a call that needs approval is denied. Details: [Subagents](subagents.md#permissions-and-approval).

## Checkpoints and `/rewind`

Every user prompt is a _turn_. Right before Write/Edit/Script changes a file, its previous content (or the fact that it did not exist) is copied to `~/.usta/checkpoints/<session>/`.

```
/rewind          lists the recent turns
/rewind 2        undoes the file changes of the last 2 turns AND returns the conversation to that point
```

The conversation cut is written to the session file, so it also holds when you continue with `usta -c`. After an automatic summary, older turns can only be rewound back to the summary point.

> **Limit:** File changes made through `Bash` are not tracked and cannot be undone.

## What is and is not guaranteed

| Guaranteed                                                        | **Not** guaranteed                                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Every tool call passes the gate and `deny` always wins            | Prefix rules catching indirect commands (`xargs`, `bash -c`)                                                                     |
| Repository settings do not run without approval                   | Blocking secret access through `Bash` (extra rules needed)                                                                       |
| In the file tools, symlinks and `..` are resolved before checking | A `Script` program being unable to reach the network or home directory (it only runs on a copy; its code is approved beforehand) |
| Session/output/checkpoint files have private permissions          | `Bash` changes being undoable                                                                                                    |

To report a vulnerability see [SECURITY.md](../../SECURITY.md).
