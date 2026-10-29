import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type Tool, ToolError, z } from "@usta/sdk";
import { expandEnv, isHttp, type McpServerConfig } from "./config.js";

const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 120_000;
const MAX_DESCRIPTION = 240;

export interface McpServerStatus {
  name: string;
  state: "connected" | "failed";
  tools: string[];
  /** Why it failed. */
  error?: string;
  /** Rough prompt-token cost of this server's tool descriptions and schemas. */
  approxTokens: number;
}

interface RemoteTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; title?: string };
}

/** `mcp__server__tool`, with anything outside [A-Za-z0-9_-] replaced (model APIs restrict tool names). */
export const mcpToolName = (server: string, tool: string) =>
  `mcp__${server}__${tool.replace(/[^A-Za-z0-9_-]/g, "_")}`;

/** Result content as text; non-text parts are named, not embedded. */
export function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part: { type?: string; text?: string; resource?: { text?: string; uri?: string } }) => {
      if (part.type === "text") return part.text ?? "";
      if (part.type === "resource")
        return part.resource?.text ?? `[resource ${part.resource?.uri}]`;
      return `[${part.type ?? "unknown"} content omitted]`;
    })
    .join("\n");
}

/** Wraps one remote tool as a usta tool: validated by the server, gated by usta's permissions. */
export function adaptTool(
  server: string,
  remote: RemoteTool,
  call: (name: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>,
): Tool {
  const readOnly = remote.annotations?.readOnlyHint === true;
  return {
    name: mcpToolName(server, remote.name),
    description: `[${server}] ${(remote.description ?? remote.annotations?.title ?? remote.name).slice(0, MAX_DESCRIPTION)}`,
    input: z.record(z.string(), z.unknown()),
    jsonSchema: remote.inputSchema,
    // An MCP server's own "read-only" claim is a hint, not a guarantee: it only skips the
    // question in default mode, never a deny rule or the protected-path checks.
    mutating: !readOnly,
    async run(input, ctx) {
      const res = (await call(remote.name, input as Record<string, unknown>, ctx.signal)) as {
        content?: unknown;
        isError?: boolean;
        structuredContent?: unknown;
      };
      const text =
        contentToText(res.content) ||
        (res.structuredContent ? JSON.stringify(res.structuredContent) : "(no output)");
      if (res.isError) throw new ToolError(text);
      return text;
    },
  };
}

const approxTokens = (tools: RemoteTool[]) =>
  Math.ceil(
    tools.reduce(
      (n, t) =>
        n + (t.description?.length ?? 0) + JSON.stringify(t.inputSchema).length + t.name.length,
      0,
    ) / 3.5,
  );

/** Connects the configured servers and exposes their tools. A failing server never breaks the session. */
export class McpManager {
  readonly status: McpServerStatus[] = [];
  readonly tools: Tool[] = [];
  private readonly clients: Client[] = [];

  async connect(servers: Record<string, McpServerConfig>): Promise<void> {
    await Promise.all(Object.entries(servers).map(([name, cfg]) => this.connectOne(name, cfg)));
    this.status.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async connectOne(name: string, cfg: McpServerConfig): Promise<void> {
    const client = new Client({ name: "usta", version: "0.0.0" });
    try {
      const transport = isHttp(cfg)
        ? new StreamableHTTPClientTransport(new URL(cfg.url), {
            requestInit: {
              headers: Object.fromEntries(
                Object.entries(cfg.headers ?? {}).map(([k, v]) => [k, expandEnv(v)]),
              ),
            },
          })
        : new StdioClientTransport({
            command: expandEnv(cfg.command),
            args: (cfg.args ?? []).map((a) => expandEnv(a)),
            env: {
              ...getDefaultEnvironment(),
              ...Object.fromEntries(
                Object.entries(cfg.env ?? {}).map(([k, v]) => [k, expandEnv(v)]),
              ),
            },
            stderr: "ignore",
          });
      await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });
      const listed = (await client.listTools(undefined, { timeout: CONNECT_TIMEOUT_MS }))
        .tools as RemoteTool[];
      const wanted = cfg.tools ? listed.filter((t) => cfg.tools?.includes(t.name)) : listed;
      const call = (tool: string, args: Record<string, unknown>, signal?: AbortSignal) =>
        client.callTool({ name: tool, arguments: args }, undefined, {
          signal,
          timeout: CALL_TIMEOUT_MS,
        });
      const adapted = wanted.map((t) => adaptTool(name, t, call));
      this.clients.push(client);
      this.tools.push(...adapted);
      this.status.push({
        name,
        state: "connected",
        tools: adapted.map((t) => t.name),
        approxTokens: approxTokens(wanted),
      });
    } catch (err) {
      await client.close().catch(() => undefined);
      this.status.push({
        name,
        state: "failed",
        tools: [],
        error: err instanceof Error ? err.message : String(err),
        approxTokens: 0,
      });
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.clients.map((c) => c.close().catch(() => undefined)));
  }
}
