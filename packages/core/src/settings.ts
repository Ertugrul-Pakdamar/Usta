import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { HOOK_EVENTS, type HookConfig } from "./hooks.js";
import { LANGUAGES, type Lang, t } from "./i18n/index.js";
import { PERMISSION_MODES, type PermissionMode } from "./permissions.js";

const HookDefSchema = z
  .object({
    matcher: z.string().optional(),
    command: z.string().min(1).optional(),
    module: z.string().min(1).optional(),
    timeout: z.number().positive().optional(),
  })
  .refine((d) => (d.command === undefined) !== (d.module === undefined), {
    message: 'a hook needs exactly one of "command" or "module"',
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
  /** Interface language. Harmless, so it applies from every layer. */
  language: z.enum(LANGUAGES).optional(),
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
  language?: Lang;
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

/** Is this exact content (digest) already trusted under `key`? */
export function isDigestTrusted(key: string, hash: string, home = homedir()): boolean {
  return readTrust(home)[key] === hash;
}

/** Remembers a content digest as trusted under `key` (a project path, or `<path>::agents`). */
export function trustDigest(key: string, hash: string, home = homedir()): void {
  const file = trustFile(home);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify({ ...readTrust(home), [key]: hash }, null, 2), {
    mode: 0o600,
  });
}

/** Remembers the current content of this project's settings file as trusted. */
export function trustProject(info: ProjectSettingsInfo, cwd: string, home = homedir()): void {
  trustDigest(cwd, info.hash, home);
}

function readLayer(path: string): { settings: RawSettings; hash: string } | undefined {
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(t("settings.invalidJson", { path, message: (err as Error).message }));
  }
  const parsed = SettingsSchema.safeParse(json);
  if (!parsed.success)
    throw new Error(t("settings.invalid", { path, details: z.prettifyError(parsed.error) }));
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
    if (s.language) out.language = s.language;
    if (!full) return;
    Object.assign(out.models, s.models);
    if (s.compactAt !== undefined) out.compactAt = s.compactAt;
    out.allow.push(...s.permissions.allow);
    // A module is code that lives in the repository and can change after the user approved the
    // settings file, so module hooks are only taken from the user's own settings (or plugins).
    const hooks = s.hooks as HookConfig;
    if (!allowBypass) {
      for (const event of HOOK_EVENTS) {
        const defs = hooks[event];
        if (defs?.some((d) => d.module)) {
          out.warnings.push(t("settings.moduleIgnored", { path }));
          hooks[event] = defs.filter((d) => !d.module);
        }
      }
    }
    mergeHooks(hooks);
    const mode = s.permissions.defaultMode;
    if (mode === "bypass" && !allowBypass) {
      out.warnings.push(t("settings.bypassIgnored", { path }));
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
        (defs ?? []).map((d) => `hook ${event}: ${d.command ?? d.module}`),
      ),
    ];
    out.project = { path: projectPath, hash: project.hash, sensitive, trusted, summary };
    if (!trusted) {
      out.warnings.push(t("settings.untrusted", { path: projectPath }));
    }
    apply(s, projectPath, { full: trusted, allowBypass: false });
  }

  const localPath = join(cwd, ".usta", "settings.local.json");
  const local = readLayer(localPath);
  if (local) apply(local.settings, localPath, { full: true, allowBypass: false });
  return out;
}

/**
 * The `language` setting, read leniently (a broken file must not stop the language from being
 * chosen before settings are loaded and validated). Local overrides project overrides user.
 */
export function readLanguageSetting(cwd: string, home = homedir()): string | undefined {
  let language: string | undefined;
  for (const path of [
    join(home, ".usta", "settings.json"),
    join(cwd, ".usta", "settings.json"),
    join(cwd, ".usta", "settings.local.json"),
  ]) {
    try {
      const value = (JSON.parse(readFileSync(path, "utf8")) as { language?: unknown }).language;
      if (typeof value === "string") language = value;
    } catch {}
  }
  return language;
}
