# ADR-0007: Alt ajanlar: yalıtılmış bağlam, paylaşılan izin kapısı

**Durum:** Kabul edildi · **Tarih:** 2026-10-29

## Bağlam

Geniş bir keşif, ara çıktılarıyla ana bağlamı doldurur ve sonraki her istekte yeniden faturalanır. Alt işleri ayrı bir bağlamda çalıştırıp yalnızca sonucu almak hem bağlamı korur hem paralelliğe izin verir. Ancak alt ajan, ana oturumun güvenlik garantilerini **zayıflatmamalı**.

## Karar

1. **Yalıtılmış bağlam, tek rapor.** `Task` aracı alt ajanı kendi sistem istemi ve devredilen istemle başlatır; ana ajana yalnızca son rapor (ve maliyet notu) döner. Alt ajanlar `Task` çağıramaz (derinlik 1).
2. **Paylaşılan kapı.** Alt ajanın her aracı **aynı izin motorundan ve kapıdan** geçer (mod, kurallar, hook'lar, checkpoint). Ayrı bir izin sistemi yoktur; plan modu alt ajanları da bağlar.
3. **Onay sırası.** Birçok alt ajan aynı anda sorabilir; sorular `serializeAsk` ile **tek kutuda, sırayla** gösterilir, iptalde bekleyenler reddedilir. Arka plan görevleri soramaz: onay gerektiren çağrı reddedilir.
4. **Yazma yarışı önlemi.** Yazabilen bir ajan çalışırken diğer yazabilen ajanlar sırada bekler; salt okuma ajanlar paralel (en fazla 3). `Task` `mutating:false` tanımlıdır ki salt okuma ajanlar aynı turda paralel çalışabilsin.
5. **Özel ajanlar güven kapısına tabidir** ([ADR-0004](0004-project-trust-gate.md) ile aynı gerekçe): repodan gelen ajan, modeli yönlendirir ve araç listesi seçer; tam içeriği onaylanmadan yüklenmez.
6. **Arka plan sonuçları** bildirimle ve ana konuşmaya sonraki turda eklenen `<task-notification>` mesajıyla teslim edilir (`pendingMessages`); `TaskOutput` ile çekilebilir.

## Kanıt

Gerçek modelle (`qwen3-vl-30b`) ölçüldü:
- Büyük dosyayı okuyup özetleme: ana bağlam **7406 → 2973** girdi token'ı (−%60), oturum toplamı 7610 → 5925.
- **Tek bir küçük `grep`** için devretmek **daha pahalı** çıktı (ana bağlam 3316 → 3545, oturum toplamı 3440 → 6268): araç şeması ve ikinci tur, saklanan çıktıdan fazla.
- Model aynı turda iki `Task`'ı paralel çağırdı (6 istek, 2.9 sn).
- Sabit yük `Task`+`TaskOutput` ile 1021 → 1281 token.

## Sonuçlar

- Devretme **iki kenarlı** bir araçtır: büyük/çok adımlı işte kazandırır, küçük işte kaybettirir. Ana ajanın istemi bunu söyler ("tek hızlı aramayı devretme"); gerçek karar kalitesi M7 eval setinde ölçülecek.
- Sabit yük arttığı için `Task` açıklamaları kısa tutuldu; fark ilk istekten sonra önbellekten gelir.
- Alt ajan kayıtları ayrı tutulur (`~/.usta/subagents`), ana oturum dosyasını şişirmez ve denetime açıktır.
- Test sırasında bulunan tuzak: ana ve alt ajan aynı sahte sağlayıcıyı kullanınca sıra yarışı çıkıyor; testler istekleri sistem istemine göre yönlendiriyor.
