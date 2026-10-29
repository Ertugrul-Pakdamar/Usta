# Example plugins

Install one with `usta plugin install ./plugins/<name>` (you are shown what it contains first).
Format and rules: [docs/plugins.md](../docs/plugins.md).

- **commit-helper:** a `/commit` command and a `commit-style` skill.
- **guard-rails:** a `PreToolUse` module hook that blocks `--no-verify`, and a `Stop` module hook that makes the agent resolve `TODO(usta)` markers it left behind.
