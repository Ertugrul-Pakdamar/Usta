# ADR-0006: Yerelleştirme: kullanıcıya dönük ve modele dönük metin

**Durum:** Kabul edildi · **Tarih:** 2026-10-29

## Bağlam

Arayüz metinleri M1–M4 boyunca Türkçe sabit yazıldı (~150 satır, 30 dosya). Açık kaynak ve uluslararası katkı için İngilizce de gerekiyor. Bu arada aynı kod, modele giden metin (araç sonuçları, hata iletileri) de üretiyordu ve bunlar da Türkçeydi.

## Karar

1. **Metinleri iki sınıfa ayır.** _Kullanıcıya dönük_ metin katalogdan (`t()`) gelir ve dile göre değişir. _Modele dönük_ metin **İngilizce sabit**, kodda düz metindir.
2. **Katalog:** `en.ts` kaynak, `tr.ts` `Record<MessageKey, …>`; eksik anahtar **derlemeyi kırar**. Çoğul `{one, other}`, yer tutucu `{ad}`. Testler anahtar ve yer tutucu eşitliğini doğrular.
3. **İki yüzlü metin** (reddedilen çağrı): kaynak İngilizce `reason` + çevrilebilir `reasonKey` üretir; döngü modele İngilizceyi, arayüze (`display`) çeviriyi verir.
4. **Dil sırası:** `--lang` > `USTA_LANG` > ayar > sistem yereli > `tr`. (İlk plan yerel > ayar diyordu; açık kullanıcı seçimi sistem yerelinden güçlü olmalı.) Tanınan başka bir dil `en`'e düşer; `C`/`POSIX` `tr`'ye.
5. Harici i18n kütüphanesi **eklenmedi**: ihtiyaç (iki dil, yer tutucu, çoğul) `Intl` ile birkaç yüz satırda karşılanıyor; bağımlılık az tutulur.

## Neden modele dönük metin yerelleşmiyor

- **Davranış tutarlılığı:** Model aynı hatayı her dilde aynı şekilde yorumlamalı; çeviri farkları davranışı değiştirebilir.
- **Token:** Türkçe daha çok token tüketir; her araç sonucunda ve her istekte bedeli ödenir.
- **Önbellek:** İstemin öneki bayt bayt aynı kalmalı ([ADR-0005](0005-stable-prompt-prefix.md)); dil değişimi önbelleği bozmamalı.

## Sonuçlar

- Kullanıcı kendi dilinde okur, model her zaman İngilizce alır; `/lang` oturum sırasında dili değiştirir ve önbelleği etkilemez.
- Yeni kullanıcı metni eklemek iki satırdır (en + tr); unutulan çeviri CI'da derleme hatasıdır.
- Bilinen sınır: komut satırı yardımındaki bölüm başlıkları (`Usage:`) `commander`'dan gelir ve İngilizce kalır.
- Gerçek ortam doğrulaması (gerçek model, pty): İngilizce reddedilen çağrı satırı, onay kutusu ve `/cost` çıktıları; `/lang tr` ile `December 1, 2026` → `1 Aralık 2026`, `1,010 CR` → `1.010 CR`.
