# Değerlendirme (eval) raporu

usta'nın "daha az token" iddiasını tahminle değil **ölçümle** göstermek için küçük bir değerlendirme paketi var: [`evals/`](../evals/README.md). Bu sayfa ilk A/B sonucudur: **Script aracı açık mı kapalı mı**.

## Yöntem

- **Model:** `qwen3-vl-30b` (gateway'in tek modeli); tüm koşular 2026-10-29.
- **9 görev**, her biri temp dizinde taze bir projeyle başlar ve **otomatik denetlenir** (dosya içeriği, çalıştırılan test, cevap metni). Görevler: 4 toplu düzenleme (12 dosyada yeniden adlandırma, 15 dosyaya başlık, 10 JSON'da sürüm, CSV→JSON), hata düzeltme, özellik ekleme, sıfırdan betik yazma, kod tabanında cevap bulma, 700 satırlık günlükte sayım.
- **İki varyant:** `baseline` (tüm araçlar) ve `no-script` (`--disable-tools Script`; sistem isteminden ve ipuçlarından Script de çıkar). Her görev × varyant **3 kez** koşuldu (54 koşu). Koşular `-y` (bypass) ile yalıtılmış temp dizinde yapıldı.
- **Ölçü:** başarı (denetim geçti mi), toplam token (istem + tamamlama, alt ajanlar dahil), araç çağrısı sayısı, süre. Denetimlerin kendisi test edilir: [`evals/tasks.test.mjs`](../evals/tasks.test.mjs) her denetimin bozuk projeyi reddettiğini ve doğru çözümü kabul ettiğini doğrular.

## Sonuç

<p align="center"><img src="assets/chart-script-ab.svg" alt="Script A/B sonucu" width="760"></p>


#### Overall

| Variant   | Runs |      Success | Median tokens / run | Total tokens | Median tool calls | Median seconds |
| --------- | ---: | -----------: | ------------------: | -----------: | ----------------: | -------------: |
| baseline  |   27 | 27/27 (100%) |               8,278 |      220,665 |                 4 |              5 |
| no-script |   27 | 27/27 (100%) |               8,034 |      330,629 |                 4 |              5 |

#### Per task (median total tokens, successes out of runs)

| Task          | Category  | baseline tokens | baseline ok | no-script tokens | no-script ok |
| ------------- | --------- | --------------: | ----------: | ---------------: | -----------: |
| bulk-header   | bulk edit |           5,226 |         3/3 |            8,117 |          3/3 |
| fix-bug       | fix       |           8,278 |         3/3 |            7,496 |          3/3 |
| add-feature   | feature   |          10,187 |         3/3 |            7,164 |          3/3 |
| find-answer   | read-only |          10,793 |         3/3 |            9,596 |          3/3 |
| create-cli    | feature   |           4,785 |         3/3 |            4,230 |          3/3 |
| csv-to-json   | bulk edit |           6,288 |         3/3 |           10,682 |          3/3 |
| bulk-version  | bulk edit |           7,876 |         3/3 |           11,718 |          3/3 |
| bulk-rename   | bulk edit |          13,303 |         3/3 |           29,278 |          3/3 |
| big-log-count | read-only |           4,487 |         3/3 |            4,147 |          3/3 |

#### Tool use per variant (calls summed over all runs)

- **baseline:** Edit 34, Grep 21, Glob 19, Read 19, Bash 14, Script 13, Write 3
- **no-script:** Edit 105, Grep 21, Glob 20, Read 19, Bash 17, Write 6, Task 4

**Okuma:**

- **Toplu düzenlemede Script belirgin kazandırıyor.** 4 toplu görevin toplamı: baseline **102.869** token, Script kapalıyken **234.073** (**−%56**). En büyük fark 12 dosyada yeniden adlandırmada: ortanca 13.303'e karşı 29.278 (Script yokken model dosya başına ayrı `Edit` yapıyor; 27 koşunun toplamında 105 `Edit` çağrısı, baseline'da 34).
- **Başarı oranı eşit** (27/27 ve 27/27), yani tasarruf kaliteden verilmiyor. (Bu sonuç görev tanımları düzeltildikten sonra; aşağıya bakın.)
- **Toplu olmayan görevlerde fark yok ya da gürültü.** Hata düzeltme ve cevap bulmada iki varyant da benzer; özellik eklemede baseline daha pahalı çıktı (47.234'e karşı 35.843) ama N=3 ile bunu "Script'in sabit yükü" diye yorumlamak için yeterli kanıt yok. Script şeması her isteğe ek yük bindirir (bkz. [Token ekonomisi](token-economy.md)); toplu iş yoksa bir faydası olmaz.
- Model Script'i çoğunlukla doğru yerde seçti: baseline'da 13 Script çağrısı, hepsi toplu görevlerde.

## Ek ölçüm: uzun ve tekrarlı çıktı

Bir kullanıcı denemesinde (Go + React form oluşturucusu için "güvenlik açıklarını ve optimizasyonu incele" isteği) çıktı çok uzun ve tekrarlıydı. Transkriptten dört sorun çıktı: (1) model **tek bir `Glob`'dan sonra**, hiçbir dosyayı okumadan "…olabilir" kalıbında sekiz güvenlik maddesi yazdı; (2) her `Read`'den sonra aynı plan/özet/sonraki adımlar bölümlerini **yeniden yazdı**; (3) erişimi reddedilen `.env` hakkında içeriğini görmüş gibi konuştu (değeri aslında `config.go` varsayılanıydı); (4) bizim hatamız: model ```env kod bloğu açınca Markdown boyayıcı ekrana `Could not find the language 'env'` basıyordu (`usta -c` ile geçmiş yüklenirken de, yani **release binary'sinde de**).

**Düzeltmeler:** bilinmeyen dilli kod blokları `plaintext`'e çevrilir (hata ekrana sızmaz) ve iç içe listelerdeki fazladan boş satırlar temizlenir; sistem istemine "okumadığın dosya hakkında bulgu yazma, tahmini tahmin diye işaretle", "inceleme/plan/liste isteği salt okumadır", "araç çağrıları arasında en çok birkaç cümle, bulguların tamamı yalnızca son cevapta, önceki özeti tekrarlama" kuralları eklendi; `VerbosityGuard` ara turlarda uzun metni ya da önceki içeriğin tekrarını fark edince bir sonraki araç sonucuna kısa bir hatırlatma ekler (en çok her iki çağrıda bir); JSON çıktısına `assistant_chars` ve `repeat_ratio` eklendi.

**Ölçüm (`review-project` görevi, gerçek model):**

| Varyant                         | Koşu | Cevapta gerçek bulgular | Ortanca tamamlama token'ı | Tekrarlanan pay |
| ------------------------------- | ---: | ----------------------: | ------------------------: | --------------: |
| Önce (eski istem, koruyucu yok) |    4 |                     2/4 |                     2.099 |              %5 |
| Sonra (yeni istem + koruyucu)   |    6 |                     3/6 |                     2.177 |              %1 |
| Sonra + `frequency_penalty` 0,3 |    6 |                     1/6 |                     1.858 |              %1 |

Dokuz görevlik standart paket yeni istemle yeniden koşuldu: **27/27 başarı** (önceki 27/27); tamamlama token'ı toplamı 11.672 → 11.727 (aynı).

**Dürüst yorum:**

- **Kullanıcının uzun çıktısını yeniden üretemedim.** Benim 11 dosyalık örnek projem çok daha küçük; temel çıktı zaten ~2.100 token ve tekrar payı %5 idi. İstem ve koruyucu tekrar payını %5'ten %1'e indirdi, ama **çıktı uzunluğunu ve başarıyı ölçülebilir şekilde değiştirmedi** (N = 4–6, fark gürültü içinde).
- **`frequency_penalty` fayda sağlamadı** (1/6 başarı, uzunlukta anlamlı fark yok); bu yüzden **varsayılan kapalı**, yalnızca deneysel bir `EVREN_FREQUENCY_PENALTY` ayarı olarak duruyor.
- "Gerçek bulgu" denetimi kaba (dört anahtardan en az ikisi son cevapta geçmeli) ve sonuçlar gürültülü; "okunmadan yazılmış iddia" oranını ölçen bir metrik **henüz yok**.
- Standart pakette toplam token 220.665 → 337.154 çıktı; fark neredeyse tamamen `bulk-rename` görevinin doğal oynaklığından (ortanca 13.303 → 36.316; aynı görev daha önce 97.179'a kadar çıkmıştı) ve tamamlama token'ı değişmedi; yine de bu görev istem değişikliğiyle birlikte izlenmeli.
- **Sıradaki adım:** gerçek projeyle (kullanıcının Formexus'u) aynı isteği yeni sürümle yeniden denemek ve transkripti paylaşmak.

## Süreç ve bulunan hatalar (düzeltildi)

Değerlendirme paketi, ürünün ve görevlerin kusurlarını da ortaya çıkardı. Hepsi kayıtlı:

1. **Ürün hatası:** `Grep`, `path` olarak tek bir dosya verilince `spawn ENOTDIR` ile çöküyordu (pilot koşuda yakalandı). Düzeltildi, test eklendi.
2. **Ürün iyileştirmesi:** Model 42 eşleşmeyi 30–37 diye **yanlış saydı** (6/6 koşuda). `Grep` sonucu artık toplam sayıyı yazıyor (`(42 matches)`); aynı görev **0/6 → 6/6**. Not: bu değişiklik diğer 8 görevin koşularından _sonra_ yapıldı, onlar eski çıktıyla koşuldu (çok eşleşmeli görevlerde etkisi küçüktür).
3. **Görev kusurları (benim):** İlk koşuda `bulk-version` belirsizdi (bağımlılık sürümleri de mi?), `bulk-rename` yorum satırında tuzak içeriyordu ve 20 tur sınırı elle düzenlemeyi haksız cezalandırıyordu, `big-log-count` sorusu modeli yanlış regex'e itiyordu, `create-cli` ESM/CJS belirsizdi. Görevler düzeltildi, etkilenen üçü yeniden koşuldu. **İlk koşunun ham sonuçları da depoda** ([`evals/results/`](../evals/results/)): ilk turda baseline 20/27, Script kapalı 19/27 idi; farkın büyük kısmı görev belirsizliğiydi, modelden değil.

## Sınırlar (dürüstçe)

- **Küçük örneklem:** 9 görev × 3 tekrar. Yön tutarlı ama kesin yüzdeler ±birkaç puan oynayabilir; model her koşuda farklı davranır.
- **Görevleri ben yazdım**, küçük ve sentetik; gerçek projelerdeki karmaşıklığı temsil etmez. Script'in kazancı iş büyüdükçe artar, ama bu burada ölçülmedi.
- Tek model, tek gün. Ücretli döneme geçişte (CR fiyatı) _token_ sayısı sabit kalır ama CR cinsinden maliyet ayrıca doğrulanmalıdır.
- `no-task` varyantı (alt ajanlar kapalı) tanımlı ama bu turda koşulmadı; alt ajan kazancı hâlâ [tek tek ölçümlere](subagents.md#maliyet-ne-zaman-kullanmalı) dayanıyor.

## Yeniden üretmek

```bash
pnpm build
node evals/run.mjs --reps 3 --variants baseline,no-script --out evals/results/benim.jsonl
node evals/report.mjs evals/results/benim.jsonl
```

Gateway ayarları (`EVREN_API_KEY`, `EVREN_BASE_URL`) kök `.env` ya da ortamdan okunur; her koşu izole bir temp dizin ve `HOME` kullanır. Koşular gerçek istek yapar (şimdilik ücretsiz dönemde).
