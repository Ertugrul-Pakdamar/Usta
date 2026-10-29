import { en, type Message, type MessageKey } from "./en.js";
import { tr } from "./tr.js";

export type { MessageKey } from "./en.js";

export const LANGUAGES = ["tr", "en"] as const;
export type Lang = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Lang = "tr";

const catalogs: Record<Lang, Record<MessageKey, Message>> = { en, tr };
let current: Lang = DEFAULT_LANGUAGE;

export type Params = Record<string, string | number>;
/** A message plus its parameters, for passing a translatable text across modules. */
export interface Localized {
  key: MessageKey;
  params?: Params;
}

export const getLanguage = (): Lang => current;
export const setLanguage = (lang: Lang): void => {
  current = lang;
};

/** `"tr"`, `"tr_TR.UTF-8"`, `"EN-us"` → a supported language; anything else → undefined. */
export function parseLanguage(value: string | undefined): Lang | undefined {
  const code = value
    ?.trim()
    .toLowerCase()
    .split(/[_.@:-]/)[0];
  return (LANGUAGES as readonly string[]).includes(code ?? "") ? (code as Lang) : undefined;
}

/**
 * Picks the interface language. Explicit choices beat the system locale:
 * `--lang` / `USTA_LANG` > settings > locale (`LC_ALL`, `LC_MESSAGES`, `LANG`, `LANGUAGE`).
 * A locale in another language falls back to English; no locale (or `C`/`POSIX`) to the default.
 */
export function detectLanguage(
  opts: { flag?: string; env?: NodeJS.ProcessEnv; setting?: string } = {},
): Lang {
  const env = opts.env ?? process.env;
  const explicit =
    parseLanguage(opts.flag) ?? parseLanguage(env.USTA_LANG) ?? parseLanguage(opts.setting);
  if (explicit) return explicit;
  const locale = [env.LC_ALL, env.LC_MESSAGES, env.LANG, env.LANGUAGE?.split(":")[0]].find((v) =>
    v?.trim(),
  );
  if (!locale || /^(c|posix)(\.|$)/i.test(locale.trim())) return DEFAULT_LANGUAGE;
  return parseLanguage(locale) ?? "en";
}

/** Looks up a message in the current language (falling back to English) and fills `{placeholders}`. */
export function t(key: MessageKey, params: Params = {}): string {
  const message = catalogs[current][key] ?? en[key];
  const text =
    typeof message === "string"
      ? message
      : message[
          new Intl.PluralRules(current).select(Number(params.count ?? 1)) === "one"
            ? "one"
            : "other"
        ];
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

export const tl = (message: Localized): string => t(message.key, message.params);

/** Locale-aware number, e.g. credit amounts. */
export function formatNumber(value: number, maxFractionDigits = 4): string {
  return new Intl.NumberFormat(current, { maximumFractionDigits: maxFractionDigits }).format(value);
}

/** `2026-12-01` → "1 Aralık 2026" / "December 1, 2026". Unparseable input is returned as is. */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat(current, { dateStyle: "long", timeZone: "UTC" }).format(date);
}

/** Catalogs, for tests and tooling. */
export const messages = catalogs;
