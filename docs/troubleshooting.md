# Sorun giderme

Önce `usta doctor` çalıştırın; çoğu sorunu doğrudan gösterir.

| Belirti                                              | Neden                                                     | Çözüm                                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `✗ API anahtarı: EVREN_API_KEY tanımlı değil`        | Anahtar ortamda yok                                       | `.env` dosyasına ya da `~/.usta/credentials`'a ekleyin ([Başlangıç](getting-started.md#yapılandırma))                                             |
| `✗ Gateway adresi: EVREN_BASE_URL tanımlı değil`     | Yerleşik adres yoktur                                     | `EVREN_BASE_URL=https://<gateway>/v1` ekleyin                                                                                                     |
| `✗ Kullanım şartları: Kabul edilmemiş`               | Hesap şartları kabul edilmedi                             | `usta terms` ile okuyun, `usta terms accept` ile (siz yazarak) kabul edin                                                                         |
| `Hata: API anahtarı geçersiz (HTTP 401)`             | Yanlış/iptal edilmiş anahtar                              | Anahtarı gateway panelinden yenileyin                                                                                                             |
| `Hız sınırı veya kota aşıldı (HTTP 429)`             | 5 dakikalık veya günlük kota doldu                        | `/cost` ile kotayı görün; bekleyin ya da bütçe koyun                                                                                              |
| `İçerik güvenlik katmanı isteği reddetti`            | Gateway'in `content_guard` katmanı istemi engelledi       | İstemi yeniden ifade edin; kullanım politikasını kontrol edin                                                                                     |
| `usta: command not found`                            | `npm link` yapılmadı                                      | `cd packages/cli && npm link` veya depo kökünden `pnpm usta`                                                                                      |
| `usta` etkileşimsiz yardım metni basıyor             | stdin/stdout bir terminal değil                           | Terminalde çalıştırın veya `-p` kullanın                                                                                                          |
| `-c` "Devam edilecek oturum bulunamadı"              | Oturumlar dizine göre aranır                              | O proje dizininde çalıştırın veya `-r <id>` verin (`/session` kimliği gösterir)                                                                   |
| `Read` "Erişim engellendi: .env"                     | Gizli dosya koruması                                      | Bilinçli bir davranıştır ([izinler](permissions.md#gizli-dosya-koruması))                                                                         |
| `-p` modunda araç "izin verilmedi: onay gerekiyor"   | Soracak kimse yok                                         | `--allow 'Bash(…)'` ekleyin ya da `--permission-mode acceptEdits`                                                                                 |
| Çıkış kodu 3                                         | Bütçe aşılacaktı                                          | `--budget`/`--token-budget` değerini artırın veya oturumu bölün                                                                                   |
| `Bağlam özetlenemedi` uyarısı                        | Özetleme isteği başarısız                                 | Geçicidir; `/compact` ile elle deneyin, olmuyorsa `/clear`                                                                                        |
| Script: "Project is too large to copy"               | Kopya 150 MB'ı aştı                                       | Büyük dizinleri `.gitignore`/hariç tutulanlara taşıyın veya betiği dar bir alt dizinde çalıştırın                                                 |
| `Task`: "Unknown agent"                              | Ajan adı yanlış ya da dosyası yüklenmedi                  | Kullanılabilir adlar hata iletisinde; özel ajan dosyasının `---` frontmatter'ını ve adını kontrol edin ([Alt ajanlar](subagents.md#özel-ajanlar)) |
| Proje ajanları yüklenmedi                            | Repodan gelen ajanlar güvenilmedi                         | Açılıştaki soruya `e` deyin ya da `--trust-project` verin                                                                                         |
| Arka plan görevi "approval is needed" ile reddedildi | Arka plan görevi kullanıcıya soramaz                      | İzin kuralı ekleyin (`--allow`) ya da görevi ön planda çalıştırın                                                                                 |
| Script: python bulunamadı                            | `python3` kurulu değil                                    | Kurun veya model `node` betiği yazsın                                                                                                             |
| Beklenmedik pano/yapıştırma davranışı                | Yapıştırılan metindeki Enter _gönderme sayılmaz_          | Bilinçli: yapıştırma tek parça eklenir; göndermek için Enter'a ayrıca basın                                                                       |
| Arayüz beklenen dilde değil                          | Dil sırası: `--lang` > `USTA_LANG` > ayar > sistem yereli | `usta --lang en`, `export USTA_LANG=en` veya `/lang en`; ayrıntı: [Yapılandırma → Dil](configuration.md#dil)                                      |
| `--help` başlıkları İngilizce                        | `Usage:`/`Options:` başlıkları kütüphaneden gelir         | Bilinen sınır; açıklamalar çevrilidir                                                                                                             |

## Tanılama için

```sh
usta doctor                 # genel durum
usta models                 # gateway modelleri
usta -p "merhaba" --output-format json   # uçtan uca, kullanım değerleriyle
```

Oturum dosyaları `~/.usta/sessions/` altındadır (araç çıktıları içerebilir; hata raporuna eklemeden önce temizleyin). Hata bildirirken [issue şablonundaki](../.github/ISSUE_TEMPLATE/bug_report.yml) bilgileri verin.
