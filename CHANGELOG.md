# Değişiklik günlüğü

Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) kurallarını, sürümleme [Anlamsal Sürümleme](https://semver.org/lang/tr/) kurallarını izler. Henüz yayımlanmış bir sürüm yoktur; proje alfa aşamasındadır.

## [Yayımlanmamış]

### Eklendi

**M4.5: Lokalizasyon**
- Türkçe ve İngilizce arayüz: `t()` ve katalog (`core/src/i18n`); `en.ts` kaynak, `tr.ts` derleme zamanında eksiksiz olmak zorunda.
- Dil seçimi: `--lang` > `USTA_LANG` > ayar (`language`) > sistem yereli > `tr`; tanınan başka dil `en`'e düşer. `/lang` oturum sırasında dili değiştirir.
- Kullanıcıya dönük tüm metinler taşındı: arayüz, onay kutuları, `doctor`, `terms`, komut satırı yardımı, slash komutları, raporlar, uyarılar, hata iletileri.
- Sayı ve tarih biçimleri dile göre (`Intl`): `1.010 CR` / `1,010 CR`, `1 Aralık 2026` / `December 1, 2026`; çoğul biçimleri.
- Reddedilen araç çağrıları kullanıcıya kendi dilinde gösterilir (`display`), modele İngilizce nedeni gider (`reasonKey`).
- İngilizce terminal görüntüsü (`docs/assets/demo.en.svg`), ADR-0006.
- **İngilizce belgeler:** `docs/en/` altında tüm kullanıcı ve katkıcı belgeleri, ADR'ler ve katkı rehberi; `SECURITY.md` ve `CODE_OF_CONDUCT.md` iki dilli.

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

- **Modele giden tüm metinler İngilizce sabit oldu:** araç sonuçları ve hata iletileri (`Cannot read …`, `old_string was not found …`), izin ve hook ret sebepleri, döngü hataları. Önceden Türkçeydi; model davranışı dilden bağımsız, token tüketimi düşük.
- Geçersiz `--lang` değeri yığın izi yerine anlaşılır hata verir.
- Gateway adresi artık yerleşik varsayılana sahip değil; `EVREN_BASE_URL` zorunludur.
- Headless JSON çıktısındaki `usage` alanları snake_case'tir (`prompt_tokens`, `completion_tokens`, `cached_tokens`, `cache_ratio`).

### Güvenlik

- Repodan gelen `allow` kuralları, hook'lar, `defaultMode`, `models` ve `compactAt` kullanıcı onayına bağlandı.
- Gizli dosyalar (`.env`, `*.pem`, `*.key`) dosya araçlarında varsayılan olarak reddedilir.

### Düzeltildi

- Uzun dizin yollarında banner'ın "usta" yerine "ust" görünmesi; `›`/`●` öneklerinin küçülmesi.
- Özetleyicinin tüm oturum hakkında "yalnızca X yapıldı" gibi yanıltıcı kesin ifadeler kurması.
