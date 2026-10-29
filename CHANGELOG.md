# Değişiklik günlüğü

Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) kurallarını, sürümleme [Anlamsal Sürümleme](https://semver.org/lang/tr/) kurallarını izler. `0.1.1` hazırdır ve `v0.1.1` etiketiyle yayımlanır; proje alfa aşamasındadır.

## [Yayımlanmamış]

### Eklendi

- **Aynı modelde Claude Code ile karşılaştırma:** `qwen3-vl-30b` ile 10 görev × 3 tekrar: usta %91 ↔ Claude Code %80 başarı, çalıştırma başına **13,5× daha az token** (önbelleksiz 7,9×). Ham veri `evals/results/*-claude-code-*.jsonl`, koşturucu `evals/run-claude-code.mjs`, tablo `evals/compare.mjs`, grafik, `docs/vs-claude-code.md` (TR/EN) ve README'lerde vurgu. Sınırlar (ev sahibi avantajı, küçük örneklem, farklı izin modları, sonradan düzeltilen tur sınırı, tek model) belgede açıkça yazılı.

## [0.1.1] — 2026-10-29

### Düzeltildi

- Sürüm: `v0.1.1` etiketi, paket sürümleri `0.1.0`'da kaldığı için release iş akışını durdurmuştu. Dört paket de `0.1.1`; `scripts/check-versions.mjs` artık hem CI'da (paketler aynı sürümde mi) hem release'te (etiket = sürüm mü) çalışır.
- Bilinmeyen dilli kod bloğunda ekrana sızan `Could not find the language 'env'` uyarısı (`usta -c` ile geçmiş yüklerken de; release binary'sinde de görülüyordu): bilinmeyen diller `plaintext`'e çevrilir; iç içe listelerdeki fazladan boş satırlar temizlenir.

### Eklendi

- **Uzun/tekrarlı çıktı ve okumadan iddia sorunu (kısmen ölçüldü):** sistem istemine "okumadan bulgu yazma", "inceleme isteği salt okumadır", "ara turlarda kısa yaz, bulguları yalnızca son cevapta ver" kuralları; `VerbosityGuard` (uzun ara metin/tekrar için araç sonucuna hatırlatma); JSON çıktısında `assistant_chars` ve `repeat_ratio`; `review-project` eval görevi; deneysel `EVREN_FREQUENCY_PENALTY` (fayda ölçülmedi, varsayılan kapalı). Etki **ölçülebilir şekilde kanıtlanmadı**: tekrar payı %5 → %1, çıktı uzunluğu ve başarı gürültü içinde; ayrıntı [Değerlendirme raporu](docs/evals.md#ek-ölçüm-uzun-ve-tekrarlı-çıktı).

## [0.1.0] — 2026-10-29 (yayımlandı)

İlk sürüm: aşağıdaki M0–M7 çalışmalarının tamamı.

### Eklendi

**Belgeler:** `docs/comparison.md` (TR/EN): Claude Code ile özellik karşılaştırması, usta'nın farkları, olgunluk sınırları ve katkıcılar için numaralı aday iş listesi (N1–N12).

**M7c: Tek dosya binary ve uygulama içinden giriş**
- `usta login`: gateway adresi ve API anahtarı etkileşimli sorulur (anahtar ekrana yazılmaz), `~/.usta/credentials` dosyasına 0600 ile kaydedilir, bağlantı denetlenir. İlk çalıştırmada yapılandırma yoksa sihirbaz kendiliğinden açılır. `--base-url`, `--key-stdin` (betikler), `--model`, `--max-tokens`; `usta logout [--all]`; düz `http://` için açık onay.
- Tek dosya yürütülebilir (Node SEA + esbuild): `pnpm build:binary` → `dist-bin/usta` (Node gerektirmez). `.github/workflows/release.yml` `v*` etiketinde Linux x64/arm64, macOS arm64, Windows x64 için derler, SHA-256 ile GitHub sürümüne ekler; CI'a her PR'da binary duman testi eklendi.
- Sürümler `0.1.0`. ADR-0011.
- Gerçek doğrulama: Node'u PATH'ten saklayıp binary ile gerçek gateway'e `-p` isteği, TUI ve `@` tamamlama gerçek terminalde, `login` gizli girişi gerçek pty'de (anahtar ekrana yansımadı, dosya 0600).

**M7b: Değerlendirme (eval) paketi**
- `evals/`: 9 otomatik denetlenen görev (toplu düzenleme, hata düzeltme, özellik, okuma), gerçek CLI + gerçek gateway, varyant başına tekrarlı koşu; `evals/run.mjs`, `evals/report.mjs`; denetimlerin kendisi `evals/tasks.test.mjs` ile (bozuk projeyi reddet, doğru çözümü kabul et) test edilir.
- Yeni bayrak `--disable-tools <ad...>` (varyant kurmak için; sistem isteminden ilgili satırlar da çıkar).
- İlk A/B sonucu: toplu düzenlemede Script toplam token'ı **−%56** düşürüyor (102.869 ↔ 234.073), başarı eşit (27/27); toplu olmayan görevlerde fark yok/gürültü. Rapor: `docs/evals.md` (TR/EN), ham sonuçlar `evals/results/`.
- Eval'in bulduğu düzeltmeler: `Grep` `path` tek dosyaysa çöküyordu; model çok eşleşmeyi yanlış sayıyordu, `Grep` artık toplamı yazıyor (aynı görev 0/6 → 6/6). Ayrıca görev tanımlarımdaki belirsizlikler düzeltildi ve ilk (kusurlu) tur da kayıt altında.

**M7a: `@dosya` tamamlama ve renkli diff**
- İstemde `@yol` önerisi ve Tab ile tamamlama; bahsedilen dosyanın içeriği isteme eklenir (en çok 5 dosya, 12.000 karakter; büyük dosya kesilir ve `Read` ile devam edilir). Gizli dosyalar, proje dışı yollar ve bunlara giden sembolik bağlar eklenmez (testin yakaladığı sembolik bağ açığı kapatıldı). Başsız modda da çalışır. Tab ayrıca `/komut` adlarını tamamlar.
- Diff'lerde sözdizimi renklendirme (bağımlılıksız küçük bir ayrıştırıcı: anahtar sözcük, metin, yorum, sayı; dil uzantıdan). Gerçek modelle `@dosya` doğrulandı (model `Read` çağırmadan cevapladı).

**M6c: Plugin'ler, modül hook'ları, Stop ile devam**
- Plugin: `usta-plugin.json` + `skills/`, `commands/`, `agents/`; manifestte hook'lar ve MCP sunucuları (`${PLUGIN_ROOT}`). `usta plugin install|list|enable|disable|remove`, `/plugins`. Kaynak: klasör veya git (npm ertelendi). Kurulum içeriği gösterip etkileşimli onay ister (atlanamaz); kurulumdan sonra değişen plugin uyarıyla atlanır.
- Modül hook'ları: `{"module": "…"}` (süreç içi, block/context döner); yalnızca kullanıcı ayarlarından ve plugin'lerden okunur, proje ayarındaki yok sayılır. Ayar şeması: `command` ile `module`'den tam biri.
- `Stop` hook'u artık engelleyebilir: sebep `[Stop hook] …` mesajı olarak eklenir ve ajan devam eder (`stopHookActive`, çalıştırma başına en çok 3 devam).
- Örnek plugin'ler `plugins/` altında: `commit-helper`, `guard-rails` (gerçek modelle doğrulandı).
- Belgeler: `docs/plugins.md` (TR/EN), ADR-0010, izinler sayfasında hook bölümü.

**M6b: MCP connector'ları**
- `@usta/mcp`: stdio ve HTTP (streamable) MCP sunucularına bağlanır; araçlar `mcp__<sunucu>__<araç>` adıyla, sunucunun kendi JSON Şemasıyla (`Tool.jsonSchema`) modele sunulur ve aynı izin kapısından geçer. `mcp__sunucu` kuralı sunucunun tüm araçlarını kapsar.
- `usta mcp add|list|remove`, oturumda `/mcp`; yapılandırma `~/.usta/mcp.json` (0600, Claude Code ile aynı `mcpServers` biçimi), `${VAR}` ile gizliler dosyaya yazılmaz, `tools` ile daraltma.
- Güvenlik: `<proje>/.usta/mcp.json` güven kapısında (program başlatabildiği için tam içeriğe bağlı onay); stdio sunucuya ortam sızdırılmaz; `readOnlyHint` yalnızca sorma davranışını etkiler; sunucu hatası oturumu düşürmez.
- Belgeler: `docs/mcp.md` (TR/EN), ADR-0009; gerçek modelle uçtan uca doğrulandı; token maliyeti `usta mcp list`'te.

**M6a: Skill'ler ve özel komutlar**
- Skill: `skills/<ad>/SKILL.md` (`name`, `description`); yalnızca ad+açıklama `Skill` aracının açıklamasında gider, gövde model çağırınca yüklenir. Skill yoksa araç eklenmez (sabit yük artmaz).
- Özel komut: `commands/<ad>.md`, `/ad argümanlar`, `$ARGUMENTS`; başsız modda `-p "/ad …"` de çalışır. `/skills` yükleneni listeler; öneri listesi özel komutları da gösterir.
- Konum: `~/.usta` ve `<proje>/.usta` (proje kazanır). Proje dosyaları **güven kapısına tabi** (tam içeriğe bağlı onay, `~/.usta/trust.json`).
- Belgeler: `docs/skills.md` (TR/EN). Gerçek modelle doğrulandı: model skill'i kendisi yükledi ve biçimi uyguladı.

**M5.5: Auto modu (deneysel)**
- Yeni izin modu `auto` (`--permission-mode auto`, `/mode auto`, ⇧Tab döngüsünde `acceptEdits`'ten sonra): değişiklik yapan çağrıları (`Bash`, `Script`, proje dışı yollar, eklenti araçları) `models.fast` ile "güvenli / riskli / belirsiz" diye sınıflar; `safe` izin alır, diğerleri kullanıcıya sorulur (soracak kimse yoksa reddedilir).
- Sınıflandırıcı kuralları gevşetemez: `deny`, korunan yollar ve `ask` kuralları onun önünde biter. Yalnızca kullanıcı mesajlarını ve ajanın araç çağrılarını görür; araç çıktısı, alt ajan raporu, özet ve hook metni görmez (prompt injection direnci). Hata/zaman aşımı = `unsure`.
- Yerel katman: tehlikeli Bash kalıpları model çağrılmadan `risky`, küçük salt okuma listesi `safe`.
- Devre kesici: art arda 3 / toplam 10 onaylanamayan çağrıdan sonra `default` moduna dönüş. Denetim günlüğü `~/.usta/audit/<oturum>.jsonl` (0600, anahtar maskeli); `/auto` komutu; sınıflandırma kullanımı oturum toplamına eklenir.
- Belgeler: `docs/auto-mode.md` (TR/EN), ADR-0008. Gerçek model ölçümü (39 çağrı): tehlikeli 20'den 0'ı `safe` sayıldı, güvenli 15'ten 14'ü `safe`, median 274 ms.

**M5: Alt ajanlar ve arka plan görevleri**
- `Task` ve `TaskOutput` araçları: iş, kendi bağlamında çalışan bir alt ajana devredilir; ana ajana yalnızca son rapor ve maliyet notu döner. Salt okuma alt ajanlar aynı turda paralel çalışır (en fazla 3).
- Dahili ajanlar `explore` (salt okuma, `models.fast`), `plan`, `general`; özel ajanlar `~/.usta/agents/*.md` ve `<proje>/.usta/agents/*.md` (proje ajanları güven kapısına tabi, içerik özetine bağlı onay).
- Alt ajanlar ana oturumun **aynı izin kapısından** geçer (mod, kurallar, hook'lar, checkpoint); `Task(ajan)` kuralları; onay kutusu ajanı etiketler ve aynı anda tek kutu açılır (`serializeAsk`); arka plan görevleri soramaz; yazabilen ajanlar sırayla çalışır.
- Arka plan görevleri: `Task {background: true}`, `/tasks`, `/tasks show|stop <id>`, durum çubuğunda sayaç, bitince bildirim ve raporun sonraki turda konuşmaya eklenmesi; başsız modda ön planda çalışır.
- `SubagentStop` hook'u; alt ajan kayıtları `~/.usta/subagents/<oturum>/<görev>.jsonl` (0600, anahtar maskeli); alt ajan kullanımı oturum toplamına eklenir, bütçe alt ajan isteklerinde de işler; JSON çıktısında `session_usage`.
- Belgeler: `docs/subagents.md` (TR/EN), ADR-0007; gerçek model ölçümleri (büyük dosyada ana bağlam −%60, tek küçük aramada daha pahalı).

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
- Sabit istem yükü 1190 → 989 token (M4 sonu, 7 araç; ilk ölçüm 1071'di, `ApplyChanges` kaldırılınca düştü).
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

- Belgelerdeki sabit istem yükü rakamı düzeltildi: M4 sonu **989** token (7 araç); önceki 1071, `ApplyChanges` kaldırılmadan önceki geçici tasarımın ölçümüydü. M5'te alt ajan araçlarıyla 1281.

- CI: Markdown biçim hataları (Türkçe README/CONTRIBUTING, İngilizce SECURITY, kararsız biçimlenen bir mimari tablosu) `pnpm lint`'i kırıyordu; düzeltildi.

- Uzun dizin yollarında banner'ın "usta" yerine "ust" görünmesi; `›`/`●` öneklerinin küçülmesi.
- Özetleyicinin tüm oturum hakkında "yalnızca X yapıldı" gibi yanıltıcı kesin ifadeler kurması.
