# Troubleshooting

Run `usta doctor` first; it shows most problems directly.

| Symptom | Cause | Fix |
|---|---|---|
| `✗ API key: EVREN_API_KEY is not set` | The key is not in the environment | Add it to `.env` or `~/.usta/credentials` ([Getting started](getting-started.md#configuration)) |
| `✗ Gateway address: EVREN_BASE_URL is not set` | There is no built-in address | Add `EVREN_BASE_URL=https://<gateway>/v1` |
| `✗ Terms of use: Not accepted` | The account has not accepted the terms | Read them with `usta terms`, accept (by typing yourself) with `usta terms accept` |
| `Error: Invalid API key (HTTP 401)` | Wrong/revoked key | Renew the key in the gateway panel |
| `Rate limit or quota exceeded (HTTP 429)` | The 5-minute or the daily quota is used up | Look at the quota with `/cost`; wait, or set a budget |
| `The content safety layer rejected the request` | The gateway's `content_guard` layer blocked the prompt | Rephrase the prompt; check the usage policy |
| `usta: command not found` | `npm link` was not run | `cd packages/cli && npm link`, or `pnpm usta` from the repo root |
| `usta` prints the help text instead of starting | stdin/stdout is not a terminal | Run it in a terminal or use `-p` |
| `-c` "No session to resume was found" | Sessions are looked up per directory | Run it in that project directory or pass `-r <id>` (`/session` shows the id) |
| `Read` "Access denied: .env may contain secrets" | Secret file protection | It is intentional ([permissions](permissions.md#secret-file-protection)) |
| In `-p` mode a tool "was not allowed: approval is needed" | Nobody to ask | Add `--allow 'Bash(…)'` or `--permission-mode acceptEdits` |
| Exit code 3 | The budget would be exceeded | Raise `--budget`/`--token-budget` or split the session |
| `Could not summarize the context` warning | The summarization request failed | It is transient; try `/compact` by hand, if it persists `/clear` |
| Script: "Project is too large to copy" | The copy exceeded 150 MB | Move big directories to the excluded ones or run the script in a narrow subdirectory |
| Script: python not found | `python3` is not installed | Install it, or let the model write a `node` script |
| Unexpected paste behavior | A newline inside pasted text is *not a submit* | By design: pasted text is inserted as one piece; press Enter separately to send |
| The interface is not in the language you expect | Language order: `--lang` > `USTA_LANG` > setting > system locale | `usta --lang en`, `export USTA_LANG=en` or `/lang en`; see [Configuration → Language](configuration.md#language) |
| `--help` headings are English | `Usage:`/`Options:` come from the library | Known limit; the descriptions are translated |

## For diagnosis

```sh
usta doctor                 # overall state
usta models                 # gateway models
usta -p "hello" --output-format json   # end to end, with usage values
```

Session files are under `~/.usta/sessions/` (they may contain tool output; clean them before attaching to a bug report). When reporting a bug give the information asked for in the [issue template](../../.github/ISSUE_TEMPLATE/bug_report.yml).
