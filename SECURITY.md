# Güvenlik politikası

usta, kullanıcının makinesinde komut çalıştırıp dosya değiştiren bir araçtır; güvenlik bu projenin merkezindedir. Zafiyet bildirimlerini ciddiye alıyoruz.

## Desteklenen sürümler

Proje alfa aşamasındadır; yalnızca `main` dalının en güncel hâli desteklenir. Kararlı sürümler (`v0.1.0` sonrası) için bu tablo güncellenecektir.

## Zafiyet bildirme

**Herkese açık issue, PR veya tartışma açmayın.** Bunun yerine GitHub'ın özel bildirim kanalını kullanın:

1. Deponun **Security** sekmesine gidin.
2. **Report a vulnerability** ile [özel bir bildirim](https://github.com/Ertugrul-Pakdamar/Usta/security/advisories/new) oluşturun.

Bildirimde şunlar yardımcı olur: etkilenen sürüm/commit, yeniden üretme adımları (mümkünse küçük bir örnek), beklenen ve gerçekleşen davranış, etki değerlendirmeniz. Bildirimlere makul bir sürede yanıt vermeye ve düzeltme yayımlanana kadar sizi bilgilendirmeye çalışırız. Düzeltme yayımlandıktan sonra, isterseniz katkınız kamuya açık olarak anılır.

## Kapsam

**Kapsam içi (örnek):**

- İzin motorunun atlatılması: `deny` kuralının aşılması, bileşik Bash komutuyla `allow` kuralının atlatılması, sembolik bağlantı veya `..` ile yol kuralının atlatılması.
- Proje güven kapısının atlatılması: repodan gelen `allow`/hook/ayarın onaysız çalışması.
- Gizli bilginin (API anahtarı, `.env`, anahtar dosyaları) modele, loglara, oturum dosyalarına veya ağa sızması.
- Hook veya `Script` aracı üzerinden onaysız komut çalıştırma.
- Oturum, checkpoint ve çıktı dosyalarının izinlerinin gevşek olması; yol geçişi (path traversal).

**Kapsam dışı:**

- Modelin yanlış/uydurma cevap vermesi (halüsinasyon).
- [İzinler belgesinde](docs/permissions.md#garanti-edilenler-ve-edilmeyenler) _garanti edilmeyen_ olarak açıkça belirtilen bilinen sınırlar (örneğin önek kurallarının `xargs rm` gibi dolaylı çağrıları görmemesi, `Bash` değişikliklerinin geri alınamaması). Bunların iyileştirme önerileri normal issue olarak açılabilir.
- Gateway tarafındaki zafiyetler (bunlar gateway işletmecisine bildirilmelidir).
- Kullanıcının bilerek `bypass` modunu açmasının sonuçları.

## Güvenlik tasarımı özeti

- Her araç çağrısı tek bir izin kapısından geçer; **`deny` her zaman kazanır**.
- Kapalı başarısızlık: emin olunamayan durumda sor veya reddet.
- Telemetri yoktur; veri yalnızca kullanıcının gateway'ine gider.
- Kullanıcı verisi (oturumlar, çıktılar, checkpoint'ler) `0600`/`0700` izinleriyle tutulur ve API anahtarı yazılmadan önce maskelenir.

Ayrıntılar: [docs/permissions.md](docs/permissions.md), [ADR-0004](docs/adr/0004-project-trust-gate.md).
