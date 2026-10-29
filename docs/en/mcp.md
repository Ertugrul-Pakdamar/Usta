# MCP connectors

[MCP](https://modelcontextprotocol.io) servers add external tools to usta (GitHub, databases, browsers…). Their tools appear as `mcp__<server>__<tool>` and pass through **the same permission gate as every other tool**.

## Adding

```bash
usta mcp add fs -- npx -y @modelcontextprotocol/server-filesystem /data     # local process (stdio)
usta mcp add gh --url https://mcp.example.com/mcp -H "Authorization=Bearer ${GH_TOKEN}"   # HTTP
usta mcp list      # connects; shows status, tools and prompt cost
usta mcp remove fs
```

Inside a session `/mcp` shows the connected servers and their tools. The configuration lives in `~/.usta/mcp.json` (0600) and uses the same `mcpServers` format as Claude Code:

```json
{
  "mcpServers": {
    "fs": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data"] },
    "gh": {
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ${GH_TOKEN}" }
    }
  }
}
```

- In `env`, `headers`, `args` and `command`, `${VARIABLE}` is read from your own environment: **do not write secrets into the file**.
- `"tools": ["a", "b"]` offers only those tools. `"disabled": true` turns a server off.
- If a server cannot start the session still starts; the error is shown as a warning.

## Token cost

Every MCP tool's description and schema is added to **each request** (fixed for the session, so it is served from the cache; it still grows the context and the first request). Descriptions are clipped to 240 characters. `usta mcp list` shows an approximate token count per server; above 1,500 narrowing with `tools` is suggested. Measured: a test server with 4 small tools ≈146 tokens.

## Security

- **Permission gate:** MCP tools count as changing and **ask** in default mode. If the server sets `readOnlyHint` the tool counts as read-only, but that is only the server's claim: it does not override `deny` rules or the plan-mode check. In `auto` mode calls are classified.
- **Rules:** `mcp__gh__list_issues` covers one tool, `mcp__gh` all tools of the server: `--allow mcp__gh --deny mcp__gh__delete_repo`. Deny always wins.
- **Project configuration is behind the trust gate.** `<project>/.usta/mcp.json` comes from the repository and **can start programs**; so the commands are shown and no server starts until you approve the file's **exact content** (changing it asks again). Headless mode cannot ask: `--trust-project` is required.
- **No environment leak:** a stdio server only gets a safe default environment (PATH, HOME…) plus what you list in `env`; your API key and other variables are not passed.
- **Results are untrusted:** text from a server goes through the output limiter like any tool output and never reaches the `auto` classifier. Do not add servers you do not trust.
- Non-text content such as images is shown as `[image content omitted]`.

## Known limits

- The tool list is fixed at session start (cache); if a server adds tools you need a new session.
- Only tools are supported; no MCP prompts, resources or OAuth flow (pass a token in a header).
- Of the subagents only those with `tools: *` see MCP tools; they pass through the same permission gate.
