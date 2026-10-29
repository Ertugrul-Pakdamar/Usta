# Değişiklik günlüğü

Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) kurallarını, sürümleme [Anlamsal Sürümleme](https://semver.org/lang/tr/) kurallarını izler. Henüz yayımlanmış bir sürüm yoktur; proje alfa aşamasındadır.

## [Yayımlanmamış]

### Eklendi

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
