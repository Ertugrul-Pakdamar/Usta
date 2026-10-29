import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { isDigestTrusted } from "@usta/core";
import { z } from "@usta/sdk";

const NAME = /^[a-zA-Z][a-zA-Z0-9-]{0,29}$/;

const common = {
  /** Only these tools of the server are offered (each one costs prompt tokens). */
  tools: z.array(z.string()).optional(),
  disabled: z.boolean().optional(),
};
const stdio = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  ...common,
});
const http = z.object({
  url: z.url(),
  headers: z.record(z.string(), z.string()).optional(),
  ...common,
});
export const serverSchema = z.union([stdio, http]);
export const configSchema = z.object({ mcpServers: z.record(z.string(), serverSchema) });

export type McpServerConfig = z.infer<typeof serverSchema>;
export const isHttp = (c: McpServerConfig): c is z.infer<typeof http> => "url" in c;

export interface McpSource {
  file: string;
  servers: Record<string, McpServerConfig>;
  hash: string;
}

export const mcpTrustKey = (cwd: string) => `${cwd}::mcp`;
export const userMcpFile = (home = homedir()) => join(home, ".usta", "mcp.json");
export const projectMcpFile = (cwd: string) => join(cwd, ".usta", "mcp.json");

/** Reads one config file; problems become warnings, never exceptions. */
export function readMcpFile(file: string, warnings: string[]): McpSource | undefined {
  if (!existsSync(file)) return undefined;
  const text = readFileSync(file, "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    warnings.push(`${file}: not valid JSON`);
    return undefined;
  }
  const servers: Record<string, McpServerConfig> = {};
  const map = (raw as { mcpServers?: Record<string, unknown> } | null)?.mcpServers;
  if (!map || typeof map !== "object") {
    warnings.push(`${file}: no "mcpServers" object`);
    return undefined;
  }
  for (const [name, value] of Object.entries(map)) {
    if (!NAME.test(name)) {
      warnings.push(`${file}: invalid server name "${name}" (letters, digits, dashes)`);
      continue;
    }
    const parsed = serverSchema.safeParse(value);
    if (!parsed.success)
      warnings.push(`${file}: server "${name}": ${z.prettifyError(parsed.error)}`);
    else servers[name] = parsed.data;
  }
  return { file, servers, hash: createHash("sha256").update(text).digest("hex") };
}

/** `${VAR}` → value from the environment (missing → empty). Secrets stay out of the config file. */
export function expandEnv(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => env[name] ?? "");
}

export interface LoadedMcpConfig {
  servers: Record<string, McpServerConfig>;
  warnings: string[];
  project?: { file: string; hash: string; trusted: boolean; summary: string[] };
}

/** One line per server for the trust prompt: what would be started or contacted. */
export function describeServer(name: string, c: McpServerConfig): string {
  return isHttp(c)
    ? `${name}: HTTP ${c.url}`
    : `${name}: runs \`${[c.command, ...(c.args ?? [])].join(" ")}\``;
}

/**
 * User servers from `~/.usta/mcp.json`; project servers from `<project>/.usta/mcp.json` only
 * once the user trusted that exact file (a config can start arbitrary programs).
 */
export function loadMcpConfig(
  cwd: string,
  home: string | undefined,
  opts: { trustProject?: boolean } = {},
): LoadedMcpConfig {
  const warnings: string[] = [];
  const out: LoadedMcpConfig = { servers: {}, warnings };
  const user = readMcpFile(userMcpFile(home), warnings);
  Object.assign(out.servers, user?.servers);
  const project = readMcpFile(projectMcpFile(cwd), warnings);
  if (project) {
    const trusted =
      opts.trustProject === true || isDigestTrusted(mcpTrustKey(cwd), project.hash, home);
    out.project = {
      file: project.file,
      hash: project.hash,
      trusted,
      summary: Object.entries(project.servers).map(([n, c]) => describeServer(n, c)),
    };
    if (trusted) Object.assign(out.servers, project.servers);
    else
      warnings.push(`${project.file}: MCP servers not loaded because the project is not trusted`);
  }
  for (const [name, c] of Object.entries(out.servers)) if (c.disabled) delete out.servers[name];
  return out;
}

/** Adds or replaces a server in the user's config file. */
export function saveUserServer(name: string, config: McpServerConfig, home = homedir()): string {
  if (!NAME.test(name)) throw new Error(`Invalid server name "${name}" (letters, digits, dashes)`);
  const file = userMcpFile(home);
  const warnings: string[] = [];
  const existing = readMcpFile(file, warnings)?.servers ?? {};
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ mcpServers: { ...existing, [name]: config } }, null, 2), {
    mode: 0o600,
  });
  return file;
}

/** Removes a server from the user's config file; false when it was not there. */
export function removeUserServer(name: string, home = homedir()): boolean {
  const file = userMcpFile(home);
  const source = readMcpFile(file, []);
  if (!source || !(name in source.servers)) return false;
  const { [name]: _, ...rest } = source.servers;
  writeFileSync(file, JSON.stringify({ mcpServers: rest }, null, 2), { mode: 0o600 });
  return true;
}
