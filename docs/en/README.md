# usta documentation

This directory is for both users and contributors. The project is in alpha; the docs are updated together with the code and every page describes behavior that is actually implemented (planned things are clearly marked **planned**).

_Turkish documentation: [docs/README.md](../README.md)._

## For users

| Document                                                           | Contents                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| [Getting started](getting-started.md)                              | Installation, configuration, terms of use, first session, headless use                                        |
| [Configuration](configuration.md)                                  | Environment variables, settings files and their layers, every CLI flag, the language, the `~/.usta` directory |
| [Permissions and security](permissions.md)                         | Modes, rule syntax, Bash safety, project trust gate, plan mode, hooks, rewind                                 |
| [Token economy](token-economy.md)                                  | Cost visibility, caching, output limiting, summarization, budgets, Script-first                               |
| [Plugins](plugins.md)                                              | `usta-plugin.json`, install, consent and integrity, examples                                                  |
| [Comparison with Claude Code on the same model](vs-claude-code.md) | Success and tokens: usta 91%, Claude Code 80%; 13.5× fewer tokens; method, raw data, limits                   |
| [Evaluation report](evals.md)                                      | Script A/B measurement: method, result, bugs found, limits                                                    |
| [MCP connectors](mcp.md)                                           | `usta mcp`, configuration, token cost, security                                                               |
| [Skills and commands](skills.md)                                   | `SKILL.md`, `commands/*.md`, on-demand loading, trust gate                                                    |
| [Auto mode](auto-mode.md)                                          | Classifier-backed permission mode, local layer, circuit breaker, audit, measured accuracy                     |
| [Subagents](subagents.md)                                          | `Task`, built-in and custom agents, background tasks, permissions, measured cost                              |
| [Troubleshooting](troubleshooting.md)                              | Common problems and their fixes                                                                               |

## For contributors

| Document                                   | Contents                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| [Architecture](architecture.md)            | Packages, agent loop, tool gate, localization, file formats, test strategy         |
| [Extending](extending.md)                  | Adding a tool (today), hooks, skills/plugins/MCP (planned)                         |
| [Roadmap](roadmap.md)                      | Milestones, their status and the reasons for the order                             |
| [Comparison and next steps](comparison.md) | Feature gaps versus Claude Code, a candidate work list (N1–N12), how to contribute |
| [Architecture decision records](adr/)      | Why we did it this way: decisions backed by evidence                               |
| [Contributing](contributing.md)            | Development environment, workflow, standards                                       |
