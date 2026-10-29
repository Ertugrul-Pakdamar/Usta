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

---

# Security policy (English)

usta is a tool that runs commands and changes files on the user's machine; security is at the center of this project. We take vulnerability reports seriously.

## Supported versions

The project is in alpha; only the latest state of the `main` branch is supported. This table will be updated for stable releases (after `v0.1.0`).

## Reporting a vulnerability

**Do not open a public issue, PR or discussion.** Use GitHub's private reporting channel instead:

1. Go to the **Security** tab of the repository.
2. Create a [private report](https://github.com/Ertugrul-Pakdamar/Usta/security/advisories/new) with **Report a vulnerability**.

Helpful details: the affected version/commit, steps to reproduce (a small example if possible), expected and actual behavior, and your impact assessment. We try to answer reports in a reasonable time and to keep you informed until a fix is released. After the fix is released your contribution is credited publicly, if you wish.

## Scope

**In scope (examples):**

- Bypassing the permission engine: overriding a `deny` rule, defeating an `allow` rule with a compound Bash command, defeating a path rule with a symlink or `..`.
- Bypassing the project trust gate: repository `allow`/hook/settings running without approval.
- Leaking secrets (API key, `.env`, key files) to the model, logs, session files or the network.
- Running commands without approval through hooks or the `Script` tool.
- Loose permissions on session, checkpoint and output files; path traversal.

**Out of scope:**

- The model giving wrong/made-up answers (hallucination).
- Known limits explicitly listed as _not guaranteed_ on the [permissions page](docs/en/permissions.md#what-is-and-is-not-guaranteed) (for example prefix rules not seeing indirect calls such as `xargs rm`, `Bash` changes not being undoable). Ideas to improve them can be opened as normal issues.
- Vulnerabilities on the gateway side (report those to the gateway operator).
- The consequences of a user deliberately enabling `bypass` mode.

## Security design summary

- Every tool call passes through a single permission gate; **`deny` always wins**.
- Fail closed: when unsure, ask or deny.
- No telemetry; data only goes to the user's gateway.
- User data (sessions, outputs, checkpoints) is kept with `0600`/`0700` permissions and the API key is masked before writing.

Details: [docs/en/permissions.md](docs/en/permissions.md), [ADR-0004](docs/en/adr/0004-project-trust-gate.md).
