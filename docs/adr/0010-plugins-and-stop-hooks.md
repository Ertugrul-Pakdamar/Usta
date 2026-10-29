# ADR-0010: Plugin'ler, modül hook'ları ve Stop ile devam

**Durum:** Kabul edildi · **Tarih:** 2026-10-29

## Bağlam

Skill, komut, ajan, hook ve MCP ayrı ayrı vardı; ekiplere dağıtmak için tek paket gerekiyordu. Ayrıca hook'lar yalnızca kabuk komutuydu ve `Stop` bilgilendirme amaçlıydı ("testler hâlâ kırıkken durma" yazılamıyordu).

## Karar

1. **Plugin = klasör + `usta-plugin.json`.** Mevcut yükleyicilere ek kök olarak girer (skills/commands/agents), hook'lar ve MCP sunucuları manifestte. Yeni bir yükleme mekanizması yok; öncelik plugin < kullanıcı < proje.
2. **Kurulum onayı içeriğe bağlı ve atlanamaz.** İçerik gösterilir, etkileşimli terminal şart (`--yes` yok). Kurulumda tüm dosyaların özeti saklanır; sonradan değişen plugin atlanır ve yeniden onay ister. Gerekçe: plugin kodu kullanıcı yetkisiyle çalışır ([ADR-0004](0004-project-trust-gate.md) ile aynı ilke; farkı onayın projeye değil açık bir kurulum eylemine bağlı olması).
3. **Kaynaklar:** klasör ve git. npm bilerek ertelendi (internetsiz ortam, ek bağımlılık).
4. **Modül hook'ları** (`{"module": …}`): süreç içi, aynı protokol (block/context), hata ve zaman aşımı uyarı. **Yalnızca kullanıcı ayarlarından ve plugin'lerden** okunur; proje ayarında depodaki kod onaydan sonra değişebileceği için yok sayılır.
5. **`Stop` engelleyici:** hook engellerse sebep `[Stop hook] …` kullanıcı mesajı olarak eklenir ve ajan devam eder. `stopHookActive` ile döngü kontrolü hook'a bırakılır; çalıştırma başına en çok 3 devam sert sınırdır.
6. Hook'lar yine yalnızca kısıtlar; izin kurallarını gevşetemez.

## Sonuçlar

- Gerçek modelle `guard-rails`: model `TODO(usta)` yazıp bitti dedi, hook devam ettirdi, model işareti temizledi. Yan etki: `Stop` bir ek model turu demektir (token); hook'un kendisi ucuz olmalı.
- Plugin'ler sandbox değildir; belgede açıkça yazıldı.
- Test sırasında bulunan eksik: ilk `no-open-todos` hook'u yeni (izlenmeyen) dosyaları görmüyordu (`git diff HEAD`); gerçek model denemesi hazırlanırken fark edildi (testten önce), izlenmeyen dosyalar da taranır.
