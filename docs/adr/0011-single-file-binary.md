# ADR-0011: Tek dosya binary: Node SEA + esbuild paketi

**Durum:** Kabul edildi · **Tarih:** 2026-10-29

## Bağlam

Plan `bun build --compile` diyordu (savunma ortamlarında internetsiz kurulum için). Geliştirme makinesinde bun yok; ayrıca proje zaten Node 22'ye bağlı (Ink, resmi MCP SDK'sı, `process.loadEnvFile`). Ek bir çalışma zamanı eklemek test ve davranış farkı demektir.

## Karar

1. **Node "single executable application" (SEA)**, bun değil: aynı Node'da çalışan aynı kod; çalışma zamanı farkı yok.
2. **esbuild ile tek ES modülü** (`scripts/build-binary.mjs`): CLI ve bağımlılıkları bir dosyada. Ink'in yalnızca `DEV=true` iken yüklediği `react-devtools-core` boş bir modülle değiştirilir; sürüm yapı zamanında gömülür (yanında `package.json` olmadığı için).
3. **CommonJS önyükleyici + açma.** Node 22'de SEA ana betiği CommonJS'tir ve üst düzey `await` içeren ES modülünü doğrudan çalıştıramaz (yoga wasm'ı bunu kullanır). Bu yüzden paket SEA varlığı olarak gömülür; önyükleyici onu **bir kez** `~/.usta/cache/usta-<özet>.mjs` olarak açar (0600, içerik özetine göre; eski sürümler silinir) ve içe aktarır.
4. **Resmi Node gerekir.** Binary, betiği çalıştıran Node'un kopyasıdır; dağıtım paketleri (örn. Fedora) `libnode.so`'ya bağlı küçük bir kabuk sunduğundan SEA'ya uygun değildir. Betik bunu algılayıp açık bir hatayla durur; CI `actions/setup-node` kullanır.
5. **Dağıtım:** `release.yml` bir `v*` etiketinde Linux (x64, arm64), macOS (arm64) ve Windows (x64) için derler, `--version` ile duman testi yapar, arşivler ve SHA-256 ile GitHub sürümüne ekler. Sürüm etiketi `package.json` sürümüyle eşleşmezse durur.

## Sonuçlar

- Dosya **~130 MB** (Node çalışma zamanının kendisi ~125 MB; arşivde ~40 MB). bun ile de benzer olurdu.
- İlk çalıştırmada küçük bir açma maliyeti vardır; sonraki başlatmalar normaldir.
- Doğrulandı: Node'u PATH'ten saklayıp gerçek gateway ile `-p` çalıştırma, TUI'nin gerçek terminalde açılması ve `@` tamamlama. Linux dışındaki hedefler yalnızca CI'da derlenir/duman testi görür; macOS imzası ad-hoc'tur (kurumsal dağıtımda gerçek imza gerekir).
- Windows'ta `bash` hook'ları ve `Bash` aracı Git Bash/WSL ister; binary bunu değiştirmez.
