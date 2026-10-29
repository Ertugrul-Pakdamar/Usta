# İzinler ve güvenlik

usta'nın güvenlik anlayışı basittir: **model ne isterse istesin, her araç çağrısı tek bir kapıdan geçer** ve kapı, kullanıcının kurallarına bakar. Bu sayfa kapının nasıl çalıştığını, neyi garanti ettiğini ve neyi **garanti etmediğini** anlatır.

## İzin modları

| Mod           | Okuma   | Çalışma dizininde Write/Edit | Bash / Script   | Ne zaman                                                               |
| ------------- | ------- | ---------------------------- | --------------- | ---------------------------------------------------------------------- |
| `default`     | serbest | sorar                        | sorar           | Varsayılan                                                             |
| `acceptEdits` | serbest | otomatik                     | sorar           | Düzenlemelere güvendiğinizde                                           |
| `auto`        | serbest | otomatik                     | sınıflandırılır | Az onay, güvenlik kuralları aynı: [Auto modu](auto-mode.md) (deneysel) |
| `bypass`      | serbest | otomatik                     | otomatik        | Yalnızca izole ortam; `-y` veya kullanıcı ayarı                        |

⇧Tab `default → acceptEdits → auto → plan` döngüsünü gezer (`bypass`'a oradan geçilemez). Çalışma dizini **dışındaki** yollar her modda (bypass hariç) sorar.

## Karar sırası

Bir araç çağrısı için izin motoru şu sırayla karar verir; ilk eşleşen kazanır:

1. **`deny` kuralı** eşleşirse → reddedilir (bypass dahil, hiçbir şey aşamaz).
2. **Plan modunda** değişiklik yapan araç → reddedilir.
3. `ExitPlanMode` → plan modunda onay ister, değilse reddeder.
4. **Korunan yola** yazma (`.git/`, `.usta/`, `~/.usta/`) → sorar (bypass hariç; `allow` kuralı bile aşamaz).
5. **`ask` kuralı** eşleşirse → sorar.
6. **`allow` kuralı** (oturum kuralları dahil) eşleşirse → izin verir.
7. `bypass` → izin verir.
8. Çalışma dizini dışında bir yol → sorar (okunması serbest olan `~/.usta/outputs/**` hariç).
9. Salt okuma aracı → izin verir.
10. `acceptEdits` + dosya aracı → izin verir.
11. Aksi halde → sorar. (`mcp__sunucu` kuralı o sunucunun tüm MCP araçlarını kapsar: [MCP](mcp.md).) (`auto` modunda bu adım **sınıflandırılır**: `safe` ise izin, `risky`/`unsure` ise sorar; sınıflandırıcı yukarıdaki hiçbir adımı gevşetemez. Bkz. [Auto modu](auto-mode.md).)

Karar "sor" ise ve etkileşimli onay yoksa (`-p` ve terminal yok) çağrı **reddedilir**; sebep modele iletilir.

## Kural sözdizimi

`Araç` veya `Araç(belirteç)`. Araç adları: `Read` `Write` `Edit` `Glob` `Grep` `Bash` `Script` `Task` `TaskOutput` `ExitPlanMode`.

```
Bash                       tüm Bash çağrıları
Bash(git status:*)         "git status" ile başlayan komutlar (kelime sınırlı)
Bash(npm test)             yalnızca tam olarak bu komut
Read(.env)                 her dizindeki .env
Edit(src/**)               src/ altındaki her dosya
Read(~/.ssh/**)            ev dizini yolu
Script(python)             python betikleri
Task(general)              general alt ajanına devretme
```

**Yol belirteçleri** gitignore benzeri çalışır: `/` içermeyen desen (`.env`) her dizinde adıyla eşleşir; `/` içeren desen çalışma dizinine göredir; `~/` ev dizinidir; bir dizin adı içindeki her şeyi kapsar. Yollar **sembolik bağlantılar çözülerek** karşılaştırılır; yani `.env`'e işaret eden `masum.txt` de `Read(.env)` kuralına takılır.

### Bash kuralları ve bileşik komutlar

Kabuk komutları tek bir komut gibi görünüp birden fazlasını çalıştırabilir. Bu yüzden:

- **allow** kuralı, komut `&&`, `||`, `;`, `|`, `&` veya satır sonuyla bölündüğünde **her alt komutun** bir allow kuralıyla eşleşmesini ister. `git status; rm -rf /` kural `Bash(git status:*)` ile **onaylanmaz**.
- `$(…)`, ters tırnak, `(`, `)`, `<`, `>` içeren komutlar allow kuralıyla **hiç** eşleşmez (sorar). `2>&1` istisnadır.
- `FOO=1 git status` (başa ortam değişkeni) allow kuralıyla eşleşmez.
- **deny/ask** kuralı daha geniş bölünür: `echo $(rm -rf x)` içindeki `rm -rf x` da `Bash(rm:*)` deny kuralına takılır.

> **Sınır:** Önek kuralları dolaylı çağrıları göremez: `xargs rm`, `bash -c "rm …"`, `env rm`, `find -exec rm` gibi. Önek kuralı bir **kolaylıktır, sandbox değildir**. Gerçek izolasyon gerekiyorsa usta'yı konteyner/VM içinde çalıştırın ve `bypass` kullanmayın.

### Oturum içi "hep izin ver"

Onay kutusundaki `a` tuşu kalıcı değil, **oturumluk** kural ekler: `Bash` için yalnızca o tam komut, çalışma dizinindeki düzenlemeler için `acceptEdits`, çalışma dizini dışındaki yollar için o dizin. `Script` için hedef betik dilidir; yani `a` o oturumda _her_ python (veya node) betiğinin çalıştırılmasına izin verir, kullanırken bunu bilin. Kalıcı kural için ayar dosyasına yazın.

## Gizli dosya koruması

`Read`/`Write`/`Edit` varsayılan olarak `.env`, `.env.*` (`.env.example` hariç), `*.pem`, `*.key`, `*.p12`, `*.pfx` dosyalarını reddeder; `Grep` bunları taramaz; `Script` kopyasına bunları hiç koymaz.

> **Sınır:** Bu koruma _dosya araçlarındadır_. Model `Bash` ile `cat .env` çalıştırabilir; bunu da engellemek istiyorsanız `deny: ["Bash(cat .env:*)"]` gibi kurallar ekleyin veya Bash'i hiç allow etmeyin.

## Proje güven kapısı

Repodan gelen `.usta/settings.json` içindeki `allow`, hook, `defaultMode`, `models`, `compactAt` ayarları siz içeriği onaylamadan uygulanmaz; ayrıntı için [Yapılandırma](configuration.md#proje-güven-kapısı). `bypass` hiçbir zaman proje veya yerel dosyadan gelemez.

## Plan modu

```
usta --plan      # veya oturumda /plan, ya da ⇧Tab
```

1. Model yalnızca `Read`/`Glob`/`Grep` kullanır; yazma ve komut çağrıları reddedilir.
2. Araştırma bitince `ExitPlanMode` ile somut bir plan sunar. Plan onay kutusunda gösterilir.
3. `y` → planı onayla ve düzenlemeleri otomatik kabul et (`acceptEdits`) · `e` → onayla ama her değişikliği sor (`default`) · `n` → reddet, model planı revize eder.

Plan modu uyarısı istemin **sonuna** eklenir (önbellek önekini bozmamak için) ve `ExitPlanMode` aracı yalnızca bu modda araç listesindedir.

## Hook'lar

Hook'lar yaşam döngüsünün belirli noktalarında çalışan kabuk komutlarıdır.

| Olay               | Ne zaman                                                            | Engelleyebilir mi           |
| ------------------ | ------------------------------------------------------------------- | --------------------------- |
| `PreToolUse`       | Araç çalışmadan önce (izin kuralları geçtikten sonra)               | evet                        |
| `PostToolUse`      | Araç çalıştıktan sonra                                              | hayır (geri bildirim ekler) |
| `UserPromptSubmit` | Kullanıcı istem gönderince                                          | evet                        |
| `SessionStart`     | Oturumun ilk isteminde                                              | hayır (bağlam ekler)        |
| `Stop`             | Model turu bitirince                                                | evet: ajan **devam eder**   |
| `SubagentStop`     | Bir alt ajan bitince (`agent`, `description`, `result` alanlarıyla) | hayır                       |

**Protokol.** Komuta stdin'den tek satır JSON gelir, ortamda `USTA_PROJECT_DIR` bulunur:

```json
{
  "event": "PreToolUse",
  "cwd": "/…/proje",
  "sessionId": "2026-10-29-ab12cd",
  "toolName": "Bash",
  "toolInput": { "command": "rm -rf build" }
}
```

`PostToolUse` ayrıca `toolOutput` (ilk 5000 karakter) ve `isError`; `UserPromptSubmit` ayrıca `prompt` alanı taşır.

| Çıkış | Anlamı                                                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`   | Tamam. stdout `{"decision":"block","reason":"…"}` ise engeller; `{"context":"…"}` modele bağlam ekler. `UserPromptSubmit`/`SessionStart`'ta düz metin stdout da bağlam olur |
| `2`   | Engelle: stderr (yoksa stdout) sebep olarak modele döner                                                                                                                    |
| diğer | Uyarı: gösterilir, akış devam eder                                                                                                                                          |

`matcher`, araç adına karşı **tam eşleşen** bir düzenli ifadedir (`"Write|Edit"`); boş veya `*` hepsi demektir. Zaman aşımı varsayılan 30 sn'dir ve süreç ağacı öldürülür.

**`Stop` ile devam ettirme.** Bir `Stop` hook'u engellerse (çıkış 2 ya da `{"decision":"block","reason":"…"}`) ajan durmaz; sebep `[Stop hook] …` kullanıcı mesajı olarak eklenir ve model işe devam eder (örneğin "testler hâlâ kırık"). Olay `stopHookActive: true` taşıyorsa ajan zaten bir hook yüzünden devam ediyordur; hook sonsuz döngüye girmemek için bunu kontrol etmelidir. Güvenlik ağı olarak bir çalıştırmada en çok **3** devam edilir.

**Modül hook'ları.** Kabuk komutu yerine `{"module": "/yol/hook.mjs"}` yazılabilir; modülün varsayılan dışa aktarımı `(olay) => void | {decision?, reason?, context?}` işlevidir (async olabilir; olay nesnesi yukarıdaki JSON'dur). Süreç içinde çalışır, aynı zaman aşımı ve aynı sınırlar geçerlidir; hata veya zaman aşımı yalnızca uyarıdır. Modül kodu çalışma dizinindeki depoda değişebileceği için **yalnızca kendi ayarlarınızdan (`~/.usta/settings.json`) ve kurduğunuz [plugin](plugins.md)'lerden** okunur; proje ayarındaki `module` hook'ları uyarıyla yok sayılır.

**Hook'lar yalnızca kısıtlayabilir.** Bir hook'un `allow` demesi `deny`/`ask` kurallarını aşamaz; hook izin kuralları geçtikten **sonra** çalışır.

```sh
#!/usr/bin/env bash
# .usta/hooks/no-force-push.sh — PreToolUse, matcher: Bash
cmd=$(jq -r '.toolInput.command')
if [[ "$cmd" == *"git push"*"--force"* ]]; then
  echo "force-push yasak" >&2
  exit 2
fi
```

## Alt ajanlar

Alt ajanlar **aynı kapıdan** geçer: mod (plan modu dahil), kurallar, hook'lar ve checkpoint'ler onların her aracı için de geçerlidir; hangi ajanın kullanılabileceğini `Task(ajan)` kurallarıyla sınırlayabilirsiniz. Birçok alt ajan aynı anda sorsa bile tek seferde tek onay kutusu açılır; arka plan görevleri soramaz, onay gerektiren çağrı reddedilir. Ayrıntı: [Alt ajanlar](subagents.md#izinler-ve-onay).

## Checkpoint ve `/rewind`

Her kullanıcı isteği bir *tur*dur. Write/Edit/Script bir dosyayı değiştirmeden hemen önce dosyanın önceki hali (veya "yoktu" bilgisi) `~/.usta/checkpoints/<oturum>/` altına alınır.

```
/rewind          son turları listeler
/rewind 2        son 2 turun dosya değişikliklerini geri alır VE konuşmayı o noktaya döndürür
```

Konuşma kesilmesi oturum dosyasına yazılır; `usta -c` ile devamda da geçerlidir. Otomatik özetten sonra eski turlar yalnızca özet noktasına kadar geri alınabilir.

> **Sınır:** `Bash` ile yapılan dosya değişiklikleri izlenmez ve geri alınamaz.

## Garanti edilenler ve edilmeyenler

| Garanti                                                       | Garanti**değil**                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Her araç çağrısı kapıdan geçer, `deny` her zaman kazanır      | Önek kurallarının dolaylı komutları (`xargs`, `bash -c`) yakalaması                            |
| Repo ayarları onaysız çalıştırılmaz                           | `Bash` ile gizli dosyaya erişimin engellenmesi (ek kural gerekir)                              |
| Dosya araçlarında sembolik bağlantı ve `..` çözülerek kontrol | Script betiğinin ağa/ev dizinine erişememesi (yalnızca kopyada çalışır; kod önceden onaylanır) |
| Oturum/çıktı/checkpoint dosyaları özel izinlerle              | `Bash` değişikliklerinin geri alınabilmesi                                                     |

Zafiyet bildirmek için [SECURITY.md](../SECURITY.md).
