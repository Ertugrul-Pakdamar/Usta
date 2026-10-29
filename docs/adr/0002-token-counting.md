# ADR-0002: Token sayımı: kalibre tahmin + gateway sayımı

**Durum:** Kabul edildi · **Tarih:** 2026-10-29

## Bağlam

İstek göndermeden önce boyutu bilmek gerekiyor: bağlam doluluğu, bütçe ve otomatik özet kararları buna bağlı. İlk plan, Qwen tokenizer'ını yerelde çalıştırmaktı (`@huggingface/tokenizers`).

Gateway keşfedildiğinde şunlar görüldü:
- `POST /v1/messages/count_tokens` sistem istemi ve araç şemaları **dahil** tam sayım yapıyor.
- Her yanıt gerçek `usage.prompt_tokens` döndürüyor.
- Qwen `tokenizer.json` ~11 MB ve internetsiz ortamda indirilemez.

## Karar

1. **Ön tahmin:** karakter/token oranı kalibre edilen çevrimdışı bir tahmin. Her yanıttaki gerçek `usage` ile üstel ortalamayla güncellenir; sıradaki istek = son gerçek `usage` + eklenen mesajların tahmini.
2. **Tam sayım:** yalnızca gerektiğinde gateway'in `count_tokens`'ı (`/context` dökümü, baz yük ölçümü). Ulaşılamazsa tahmine düşülür ve çıktıda "tahmin" etiketlenir.
3. Yerel tokenizer bağımlılığı **eklenmedi**.

## Sonuçlar

- Pakete 11 MB eklenmedi; çevrimdışı çalışır.
- Tahmin dile uyum sağlar (Türkçe/kod karışımı) çünkü oranı ölçümden öğrenir.
- Tahmin kaba kalabilir (ilk istekte); kararlar eşiklere (%80, %80 bütçe uyarısı) ve gerçek `usage`'a dayandığı için bu kabul edilebilir.
- Bütçe ön kontrolü gerçek ölçümle desteklendi: 300 token bütçe, ~1053 token'lık istekte doğru durdu (gerçek ilk istek ~1.1–1.2k).
