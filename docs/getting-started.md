# Başlangıç

## Gereksinimler

| Gereksinim                      | Neden                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Node.js ≥ 22                    | Çalışma zamanı (`.nvmrc` ile sabit)                                           |
| [pnpm](https://pnpm.io) 12      | Monorepo yönetimi (`packageManager` alanında sabit)                           |
| EVREN LLM Gateway hesabı        | Modele erişim: bir API anahtarı ve gateway adresi                             |
| `python3` _(isteğe bağlı)_      | `Script` aracı python betiklerini çalıştırır (node betikleri için Node yeter) |
| `rg` (ripgrep) _(isteğe bağlı)_ | `Grep` kuruluysa onu kullanır, yoksa saf JS yedeği çalışır                    |

## Kurulum

```sh
git clone git@github.com:Ertugrul-Pakdamar/Usta.git
cd Usta
pnpm install
pnpm build
```

Çalıştırmanın iki yolu vardır:

```sh
pnpm usta --version            # depo kökünden (geliştirme için en kolayı)

cd packages/cli && npm link    # `usta` komutunu her dizinde kullanılabilir yapar
usta --version
```

> `npm link` global npm dizininize (`npm prefix -g`) bir sembolik bağ koyar; kaldırmak için `npm unlink -g @usta/cli`.

## Yapılandırma

usta üç ortam değişkeni okur (tam liste: [Yapılandırma](configuration.md)):

```sh
cp .env.example .env
```

```ini
EVREN_API_KEY=...                         # gateway hesabınızın API anahtarı
EVREN_BASE_URL=https://<gateway>/v1       # gateway adresi (/v1 ile biter); varsayılanı yoktur
EVREN_DEFAULT_MODEL=qwen3-vl-30b          # isteğe bağlı
```

Değişkenler şu sırayla aranır (ilk bulunan kazanır): gerçek ortam değişkenleri → çalışma dizinindeki `.env` → `~/.usta/credentials`.
`usta`'yı farklı dizinlerden kullanacaksanız anahtarı bir kez `~/.usta/credentials` dosyasına koyun:

```sh
mkdir -p ~/.usta && cp .env ~/.usta/credentials && chmod 600 ~/.usta/credentials
```

`.env` dosyası `.gitignore` ile dışarıda tutulur; **asla commit etmeyin**.

Arayüz dili sistem yerelinizden seçilir (Türkçe veya İngilizce). Değiştirmek için `usta --lang en`, `export USTA_LANG=en` veya oturum içinde `/lang en` kullanın ([ayrıntı](configuration.md#dil)).

## Kullanım şartlarını kabul etme

Gateway, hesap şartları kabul edilmeden hiçbir isteğe cevap vermez. usta bu kabulü **sizin yerinize yapmaz**:

```sh
usta terms            # güncel şart metnini ve sürümünü gösterir
usta terms accept     # metni gösterir, "kabul ediyorum" yazmanızı bekler, sonra gateway'e bildirir
```

`accept` yalnızca etkileşimli bir terminalde çalışır; boru hattından, betikten veya ajanın `Bash` aracından çalıştırılamaz.

## Kurulumu doğrulama

```sh
usta doctor
```

```
✓ API anahtarı: EVREN_API_KEY tanımlı
✓ Gateway adresi: EVREN_BASE_URL tanımlı
✓ Kullanım şartları: v1 kabul edilmiş
✓ Gateway: 1 model erişilebilir
✓ Varsayılan model: qwen3-vl-30b
✓ Kota: 1010 CR · günlük kalan 14976k token
```

Bir madde ✗ ise nedeni ve çözümü [Sorun giderme](troubleshooting.md) sayfasındadır.

## İlk oturum

```sh
cd ~/projem
usta
```

Bir hedef yazın, örneğin _"src/ altındaki TODO yorumlarını listele ve en acil olanı düzelt"_. Model araçları kullanır; dosya değiştirecek her çağrı için sizden diff'li onay ister:

- `y` bir kez izin verir, `a` aynı türden çağrılara oturum boyunca izin verir, `n` reddeder.
- ⇧Tab izin modunu döndürür: _izin sor_ → _düzenlemeleri kabul_ → _auto_ → _plan modu_.
- `Esc` çalışan işi iptal eder; `Ctrl+C` iptal eder veya (boştayken) çıkar.
- `/help` komutların tamamını listeler.
- **`@dosya`**: istemde `@` yazınca proje dosyaları önerilir, **Tab** tamamlar (`/komut` adlarını da tamamlar). Bahsettiğiniz dosyanın içeriği isteme eklenir, model `Read` çağırmak zorunda kalmaz (büyük dosyalar 12.000 karakterde kesilir ve model kalanı `Read` ile açar; en çok 5 dosya). Gizli dosyalar (`.env`, `*.pem`, `*.key`), proje dışı yollar ve bunlara çıkan sembolik bağlar **eklenmez**. Başsız modda da çalışır: `usta -p "@src/a.ts dosyasını açıkla"`.
- Onay kutusundaki ve sonuçtaki diff'lerde kod renklendirilir (anahtar sözcük, metin, yorum, sayı); dil dosya uzantısından seçilir.

Büyük veya riskli bir işe başlamadan önce **plan modunu** deneyin (`usta --plan` veya `/plan`): model yalnızca okur, sonunda planı sunar ve siz onaylayana kadar hiçbir şeyi değiştirmez.

## Headless kullanım

`-p` ile tek seferlik, etkileşimsiz çalıştırın (CI, betikler):

```sh
usta -p "package.json'daki bağımlılıkları özetle"
usta -p "..." --output-format json
```

JSON çıktısı:

```json
{
  "result": "…",
  "turns": 3,
  "stop_reason": "end_turn",
  "usage": {
    "prompt_tokens": 3781,
    "completion_tokens": 301,
    "cached_tokens": 2416,
    "cache_ratio": 0.639
  },
  "spent_cr": 0,
  "remaining_cr": 1010
}
```

| Çıkış kodu | Anlamı                                        |
| ---------- | --------------------------------------------- |
| `0`        | Normal bitti                                  |
| `1`        | Hata (yapılandırma, gateway, geçersiz bayrak) |
| `2`        | Bitmeden durdu (tur sınırı veya iptal)        |
| `3`        | Bütçe aşılacağı için durduruldu               |

Etkileşimsiz modda onay gerektiren bir çağrı **reddedilir** (soracak kimse yoktur). İzin vermek için kural ekleyin:

```sh
usta -p "testleri çalıştır" --allow 'Bash(pnpm test:*)'
usta -p "..." --permission-mode acceptEdits      # cwd içindeki düzenlemelere izin
```

`-y/--yes` (bypass) her şeye izin verir **ama deny kurallarını aşamaz**; yalnızca ne yapacağını bildiğiniz, izole ortamlarda kullanın.
