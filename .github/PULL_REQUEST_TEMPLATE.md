## Ne değişti ve neden?

<!-- Değişikliği ve gerekçesini kısaca anlatın. İlgili issue: Closes #… -->

## Nasıl test edildi?

<!-- Eklenen testler, elle denemeler. Arayüz değişikliğiyse gerçek terminalde denendi mi? -->

## Kontrol listesi

- [ ] `pnpm lint && pnpm build && pnpm test` yeşil
- [ ] Yeni davranış için test eklendi (hata düzeltmesi için yeniden üreten test)
- [ ] Belge ve `CHANGELOG.md` güncellendi
- [ ] Gizli bilgi (anahtar, `.env`, iç adresler) içermiyor
- [ ] Güvenlik hassas alanlara dokunuyorsa: atlatma testleri var, `deny` önceliği korunuyor
- [ ] Mimari etkisi varsa ADR eklendi (`docs/adr/`)
