# ADR-0005: Sabit istem öneki ve sondaki geçici mesaj

**Durum:** Kabul edildi · **Tarih:** 2026-10-29

## Bağlam

Gateway istemin **ön ekini** önbelleğe alıyor (`usage.prompt_tokens_details.cached_tokens`). Önekte tek bir bayt bile değişirse o noktadan sonrası önbellekten kaçar. İlk tasarım, plan modunda sistem istemine bir blok ekliyordu; mod değiştikçe önek bozuluyordu.

## Karar

- Sistem istemi oturumda **bir kez** üretilir ve değişmez.
- Moda bağlı uyarı (plan modu) isteğin **sonuna**, geçmişe kaydedilmeyen geçici bir `user` mesajı olarak eklenir (`volatileTail`).
- Araç listesi sabittir; `ExitPlanMode` yalnızca plan modunda listeye girer (mod değişiminde tek seferlik kaçırma kabul edilir).
- Araç açıklamaları kısa İngilizce; JSON şemasından `additionalProperties:false` ve güvenli-tamsayı sınırları atılır.

## Ölçümler (`count_tokens`, `qwen3-vl-30b`)

|                                                                      | Toplam   |
| -------------------------------------------------------------------- | -------- |
| Önce (M1–M3, 7 araç)                                                 | **1190** |
| Sonra (M4 sonu, 7 araç; `Script` var, `ApplyChanges` yok)            | **989**  |
| M5: alt ajan araçları (`Task`, `TaskOutput`) + sistem istemi maddesi | **1281** |

> **Düzeltme (M5 sırasında):** M4'te ilk ölçülen 1071, `Script`'in iki araçlı ilk tasarımını (`ApplyChanges` dahil, 8 araç) içeriyordu. [ADR-0003](0003-script-review-in-tool.md) ile ikinci araç kaldırılınca aynı kurulum 989 çıktı. Plan modunda `ExitPlanMode` eklenir (+~80).

Gerçek oturumlarda önbellekten gelen pay: %49 (2 istek), %64 (3 istek), %97 (6 istek).

## Sonuçlar

- Sabit yük M1–M3'e göre ~%17 azaldı (1190 → 989); asıl kazanç önbellekten gelir. M5'in alt ajan araçları bunu 1281'e çıkardı: özelliğin bedeli, ilk istekten sonra önbellekten gelir.
- Plan modu uyarısı modele her istekte ulaşır ama önbelleği bozmaz.
- Bu test sırasında bulundu: ilk plana yazılan "baz yük ~2.4k" iddiası yanlıştı (iki isteğin toplamı tek istek sanılmıştı); ölçüm bu ADR'deki değerlerle düzeltildi.
