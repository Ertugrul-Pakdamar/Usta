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

|                                      | Sistem | Araçlar | Toplam   |
| ------------------------------------ | ------ | ------- | -------- |
| Önce (M1–M3, 7 araç)                 | 237    | 953     | **1190** |
| Sonra (M4, 8 araç: `Script` eklendi) | 194    | 877     | **1071** |
| Sonra, plan modunda                  |        |         | 1151     |

Gerçek oturumlarda önbellekten gelen pay: %49 (2 istek), %64 (3 istek), %97 (6 istek).

## Sonuçlar

- İki araç eklenmesine rağmen sabit yük ~%10 azaldı; asıl kazanç önbellekten gelir.
- Plan modu uyarısı modele her istekte ulaşır ama önbelleği bozmaz.
- Bu test sırasında bulundu: ilk plana yazılan "baz yük ~2.4k" iddiası yanlıştı (iki isteğin toplamı tek istek sanılmıştı); ölçüm bu ADR'deki değerlerle düzeltildi.
