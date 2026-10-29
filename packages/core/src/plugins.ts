import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "@usta/sdk";
import { HOOK_EVENTS, type HookConfig, type HookDef } from "./hooks.js";
import { t } from "./i18n/index.js";

const run = promisify(execFile);
const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const MANIFEST = "usta-plugin.json";

const HookSchema = z
  .object({
    matcher: z.string().optional(),
    command: z.string().min(1).optional(),
    module: z.string().min(1).optional(),
    timeout: z.number().positive().optional(),
  })
  .refine((d) => (d.command === undefined) !== (d.module === undefined), {
    message: 'a hook needs exactly one of "command" or "module"',
  });

const ManifestSchema = z.object({
  name: z.string().regex(NAME, "lowercase letters, digits and dashes"),
  version: z.string().optional(),
  description: z.string().optional(),
  hooks: z.partialRecord(z.enum(HOOK_EVENTS), z.array(HookSchema)).default({}),
  /** Same shape as `mcpServers` in mcp.json; validated by @usta/mcp when it is loaded. */
  mcpServers: z.record(z.string(), z.unknown()).default({}),
});
export type PluginManifest = z.infer<typeof ManifestSchema>;

export interface InstalledState {
  enabled: boolean;
  source: string;
  digest: string;
  installedAt: string;
}

export interface LoadedPlugin {
  name: string;
  root: string;
  manifest: PluginManifest;
  /** Hooks with `${PLUGIN_ROOT}` filled in and module paths made absolute. */
  hooks: HookConfig;
  /** MCP servers, names prefixed with the plugin name (`<plugin>-<server>`). */
  mcpServers: Record<string, unknown>;
}

export interface LoadedPlugins {
  plugins: LoadedPlugin[];
  warnings: string[];
}

export const pluginsDir = (home = homedir()) => join(home, ".usta", "plugins");
const stateFile = (home: string) => join(pluginsDir(home), "state.json");

export function readPluginState(home = homedir()): Record<string, InstalledState> {
  try {
    return JSON.parse(readFileSync(stateFile(home), "utf8"));
  } catch {
    return {};
  }
}

function writePluginState(state: Record<string, InstalledState>, home: string): void {
  mkdirSync(pluginsDir(home), { recursive: true, mode: 0o700 });
  writeFileSync(stateFile(home), JSON.stringify(state, null, 2), { mode: 0o600 });
}

export function readManifest(dir: string): { manifest: PluginManifest } | { error: string } {
  const file = join(dir, MANIFEST);
  if (!existsSync(file)) return { error: t("plugin.noManifest", { dir, file: MANIFEST }) };
  try {
    const parsed = ManifestSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success
      ? { manifest: parsed.data }
      : { error: `${file}: ${z.prettifyError(parsed.error)}` };
  } catch (err) {
    return { error: `${file}: ${(err as Error).message}` };
  }
}

/** Files that make up a plugin (no VCS data, dependencies or symlinks). */
const skip = (name: string) => name === ".git" || name === "node_modules";
function* walk(dir: string, rel = ""): Generator<string> {
  for (const name of readdirSync(join(dir, rel)).sort()) {
    if (skip(name)) continue;
    const r = rel ? `${rel}/${name}` : name;
    const st = lstatSync(join(dir, r));
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) yield* walk(dir, r);
    else yield r;
  }
}

/** Digest of every file in the plugin, so a later change is noticed. */
export function digestPlugin(dir: string): string {
  const h = createHash("sha256");
  for (const rel of walk(dir)) h.update(`${rel}\0${readFileSync(join(dir, rel))}\0`);
  return h.digest("hex");
}

/** What the plugin would add, one line each: shown before the user agrees to install it. */
export function describePlugin(dir: string, manifest: PluginManifest): string[] {
  const lines: string[] = [];
  const list = (sub: string, kind: string, pick: (n: string) => string | undefined) => {
    const base = join(dir, sub);
    if (!existsSync(base)) return;
    for (const n of readdirSync(base).sort()) {
      const v = pick(n);
      if (v) lines.push(`${kind} ${v}`);
    }
  };
  list("skills", "skill", (n) => (existsSync(join(dir, "skills", n, "SKILL.md")) ? n : undefined));
  list("commands", "command", (n) => (n.endsWith(".md") ? `/${n.slice(0, -3)}` : undefined));
  list("agents", "agent", (n) => (n.endsWith(".md") ? n.slice(0, -3) : undefined));
  for (const [event, defs] of Object.entries(manifest.hooks)) {
    for (const d of defs ?? []) lines.push(`hook ${event}: ${d.command ?? `module ${d.module}`}`);
  }
  for (const [name, server] of Object.entries(manifest.mcpServers)) {
    const s = server as { command?: string; args?: string[]; url?: string };
    lines.push(
      `mcp ${name}: ${s.url ? `HTTP ${s.url}` : `runs ${[s.command, ...(s.args ?? [])].join(" ")}`}`,
    );
  }
  return lines;
}

const isGit = (s: string) => /^(https?:\/\/|ssh:\/\/|git@|github:)/.test(s) || s.endsWith(".git");

/** A local folder or a git repository → a directory to read the plugin from. */
async function fetchSource(source: string): Promise<{ dir: string; cleanup: () => void }> {
  if (isGit(source)) {
    const tmp = mkdtempSync(join(tmpdir(), "usta-plugin-"));
    const url = source.startsWith("github:") ? `https://github.com/${source.slice(7)}.git` : source;
    try {
      await run("git", ["clone", "--depth", "1", "--quiet", url, tmp], { timeout: 120_000 });
    } catch (err) {
      rmSync(tmp, { recursive: true, force: true });
      throw new Error(t("plugin.cloneFailed", { source, error: (err as Error).message }));
    }
    return { dir: tmp, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
  }
  const dir = resolve(source);
  if (!existsSync(dir) || !lstatSync(dir).isDirectory()) {
    throw new Error(t("plugin.notFound", { source }));
  }
  return { dir, cleanup: () => {} };
}

export interface InstallOptions {
  home?: string;
  /** Receives what the plugin contains; return false to cancel. Nothing is installed without a yes. */
  confirm: (info: {
    manifest: PluginManifest;
    lines: string[];
    replacing: boolean;
  }) => Promise<boolean>;
}

/** Copies a plugin into `~/.usta/plugins/<name>` after the user agreed to its exact content. */
export async function installPlugin(
  source: string,
  opts: InstallOptions,
): Promise<{ name: string } | undefined> {
  const home = opts.home ?? homedir();
  const { dir, cleanup } = await fetchSource(source);
  try {
    const read = readManifest(dir);
    if ("error" in read) throw new Error(read.error);
    const { manifest } = read;
    const state = readPluginState(home);
    const ok = await opts.confirm({
      manifest,
      lines: describePlugin(dir, manifest),
      replacing: manifest.name in state,
    });
    if (!ok) return undefined;
    const target = join(pluginsDir(home), manifest.name);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true, mode: 0o700 });
    for (const rel of walk(dir)) {
      const to = join(target, rel);
      mkdirSync(join(to, ".."), { recursive: true });
      cpSync(join(dir, rel), to);
    }
    state[manifest.name] = {
      enabled: true,
      source: isGit(source) ? source : resolve(source),
      digest: digestPlugin(target),
      installedAt: new Date().toISOString(),
    };
    writePluginState(state, home);
    return { name: manifest.name };
  } finally {
    cleanup();
  }
}

export function setPluginEnabled(name: string, enabled: boolean, home = homedir()): boolean {
  const state = readPluginState(home);
  if (!state[name]) return false;
  (state[name] as InstalledState).enabled = enabled;
  writePluginState(state, home);
  return true;
}

export function removePlugin(name: string, home = homedir()): boolean {
  if (!NAME.test(name)) return false;
  const state = readPluginState(home);
  if (!state[name]) return false;
  delete state[name];
  rmSync(join(pluginsDir(home), name), { recursive: true, force: true });
  writePluginState(state, home);
  return true;
}

const fill = (s: string, root: string) => s.replaceAll("${PLUGIN_ROOT}", root);

/**
 * Enabled plugins whose files still match the digest recorded when the user installed them.
 * A plugin that changed on disk is skipped with a warning (reinstall to approve the change).
 */
export function loadPlugins(home = homedir()): LoadedPlugins {
  const out: LoadedPlugins = { plugins: [], warnings: [] };
  for (const [name, st] of Object.entries(readPluginState(home))) {
    if (!st.enabled) continue;
    const root = join(pluginsDir(home), name);
    if (!existsSync(root)) {
      out.warnings.push(t("plugin.missing", { name }));
      continue;
    }
    if (digestPlugin(root) !== st.digest) {
      out.warnings.push(t("plugin.changed", { name }));
      continue;
    }
    const read = readManifest(root);
    if ("error" in read) {
      out.warnings.push(read.error);
      continue;
    }
    const hooks: HookConfig = {};
    for (const event of HOOK_EVENTS) {
      const defs = read.manifest.hooks[event];
      if (!defs?.length) continue;
      hooks[event] = defs.map(
        (d): HookDef => ({
          ...d,
          command: d.command ? fill(d.command, root) : undefined,
          module: d.module ? resolve(root, fill(d.module, root)) : undefined,
        }),
      );
    }
    const mcpServers = Object.fromEntries(
      Object.entries(read.manifest.mcpServers).map(([n, v]) => [`${name}-${n}`, v]),
    );
    out.plugins.push({ name, root, manifest: read.manifest, hooks, mcpServers });
  }
  return out;
}

/** Hook configs of all loaded plugins, merged (settings hooks are appended after these). */
export function mergePluginHooks(plugins: LoadedPlugin[], into: HookConfig = {}): HookConfig {
  for (const p of plugins) {
    for (const event of HOOK_EVENTS) {
      const defs = p.hooks[event];
      if (defs?.length) into[event] = [...(into[event] ?? []), ...defs];
    }
  }
  return into;
}
