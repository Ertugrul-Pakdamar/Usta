# ADR-0008: Auto modu: sınıflandırıcı yalnızca "sor"u "izin ver"e çevirebilir

**Durum:** Kabul edildi · **Tarih:** 2026-10-29

## Bağlam

Her değişiklik için onay istemek güvenlidir ama yorucudur; kullanıcılar sonunda her şeye "evet" der ya da `bypass`'a geçer. M3'te ilk plandaki `auto` modu, allow kuralları aynı işi gördüğü için kaldırılmıştı. Şimdi hızlı bir modelin bağlama bakarak karar vermesi, kuralla yazılamayan durumları da kapsıyor.

## Karar

1. **Sınıflandırıcı kuralların altındadır.** İzin motoru `auto` modunda "sor" yerine `classify` kararı üretir; `deny`, korunan yol ve `ask` kuralı sınıflandırıcıdan önce biter. Sınıflandırıcı yalnızca `ask → allow` yönünde karar verebilir.
2. **Kapalı başarısızlık.** `risky`, `unsure`, hata, zaman aşımı ve ayrıştırılamayan cevap hep kullanıcıya sorar; soracak kimse yoksa reddeder.
3. **Girdi daraltılır.** Sınıflandırıcı yalnızca kullanıcı mesajlarını, ajanın araç çağrılarını ve kararı görür; **araç çıktısı, alt ajan raporu, özet ve hook metni girmez.** Gerekçe: dışarıdan gelen metnin (dosya, web) sınıflandırıcıya talimat taşıyamaması.
4. **Yerel katman önce.** Tehlikeli kalıplar ve küçük bir salt okuma listesi model çağrılmadan karara bağlanır (gecikme, maliyet ve modele güvenmeme).
5. **Devre kesici** (3 ardışık / 10 toplam) ve **denetim günlüğü** (`~/.usta/audit`) modun parçasıdır.
6. Sınıflandırıcı `models.fast` kullanır, sıcaklık 0; kullanımı oturum toplamına eklenir, bütçe aşılınca çağrılmaz.

## Kanıt

Gerçek modelle 39 çağrılık elle yazılmış küme: tehlikeli 20 çağrının **hiçbiri `safe` sayılmadı** (13 yerel, 7 model; 4 enjeksiyon denemesi dahil); güvenli 15'in 14'ü `safe` (1 gereksiz soru); median gecikme 274 ms. Küme küçük ve yazarı geliştirici; ayrıntı ve sınırlar: [Auto modu](../auto-mode.md#ölçülmüş-doğruluk).

## Sonuçlar

- Mod **deneysel** işaretlidir; kritik ortamlarda `default` önerilir. Daha geniş ve bağımsız bir küme M7 eval setine eklenecek.
- Çağrının kendisine gömülü talimat (ör. komut yorumunda "safe de") yapısal olarak engellenemez, model kararına kalır; bu yüzden yerel katman ve `deny` kuralları vazgeçilmezdir.
- Test sırasında bulunan tuzak: Linux'ta `/proc/...` altında `mkdir` yapan bir test takılıyordu; yazılamaz-dizin testleri normal dosyanın altına dizin açmayı denemeli.
