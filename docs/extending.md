# Genişletme

usta'yı bugün üç yolla genişletebilirsiniz; geri kalanı [M6](roadmap.md) ile gelir.

| Yol                                        | Durum    | Kullanım                                                           |
| ------------------------------------------ | -------- | ------------------------------------------------------------------ |
| Yeni dahili araç                           | ✅ bugün | Kod katkısı: `packages/core/src/tools`                             |
| Hook'lar                                   | ✅ bugün | Ayar dosyasında kabuk komutu: [Hook'lar](permissions.md#hooklar)   |
| Özel alt ajan                              | ✅ bugün | `agents/<ad>.md` dosyası: [Alt ajanlar](subagents.md#özel-ajanlar) |
| İzin kuralları                             | ✅ bugün | Ayar dosyasında: [İzinler](permissions.md)                         |
| Skill, slash komutu, plugin, MCP connector | 🔜 M6    | Aşağıda taslak                                                     |

## Yeni bir araç eklemek

Araçlar `@usta/sdk` üzerinden tanımlanır. Örnek: bir dosyadaki kelimeleri sayan salt okuma aracı.

```ts
// packages/core/src/tools/word-count.ts
import { ToolError, defineTool, z } from "@usta/sdk";
import { readFile } from "node:fs/promises";
import { resolvePath } from "./paths.js";

export const wordCountTool = defineTool({
  name: "WordCount",
  description: "Count the words in a file.", // İngilizce, kısa: her istekte token harcar
  permission: { kind: "path", target: (i) => i.path }, // izin kuralları dosya yoluyla eşleşir
  mutating: false, // durum değiştirmez
  input: z.object({ path: z.string() }),
  async run({ path }, ctx) {
    const abs = resolvePath(ctx.cwd, path); // gizli dosya korumasını uygular
    try {
      const text = await readFile(abs, "utf8");
      return String(text.split(/\s+/).filter(Boolean).length);
    } catch (err) {
      throw new ToolError(`Cannot read ${path}: ${(err as NodeJS.ErrnoException).code}`);
    }
  },
});
```

Adımlar:

1. Dosyayı `packages/core/src/tools/` altına ekleyin ve `tools/index.ts` içinde `builtinTools` listesine **sabit bir sırayla** koyun (sıra istem önekinin parçasıdır).
2. **Gerçekten gerekli mi?** Her araç her istekte yaklaşık 110 token tutar. Mevcut araçlarla (`Bash`, `Script`) yapılabiliyorsa yeni araç eklemeyin; gerekçeyi PR'da yazın.
3. Test yazın (`tools.test.ts` kalıbı): normal yol, hata yolu, izin davranışı. Gerekirse `MockProvider` ile bir ajan senaryosu ekleyin.
4. Aracı belgeleyin: [İzinler](permissions.md) (kural adı) ve gerekiyorsa [Token ekonomisi](token-economy.md).

Araç yazma kuralları:

- **Hatalar:** Beklenen her hata `ToolError` olmalı; mesaj modele döner ve model düzeltebilir. **Mesajlar İngilizce yazılır** (model her dilde aynı davranmalı); kataloğa girmezler. Beklenmeyenler yakalanıp `Unexpected error: …` olur, çökmez.
- **Kullanıcıya görünen metin** (örneğin yeni bir slash komutunun açıklaması veya bir uyarı) kataloğa girer: `core/src/i18n/en.ts` + `tr.ts`, kodda `t("anahtar")`. Ayrıntı: [Mimari → Yerelleştirme](architecture.md#yerelleştirme-i18n).
- **Çıktı boyutu:** Sınırlayıcı sizi korur ama gereksiz büyük çıktı üretmeyin; devam için `offset` gibi bir mekanizma sunun (bkz. `Read`).
- **Yazan araçlar** (`mutating: true`): `preview` ile diff gösterin; yol tabanlıysa `permission: { kind: "path", … }` verin ki checkpoint ve `acceptEdits` doğru çalışsın.
- **Kendi başına çok dosya yazan araçlar:** yazmadan önce `ctx.review({summary, diff, paths})` çağırın ve cevabı beklemeden hiçbir şey yazmayın (`Script`'e bakın). `ctx.review` yoksa yazmayın.
- **Paylaşılan durum:** `ctx.state` konuşma boyunca yaşar ve özet/rewind'da temizlenebilir; önbellekleri orada tutun.
- Dosya yollarını `resolvePath` ile çözün; gizli dosya korumasını atlamayın.

## Hook'lar ile genişletme

Kod yazmadan davranış eklemek için en kolay yol hook'tur: komut engelleme, otomatik biçimlendirme, bağlam ekleme, denetim günlüğü. Protokol ve örnek: [İzinler → Hook'lar](permissions.md#hooklar).

## Planlanan: skill, plugin ve connector (M6)

> **Taslak:** Aşağıdaki biçimler tasarım hedefidir; uygulanana kadar değişebilir. Mevcut Claude Code skill/plugin biçimlerine yakın tutulacaktır ki taşıma kolay olsun.

| Kavram           | Biçim                                                          | Not                                                                                                  |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Skill**        | `skills/<ad>/SKILL.md` (`name`, `description` frontmatter'ı)   | Başta yalnızca açıklaması bağlama girer; tetiklenince tam içerik yüklenir (token dostu)              |
| **Slash komutu** | `commands/<ad>.md` (`$ARGUMENTS` desteğiyle)                   |                                                                                                      |
| **Connector**    | MCP sunucuları (stdio / HTTP)                                  | `usta mcp add\|list\|remove`; araçlar `mcp__sunucu__araç` adıyla, izin kuralları onlara da uygulanır |
| **Plugin**       | `usta-plugin.json` manifesti: yukarıdakilerin hepsini paketler | Yerel klasör, git URL'si veya npm kaynağından `usta plugin install`                                  |

Fikriniz veya ihtiyacınız varsa bir [özellik isteği](https://github.com/Ertugrul-Pakdamar/Usta/issues/new?template=feature_request.yml) açın; M6 tasarımını şekillendirebilirsiniz.
