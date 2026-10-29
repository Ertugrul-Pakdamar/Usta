# Değişiklik günlüğü

Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) kurallarını, sürümleme [Anlamsal Sürümleme](https://semver.org/lang/tr/) kurallarını izler. Henüz yayımlanmış bir sürüm yoktur; proje alfa aşamasındadır.

## [Yayımlanmamış]

### Eklendi

**M4: Token ekonomisi**
- Model kaydı (`/v1/models`, diskte 1 saatlik önbellek); kalibre token tahmini ve gateway `count_tokens` ile tam sayım.
- Maliyet ve kota takibi (`/v1/quota`), oturum bütçeleri (`--budget`, `--token-budget`, ayarlarda `budget`); aşımda sorar veya çıkış kodu 3 ile durur.
- Önbellek dostu istem: sabit sistem istemi ve araç listesi; plan modu uyarısı isteğin sonuna; `ExitPlanMode` yalnızca plan modunda.
- Sabit istem yükü 1190 → 1071 token (iki araç eklenmesine rağmen).
- Araç çıktısı sınırlayıcı (baş + son, tamamı `~/.usta/outputs`), `Read` için "değişmedi" önbelleği, `Bash` bellek koruması.
- Otomatik bağlam özeti (`compactAt`, varsayılan %80) ve `/compact`; oturum dosyasına `compact` kaydı.
- `/context` (gateway sayımıyla döküm) ve genişletilmiş `/cost`; durum çubuğunda bağlam %, önbellek %, kalan CR.
- `Script` aracı: kodu proje kopyasında çalıştırır, diff'i kullanıcıya onaylatır, onayla uygular; toplu düzenleme sezgisi.
- `rg` kuruluysa `Grep` onu kullanır (JS yedeği korunur).
- `models.main`/`models.fast`, `budget`, `compactAt` ayarları; `doctor`'da gerçek şart durumu ve kota.

**M3: Güvenlik**
- İzin motoru: `default` / `acceptEdits` / `plan` / `bypass`; `Araç(belirteç)` kuralları; Bash bileşik komut ve sembolik bağlantı korumaları.
- Katmanlı ayarlar (`~/.usta`, proje, yerel) ve **proje güven kapısı**.
- Plan modu (`ExitPlanMode`, `--plan`, `/plan`, ⇧Tab).
- Checkpoint ve `/rewind` (dosyalar ve konuşma).
- Hook'lar: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `Stop`.
- `/mode`, `/permissions`; `--permission-mode`, `--allow`, `--deny`, `--trust-project`, `-y`.

**M2: Arayüz**
- Ink TUI: akış, markdown, diff'li onay, slash komutları, `!komut`, çok satırlı giriş, geçmiş.
- Oturum kaydı (JSONL) ve `-c` / `-r` ile devam.

**M1: Çekirdek**
- OpenAI uyumlu provider, ajan döngüsü, `Read` `Write` `Edit` `Glob` `Grep` `Bash`, headless `-p`.
- `.env` yükleme, `usta terms [accept]` (kabul yalnızca kullanıcı onayıyla), `usta models`, `usta doctor`.

**M0: İskelet**
- pnpm monorepo, TypeScript, Biome, Vitest, CI, ADR'ler.

### Değişti

- Gateway adresi artık yerleşik varsayılana sahip değil; `EVREN_BASE_URL` zorunludur.
- Headless JSON çıktısındaki `usage` alanları snake_case'tir (`prompt_tokens`, `completion_tokens`, `cached_tokens`, `cache_ratio`).

### Güvenlik

- Repodan gelen `allow` kuralları, hook'lar, `defaultMode`, `models` ve `compactAt` kullanıcı onayına bağlandı.
- Gizli dosyalar (`.env`, `*.pem`, `*.key`) dosya araçlarında varsayılan olarak reddedilir.

### Düzeltildi

- Uzun dizin yollarında banner'ın "usta" yerine "ust" görünmesi; `›`/`●` öneklerinin küçülmesi.
- Özetleyicinin tüm oturum hakkında "yalnızca X yapıldı" gibi yanıltıcı kesin ifadeler kurması.
