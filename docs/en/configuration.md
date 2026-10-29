# Configuration

usta is configured from three sources: **environment variables** (gateway access), **settings files** (permissions, hooks, budget, models) and **command-line flags** (for that session). The more specific one wins: flag > settings file > default.

## Environment variables

| Variable                   | Required | Meaning                                                                                          |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `EVREN_API_KEY`            | yes      | Gateway API key. It is masked before anything is logged or written to session files              |
| `EVREN_BASE_URL`           | yes      | Gateway address, ends with `/v1`. It is deployment specific, so there is **no** built-in default |
| `EVREN_DEFAULT_MODEL`      | no       | Model used when no other is chosen (default `qwen3-vl-30b`)                                      |
| `EVREN_DEFAULT_MAX_TOKENS` | no       | Upper bound for one model reply; empty means the gateway default                                 |
| `EVREN_FAST_MODEL`         | no       | Cheaper model for context summaries; empty means the main model (the `models.fast` setting wins) |
| `USTA_NO_RG`               | no       | When set, `rg` is not used and the pure-JS search runs                                           |
| `USTA_LANG`                | no       | Interface language: `tr` or `en` ([Language](#language))                                         |

Lookup order (first found wins): real environment variables → `./.env` → `~/.usta/credentials`. The files use `KEY=value` lines. Instead of editing `~/.usta/credentials` by hand use `usta login` / `usta logout` (writes with 0600, keeps other lines).

## Settings files

```
~/.usta/settings.json              user         (every field applies)
<project>/.usta/settings.json      project, in the repo   (trust gate, see below)
<project>/.usta/settings.local.json  local, gitignored    (belongs to the user)
```

Layers are merged: lists (`allow`, `deny`, `ask`, hooks) are concatenated, scalar values take the later layer, and **`deny` always wins**. An invalid file is not silently ignored: usta stops with an error (so rules cannot disappear unnoticed).

### Schema

```json
{
  "permissions": {
    "allow": ["Bash(git status:*)", "Edit(src/**)"],
    "deny": ["Read(.env)", "Bash(rm:*)"],
    "ask": ["Bash(git push:*)"],
    "defaultMode": "default"
  },
  "hooks": {
    "PreToolUse": [{ "matcher": "Bash", "command": "./scripts/check-command.sh", "timeout": 10 }]
  },
  "models": { "main": "qwen3-vl-30b", "fast": "qwen3-vl-30b" },
  "budget": { "tokens": 500000, "cr": 5 },
  "compactAt": 0.8,
  "language": "en"
}
```

| Field                                | Type                                                       | Description                                                                          |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `permissions.allow` / `deny` / `ask` | `string[]`                                                 | [Rule syntax](permissions.md#rule-syntax)                                            |
| `permissions.defaultMode`            | `default` \| `acceptEdits` \| `auto` \| `plan` \| `bypass` | Initial permission mode. `bypass` is valid **only in user settings**                 |
| `hooks.<Event>`                      | `{matcher?, command, timeout?}[]`                          | [Hooks](permissions.md#hooks). `timeout` in seconds, default 30                      |
| `models.main` / `models.fast`        | `string`                                                   | Main model and the summarization model                                               |
| `budget.tokens`                      | `int`                                                      | Cap on total tokens processed in a session (input + output)                          |
| `budget.cr`                          | `number`                                                   | Credit (CR) cap for a session                                                        |
| `compactAt`                          | `0.3 – 0.95`                                               | Fraction of the context window at which it is summarized automatically (default 0.8) |
| `language`                           | `tr` \| `en`                                               | Interface language ([Language](#language)). Harmless, so it applies from every layer |

### Project trust gate

A `.usta/settings.json` that comes from a repository may have been written by someone else. So if the file contains **an `allow` rule, a hook, `defaultMode`, `models` or `compactAt`**, usta does **not apply them until you have approved its content**. At startup it lists what the file defines and asks:

```
This project defines the following in /…/project/.usta/settings.json:
  - allow: Bash
  - hook PreToolUse: ./check.sh
These can run commands on this computer without asking.
Do you trust these project settings? [y/N]
```

- Approval is bound to the file's **content digest (SHA-256)** and stored in `~/.usta/trust.json`; if the file changes, you are asked again.
- `deny`, `ask` and `budget` always apply (they can only restrict).
- In non-interactive runs (`-p`, no terminal) the untrusted parts are skipped with a warning. In CI, if you trust the file, pass `--trust-project`.
- The same gate applies to **project agents** (`.usta/agents/*.md`): they are not loaded until their exact content is approved, and `--trust-project` trusts both ([Subagents](subagents.md#custom-agents)).

## Command line

```
usta [prompt...]                   interactive session (starts with the prompt)
usta doctor                        check connectivity, key, terms status, quota
usta terms [accept]                show / accept the terms of use
usta models                        list the models on the gateway
```

| Flag                          | Meaning                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `-p, --print <prompt>`        | Run non-interactively, print the result, exit                                |
| `--output-format text\|json`  | Output format for `-p` (default `text`)                                      |
| `--model <name>`              | Model for this session                                                       |
| `--max-turns <n>`             | Maximum agent turns for `-p` (default 25; 50 in an interactive session)      |
| `-c, --continue`              | Continue the latest session of this directory                                |
| `-r, --resume [id]`           | Continue a specific (or the latest) session                                  |
| `--permission-mode <mode>`    | `default` \| `acceptEdits` \| `auto` \| `plan` \| `bypass`                   |
| `--plan`                      | Start in plan mode                                                           |
| `--allow <rule...>`           | Add an allow rule (repeatable)                                               |
| `--deny <rule...>`            | Add a deny rule (repeatable)                                                 |
| `--trust-project`             | Trust the repository's `.usta/settings.json` without asking                  |
| `--disable-tools <name...>`   | Leave tools out of this session (e.g. `Script Task`); used by the eval suite |
| `--budget <cr>`               | Credit budget for the session                                                |
| `--token-budget <n>`          | Token budget for the session; `200k`, `1.5m` are accepted                    |
| `--lang <lang>`               | Interface language: `tr` or `en`                                             |
| `-y, --yes`                   | `bypass` mode: **allows everything except deny rules**                       |
| `-V, --version`, `-h, --help` | Version, help                                                                |

## Language

The interface (menus, error messages, `doctor`, `terms`, command-line help, reports) is available in Turkish and English. The language is chosen in this order; **an explicit choice beats the system locale**:

1. the `--lang tr|en` flag
2. the `USTA_LANG` environment variable
3. `"language"` in a settings file
4. the system locale (`LC_ALL`, `LC_MESSAGES`, `LANG`, `LANGUAGE`): `tr*` → Turkish, `en*` → English, **any other language → English** (international fallback)
5. no locale, or `C`/`POSIX`: Turkish

Inside a session, `/lang en` or `/lang tr` switches the language immediately (for that session; to make it permanent use `USTA_LANG` or the `language` setting). Numbers and dates are formatted for the language (`1,010 CR` / `1.010 CR`, `December 1, 2026` / `1 Aralık 2026`).

**Text sent to the model does not depend on the language.** The system prompt, tool descriptions, tool results and error messages, and permission/hook denial reasons are always English, so behavior stays consistent, fewer tokens are spent and the cacheable prompt prefix is never disturbed. The interface language only changes what _you_ read: for example you read a denied call in your language while the model receives the English reason.

> **Limit:** The section headings in the command-line help (`Usage:`, `Options:`, `Commands:`) come from the `commander` library and stay English; the descriptions are translated.

## The `~/.usta` directory

| Path                                    | Contents                                       | Notes                                          |
| --------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `credentials`                           | `EVREN_*` variables                            | written by `usta login` (0600)                 |
| `settings.json`                         | User settings                                  |                                                |
| `trust.json`                            | Digests of trusted project settings            |                                                |
| `sessions/<id>.jsonl`                   | Conversation records                           | 0600; continue with `-c`/`-r`                  |
| `checkpoints/<id>/`                     | File backups for `/rewind`                     | 0600                                           |
| `outputs/<id>/`                         | Full tool outputs that did not fit the context | Older than 7 days are deleted at startup       |
| `cache/models.json`                     | Cache of gateway model info                    | Valid for 1 hour                               |
| `agents/*.md`                           | The user's custom subagents                    | [Subagents](subagents.md#custom-agents)        |
| `subagents/<session>/`                  | Subagent conversation records                  | 0600; for auditing                             |
| `plugins/<name>/`, `plugins/state.json` | Installed plugins and their state              | [Plugins](plugins.md)                          |
| `mcp.json`                              | MCP servers (0600)                             | [MCP](mcp.md)                                  |
| `skills/`, `commands/`                  | User skills and custom commands                | [Skills](skills.md)                            |
| `audit/<session>.jsonl`                 | Auto mode decisions                            | 0600; [Auto mode](auto-mode.md#audit-and-cost) |

Session files may contain tool output; review them before sharing.
