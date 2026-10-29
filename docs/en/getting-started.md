# Getting started

## Requirements

| Requirement                  | Why                                                                     |
| ---------------------------- | ----------------------------------------------------------------------- |
| Node.js ≥ 22                 | Runtime (pinned by `.nvmrc`)                                            |
| [pnpm](https://pnpm.io) 12   | Monorepo management (pinned in the `packageManager` field)              |
| An EVREN LLM Gateway account | Access to the model: an API key and the gateway address                 |
| `python3` _(optional)_       | The `Script` tool runs python scripts (Node is enough for node scripts) |
| `rg` (ripgrep) _(optional)_  | `Grep` uses it when installed, otherwise a pure-JS fallback runs        |

## Installation

```sh
git clone git@github.com:Ertugrul-Pakdamar/Usta.git
cd Usta
pnpm install
pnpm build
```

There are two ways to run it:

```sh
pnpm usta --version            # from the repository root (easiest for development)

cd packages/cli && npm link    # makes the `usta` command available everywhere
usta --version
```

> `npm link` puts a symlink into your global npm directory (`npm prefix -g`); remove it with `npm unlink -g @usta/cli`.

## Configuration

usta reads a few environment variables (full list: [Configuration](configuration.md)):

```sh
cp .env.example .env
```

```ini
EVREN_API_KEY=...                         # API key of your gateway account
EVREN_BASE_URL=https://<gateway>/v1       # gateway address (ends with /v1); there is no default
EVREN_DEFAULT_MODEL=qwen3-vl-30b          # optional
```

Variables are looked up in this order (first found wins): real environment variables → `.env` in the working directory → `~/.usta/credentials`.
If you use `usta` from different directories, put the key once into `~/.usta/credentials`:

```sh
mkdir -p ~/.usta && cp .env ~/.usta/credentials && chmod 600 ~/.usta/credentials
```

`.env` is kept out of git by `.gitignore`; **never commit it**.

The interface language follows your system locale (Turkish or English). To change it use `usta --lang en`, `export USTA_LANG=en`, or `/lang en` inside a session ([details](configuration.md#language)).

## Accepting the terms of use

The gateway answers no request until your account has accepted its terms. usta **does not accept them for you**:

```sh
usta terms            # shows the current terms text and version
usta terms accept     # shows the text, waits for you to type the confirmation word, then tells the gateway
```

`accept` only works in an interactive terminal; it cannot be run from a pipe, a script, or the agent's `Bash` tool.

## Verifying the setup

```sh
usta doctor
```

```
✓ API key: EVREN_API_KEY is set
✓ Gateway address: EVREN_BASE_URL is set
✓ Terms of use: v1 accepted
✓ Gateway: 1 model reachable
✓ Default model: qwen3-vl-30b
✓ Quota: 1010 CR · 14976k tokens left today
```

If a line is ✗, its cause and fix are on the [Troubleshooting](troubleshooting.md) page.

## First session

```sh
cd ~/my-project
usta
```

Type a goal, for example _"list the TODO comments under src/ and fix the most urgent one"_. The model uses its tools; for every call that would change something it asks for your approval with a diff:

- `y` allows once, `a` allows similar calls for the rest of the session, `n` denies.
- ⇧Tab cycles the permission mode: _ask_ → _accept edits_ → _auto_ → _plan mode_.
- `Esc` cancels running work; `Ctrl+C` cancels or (when idle) quits.
- `/help` lists every command.

Before a big or risky task try **plan mode** (`usta --plan` or `/plan`): the model only reads, presents a plan at the end, and changes nothing until you approve it.

## Headless use

Run once, non-interactively, with `-p` (CI, scripts):

```sh
usta -p "summarize the dependencies in package.json"
usta -p "..." --output-format json
```

JSON output:

```json
{
  "result": "…",
  "turns": 3,
  "stop_reason": "end_turn",
  "usage": {
    "prompt_tokens": 3781,
    "completion_tokens": 301,
    "cached_tokens": 2416,
    "cache_ratio": 0.639
  },
  "spent_cr": 0,
  "remaining_cr": 1010
}
```

| Exit code | Meaning                                      |
| --------- | -------------------------------------------- |
| `0`       | Finished normally                            |
| `1`       | Error (configuration, gateway, invalid flag) |
| `2`       | Stopped early (turn limit or cancelled)      |
| `3`       | Stopped because the budget would be exceeded |

In non-interactive mode a call that needs approval is **denied** (there is nobody to ask). To allow things, add rules:

```sh
usta -p "run the tests" --allow 'Bash(pnpm test:*)'
usta -p "..." --permission-mode acceptEdits      # allow edits inside the working directory
```

`-y/--yes` (bypass) allows everything **but cannot override deny rules**; use it only in isolated environments where you know what will happen.
