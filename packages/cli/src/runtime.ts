import { createInterface } from "node:readline/promises";
import {
  detectLanguage,
  Economy,
  GatewayError,
  gatewayError,
  HookRunner,
  LANGUAGES,
  type Lang,
  type LoadedSettings,
  loadSettings,
  ModelRegistry,
  PERMISSION_MODES,
  PermissionEngine,
  type PermissionMode,
  type Provider,
  parseLanguage,
  parseRule,
  readLanguageSetting,
  setLanguage,
  t,
  trustProject,
  type UstaConfig,
} from "@usta/core";

export interface RuntimeFlags {
  permissionMode?: string;
  plan?: boolean;
  yes?: boolean;
  allow?: string[];
  deny?: string[];
  trustProject?: boolean;
}

export async function askYesNo(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^(e|evet|y|yes)$/i.test(
      (await rl.question(`${question} ${t("prompt.yesNo")} `)).trim(),
    );
  } finally {
    rl.close();
  }
}

/**
 * Builds the permission engine and hooks from settings files and CLI flags.
 * `canPrompt` allows asking the user whether to trust a repo's `.usta/settings.json`.
 */
export async function setupRuntime(cwd: string, flags: RuntimeFlags, canPrompt: boolean) {
  let settings = loadSettings(cwd, undefined, { trustProject: flags.trustProject });
  const info = settings.project;
  if (info && !info.trusted && canPrompt) {
    console.error(`\n${t("trust.header", { path: info.path })}`);
    for (const line of info.summary) console.error(`  - ${line}`);
    console.error(t("trust.warning"));
    if (await askYesNo(t("trust.question"))) {
      trustProject(info, cwd);
      settings = loadSettings(cwd);
    }
  }

  if (
    flags.permissionMode &&
    !(PERMISSION_MODES as readonly string[]).includes(flags.permissionMode)
  ) {
    throw gatewayError("error.invalidPermissionMode", {
      mode: flags.permissionMode,
      modes: PERMISSION_MODES.join(" | "),
    });
  }
  const mode: PermissionMode = flags.yes
    ? "bypass"
    : flags.plan
      ? "plan"
      : ((flags.permissionMode as PermissionMode | undefined) ?? settings.defaultMode ?? "default");

  const allow = [...settings.allow, ...(flags.allow ?? [])];
  const deny = [...settings.deny, ...(flags.deny ?? [])];
  const warnings = [...settings.warnings];
  for (const rule of [...allow, ...deny, ...settings.ask]) {
    if (!parseRule(rule)) warnings.push(t("warn.invalidRule", { rule }));
  }
  return {
    engine: new PermissionEngine({ cwd, mode, allow, deny, ask: settings.ask }),
    hooks: new HookRunner(settings.hooks, cwd),
    warnings,
    settings,
  };
}

export interface EconomyFlags {
  budget?: number;
  tokenBudget?: number;
}

/** "200k", "1.5m", "50000" → tokens. */
export function parseTokens(value: string): number {
  const m = /^(\d+(?:\.\d+)?)([km]?)$/i.exec(value.trim());
  if (!m) throw gatewayError("error.invalidTokenCount", { value });
  return Math.round(
    Number(m[1]) * ({ k: 1_000, m: 1_000_000 }[(m[2] ?? "").toLowerCase() as "k" | "m"] ?? 1),
  );
}

export async function createEconomy(opts: {
  config: UstaConfig;
  provider: Provider;
  settings: LoadedSettings;
  flags: EconomyFlags;
  /** Model of this session (flag, resumed session or configured default). */
  model: string;
}): Promise<Economy> {
  const registry = new ModelRegistry(opts.config);
  await registry.load();
  const { settings, flags } = opts;
  const budget = {
    cr: flags.budget ?? settings.budget?.cr,
    tokens: flags.tokenBudget ?? settings.budget?.tokens,
  };
  return new Economy({
    config: opts.config,
    provider: opts.provider,
    registry,
    model: () => opts.model,
    fastModel: () => settings.models.fast ?? process.env.EVREN_FAST_MODEL ?? opts.model,
    budget: budget.cr !== undefined || budget.tokens !== undefined ? budget : undefined,
    compactAt: settings.compactAt,
  });
}

/**
 * Chooses and applies the interface language. Runs before anything is printed, so it reads
 * `--lang` straight from argv (commander has not parsed yet) and the setting leniently.
 */
export function initLanguage(argv: string[] = process.argv, cwd = process.cwd()): Lang {
  const i = argv.findIndex((a) => a === "--lang" || a.startsWith("--lang="));
  const flag = i < 0 ? undefined : argv[i]?.includes("=") ? argv[i]?.split("=")[1] : argv[i + 1];
  if (flag !== undefined && !parseLanguage(flag)) {
    throw gatewayError("error.invalidLanguage", { value: flag, languages: LANGUAGES.join(", ") });
  }
  const lang = detectLanguage({ flag, setting: readLanguageSetting(cwd) });
  setLanguage(lang);
  return lang;
}
