<div align="center">

<img src="docs/assets/logo.svg" alt="usta" width="320">

### EVREN LLM Gateway için terminalde çalışan, token ve maliyet bilinciyle tasarlanmış kodlama ajanı

Planlama, kod analizi, dosya düzenleme ve terminal erişimini **en az token, en az emekle** yapın.

[![CI](https://github.com/Ertugrul-Pakdamar/Usta/actions/workflows/ci.yml/badge.svg)](https://github.com/Ertugrul-Pakdamar/Usta/actions/workflows/ci.yml)
[![Lisans: Apache-2.0](https://img.shields.io/badge/lisans-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Durum: alfa](https://img.shields.io/badge/durum-alfa-orange.svg)](docs/roadmap.md)
[![PR'lara açık](https://img.shields.io/badge/PR'lar-a%C3%A7%C4%B1k-brightgreen.svg)](CONTRIBUTING.md)

**Türkçe** · [English](README.en.md)

[Hızlı başlangıç](#hızlı-başlangıç) · [Belgeler](docs/README.md) · [Mimari](docs/architecture.md) · [Yol haritası](docs/roadmap.md) · [Katkı](CONTRIBUTING.md)

<img src="docs/assets/demo.svg" alt="usta oturumu: model tek bir betikle 8 dosyayı değiştirir, diff onaylanınca uygulanır" width="720">

</div>

---

## Neden usta?

Kod ajanları güçlüdür ama pahalı ve denetimsiz olabilir. **usta** üç şeyi birlikte çözmek için yazıldı:

- **Token ekonomisi bir özellik, sonradan eklenen bir iyileştirme değil.** Sabit istem öneki sayesinde gateway önbelleği %50–95 isabet verir; büyük çıktılar bağlama sığdırılmaz, diske yazılır; bağlam dolunca otomatik özetlenir; aynı değişiklik çok dosyada gerekiyorsa model tek bir betik yazar.
- **Güvenlik varsayılan.** Her araç çağrısı bir izin kapısından geçer: kurallar, plan modu, diff'li onay, korunan yollar, hook'lar. Repodan gelen ayarlar siz onaylamadan çalışmaz.
- **Savunma sanayi bağlamına uygun.** Telemetri yok, veri yalnızca sizin EVREN gateway'inize gider, çalışmak için yalnızca gateway erişimi yeter, gizli dosyalar varsayılan olarak modelden saklanır.

## Özellikler

|                         |                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ajan ve araçlar**     | `Read` `Write` `Edit` `Glob` `Grep` `Bash` `Script`; bağımsız çağrılar paralel; akışlı cevap; bozuk araç çağrısı onarımı                                 |
| **Planlama**            | Plan modu (salt okuma) → `ExitPlanMode` ile plan onayı → uygulama; ⇧Tab ile mod değiştirme                                                               |
| **İzinler**             | `default` · `acceptEdits` · `plan` · `bypass`; `Bash(git status:*)`, `Edit(src/**)`, `Read(.env)` kuralları; katmanlı ayar dosyaları; proje güven kapısı |
| **Geri alma**           | Her Write/Edit/Script öncesi checkpoint; `/rewind N` dosyaları **ve** konuşmayı geri alır                                                                |
| **Hook'lar**            | `PreToolUse` `PostToolUse` `UserPromptSubmit` `SessionStart` `Stop`; kabuk komutu, JSON protokolü                                                        |
| **Token ekonomisi**     | `/cost` `/context` `/compact`; bütçe (`--budget`, `--token-budget`); önbellek dostu istem; çıktı sınırlayıcı; okuma önbelleği                            |
| **Oturumlar**           | JSONL, 0600 izinli; `usta -c` / `usta -r <id>` ile devam; otomatik özet devamda da geçerli                                                               |
| **Dil**                 | Türkçe ve İngilizce arayüz (`--lang`, `USTA_LANG`, `/lang`); modele giden metin dilden bağımsız, sabit İngilizce                                         |
| **Headless**            | `usta -p "..." --output-format json` — CI ve betikler için; çıkış kodları anlamlı                                                                        |
| **Genişletilebilirlik** | `@usta/sdk` ile araç tanımlama bugün; skill, plugin ve MCP connector'ları [M6](docs/roadmap.md)                                                          |

## Hızlı başlangıç

**Gereksinimler:** Node.js ≥ 22, [pnpm](https://pnpm.io) 12, bir EVREN LLM Gateway hesabı. İsteğe bağlı: `python3` (Script aracı), `rg` (hızlı arama).

```sh
git clone https://github.com/Ertugrul-Pakdamar/Usta.git
cd Usta
pnpm install && pnpm build

cp .env.example .env        # EVREN_API_KEY ve EVREN_BASE_URL değerlerini doldurun
pnpm usta doctor            # bağlantı, anahtar, şart kabulü, kota
pnpm usta terms             # kullanım şartlarını okuyun
pnpm usta terms accept      # ... ve kabul ediyorsanız onaylayın (siz yazarsınız, otomatik kabul yok)
pnpm usta                   # etkileşimli oturum
```

`usta` komutunu her yerden çalıştırmak için: `cd packages/cli && npm link` (anahtar bilgilerini `~/.usta/credentials` dosyasına koyabilirsiniz, bkz. [Başlangıç](docs/getting-started.md)).

## Kullanım

```sh
usta                                   # etkileşimli oturum
usta "login testini düzelt"            # istemle başlat
usta -c                                # bu dizindeki son oturuma devam et
usta --plan                            # plan modunda başla
usta --lang en                         # arayüzü İngilizce aç (USTA_LANG=en de olur)
usta -p "TODO'ları listele" --output-format json
usta --budget 5 --token-budget 200k    # sınırlı oturum
usta -p "..." --allow 'Bash(pnpm test:*)' --deny 'Read(.env)'
```

Oturum içinde `/help` tüm komutları listeler:

| Komut                                              | Ne yapar                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| `/plan`, `/mode`                                   | Plan moduna geçer, izin modunu gösterir/değiştirir (⇧Tab ile de döner) |
| `/context`                                         | Bağlam penceresinin neye gittiğini gateway'in tam sayımıyla gösterir   |
| `/cost`                                            | Token, önbellek isabeti, kalan kredi, günlük kota ve bütçe             |
| `/compact [odak]`                                  | Eski turları özetleyip bağlamı küçültür                                |
| `/rewind [N]`                                      | Son N turun dosya değişikliklerini ve konuşmayı geri alır              |
| `/permissions`                                     | Geçerli kuralları, hook'ları ve ayar dosyalarını gösterir              |
| `/model`, `/models`, `/clear`, `/session`, `/exit` | Model, konuşma ve oturum yönetimi                                      |
| `!komut`                                           | Doğrudan kabuk komutu (modele gitmez)                                  |

## Nasıl çalışır

```mermaid
flowchart LR
  CLI["@usta/cli<br/>TUI · komutlar · headless"] --> CORE["@usta/core<br/>ajan döngüsü · araçlar<br/>izinler · token ekonomisi"]
  CLI -.-> MCP["@usta/mcp<br/>connector'lar (M6)"]
  CORE --> SDK["@usta/sdk<br/>araç / plugin API'si"]
  MCP -.-> SDK
  CORE -->|"OpenAI uyumlu"| GW[("EVREN LLM Gateway")]
```

Her araç çağrısı tek bir kapıdan geçer; ayrıntı için [mimari belgesine](docs/architecture.md) bakın:

```mermaid
flowchart TD
  A["Model araç çağırır"] --> B{"Argümanlar geçerli mi?"}
  B -- hayır --> X["Hata modele döner"]
  B -- evet --> C{"İzin motoru"}
  C -- deny --> X
  C -- "ask / allow" --> E{"PreToolUse hook'u engelledi mi?"}
  E -- evet --> X
  E -- hayır --> F{"Onay gerekiyor mu?"}
  F -- evet --> D["Kullanıcıya diff ile sor"]
  D -- reddet --> X
  D -- onayla --> G["Checkpoint al"]
  F -- hayır --> G
  G --> H["Aracı çalıştır"]
  H --> I["Çıktıyı sınırla · PostToolUse"]
  I --> J["Sonuç modele döner"]
```

## Token ekonomisi, ölçülmüş

Aşağıdaki sayılar `qwen3-vl-30b` ile, gateway'in kendi `count_tokens` ve `usage` değerlerinden alındı (2026-10-29):

| Ölçüm                                                   | Değer                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Her istekteki sabit yük (sistem istemi + 8 araç şeması) | **~1.07k token** (M1–M3'te 1.19k idi; iki araç eklenmesine rağmen düştü)        |
| Aynı oturumun ikinci isteğinde önbellekten gelen pay    | **%49 – %97** (iş yüküne göre)                                                  |
| 8 dosyada aynı değişiklik                               | 3 model turu, tek betik, 3.8k girdi token'ı (%64 önbellekten)                   |
| 80 KB'lık komut çıktısı                                 | Bağlama ~12k karakter girer, tamamı diske kaydedilir, model `Read` ile açabilir |

Ayrıntılar ve yöntem: [Token ekonomisi](docs/token-economy.md). Gerçek A/B eval seti [M7](docs/roadmap.md) kapsamında.

## Güvenlik modeli

- Her araç çağrısı izin motorundan geçer; **deny her zaman kazanır**, `bypass` modunda bile.
- Bash allow kuralları bileşik komutlarda her alt komutu doğrular; `$(…)`, kaçış ve yönlendirme içeren komutlar kural ile onaylanmaz.
- `.env`, `*.pem`, `*.key` gibi dosyalar varsayılan olarak okunamaz ve yazılamaz; sembolik bağlantılar çözülerek kontrol edilir.
- Repodan gelen `.usta/settings.json` içindeki `allow` kuralları, hook'lar ve model/özet ayarları **siz içeriği onaylamadan** uygulanmaz.
- Telemetri yoktur. Oturumlar, çıktılar ve checkpoint'ler yalnızca sizin makinenizde, özel izinlerle tutulur.

Ayrıntılar: [İzinler ve güvenlik](docs/permissions.md) · Zafiyet bildirimi: [SECURITY.md](SECURITY.md)

## Durum ve yol haritası

usta **alfa** aşamasındadır: çekirdek, arayüz, güvenlik ve token ekonomisi tamamlandı.

|     | Aşama                                             | Durum                                |
| --- | ------------------------------------------------- | ------------------------------------ |
| ✅  | M0–M2 İskelet, çekirdek, TUI                      | Tamamlandı                           |
| ✅  | M3 Güvenlik: izinler, plan modu, rewind, hook'lar | Tamamlandı                           |
| ✅  | M4 Token ekonomisi: bütçe, önbellek, özet, Script | Tamamlandı                           |
| 🟡  | M4.5 Lokalizasyon (TR/EN)                         | Kod tamam, İngilizce belgeler sırada |
| 🔜  | M5 Subagent'lar ve arka plan görevleri            | Planlandı                            |
| 🔜  | M5.5 Auto modu (sınıflandırıcı destekli izin)     | Planlandı                            |
| 🔜  | M6 Skill, plugin ve MCP connector'ları            | Planlandı                            |
| 🔜  | M7 Tek dosya binary, eval raporu, v0.1.0          | Planlandı                            |

Tam liste: [docs/roadmap.md](docs/roadmap.md).

## Depo yapısı

```
packages/
  core/   ajan döngüsü, provider, araçlar, izinler, token ekonomisi, oturumlar
  cli/    Ink arayüzü, komutlar, headless mod
  sdk/    araç/plugin yazarları için genel API
  mcp/    MCP connector istemcisi (M6)
docs/     kullanıcı ve geliştirici belgeleri, mimari karar kayıtları (ADR)
```

## Katkı

Katkılar memnuniyetle karşılanır. Başlamak için [CONTRIBUTING.md](CONTRIBUTING.md) dosyasına ve [mimari belgesine](docs/architecture.md) bakın. Davranış kuralları: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

```sh
pnpm install && pnpm build
pnpm lint && pnpm test      # PR öncesi ikisi de yeşil olmalı
```

## Lisans

[Apache License 2.0](LICENSE) altında dağıtılır. Bkz. [NOTICE](NOTICE).
