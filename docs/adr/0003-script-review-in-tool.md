# ADR-0003: Script: onay ve uygulama tek araç çağrısında

**Durum:** Kabul edildi · **Tarih:** 2026-10-29

## Bağlam

Aynı değişiklik çok dosyada gerektiğinde, dosya başına bir `Edit` çağrısı her biri ayrı model turu demektir. Tek bir betik çok daha ucuzdur, ancak betik güvenle uygulanmalıdır: kullanıcı ne olacağını görmeli, gerçek proje onay olmadan değişmemelidir.

İlk tasarım iki araçtı: `Script` (proje kopyasında çalışır, bir _changeset_ üretir) ve `ApplyChanges {id}` (diff'i gösterip uygular).

## Kanıt

Gerçek modelle (`qwen3-vl-30b`) denendi. Model `Script`'i doğru seçti ve 8 dosyalık değişiklik hazırlandı, ancak **`ApplyChanges`'i çağırmadı**: kullanıcıdan "ApplyChanges komutunu çalıştırmasını" istedi. Sonuç mesajı "önce kullanıcıya sorma, `ApplyChanges`'i çağır" diye netleştirildi; **iki denemede de** aynı davranış sürdü. Model, zincirleme araç çağrısına güvenilmeyecek kadar tutarsız.

## Karar

Tek araç: `Script`. Betik kopyada çalıştıktan sonra araç, `ctx.review({summary, diff, paths})` ile tam diff'i **kendi içinde** kullanıcıya onaylatır ve onaydan sonra aynı çağrıda uygular.

`ctx.review`, kapının (`createReviewer`) sağladığı bir kanaldır: dosya bazında `deny` kuralları, korunan yollar, çalışma dizini dışı denetlenir; gerekirse kullanıcıya sorulur; dosyalar checkpoint'lenir. Onay beklerken dosyalar değişirse uygulama hiç yapılmaz (hepsi ya da hiçbiri).

## Sonuçlar

- Model akışı: `Glob → Script → bitiş` (3 tur); ikinci araç turu ve ~100 token baz yük tasarruf edildi.
- Güvenilirlik artık modelin zincirleme yeteneğine bağlı değil.
- Araç yazarları, çok dosya yazan araçlar için aynı `ctx.review` kalıbını kullanabilir.
- Kopya bir güvenlik izolasyonu **değildir**; bu yüzden kod çalışmadan önce ayrıca onaya sunulur.
