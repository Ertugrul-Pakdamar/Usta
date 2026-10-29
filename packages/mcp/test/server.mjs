// A minimal MCP server over stdio, used by the tests.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "@usta/sdk";

const server = new McpServer({ name: "fixture", version: "1.0.0" });
server.registerTool(
  "echo",
  {
    description: "Echo the text back",
    inputSchema: { text: z.string() },
    annotations: { readOnlyHint: true },
  },
  async ({ text }) => ({ content: [{ type: "text", text: `echo:${text}` }] }),
);
server.registerTool("boom", { description: "Always fails", inputSchema: {} }, async () => ({
  isError: true,
  content: [{ type: "text", text: "it broke" }],
}));
server.registerTool(
  "read-env",
  { description: "Reads an env var", inputSchema: { name: z.string() } },
  async ({ name }) => ({
    content: [{ type: "text", text: `${name}=${process.env[name] ?? "(unset)"}` }],
  }),
);
server.registerTool("pic", { description: "Returns an image", inputSchema: {} }, async () => ({
  content: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
}));
await server.connect(new StdioServerTransport());
