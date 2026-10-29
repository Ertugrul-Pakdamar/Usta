# ADR-0004: Repodan gelen ayarlar için güven kapısı

**Durum:** Kabul edildi · **Tarih:** 2026-10-29

## Bağlam

`.usta/settings.json` repoda durabilir. Kötü niyetli veya ihmalkâr bir repo `allow: ["Bash"]` ya da çalıştırılacak bir `PreToolUse` hook'u içerebilir; kullanıcı repoyu klonlayıp usta'yı açar açmaz komut çalışmasına yol açabilir.

## Karar

Proje ayar dosyasındaki **`allow` kuralları, hook'lar, `defaultMode`, `models` ve `compactAt`** kullanıcı içeriği onaylamadan uygulanmaz. Onay, dosyanın SHA-256 özetine bağlanır (`~/.usta/trust.json`); dosya değişirse yeniden sorulur. `deny`, `ask` ve `budget` her zaman uygulanır (yalnızca kısıtlayıcıdır). `bypass` yalnızca CLI bayrağından veya kullanıcı ayarından gelebilir.

## Sonuçlar

- Klonla-ve-çalıştır saldırısı kapanır; açılışta ne tanımlandığı listelenir.
- Etkileşimsiz çalıştırmada güvenilmeyen kısımlar uyarıyla atlanır; CI için `--trust-project`.
- **Gelişme:** Kuralı yazarken `models` ve `compactAt` başta "hassas" sayılmıyordu; bir test, bu alanların güven sorulmadan uygulandığını yakaladı (model seçimi maliyeti etkiler). İkisi de kapıya alındı.
