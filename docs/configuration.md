# Yapılandırma

usta üç kaynaktan yapılandırılır: **ortam değişkenleri** (gateway erişimi), **ayar dosyaları** (izinler, hook'lar, bütçe, modeller) ve **komut satırı bayrakları** (o oturum için). Öncelik her zaman daha özel olandadır: bayrak > ayar dosyası > varsayılan.

## Ortam değişkenleri

| Değişken                   | Zorunlu | Anlamı                                                                                   |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `EVREN_API_KEY`            | evet    | Gateway API anahtarı. Loglara ve oturum dosyalarına yazılmadan önce maskelenir           |
| `EVREN_BASE_URL`           | evet    | Gateway adresi, `/v1` ile biter. Kuruma özgü olduğu için yerleşik varsayılanı **yoktur** |
| `EVREN_DEFAULT_MODEL`      | hayır   | Başka model seçilmediğinde kullanılan model (varsayılan `qwen3-vl-30b`)                  |
| `EVREN_DEFAULT_MAX_TOKENS` | hayır   | Tek bir model cevabının üst sınırı; boşsa gateway varsayılanı                            |
| `EVREN_FAST_MODEL`         | hayır   | Bağlam özetleri için ucuz model; boşsa ana model (`models.fast` ayarı önceliklidir)      |
| `USTA_NO_RG`               | hayır   | Doluysa `rg` kullanılmaz, saf JS arama çalışır                                           |
| `USTA_LANG`                | hayır   | Arayüz dili: `tr` veya `en` ([Dil](#dil))                                                |

Arama sırası (ilk bulunan kazanır): gerçek ortam değişkenleri → `./.env` → `~/.usta/credentials`. Dosyalar `ANAHTAR=değer` biçimindedir.

## Ayar dosyaları

```
~/.usta/settings.json            kullanıcı        (her alan geçerli)
<proje>/.usta/settings.json      proje, repoda    (güven kapısı var, aşağıya bakın)
<proje>/.usta/settings.local.json  yerel, gitignore'lu  (kullanıcıya ait)
```

Katmanlar birleştirilir: listeler (`allow`, `deny`, `ask`, hook'lar) birbirine eklenir, skaler değerlerde sonraki katman kazanır, **`deny` her zaman kazanır**. Geçersiz bir dosya sessizce yok sayılmaz: usta hata verip durur (kurallar kaybolmasın diye).

### Şema

```json
{
  "permissions": {
    "allow": ["Bash(git status:*)", "Edit(src/**)"],
    "deny": ["Read(.env)", "Bash(rm:*)"],
    "ask": ["Bash(git push:*)"],
    "defaultMode": "default"
  },
  "hooks": {
    "PreToolUse": [{ "matcher": "Bash", "command": "./scripts/check-command.sh", "timeout": 10 }]
  },
  "models": { "main": "qwen3-vl-30b", "fast": "qwen3-vl-30b" },
  "budget": { "tokens": 500000, "cr": 5 },
  "compactAt": 0.8,
  "language": "tr"
}
```

| Alan                                 | Tür                                                        | Açıklama                                                                    |
| ------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `permissions.allow` / `deny` / `ask` | `string[]`                                                 | [Kural sözdizimi](permissions.md#kural-sözdizimi)                           |
| `permissions.defaultMode`            | `default` \| `acceptEdits` \| `auto` \| `plan` \| `bypass` | Başlangıç izin modu. `bypass` **yalnızca kullanıcı ayarlarında** geçerlidir |
| `hooks.<Olay>`                       | `{matcher?, command, timeout?}[]`                          | [Hook'lar](permissions.md#hooklar). `timeout` saniye, varsayılan 30         |
| `models.main` / `models.fast`        | `string`                                                   | Ana model ve özetleme modeli                                                |
| `budget.tokens`                      | `int`                                                      | Oturum boyunca işlenen toplam token üst sınırı (girdi + çıktı)              |
| `budget.cr`                          | `number`                                                   | Oturum kredi (CR) üst sınırı                                                |
| `compactAt`                          | `0.3 – 0.95`                                               | Bağlam penceresinin bu oranına varınca otomatik özet (varsayılan 0.8)       |
| `language`                           | `tr` \| `en`                                               | Arayüz dili ([Dil](#dil)). Zararsız olduğu için her katmandan uygulanır     |

### Proje güven kapısı

Repodan gelen `.usta/settings.json` dosyasını başkası yazmış olabilir. Bu yüzden dosyada **`allow` kuralı, hook, `defaultMode`, `models` veya `compactAt`** varsa, usta bunları siz içeriği onaylamadan **uygulamaz**. Açılışta ne tanımlandığını listeler ve sorar:

```
Bu proje /…/proje/.usta/settings.json dosyasında şunları tanımlıyor:
  - allow: Bash
  - hook PreToolUse: ./check.sh
Bunlar bu bilgisayarda izin sormadan komut çalıştırabilir.
Bu proje ayarlarına güveniyor musunuz? [e/H]
```

- Onay, dosyanın **içerik özetine (SHA-256)** bağlanır ve `~/.usta/trust.json` içinde saklanır; dosya değişirse yeniden sorulur.
- `deny`, `ask` ve `budget` her zaman uygulanır (yalnızca kısıtlayıcıdırlar).
- Etkileşimsiz çalıştırmada (`-p`, terminal yok) güvenilmeyen kısımlar uyarıyla atlanır. CI'da dosyaya güveniyorsanız `--trust-project` verin.
- Aynı kapı **proje ajanları** (`.usta/agents/*.md`) için de geçerlidir: tam içerikleri onaylanmadan yüklenmez, `--trust-project` her ikisine de güvenir ([Alt ajanlar](subagents.md#özel-ajanlar)).

## Komut satırı

```
usta [istem...]                    etkileşimli oturum (istemle başlar)
usta doctor                        bağlantı, anahtar, şart kabulü, kota kontrolü
usta terms [accept]                kullanım şartlarını göster / kabul et
usta models                        gateway'deki modelleri listele
```

| Bayrak                        | Anlamı                                                                |
| ----------------------------- | --------------------------------------------------------------------- |
| `-p, --print <istem>`         | Etkileşimsiz çalıştır, sonucu yazdır, çık                             |
| `--output-format text\|json`  | `-p` çıktı biçimi (varsayılan `text`)                                 |
| `--model <ad>`                | Bu oturumun modeli                                                    |
| `--max-turns <n>`             | `-p` için en fazla ajan turu (varsayılan 25; etkileşimli oturumda 50) |
| `-c, --continue`              | Bu dizindeki son oturuma devam et                                     |
| `-r, --resume [id]`           | Belirli (veya son) oturuma devam et                                   |
| `--permission-mode <mod>`     | `default` \| `acceptEdits` \| `auto` \| `plan` \| `bypass`            |
| `--plan`                      | Plan modunda başla                                                    |
| `--allow <kural...>`          | İzin kuralı ekle (tekrarlanabilir)                                    |
| `--deny <kural...>`           | Yasak kuralı ekle (tekrarlanabilir)                                   |
| `--trust-project`             | Repodaki `.usta/settings.json` dosyasına sormadan güven               |
| `--lang <dil>`                | Arayüz dili: `tr` veya `en`                                           |
| `--budget <cr>`               | Oturum kredi bütçesi                                                  |
| `--token-budget <n>`          | Oturum token bütçesi; `200k`, `1.5m` biçimleri geçerli                |
| `-y, --yes`                   | `bypass` modu: **deny kuralları dışında her şeye izin verir**         |
| `-V, --version`, `-h, --help` | Sürüm, yardım                                                         |

## Dil

Arayüz (menüler, hata iletileri, `doctor`, `terms`, komut satırı yardımı, raporlar) Türkçe ve İngilizce desteklenir. Dil şu sırayla seçilir; **açık seçim sistem yerelinden güçlüdür**:

1. `--lang tr|en` bayrağı
2. `USTA_LANG` ortam değişkeni
3. Ayar dosyasında `"language"`
4. Sistem yereli (`LC_ALL`, `LC_MESSAGES`, `LANG`, `LANGUAGE`): `tr*` → Türkçe, `en*` → İngilizce, **başka bir dil → İngilizce** (uluslararası yedek)
5. Yerel yoksa veya `C`/`POSIX` ise: Türkçe

Oturum içinde `/lang en` veya `/lang tr` dili anında değiştirir (o oturum için; kalıcı yapmak için `USTA_LANG` veya `language` ayarını kullanın). Sayılar ve tarihler dile göre biçimlenir (`1.010 CR` / `1,010 CR`, `1 Aralık 2026` / `December 1, 2026`).

**Modele giden metinler dilden bağımsızdır.** Sistem istemi, araç açıklamaları, araç sonuçları ve hata iletileri, izin/hook ret sebepleri her zaman İngilizcedir; böylece davranış tutarlı kalır, daha az token harcanır ve önbellek öneki bozulmaz. Arayüz dili yalnızca _sizin_ gördüğünüz metni değiştirir. Örneğin reddedilen bir çağrıyı siz kendi dilinizde okursunuz, model ise İngilizce nedeni alır.

> **Sınır:** Komut satırı yardımındaki bölüm başlıkları (`Usage:`, `Options:`, `Commands:`) kullanılan `commander` kütüphanesinden gelir ve İngilizce kalır; açıklamalar çevrilir.

## `~/.usta` dizini

| Yol                                   | İçerik                                 | Notlar                                             |
| ------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| `credentials`                         | `EVREN_*` değişkenleri                 | `chmod 600` önerilir                               |
| `settings.json`                       | Kullanıcı ayarları                     |                                                    |
| `trust.json`                          | Güvenilen proje ayarlarının özetleri   |                                                    |
| `sessions/<id>.jsonl`                 | Konuşma kayıtları                      | 0600; `-c`/`-r` ile devam                          |
| `checkpoints/<id>/`                   | `/rewind` için dosya yedekleri         | 0600                                               |
| `outputs/<id>/`                       | Bağlama sığmayan tam araç çıktıları    | 7 günden eskiler açılışta silinir                  |
| `cache/models.json`                   | Gateway model bilgisi önbelleği        | 1 saat geçerli                                     |
| `agents/*.md`                         | Kullanıcının özel alt ajanları         | [Alt ajanlar](subagents.md#özel-ajanlar)           |
| `subagents/<oturum>/`                 | Alt ajan konuşma kayıtları             | 0600; denetim için                                 |
| `plugins/<ad>/`, `plugins/state.json` | Kurulu plugin'ler ve durumları         | [Plugin'ler](plugins.md)                           |
| `mcp.json`                            | MCP sunucuları (0600)                  | [MCP](mcp.md)                                      |
| `skills/`, `commands/`                | Kullanıcı skill'leri ve özel komutları | [Skill'ler](skills.md)                             |
| `audit/<oturum>.jsonl`                | Auto modu kararları                    | 0600; [Auto modu](auto-mode.md#denetim-ve-maliyet) |

Oturum dosyaları araç çıktılarını içerebilir; paylaşmadan önce gözden geçirin.
