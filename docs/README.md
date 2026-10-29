# usta belgeleri

Bu dizin hem kullanıcılar hem katkıcılar içindir. Proje alfa aşamasındadır; belgeler kodla birlikte güncellenir ve her sayfa, gerçekten uygulanmış davranışı anlatır (planlanan şeyler açıkça **planlı** diye işaretlenir).

## Kullanıcılar için

| Belge                                 | İçerik                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Başlangıç](getting-started.md)       | Kurulum, yapılandırma, kullanım şartları, ilk oturum, headless kullanım                   |
| [Yapılandırma](configuration.md)      | Ortam değişkenleri, ayar dosyaları ve katmanları, tüm CLI bayrakları, `~/.usta` içeriği   |
| [İzinler ve güvenlik](permissions.md) | Modlar, kural sözdizimi, Bash güvenliği, proje güven kapısı, plan modu, hook'lar, rewind  |
| [Token ekonomisi](token-economy.md)   | Maliyet görünürlüğü, önbellek, çıktı sınırlama, özetleme, bütçe, Script-first             |
| [Skill'ler ve komutlar](skills.md)    | `SKILL.md`, `commands/*.md`, aşamalı yükleme, güven kapısı                                |
| [Auto modu](auto-mode.md)             | Sınıflandırıcı destekli izin modu, yerel katman, devre kesici, denetim, ölçülmüş doğruluk |
| [Alt ajanlar](subagents.md)           | `Task`, dahili ve özel ajanlar, arka plan görevleri, izinler, ölçülmüş maliyet            |
| [Sorun giderme](troubleshooting.md)   | Sık karşılaşılan hatalar ve çözümleri                                                     |

## Katkıcılar için

| Belge                              | İçerik                                                                |
| ---------------------------------- | --------------------------------------------------------------------- |
| [Mimari](architecture.md)          | Paketler, ajan döngüsü, araç kapısı, dosya biçimleri, test stratejisi |
| [Genişletme](extending.md)         | Yeni araç ekleme (bugün), hook'lar, skill/plugin/MCP (planlı)         |
| [Yol haritası](roadmap.md)         | Aşamalar, durumları ve gerekçeleri                                    |
| [Mimari karar kayıtları](adr/)     | Neden böyle yaptık: kanıtlı kararlar                                  |
| [CONTRIBUTING](../CONTRIBUTING.md) | Geliştirme ortamı, iş akışı, standartlar                              |

## Dil

Belgeler iki dillidir: Türkçe (bu dizin) ve İngilizce ([docs/en](en/README.md)). İkisi birlikte güncellenir; [README.en.md](../README.en.md) projeyi İngilizce özetler.
