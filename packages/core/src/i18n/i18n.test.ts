import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  detectLanguage,
  formatDate,
  formatNumber,
  LANGUAGES,
  type MessageKey,
  messages,
  parseLanguage,
  setLanguage,
  t,
} from "./index.js";

afterEach(() => setLanguage(DEFAULT_LANGUAGE));

const placeholders = (m: string | { one: string; other: string }) =>
  [...(typeof m === "string" ? m : `${m.one} ${m.other}`).matchAll(/\{(\w+)\}/g)]
    .map((x) => x[1])
    .sort();
const texts = (m: string | { one: string; other: string }) =>
  typeof m === "string" ? [m] : [m.one, m.other];

describe("catalogs", () => {
  const keys = Object.keys(messages.en) as MessageKey[];

  it("every language defines exactly the same keys", () => {
    for (const lang of LANGUAGES)
      expect(Object.keys(messages[lang]).sort()).toEqual([...keys].sort());
  });

  it("no empty texts, and every language uses the same placeholders", () => {
    for (const key of keys) {
      for (const lang of LANGUAGES) {
        for (const text of texts(messages[lang][key]))
          expect(text.trim(), `${lang}:${key}`).not.toBe("");
        expect(placeholders(messages[lang][key]), `${lang}:${key}`).toEqual(
          placeholders(messages.en[key]),
        );
      }
    }
  });
});

describe("t", () => {
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(t("error.invalidSession", { path: "/x" })).toBe("Geçersiz oturum dosyası: /x");
    expect(t("error.invalidSession")).toContain("{path}");
  });

  it("follows the current language and handles plurals", () => {
    setLanguage("en");
    expect(t("unit.files", { count: 1 })).toBe("1 file");
    expect(t("unit.files", { count: 3 })).toBe("3 files");
    setLanguage("tr");
    expect(t("unit.files", { count: 3 })).toBe("3 dosya");
  });
});

describe("parseLanguage", () => {
  it.each([
    ["tr", "tr"],
    ["tr_TR.UTF-8", "tr"],
    ["EN-us", "en"],
    ["en_GB:de", "en"],
    ["de_DE.UTF-8", undefined],
    ["", undefined],
    [undefined, undefined],
  ])("%s → %s", (input, expected) => expect(parseLanguage(input)).toBe(expected));
});

describe("detectLanguage", () => {
  it("explicit choices beat the system locale, in order: flag, USTA_LANG, setting", () => {
    const env = { USTA_LANG: "en", LANG: "tr_TR.UTF-8" };
    expect(detectLanguage({ flag: "tr", env, setting: "en" })).toBe("tr");
    expect(detectLanguage({ env, setting: "tr" })).toBe("en");
    expect(detectLanguage({ env: { LANG: "en_US.UTF-8" }, setting: "tr" })).toBe("tr");
  });

  it("uses the locale next: tr → tr, en → en, another language → en", () => {
    expect(detectLanguage({ env: { LANG: "tr_TR.UTF-8" } })).toBe("tr");
    expect(detectLanguage({ env: { LANG: "en_US.UTF-8" } })).toBe("en");
    expect(detectLanguage({ env: { LANG: "de_DE.UTF-8" } })).toBe("en");
    expect(detectLanguage({ env: { LC_ALL: "tr_TR.UTF-8", LANG: "en_US.UTF-8" } })).toBe("tr");
  });

  it("falls back to the default without a usable locale", () => {
    expect(detectLanguage({ env: {} })).toBe(DEFAULT_LANGUAGE);
    expect(detectLanguage({ env: { LANG: "C.UTF-8" } })).toBe(DEFAULT_LANGUAGE);
    expect(detectLanguage({ env: { LANG: "POSIX" } })).toBe(DEFAULT_LANGUAGE);
  });

  it("ignores an unsupported explicit value and keeps looking", () => {
    expect(detectLanguage({ flag: "xx", env: { USTA_LANG: "yy", LANG: "en_US" } })).toBe("en");
  });
});

describe("formats", () => {
  it("formats numbers and dates for the current language", () => {
    setLanguage("en");
    expect(formatNumber(1234.5)).toBe("1,234.5");
    expect(formatDate("2026-12-01")).toBe("December 1, 2026");
    setLanguage("tr");
    expect(formatNumber(1234.5)).toBe("1.234,5");
    expect(formatDate("2026-12-01")).toBe("1 Aralık 2026");
    expect(formatDate("not a date")).toBe("not a date");
  });
});
