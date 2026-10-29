# usta documentation

This directory is for both users and contributors. The project is in alpha; the docs are updated together with the code and every page describes behavior that is actually implemented (planned things are clearly marked **planned**).

_Turkish documentation: [docs/README.md](../README.md)._

## For users

| Document                                   | Contents                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| [Getting started](getting-started.md)      | Installation, configuration, terms of use, first session, headless use                                        |
| [Configuration](configuration.md)          | Environment variables, settings files and their layers, every CLI flag, the language, the `~/.usta` directory |
| [Permissions and security](permissions.md) | Modes, rule syntax, Bash safety, project trust gate, plan mode, hooks, rewind                                 |
| [Token economy](token-economy.md)          | Cost visibility, caching, output limiting, summarization, budgets, Script-first                               |
| [Subagents](subagents.md)                  | `Task`, built-in and custom agents, background tasks, permissions, measured cost                              |
| [Troubleshooting](troubleshooting.md)      | Common problems and their fixes                                                                               |

## For contributors

| Document                              | Contents                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------- |
| [Architecture](architecture.md)       | Packages, agent loop, tool gate, localization, file formats, test strategy |
| [Extending](extending.md)             | Adding a tool (today), hooks, skills/plugins/MCP (planned)                 |
| [Roadmap](roadmap.md)                 | Milestones, their status and the reasons for the order                     |
| [Architecture decision records](adr/) | Why we did it this way: decisions backed by evidence                       |
| [Contributing](contributing.md)       | Development environment, workflow, standards                               |
