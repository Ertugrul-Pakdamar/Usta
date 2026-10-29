import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { HOOK_EVENTS, type HookConfig } from "./hooks.js";
import { PERMISSION_MODES, type PermissionMode } from "./permissions.js";

const HookDefSchema = z.object({
  matcher: z.string().optional(),
  command: z.string().min(1),
  timeout: z.number().positive().optional(),
});

const SettingsSchema = z.object({
  permissions: z
    .object({
      allow: z.array(z.string()).default([]),
      deny: z.array(z.string()).default([]),
      ask: z.array(z.string()).default([]),
      defaultMode: z.enum(PERMISSION_MODES).optional(),
    })
    .default({ allow: [], deny: [], ask: [] }),
  hooks: z.partialRecord(z.enum(HOOK_EVENTS), z.array(HookDefSchema)).default({}),
  models: z.object({ main: z.string().optional(), fast: z.string().optional() }).default({}),
  budget: z
    .object({
      cr: z.number().positive().optional(),
      tokens: z.number().int().positive().optional(),
    })
    .optional(),
  compactAt: z.number().min(0.3).max(0.95).optional(),
});
type RawSettings = z.infer<typeof SettingsSchema>;

export interface ProjectSettingsInfo {
  path: string;
  hash: string;
  /** Has allow rules, hooks or a default mode: things a hostile repo could abuse. */
  sensitive: boolean;
  trusted: boolean;
  /** What the file would enable, one line each (for the trust prompt). */
  summary: string[];
}

export interface LoadedSettings {
  allow: string[];
  deny: string[];
  ask: string[];
  defaultMode?: PermissionMode;
  hooks: HookConfig;
  models: { main?: string; fast?: string };
  /** Applied from every layer: a limit can only make a session safer. */
  budget?: { cr?: number; tokens?: number };
  compactAt?: number;
  /** Settings files that were read. */
  files: string[];
  warnings: string[];
  project?: ProjectSettingsInfo;
}

const trustFile = (home: string) => join(home, ".usta", "trust.json");

function readTrust(home: string): Record<string, string> {
  try {
    return JSON.parse(readFileSync(trustFile(home), "utf8"));
  } catch {
    return {};
  }
}

/** Remembers the current content of this project's settings file as trusted. */
export function trustProject(info: ProjectSettingsInfo, cwd: string, home = homedir()): void {
  const file = trustFile(home);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify({ ...readTrust(home), [cwd]: info.hash }, null, 2), {
    mode: 0o600,
  });
}

function readLayer(path: string): { settings: RawSettings; hash: string } | undefined {
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`${path} geçerli JSON değil: ${(err as Error).message}`);
  }
  const parsed = SettingsSchema.safeParse(json);
  if (!parsed.success) throw new Error(`${path} geçersiz:\n${z.prettifyError(parsed.error)}`);
  return { settings: parsed.data, hash: createHash("sha256").update(text).digest("hex") };
}

/**
 * Layers: ~/.usta/settings.json → ./.usta/settings.json → ./.usta/settings.local.json.
 * Lists are concatenated and deny always wins. The project file comes from the repo, so
 * its allow rules, hooks and mode only apply once the user trusted its current content;
 * its deny/ask rules always apply. `bypass` is never accepted from project/local files.
 */
export function loadSettings(
  cwd: string,
  home = homedir(),
  opts: { trustProject?: boolean } = {},
): LoadedSettings {
  const out: LoadedSettings = {
    allow: [],
    deny: [],
    ask: [],
    hooks: {},
    models: {},
    files: [],
    warnings: [],
  };
  const mergeHooks = (hooks: HookConfig) => {
    for (const event of HOOK_EVENTS) {
      const defs = hooks[event];
      if (defs?.length) out.hooks[event] = [...(out.hooks[event] ?? []), ...defs];
    }
  };
  const apply = (
    s: RawSettings,
    path: string,
    { full, allowBypass }: { full: boolean; allowBypass: boolean },
  ) => {
    out.files.push(path);
    out.deny.push(...s.permissions.deny);
    out.ask.push(...s.permissions.ask);
    if (s.budget) out.budget = { ...out.budget, ...s.budget };
    if (!full) return;
    Object.assign(out.models, s.models);
    if (s.compactAt !== undefined) out.compactAt = s.compactAt;
    out.allow.push(...s.permissions.allow);
    mergeHooks(s.hooks as HookConfig);
    const mode = s.permissions.defaultMode;
    if (mode === "bypass" && !allowBypass) {
      out.warnings.push(
        `${path}: defaultMode "bypass" yalnızca kullanıcı ayarlarında geçerli; yok sayıldı.`,
      );
    } else if (mode) {
      out.defaultMode = mode;
    }
  };

  const user = readLayer(join(home, ".usta", "settings.json"));
  if (user)
    apply(user.settings, join(home, ".usta", "settings.json"), { full: true, allowBypass: true });

  const projectPath = join(cwd, ".usta", "settings.json");
  const project = readLayer(projectPath);
  if (project) {
    const s = project.settings;
    const sensitive =
      s.permissions.allow.length > 0 ||
      s.permissions.defaultMode !== undefined ||
      Object.values(s.hooks).some((d) => d?.length) ||
      Object.values(s.models).some(Boolean) ||
      s.compactAt !== undefined;
    const trusted =
      !sensitive || opts.trustProject === true || readTrust(home)[cwd] === project.hash;
    const summary = [
      ...s.permissions.allow.map((r) => `allow: ${r}`),
      ...(s.permissions.defaultMode ? [`defaultMode: ${s.permissions.defaultMode}`] : []),
      ...Object.entries(s.models).flatMap(([k, v]) => (v ? [`models.${k}: ${v}`] : [])),
      ...(s.compactAt !== undefined ? [`compactAt: ${s.compactAt}`] : []),
      ...Object.entries(s.hooks).flatMap(([event, defs]) =>
        (defs ?? []).map((d) => `hook ${event}: ${d.command}`),
      ),
    ];
    out.project = { path: projectPath, hash: project.hash, sensitive, trusted, summary };
    if (!trusted) {
      out.warnings.push(
        `${projectPath}: allow kuralları ve hook'lar güvenilmediği için uygulanmadı (deny/ask uygulandı).`,
      );
    }
    apply(s, projectPath, { full: trusted, allowBypass: false });
  }

  const localPath = join(cwd, ".usta", "settings.local.json");
  const local = readLayer(localPath);
  if (local) apply(local.settings, localPath, { full: true, allowBypass: false });
  return out;
}
