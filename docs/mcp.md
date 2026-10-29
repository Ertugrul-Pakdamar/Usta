# MCP connector'ları

[MCP](https://modelcontextprotocol.io) sunucuları usta'ya harici araçlar ekler (GitHub, veritabanı, tarayıcı…). Araçlar `mcp__<sunucu>__<araç>` adıyla görünür ve **diğer her araç gibi aynı izin kapısından** geçer.

## Ekleme

```bash
usta mcp add fs -- npx -y @modelcontextprotocol/server-filesystem /veri     # yerel süreç (stdio)
usta mcp add gh --url https://mcp.example.com/mcp -H "Authorization=Bearer ${GH_TOKEN}"   # HTTP
usta mcp list      # bağlanır; durumu, araçları ve istem maliyetini gösterir
usta mcp remove fs
```

Oturum içinde `/mcp` bağlı sunucuları ve araçlarını gösterir. Yapılandırma `~/.usta/mcp.json` (0600) dosyasındadır; Claude Code ile aynı `mcpServers` biçimini kullanır:

```json
{
  "mcpServers": {
    "fs": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/veri"] },
    "gh": {
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ${GH_TOKEN}" }
    }
  }
}
```

- `env`, `headers`, `args` ve `command` içinde `${DEĞİŞKEN}` kendi ortamınızdan okunur: **gizli bilgiyi dosyaya yazmayın**.
- `"tools": ["a", "b"]` yalnızca bu araçları sunar. `"disabled": true` sunucuyu kapatır.
- Bir sunucu açılamazsa oturum yine başlar; hata uyarı olarak gösterilir.

## Token maliyeti

Her MCP aracının açıklaması ve şeması **her isteğe** eklenir (oturum boyunca sabit, bu yüzden önbellekten gelir; yine de bağlamı ve ilk isteği büyütür). Açıklamalar 240 karaktere kırpılır. `usta mcp list` her sunucu için yaklaşık token sayısını gösterir; 1.500'ü aşanlar için `tools` ile daraltma önerilir. Ölçüm: 4 küçük aracı olan deneme sunucusu ≈146 token.

## Güvenlik

- **İzin kapısı:** MCP araçları değişiklik yapan sayılır ve varsayılan modda **sorar**. Sunucunun `readOnlyHint` işareti varsa salt okuma sayılır, ama bu yalnızca sunucunun beyanıdır: `deny` kurallarını ve plan modu denetimini aşmaz. `auto` modunda çağrılar sınıflandırılır.
- **Kurallar:** `mcp__gh__list_issues` tek aracı, `mcp__gh` sunucunun tüm araçlarını kapsar: `--allow mcp__gh --deny mcp__gh__delete_repo`. Deny her zaman kazanır.
- **Proje yapılandırması güven kapısındadır.** `<proje>/.usta/mcp.json` depodan gelir ve **program başlatabilir**; bu yüzden komutlar gösterilip dosyanın **tam içeriğine** bağlı onayınız alınmadan hiçbir sunucu başlatılmaz (içerik değişirse yeniden sorulur). Başsız modda onay verilemez: `--trust-project` gerekir.
- **Ortam sızdırılmaz:** stdio sunucuya yalnızca güvenli varsayılan ortam (PATH, HOME…) ve `env`'de yazdıklarınız gider; API anahtarınız ve diğer değişkenler gitmez.
- **Sonuçlar güvenilmezdir:** sunucudan gelen metin, başka araç çıktıları gibi, çıktı sınırlayıcıdan geçer ve `auto` sınıflandırıcısına ulaşmaz. Güvenmediğiniz sunucu eklemeyin.
- Resim vb. metin olmayan içerik `[image content omitted]` olarak gösterilir.

## Bilinen sınırlar

- Araç listesi oturum başında sabitlenir (önbellek); sunucu araç eklerse yeni oturum gerekir.
- Yalnızca araçlar desteklenir; MCP prompt'ları, kaynakları ve OAuth akışı yoktur (başlıkla token verin).
- Alt ajanlardan yalnızca `tools: *` olanlar MCP araçlarını görür; aynı izin kapısından geçerler.
