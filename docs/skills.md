# Skill'ler ve özel komutlar

İkisi de düz Markdown dosyasıdır; kod gerekmez. Biçim Claude Code'a yakın tutuldu, mevcut dosyalar çoğunlukla olduğu gibi çalışır.

## Nerede durur

- Kullanıcı: `~/.usta/skills/<ad>/SKILL.md` ve `~/.usta/commands/<ad>.md`
- Proje: `<proje>/.usta/skills/…` ve `<proje>/.usta/commands/…` (aynı adda proje, kullanıcıyı geçer)
- `/skills` yüklenenleri listeler. Ad: küçük harf, rakam ve tire.

## Skill

Modelin **ihtiyaç olunca** yüklediği talimattır. Her istekte yalnızca ad ve kısa açıklama gider; tam içerik, model `Skill` aracını çağırınca gelir (token dostu).

```markdown
---

name: release-notes
description: Bu ekibin sürüm notu biçimi
---

Sürüm notu "RELEASE-FORMAT-7" satırıyla başlar, sonra her maddesi geçmiş zaman fiille başlayan liste gelir.
```

- `description` zorunludur; modelin ne zaman yükleyeceğine bu karar verir, bu yüzden "ne zaman kullanılır" diye yazın.
- **Maliyet:** skill yoksa `Skill` aracı hiç gönderilmez (sabit yük artmaz). Skill varsa araç açıklaması ad + açıklamaları listeler (oturum boyunca sabit, önbellekten gelir); her skill birkaç on token ekler. Gövde en çok 20.000 karakter.
- `Skill` salt okumadır, plan modunda da çalışır. Alt ajanlara verilmez.
- Gerçek modelle denendi: "sürüm notu yaz" isteğinde model skill'i kendisi yükledi ve biçimi uyguladı.

## Özel komut

Sizin `/ad argümanlar` ile çağırdığınız istem şablonudur.

```markdown
---

## description: Bir hatayı düzelt

Şu hatayı bul ve düzelt: $ARGUMENTS. Önce testle yeniden üret.
```

`/fix giriş sayfası boş geliyor` → gövde, `$ARGUMENTS` yerine argümanla kullanıcı istemi olarak gider. Şablonda `$ARGUMENTS` yoksa argüman sona eklenir. Yerleşik komutlar (`/help`, `/mode`…) önceliklidir. `usta -p "/fix …"` ile başsız modda da çalışır.

## Güvenlik: proje dosyaları için güven kapısı

Depodan gelen skill ve komutlar modeli yönlendirir ya da sizin adınıza istem yazar; bu yüzden [proje ayarları ve alt ajanlarla](permissions.md#proje-güven-kapısı) aynı kuralla çalışır: ilk açılışta içerik gösterilir, **tam içeriğe** bağlı onayınız alınmadan yüklenmez (içerik değişirse yeniden sorulur; özet `~/.usta/trust.json`). Kullanıcı dizinindekiler (`~/.usta`) sizin dosyalarınızdır, sorulmaz. Skill'ler izin kurallarını **aşamaz**: yüklenen talimat doğrultusunda yapılan her araç çağrısı normal izin kapısından geçer.
