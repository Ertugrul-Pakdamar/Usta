import { createInterface } from "node:readline/promises";
import {
  Economy,
  GatewayError,
  HookRunner,
  type LoadedSettings,
  loadSettings,
  ModelRegistry,
  PERMISSION_MODES,
  PermissionEngine,
  type PermissionMode,
  type Provider,
  parseRule,
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
    return /^(e|evet|y|yes)$/i.test((await rl.question(`${question} [e/H] `)).trim());
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
    console.error(`\nBu proje ${info.path} dosyasında şunları tanımlıyor:`);
    for (const line of info.summary) console.error(`  - ${line}`);
    console.error("Bunlar bu bilgisayarda izin sormadan komut çalıştırabilir.");
    if (await askYesNo("Bu proje ayarlarına güveniyor musunuz?")) {
      trustProject(info, cwd);
      settings = loadSettings(cwd);
    }
  }

  if (
    flags.permissionMode &&
    !(PERMISSION_MODES as readonly string[]).includes(flags.permissionMode)
  ) {
    throw new GatewayError(
      `Geçersiz --permission-mode: ${flags.permissionMode} (${PERMISSION_MODES.join(" | ")})`,
    );
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
    if (!parseRule(rule)) warnings.push(`Geçersiz kural yok sayıldı: ${rule}`);
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
  if (!m) throw new GatewayError(`Geçersiz token sayısı: ${value} (örnek: 200k, 1.5m, 50000)`);
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
