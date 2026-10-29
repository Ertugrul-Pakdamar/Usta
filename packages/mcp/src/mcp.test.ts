import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { trustDigest } from "@usta/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  expandEnv,
  loadMcpConfig,
  mcpTrustKey,
  removeUserServer,
  saveUserServer,
} from "./config.js";
import { contentToText, McpManager, mcpToolName } from "./manager.js";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "server.mjs");
let cwd: string;
let home: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "usta-mcp-"));
  home = await mkdtemp(join(tmpdir(), "usta-mcp-home-"));
});

const write = (root: string, servers: object) => {
  mkdirSync(join(root, ".usta"), { recursive: true });
  writeFileSync(join(root, ".usta", "mcp.json"), JSON.stringify({ mcpServers: servers }));
};

describe("config", () => {
  it("expands ${VAR} from the environment (missing → empty)", () => {
    expect(expandEnv("Bearer ${T}!${NOPE}", { T: "abc" })).toBe("Bearer abc!");
  });

  it("loads user servers and reports bad entries as warnings", () => {
    write(home, {
      good: { command: "node", args: ["x.js"] },
      web: { url: "https://example.com/mcp" },
      "bad name": { command: "x" },
      broken: { nothing: true },
    });
    const r = loadMcpConfig(cwd, home);
    expect(Object.keys(r.servers).sort()).toEqual(["good", "web"]);
    expect(r.warnings).toHaveLength(2);
  });

  it("project servers (they start programs!) need approval of the exact file", () => {
    write(cwd, { evil: { command: "sh", args: ["-c", "echo pwned"] } });
    const first = loadMcpConfig(cwd, home);
    expect(first.servers).toEqual({});
    expect(first.project?.trusted).toBe(false);
    expect(first.project?.summary[0]).toContain("sh -c echo pwned");
    trustDigest(mcpTrustKey(cwd), first.project?.hash as string, home);
    expect(Object.keys(loadMcpConfig(cwd, home).servers)).toEqual(["evil"]);
    write(cwd, { evil: { command: "sh", args: ["-c", "echo changed"] } });
    expect(loadMcpConfig(cwd, home).servers).toEqual({});
  });

  it("add/remove edit the user file (private) and keep other servers", () => {
    saveUserServer("a", { command: "node" }, home);
    saveUserServer("b", { url: "https://x.example/mcp" }, home);
    expect(Object.keys(loadMcpConfig(cwd, home).servers)).toEqual(["a", "b"]);
    expect(removeUserServer("a", home)).toBe(true);
    expect(removeUserServer("a", home)).toBe(false);
    expect(Object.keys(loadMcpConfig(cwd, home).servers)).toEqual(["b"]);
    expect(() => saveUserServer("bad name", { command: "x" }, home)).toThrow("Invalid server name");
  });

  it("disabled servers are skipped", () => {
    write(home, { off: { command: "node", disabled: true } });
    expect(loadMcpConfig(cwd, home).servers).toEqual({});
  });
});

describe("helpers", () => {
  it("sanitizes tool names and renders non-text content as a note", () => {
    expect(mcpToolName("gh", "create.issue/x")).toBe("mcp__gh__create_issue_x");
    expect(
      contentToText([
        { type: "text", text: "hi" },
        { type: "image", data: "x" },
      ]),
    ).toBe("hi\n[image content omitted]");
  });
});

describe("McpManager with a real stdio server", () => {
  let mgr: McpManager;
  afterEach(() => mgr.close());

  const connect = async (extra: object = {}) => {
    mgr = new McpManager();
    await mgr.connect({ fx: { command: process.execPath, args: [fixture], ...extra } });
    return mgr;
  };
  const tool = (name: string) => mgr.tools.find((t) => t.name === name);

  it("lists tools as mcp__server__tool with their own JSON Schema", async () => {
    await connect();
    expect(mgr.status[0]).toMatchObject({ name: "fx", state: "connected" });
    expect(mgr.tools.map((t) => t.name).sort()).toEqual([
      "mcp__fx__boom",
      "mcp__fx__echo",
      "mcp__fx__pic",
      "mcp__fx__read-env",
    ]);
    const echo = tool("mcp__fx__echo");
    expect(echo?.jsonSchema).toMatchObject({
      type: "object",
      properties: { text: { type: "string" } },
    });
    expect(echo?.description.startsWith("[fx] ")).toBe(true);
    expect(mgr.status[0]?.approxTokens).toBeGreaterThan(0);
  });

  it("read-only hint decides `mutating`; calls work; errors become ToolErrors", async () => {
    await connect();
    expect(tool("mcp__fx__echo")?.mutating).toBe(false);
    expect(tool("mcp__fx__boom")?.mutating).toBe(true);
    const ctx = { cwd } as never;
    expect(await tool("mcp__fx__echo")?.run({ text: "hi" }, ctx)).toBe("echo:hi");
    await expect(tool("mcp__fx__boom")?.run({}, ctx)).rejects.toThrow("it broke");
    expect(await tool("mcp__fx__pic")?.run({}, ctx)).toContain("image content omitted");
  });

  it("passes only declared env (plus a safe default), with ${VAR} expanded", async () => {
    process.env.USTA_MCP_TEST_SECRET = "from-parent";
    process.env.USTA_MCP_NOT_PASSED = "leak";
    try {
      await connect({ env: { DECLARED: "${USTA_MCP_TEST_SECRET}" } });
      const ctx = { cwd } as never;
      expect(await tool("mcp__fx__read-env")?.run({ name: "DECLARED" }, ctx)).toBe(
        "DECLARED=from-parent",
      );
      expect(await tool("mcp__fx__read-env")?.run({ name: "USTA_MCP_NOT_PASSED" }, ctx)).toBe(
        "USTA_MCP_NOT_PASSED=(unset)",
      );
    } finally {
      delete process.env.USTA_MCP_TEST_SECRET;
      delete process.env.USTA_MCP_NOT_PASSED;
    }
  });

  it("`tools` allowlist limits what is offered", async () => {
    await connect({ tools: ["echo"] });
    expect(mgr.tools.map((t) => t.name)).toEqual(["mcp__fx__echo"]);
  });

  it("a server that cannot start is reported, not thrown", async () => {
    mgr = new McpManager();
    await mgr.connect({ dead: { command: "/nonexistent/binary-xyz" } });
    expect(mgr.status[0]).toMatchObject({ name: "dead", state: "failed" });
    expect(mgr.status[0]?.error).toBeTruthy();
    expect(mgr.tools).toEqual([]);
  });
});
