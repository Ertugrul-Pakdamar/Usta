# usta'ya katkı rehberi

usta'ya ilgi gösterdiğiniz için teşekkürler! Bu rehber, bir fikri birleştirilmiş bir değişikliğe dönüştürmenin en kısa yolunu anlatır. Katılımınız [Davranış Kuralları](CODE_OF_CONDUCT.md)'na tabidir.

*English version: [docs/en/contributing.md](docs/en/contributing.md).*

## İçindekiler

1. [Başlamadan önce](#başlamadan-önce)
2. [Geliştirme ortamı](#geliştirme-ortamı)
3. [Depo yapısı](#depo-yapısı)
4. [İş akışı](#iş-akışı)
5. [Kod standartları](#kod-standartları)
6. [Test](#test)
7. [Güvenlik açısından hassas alanlar](#güvenlik-açısından-hassas-alanlar)
8. [Belgeler ve karar kayıtları](#belgeler-ve-karar-kayıtları)
9. [Pull request kontrol listesi](#pull-request-kontrol-listesi)
10. [Lisans](#lisans)

## Başlamadan önce

- **Küçük düzeltmeler** (yazım hatası, belge, açık bir hata) için doğrudan PR açabilirsiniz.
- **Yeni özellik veya davranış değişikliği** için önce bir [issue](https://github.com/Ertugrul-Pakdamar/Usta/issues/new/choose) açın. Böylece emeğiniz, [yol haritasıyla](docs/roadmap.md) çelişen bir yöne gitmez.
- **Güvenlik açığı** buldunuz mu? Herkese açık issue açmayın; [SECURITY.md](SECURITY.md)'ye bakın.
- Ne üzerinde çalışılabileceğini görmek için `good first issue` ve `help wanted` etiketlerine bakın, [yol haritasındaki](docs/roadmap.md) sıradaki aşamayı inceleyin.

## Geliştirme ortamı

**Gereksinimler:** Node.js ≥ 22 (`.nvmrc`), [pnpm](https://pnpm.io) 12, `python3` (Script testleri için), isteğe bağlı `rg`.

```sh
git clone git@github.com:Ertugrul-Pakdamar/Usta.git
cd Usta
pnpm install
pnpm build          # paketler birbirini derlenmiş (dist) hâliyle kullanır
pnpm test           # tüm testler; gerçek API anahtarı veya ağ gerektirmez
pnpm lint           # Biome
```

| Komut         | Ne yapar                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm build`  | Tüm paketleri `tsc -b` ile derler (**test öncesi gerekir**: `cli` testleri `core`'un derlenmiş çıktısını kullanır) |
| `pnpm test`   | Vitest ile tüm testler                                                                                             |
| `pnpm lint`   | Biome denetimi (CI'da zorunlu)                                                                                     |
| `pnpm format` | Biome ile biçimlendir ve güvenli düzeltmeleri uygula                                                               |
| `pnpm usta …` | Derlenmiş CLI'ı çalıştırır (örn. `pnpm usta doctor`)                                                               |

Gerçek gateway ile denemek için `.env.example` dosyasını `.env` olarak kopyalayıp doldurun ([Başlangıç](docs/getting-started.md)). **`.env` asla commit'lenmez**; testler gerçek anahtar kullanmaz.

## Depo yapısı

```
packages/
  sdk/   genel API (Tool, defineTool, ToolError): plugin/araç yazarlarının gördüğü tek yüzey
  core/  arayüzden bağımsız çekirdek: ajan döngüsü, araçlar, izinler, token ekonomisi
  cli/   Ink arayüzü, slash komutları, headless mod
  mcp/   MCP connector'ları (M6)
docs/    belgeler ve mimari karar kayıtları (ADR)
```

Önemli kural: **`core` arayüzü bilmez** (Ink/React import etmez); dışarıya açılan her şey `sdk` üzerinden gider. Ayrıntı: [docs/architecture.md](docs/architecture.md).

## İş akışı

1. Depoyu fork'layın ve `main`'den bir dal açın: `feat/kisa-aciklama`, `fix/kisa-aciklama`, `docs/…`.
2. Değişikliği **küçük ve odaklı** tutun. Bir PR bir şeyi yapsın; biçimlendirme ve davranış değişikliklerini karıştırmayın.
3. Önce testi (veya başarısız örneği) yazın; sonra düzeltin.
4. Yerelde şunların hepsi yeşil olmalı:

   ```sh
   pnpm lint && pnpm build && pnpm test
   ```
5. [Conventional Commits](https://www.conventionalcommits.org/tr/) biçiminde commit atın:

   ```
   feat(core): bütçe aşımında etkileşimli onay iste
   fix(cli): uzun yollarda banner'ın kırpılmasını önle
   docs: izinler belgesine hook örneği ekle
   test(core): sembolik bağlantı ile deny kuralı atlatma denemesi
   ```

   Türler: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`. Kapsamlar: `core`, `cli`, `sdk`, `mcp`, `docs`.
6. PR açın, şablonu doldurun, CI'ın geçmesini bekleyin. Birleştirme **squash** iledir; PR başlığı commit mesajı olur.

## Kod standartları

- **TypeScript strict.** `any` yalnızca ödünsüz gerektiğinde (örneğin heterojen araç listesi). Hata yutma; `ToolError` ile modele anlamlı hata dön.
- **Biçim ve lint Biome'dur;** tartışma konusu yapmayın, `pnpm format` çalıştırın.
- **Okunabilirlik önceliklidir.** Çevredeki kodun adlandırma ve yorum yoğunluğunu izleyin. Yorum "ne"yi değil **"neden"i** anlatsın.
- **Küçük dosyalar, açık sorumluluk.** Bir modül tek bir şey yapsın (`permissions.ts` yalnızca karar verir, `gate.ts` yalnızca bağlar).
- **Yeni bağımlılık eklemeden önce tartışın:** boyut, bakım durumu ve internetsiz (air-gapped) ortamda çalışması önemlidir. Çalışma zamanı bağımlılıkları kasıtlı olarak az tutulur.
- **Metin dili:** Kod, yorum ve tanımlayıcılar İngilizce. Metinler **iki sınıftır**: _modele giden_ her şey (sistem istemi, araç açıklamaları, araç sonuçları ve hata iletileri, ret sebepleri) kısa **İngilizce sabit** metindir ve kodda düz yazılır; _kullanıcıya görünen_ her şey `t("anahtar")` ile kataloktan gelir (`packages/core/src/i18n`: önce `en.ts`, sonra `tr.ts`; eksik çeviri derlemeyi kırar). Ayrıntı: [Mimari → Yerelleştirme](docs/architecture.md#yerelleştirme-i18n).
- **Telemetri ekleme.** usta hiçbir veriyi gateway dışına göndermez; bu bir ürün garantisidir.

## Test

| Ne test ediliyor                               | Nasıl                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Saf mantık (izin motoru, ayrıştırıcı, ekonomi) | Doğrudan birim testi; kenar durumlar ve **atlatma denemeleri** dahil                   |
| Ajan davranışı                                 | `MockProvider` ile senaryo: model cevapları önceden yazılır, giden istekler doğrulanır |
| Dosya sistemi                                  | Geçici dizin (`mkdtemp`); gerçek kullanıcı dizinine dokunmayın (`HOME`'u izole edin)   |
| Arayüz                                         | `ink-testing-library`; **metni ve Enter'ı ayrı yazın** (yapıştırma sayılmasın)         |
| Gateway çağrıları                              | Sahte `fetch`; gerçek ağ ve anahtar yok                                                |

**Arayüz değişikliklerini gerçek terminalde de deneyin.** Birim testler yerleşim sorunlarını yakalayamaz (örneğin uzun bir dizin yolunda banner'ın kırpılması yalnızca gerçek terminalde görüldü). Bir pty içinde `pnpm usta` çalıştırıp değişikliği gözle doğrulamanız PR açıklamasında bir cümleyle belirtilirse çok yardımcı olur.

Hata düzelten her PR, o hatayı yeniden üretip düzeltmeyi kanıtlayan bir test içermelidir.

## Güvenlik açısından hassas alanlar

Şu alanlara dokunan değişiklikler **ek özenle** incelenir: `permissions.ts`, `gate.ts`, `settings.ts`, `hooks.ts`, `tools/*` (özellikle `bash`, `script`, `paths`), `session.ts`, `checkpoint.ts`.

- **Kapalı başarısızlık:** Emin değilseniz sor veya reddet; asla sessizce izin verme.
- **`deny` her şeyin üstündedir.** Hiçbir mod, hook veya sezgi bunu aşamaz.
- Güvenlik davranışı değişiyorsa, **atlatma denemelerini** içeren testler ekleyin (sembolik bağlantı, `..`, bileşik komut, `$(…)`).
- Modele ve diske sızabilecek bilgiyi düşünün: API anahtarı, `.env`, oturum dosyaları.

## Belgeler ve karar kayıtları

- Kullanıcıya görünen her davranış değişikliği ilgili [belgeyi](docs/README.md) ve [CHANGELOG.md](CHANGELOG.md)'yi güncellemelidir.
- **Mimariyi veya geri dönmesi pahalı bir kararı** değiştiriyorsanız [docs/adr](docs/adr/README.md) altına kısa bir ADR ekleyin: _Bağlam, Karar, Sonuçlar_ ve mümkünse **ölçüm/kanıt**. usta'da kararlar tahmine değil ölçüme dayanır.
- **İki dili birlikte güncelleyin.** Bir Türkçe belgedeki değişiklik `docs/en` altındaki İngilizce karşılığına da yansımalı (ya da PR'da çevirinin ardından geleceğini belirtin).
- Yeni bir araç mı ekliyorsunuz? Önce [Genişletme](docs/extending.md) rehberini okuyun; her araç her istekte ~110 token tutar, gereklilik gerekçesi PR'da yer almalı.

## Pull request kontrol listesi

- [ ] `pnpm lint && pnpm build && pnpm test` yeşil
- [ ] Yeni davranış için test eklendi (hata düzeltmesi için yeniden üreten test)
- [ ] Belge ve CHANGELOG güncellendi
- [ ] Kullanıcıya görünen yeni metinler kataloğa eklendi (`en.ts` + `tr.ts`); modele giden metinler İngilizce
- [ ] Gizli bilgi (anahtar, `.env`, iç adresler) içermiyor
- [ ] Güvenlik hassas alanlara dokunuyorsa: atlatma testleri var, `deny` önceliği korunuyor
- [ ] Mimari etkisi varsa ADR eklendi
- [ ] Arayüz değişikliğiyse gerçek terminalde denendi

## Lisans

Katkı yaparak, katkınızın projenin lisansı olan [Apache License 2.0](LICENSE) altında lisanslanmasını kabul etmiş olursunuz (Apache-2.0 §5). Ayrı bir CLA gerekmez.

Sorularınız için bir [issue](https://github.com/Ertugrul-Pakdamar/Usta/issues) açabilirsiniz.
