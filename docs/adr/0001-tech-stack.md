# ADR-0001: Teknoloji seçimi

**Durum:** Kabul edildi · **Tarih:** 2026-10-29

## Bağlam

Terminalde çalışan, EVREN gateway'ine bağlanan, genişletilebilir ve katkıya açık bir kodlama ajanı gerekiyor. Dağıtım hedefi: internete çıkmayan ortamlara da kopyalanabilmesi.

## Karar

- **TypeScript 7 (strict) + Node.js ≥ 22**, pnpm workspaces.
- **Arayüz:** Ink 8 + React 19 (bileşen tabanlı, `ink-testing-library` ile test edilebilir).
- **Şema/doğrulama:** zod 4 (araç girdisi hem doğrulama hem model şeması için tek kaynak).
- **LLM istemcisi:** `openai` SDK, kendi `Provider` arayüzümüzün arkasında (gateway OpenAI uyumlu).
- **Lint/biçim:** Biome. **Test:** Vitest.
- **Sürümleme:** Conventional Commits; Changesets M7'de.
- **Dağıtım:** npm paketi; M7'de `bun build --compile` ile tek dosya binary.

## Elenen seçenekler

| Seçenek          | Neden elendi                                                        |
| ---------------- | ------------------------------------------------------------------- |
| Go + Bubble Tea  | Tek binary çok iyi, ancak MCP ve JS tabanlı plugin ekosistemi zayıf |
| Rust + Ratatui   | Katkı bariyeri yüksek                                               |
| Python + Textual | Başlangıç süresi ve dağıtım (internetsiz ortam) sorunlu             |

## Sonuçlar

- Resmi MCP SDK'sı TypeScript'tir; M6 doğal olarak kolaylaşır.
- Plugin yazarlarının çoğu JS/TS biliyor, katkıcı havuzu geniş.
- Node ≥ 22 gerekir (`process.loadEnvFile` vb. yerleşik özellikler kullanılıyor).
- TypeScript 7 `@types/node`'u otomatik yüklemez; `tsconfig.base.json` içinde `types: ["node"]` açıktır.
