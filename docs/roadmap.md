# Yol haritası

usta **alfa** aşamasındadır. Aşamalar sırayla ilerler; her aşama sonunda çalışan bir ürün ve ölçülmüş sonuçlar hedeflenir. Bu sayfa kodla birlikte güncellenir.

| Aşama                      | Durum | Kapsam                                                                                                                                                                                                                                                                                   |
| -------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** İskelet             | ✅    | Monorepo, Biome, Vitest, CI, `doctor`, ADR'ler                                                                                                                                                                                                                                           |
| **M1** Çekirdek            | ✅    | Provider, ajan döngüsü, 6 dosya/kabuk aracı, headless `-p`, `.env` yükleme, kullanım şartları akışı                                                                                                                                                                                      |
| **M2** Arayüz              | ✅    | Ink TUI, akış, markdown, diff'li onay, slash komutları, oturum kaydı ve devamı                                                                                                                                                                                                           |
| **M3** Güvenlik            | ✅    | İzin motoru ve modları, katmanlı ayarlar, proje güven kapısı, plan modu, checkpoint/`/rewind`, hook'lar                                                                                                                                                                                  |
| **M4** Token ekonomisi     | ✅    | Model kaydı, token tahmini/sayımı, maliyet ve kota, bütçe, önbellek dostu istem, çıktı sınırlayıcı, okuma önbelleği, otomatik özet, `/context` `/cost` `/compact`, `rg`, `Script`, sezgiler                                                                                              |
| **M4.5** Lokalizasyon      | ✅    | `t()` + TR/EN katalogları (derleme zamanında eksiksiz), dil seçimi (`--lang`/`USTA_LANG`/ayar/yerel), `/lang`, tüm kullanıcıya dönük metinler, `Intl` sayı/tarih biçimleri, modele dönük metinler İngilizce sabit, İngilizce belgeler                                                    |
| **M5** Subagent'lar        | ✅    | `Task`/`TaskOutput`, dahili (`explore`, `plan`, `general`) ve özel ajanlar (`agents/*.md`, proje ajanları için güven kapısı), paylaşılan izin kapısı ve tek kutuluk onay sırası, arka plan görevleri ve `/tasks`, `SubagentStop` hook'u, `models.fast` yönlendirmesi, alt ajan kayıtları |
| **M5.5** Auto modu         | 🔜    | Sınıflandırıcı destekli izin modu: hızlı model her değişiklik çağrısını bağlamıyla "güvenli / riskli / belirsiz" diye sınıflar; deny kuralları ve korunan yollar üstün kalır; devre kesici; denetim günlüğü                                                                              |
| **M6** Genişletilebilirlik | 🔜    | Skill'ler, slash komutları, plugin manifesti ve `usta plugin`, MCP connector'ları, TS modül hook'ları, `Stop` hook'unda devam ettirme, örnek plugin'ler                                                                                                                                  |
| **M7** Yayın               | 🔜    | Tek dosya binary (`bun build --compile`), gerçek A/B **eval raporu** (başarı, token, CR), `@dosya` tamamlama, sözdizimi vurgulu diff, `v0.1.0`                                                                                                                                           |

## Sıra gerekçeleri

- **M4.5, M5'ten önce:** her yeni ekran metni, sonradan taşımayı pahalılaştırır.
- **M5.5, M5'ten sonra:** sınıflandırıcı `models.fast` yönlendirmesine ve subagent altyapısına ihtiyaç duyar.
- **M7'de eval:** "daha az token" iddiasını (örneğin Script-first'in tasarrufunu) tahmin değil, ölçüm olarak yayımlamak için.

## Bilinen sınırlar (bugün)

- Bash ile yapılan dosya değişiklikleri checkpoint'lenmez.
- Bash önek kuralları dolaylı çağrıları (`xargs rm`, `bash -c`) göremez; sandbox değildir.
- Script kopyası güvenlik izolasyonu değildir.
- CR harcama tahmini ücretsiz dönemde (2026-12-01'e kadar) sınanamaz.
- Gateway'de tek model var; model yönlendirme henüz etkisiz.
- Alt ajanlarda otomatik özet yoktur; devretme küçük tek bir aramada daha pahalıdır ([Alt ajanlar](subagents.md#maliyet-ne-zaman-kullanmalı)).
- Komut satırı yardımındaki bölüm başlıkları (`Usage:`, `Options:`) kütüphaneden gelir ve İngilizce kalır.

Katkı için [CONTRIBUTING.md](../CONTRIBUTING.md); fikirler için issue açın.
