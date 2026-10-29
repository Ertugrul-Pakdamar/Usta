# Plugins

A plugin bundles skills, custom commands, subagents, hooks and MCP servers in **one folder**. It is the way to distribute them to a team.

```text
my-plugin/
├─ usta-plugin.json        # required: name, version, hooks, MCP servers
├─ skills/<name>/SKILL.md  # → Skills
├─ commands/<name>.md      # → custom commands
├─ agents/<name>.md        # → subagents
└─ hooks/…                 # module/command files the manifest refers to
```

```json
{
  "name": "guard-rails",
  "version": "0.1.0",
  "description": "…",
  "hooks": {
    "PreToolUse": [{ "matcher": "Bash", "module": "hooks/no-skip-hooks.mjs" }],
    "Stop": [{ "command": "${PLUGIN_ROOT}/check.sh", "timeout": 20 }]
  },
  "mcpServers": { "db": { "command": "node", "args": ["${PLUGIN_ROOT}/db.js"] } }
}
```

- `name`: lowercase letters, digits, dashes. `${PLUGIN_ROOT}` is the installed folder's path; `module` paths are relative to the plugin root.
- `mcpServers` has the same format as [MCP](mcp.md); the server name becomes `<plugin>-<server>` (e.g. `mcp__guard-rails-db__…`).
- For the rules of `skills/`, `commands/` and `agents/` see [Skills](skills.md) and [Subagents](subagents.md). Precedence: plugin < user (`~/.usta`) < project.

## Installing and managing

```bash
usta plugin install ./plugins/guard-rails          # folder
usta plugin install https://github.com/team/plugin.git   # git (or github:team/plugin)
usta plugin list
usta plugin disable guard-rails      # turn off without removing   (enable turns it back on)
usta plugin remove guard-rails
```

`/plugins` lists the installed ones in a session. Plugins are copied to `~/.usta/plugins/<name>/` (without `.git`, `node_modules` and symlinks); state is in `state.json`. A new install is active in the **next session**. npm sources are not supported yet (a folder or git is enough; in an air-gapped environment copy a folder).

## Security

A plugin can run programs on your machine (hooks, MCP servers) and steer the model (skills). So:

- **Installing asks for interactive confirmation and cannot be skipped.** The contents are shown (skill/command/agent names, every hook's command or module, every MCP server's command); without a terminal the install is refused (there is no `--yes`).
- **The approval is bound to the content.** A digest of all files is stored at install; if a file changes on disk the plugin is **skipped** with a warning and must be reinstalled (that is, re-read) to be approved again.
- Plugin hooks and modules **cannot override** permission rules (hooks only restrict); MCP tools pass the normal gate; skills cannot loosen tool calls.
- Removing a plugin deletes its copy; your own files are untouched.
- Read someone else's plugin before installing it: module hooks run in-process and command hooks in a shell, with your privileges. Plugins are not a sandbox.

## Examples

The [`plugins/`](../../plugins/README.md) folder in the repository has two examples:

- **commit-helper:** a `/commit` command and a `commit-style` skill.
- **guard-rails:** a `PreToolUse` module hook that blocks `git commit/push` with `--no-verify`, and a `Stop` module hook that stops the agent from finishing while `TODO(usta)` markers it left remain. Tried with the real model: it wrote `TODO(usta)` into a file and said "done", the hook made it continue, and the model cleaned up the marker.
