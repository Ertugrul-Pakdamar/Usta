# Claude Code ile karşılaştırma ve sonraki adımlar

Bu sayfa iki işe yarar: usta'nın **Claude Code ile özellik düzeyinde** nerede durduğunu dürüstçe göstermek (dil modeli değil, araç karşılaştırması) ve **ne yapılacağını** katkıcılar için tek yerde toplamak. Yol haritasındaki M0–M7 tamamdır; buradakiler `v0.2` ve sonrası için adaylardır.

> **Not:** Claude Code'a dair satırlar yazarın bilgisine dayanır ve güncel olmayabilir; ürün hızlı değişir. Bir satırın yanlış olduğunu görürseniz düzeltme PR'ı çok değerlidir. usta'ya dair her "var/yok" kodda doğrulandı (2026-10-29).

Gösterim: ✅ var · 🟡 kısmen/farklı · ❌ yok.

## Özellik karşılaştırması

### Çekirdek

| Özellik                                           | usta | Not                                                                             |
| ------------------------------------------------- | ---- | ------------------------------------------------------------------------------- |
| Dosya/kabuk/arama araçları, paralel salt okuma    | ✅   | `Read` `Write` `Edit` `Glob` `Grep` `Bash`                                      |
| İzin modları ve kural sözdizimi, katmanlı ayarlar | ✅   | `default` `acceptEdits` `auto` `plan` `bypass`; [İzinler](permissions.md)       |
| Plan modu                                         | ✅   |                                                                                 |
| Sınıflandırıcılı otomatik mod                     | 🟡   | Var ama **deneysel**, küçük bir kümeyle ölçüldü: [Auto modu](auto-mode.md)      |
| Hook'lar (kabuk + modül), `Stop` ile devam        | ✅   | [İzinler → Hook'lar](permissions.md#hooklar)                                    |
| Alt ajanlar, arka plan görevleri                  | ✅   | [Alt ajanlar](subagents.md)                                                     |
| Checkpoint ve `/rewind`                           | 🟡   | Yalnızca `Write`/`Edit`/`Script`; **`Bash` ile yapılan değişiklikler izlenmez** |
| Oturum devamı, otomatik özet (compaction)         | ✅   | `-c` / `-r`, `/compact`                                                         |
| Headless `-p`                                     | 🟡   | `text` ve `json` var; **`stream-json` yok**                                     |

### Genişletilebilirlik

| Özellik                             | usta | Not                                                                          |
| ----------------------------------- | ---- | ---------------------------------------------------------------------------- |
| Skill'ler, özel komutlar            | ✅   | [Skill'ler](skills.md)                                                       |
| MCP (stdio, HTTP)                   | 🟡   | Yalnızca **araçlar**; prompt, kaynak ve **OAuth akışı yok** ([MCP](mcp.md))  |
| Plugin'ler                          | 🟡   | Klasör ve git kaynağı; **npm ve marketplace yok** ([Plugin'ler](plugins.md)) |
| Programatik kullanım (SDK)          | ❌   | `@usta/sdk` yalnızca araç/plugin yazmak içindir; ajanı gömmek için API yok   |
| IDE eklentisi                       | ❌   | VS Code / JetBrains yok                                                      |
| CI/PR entegrasyonu (GitHub Actions) | ❌   |                                                                              |

### Bağlam ve araçlar (en görünür eksikler)

| Özellik                                      | usta | Not                                                                                           |
| -------------------------------------------- | ---- | --------------------------------------------------------------------------------------------- |
| Proje talimat dosyası ve kalıcı hafıza       | ❌   | `USTA.md` / `AGENTS.md` / `CLAUDE.md` okunmuyor; `/memory` ve `#` kısayolu yok (planda vardı) |
| Web erişimi (`WebFetch`, arama)              | ❌   | Hava boşluklu ortamlar için bilerek ertelendi; ayarla kapatılabilir biçimde eklenmeli         |
| Görev listesi (`TodoWrite`)                  | ❌   |                                                                                               |
| Modelin kullanıcıya soru sorması (`AskUser`) | ❌   |                                                                                               |
| Arka plan kabuğu (`BashOutput`/`KillShell`)  | ❌   | Her `Bash` çağrısı yeni kabuk; uzun süren süreç yönetilemez                                   |
| Görsel girdi / ekran görüntüsü               | ❌   | Gateway modeli (`qwen3-vl`) görseli destekliyor; arayüz ve araç tarafı yok                    |
| Jupyter not defteri düzenleme                | ❌   |                                                                                               |

### Güvenlik ve kurumsal

| Özellik                                       | usta | Not                                                                                       |
| --------------------------------------------- | ---- | ----------------------------------------------------------------------------------------- |
| Güven kapısı (repodan gelen ayar/ajan/MCP)    | ✅   | İçeriğe bağlı onay; [ADR-0004](adr/0004-project-trust-gate.md)                            |
| İşletim sistemi sandbox'ı (`bubblewrap`…)     | ❌   | `Bash` kuralları **sandbox değildir** ([İzinler](permissions.md)); planda isteğe bağlıydı |
| Merkezi yönetilen ayarlar (kurumsal politika) | ❌   | Yalnızca kullanıcı/proje/yerel katmanları var                                             |
| Telemetri                                     | ✅   | Hiç yok; veri yalnızca sizin gateway'inize gider                                          |

### Arayüz rahatlığı

| Özellik                                             | usta | Not                                                    |
| --------------------------------------------------- | ---- | ------------------------------------------------------ |
| `@dosya` tamamlama, renkli diff                     | ✅   | Diff renklendirme küçük, bağımlılıksız bir ayrıştırıcı |
| Vim modu, çıktı stilleri, durum çubuğu özelleştirme | ❌   |                                                        |
| Git worktree ile paralel oturumlar                  | ❌   |                                                        |
| Zamanlanmış/uzak oturumlar, ses girdisi             | ❌   |                                                        |
| Tema (açık/koyu) ve gelişmiş markdown görünümü      | 🟡   | `NO_COLOR` saygı görür; tema seçici yok                |

## usta'nın farkları (Claude Code'da olmayan ya da farklı olanlar)

- **Token ve kredi ekonomisi merkezde:** ön maliyet tahmini, kredi bütçesi (`--budget`), gateway kotası, önbellek isabet gösterimi, `/cost` ve `/context`. Ölçümler: [Token ekonomisi](token-economy.md).
- **`Script` aracı:** toplu değişikliği tek betikle, diff onayıyla yapar; eval'de toplu düzenlemede **−%56 token** ([rapor](evals.md)).
- **EVREN'e özgü:** kullanım şartlarını yalnızca kullanıcı kabul eder, kredi bakiyesi `/v1/quota`'dan gelir, API anahtarı ve adres uygulama içinden girilir (`usta login`).
- **Savunma bağlamı:** sıfır telemetri, tek dış hedef gateway, gizli dosya koruması, internetsiz ortama kopyalanabilir tek dosya.
- **Açık ve denetlenebilir:** Apache-2.0, tüm kararlar [ADR](adr/README.md)'lerde, ölçümler ve hatalar belgelerde.

## Olgunluk ve bilinen sınırlar

- usta **0.1.0**, tek geliştirici; kullanım ve test genişliği olgun bir ürünün çok altındadır. Eval'imiz küçüktür (9 görev, tek model): [sınırları](evals.md#sınırlar-dürüstçe).
- Binary yalnızca Linux x64'te elle denendi; macOS, Windows ve arm64 derlemeleri CI'da üretilir ama gerçek kullanımda sınanmadı.
- Tek model (`qwen3-vl-30b`): model yönlendirme henüz etkisiz; araç çağrısı güvenilirliği modele bağlıdır ([deneyimler](roadmap.md#bilinen-sınırlar-bugün)).

## Sonraki adımlar (aday liste)

Boyut: **S** (birkaç saat–1 gün), **M** (birkaç gün), **L** (hafta+). Önem, "günlük kullanımda ne kadar hissedilir" ve "kullanıcıyı ne kadar engeller" kriterlerine göre; tartışmaya açıktır. Üzerinde çalışmak istediğiniz maddeyi önce bir [issue](https://github.com/Ertugrul-Pakdamar/Usta/issues/new/choose) ile duyurun ([CONTRIBUTING](../CONTRIBUTING.md)).

### Yüksek öncelik

| #   | Madde                                               | Boyut | Tasarım notu                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **`USTA.md` / `AGENTS.md` / `CLAUDE.md` ve hafıza** | M     | `~/.usta/USTA.md` + proje `USTA.md` (+ uyumluluk için diğer adlar) sistem istemine **sabit önek** olarak girer (önbellek: [ADR-0005](adr/0005-stable-prompt-prefix.md)); `/memory`, `#` kısayolu. Repodan gelen dosya **güven kapısına** tabi olmalı. |
| N2  | **Görsel girdi**                                    | M     | `Read` görseli (png/jpg) `image_url` olarak göndersin; TUI'da yapıştırma/`@görsel`. Önce gateway'in görsel + araç çağrısı birlikteliğini ölçün. Token maliyeti ve `count_tokens` davranışı belgelenmeli.                                              |
| N3  | **`--output-format stream-json`**                   | S–M   | Olay akışı (metin, araç başlangıcı/sonucu, kullanım) satır satır JSON; IDE/otomasyon için temel. Şema belgelenmeli ve sürümlenmeli.                                                                                                                   |
| N4  | **`bubblewrap` sandbox (Linux)**                    | L     | `Bash`/`Script` için isteğe bağlı: salt okunur kök, yazılabilir yalnızca proje, ağ kapatılabilir. İzin kurallarının yerini almaz, üstüne ek katmandır. `doctor` durumu göstermeli.                                                                    |
| N5  | **`Bash` değişikliklerini izleme**                  | M     | Komut öncesi/sonrası proje dizini anlık görüntüsü ile checkpoint'e dahil etme (maliyet/yanlış pozitif dengesi ölçülmeli).                                                                                                                             |

### Orta öncelik

| #   | Madde                                        | Boyut | Tasarım notu                                                                                                                                                       |
| --- | -------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| N6  | `TodoWrite` ve `AskUser` araçları            | S     | Küçük, salt durum araçları; TUI'da görev listesi. `AskUser`, otomasyonda (soracak kimse yok) reddedilmeli.                                                         |
| N7  | `WebFetch` (kapatılabilir)                   | S–M   | Ayarla tamamen kapatılabilir; allow/deny alan adı kuralları; çıktı sınırlayıcıdan geçer; **iç ağ/SSRF** korumaları şart.                                           |
| N8  | Arka plan kabuğu (`BashOutput`, `KillShell`) | M     | Uzun süren süreçler (geliştirme sunucusu, izleyici); oturum sonunda temizlik; [alt ajan](subagents.md) arka planıyla tutarlı.                                      |
| N9  | MCP: OAuth, prompt'lar, kaynaklar            | M–L   | Önce kaynaklar ve prompt'lar (`@` ile), sonra OAuth. Token maliyeti ve güven kapısı etkileri [ADR-0009](adr/0009-mcp.md) çizgisinde.                               |
| N10 | Plugin: npm kaynağı ve kurumsal marketplace  | M     | `marketplace.json` (iç depo listesi); kaynak doğrulama ve imza/özet bağlama; kurulum onayı **atlanamaz** kalmalı ([ADR-0010](adr/0010-plugins-and-stop-hooks.md)). |
| N11 | Kurumsal yönetilen ayarlar                   | M     | Kullanıcı/proje üstünde, değiştirilemeyen bir katman (ör. `/etc/usta/managed.json`): `deny` kuralları, kapatılan özellikler (web, bypass), zorunlu hook'lar.       |
| N12 | Daha geniş ve bağımsız eval                  | M     | 9 görev yetersiz; gerçek depolardan görevler, `no-task` ve auto-mode varyantları, farklı modeller. Raporu yeni sayılarla güncelleyin.                              |

### Düşük öncelik / fikir

- Vim modu, tema seçici, çıktı stilleri, özelleştirilebilir durum çubuğu.
- Git worktree ile paralel oturumlar.
- IDE eklentileri (önce N3 `stream-json`/SDK gerekir) ve GitHub Actions entegrasyonu.
- Jupyter not defteri düzenleme aracı.
- Gerçek bir ayrıştırıcı ile diff renklendirme (çok satırlı yorum/metin).
- Modele özgü yönlendirme: gateway birden çok model sunduğunda `models.fast`/`main` gerçekten ayrışsın.

### Teknik borç ve doğrulama

- macOS/Windows/arm64 binary'lerinin gerçek makinede denenmesi; Windows'ta `bash` hook ve `Bash` aracı için Git Bash/WSL varsayımının belgelenip sınanması.
- Auto modu sınıflandırıcısı için daha büyük etiketli küme ve düzenli regresyon ölçümü.
- `CHANGELOG` için Changesets ile otomatik sürüm notu (plandaydı).
- Doküman sitesi (VitePress) — şimdilik düz Markdown.

## Nasıl katkı verilir?

1. Bir madde seçin, [issue](https://github.com/Ertugrul-Pakdamar/Usta/issues/new/choose) açıp kapsamı yazın (hangi maddeyi, nasıl ölçeceksiniz).
2. [CONTRIBUTING](../CONTRIBUTING.md)'teki iş akışını izleyin: dal, test (`pnpm test`), belge güncellemesi, gerekirse ADR.
3. Bir davranış iddiası ("X token tasarruf ediyor", "Y güvenli") yapıyorsanız **ölçün** ([eval paketi](../evals/README.md)); kötü sonuçları da yazın.
4. Güvenlik açısından hassas alanlara (izinler, güven kapısı, sandbox) dokunuyorsanız önce tasarımı issue'da tartışın.

Bu sayfa kodla birlikte güncellenir: bir madde tamamlanınca durumunu ✅ yapın ve ilgili belgeye bağlayın.
