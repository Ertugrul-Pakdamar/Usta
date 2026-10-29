# Plugin'ler

Plugin; skill, özel komut, alt ajan, hook ve MCP sunucularını **tek klasörde** paketler. Ekibe dağıtmanın yolu budur.

```text
benim-plugin/
├─ usta-plugin.json        # zorunlu: ad, sürüm, hook'lar, MCP sunucuları
├─ skills/<ad>/SKILL.md    # → Skill'ler
├─ commands/<ad>.md        # → özel komutlar
├─ agents/<ad>.md          # → alt ajanlar
└─ hooks/…                 # manifestin başvurduğu modül/komut dosyaları
```

```json
{
  "name": "guard-rails",
  "version": "0.1.0",
  "description": "…",
  "hooks": {
    "PreToolUse": [{ "matcher": "Bash", "module": "hooks/no-skip-hooks.mjs" }],
    "Stop": [{ "command": "${PLUGIN_ROOT}/check.sh", "timeout": 20 }]
  },
  "mcpServers": { "db": { "command": "node", "args": ["${PLUGIN_ROOT}/db.js"] } }
}
```

- `name`: küçük harf, rakam, tire. `${PLUGIN_ROOT}` kurulu klasörün yoludur; `module` yolları plugin köküne göredir.
- `mcpServers`, [MCP](mcp.md) ile aynı biçimdedir; sunucu adı `<plugin>-<sunucu>` olur (ör. `mcp__guard-rails-db__…`).
- `skills/`, `commands/`, `agents/` kurallarına [Skill'ler](skills.md) ve [Alt ajanlar](subagents.md) sayfalarından bakın. Öncelik: plugin < kullanıcı (`~/.usta`) < proje.

## Kurulum ve yönetim

```bash
usta plugin install ./plugins/guard-rails          # klasör
usta plugin install https://github.com/ekip/plugin.git   # git (veya github:ekip/plugin)
usta plugin list
usta plugin disable guard-rails      # silmeden kapat   (enable ile geri aç)
usta plugin remove guard-rails
```

Oturumda `/plugins` kurulu olanları listeler. Plugin'ler `~/.usta/plugins/<ad>/` altına kopyalanır (`.git`, `node_modules` ve sembolik bağlar hariç); durum `state.json`'dadır. Yeni kurulum **sonraki oturumda** etkin olur. npm kaynağı henüz desteklenmez (klasör ve git yeterli; internetsiz ortamda klasör kopyalayın).

## Güvenlik

Bir plugin makinenizde program çalıştırabilir (hook'lar, MCP sunucuları) ve modeli yönlendirebilir (skill'ler). Bu yüzden:

- **Kurulum etkileşimli onay ister ve atlanamaz.** İçerik (skill/komut/ajan adları, her hook'un komutu veya modülü, her MCP sunucusunun komutu) gösterilir; terminal yoksa kurulum reddedilir (`--yes` yoktur).
- **Onay içeriğe bağlıdır.** Kurulumda tüm dosyaların özeti saklanır; diskte bir dosya değişirse plugin uyarıyla **atlanır** ve yeniden kurularak (yani yeniden okunarak) onaylanması gerekir.
- Plugin hook'ları ve modülleri izin kurallarını **aşamaz** (hook'lar yalnızca kısıtlar); MCP araçları normal kapıdan geçer, skill'ler araç çağrılarını gevşetemez.
- Plugin'i kaldırınca kopya da silinir; kullanıcı dosyalarınıza dokunulmaz.
- Başkasının plugin'ini kurmadan önce okuyun: modül hook'ları süreç içinde, komut hook'ları kabukta, kullanıcı yetkinizle çalışır. Plugin'ler bir sandbox değildir.

## Örnekler

Depodaki [`plugins/`](../plugins/README.md) klasörü iki örnek içerir:

- **commit-helper:** `/commit` komutu ve `commit-style` skill'i.
- **guard-rails:** `--no-verify` kullanan `git commit/push`'u engelleyen `PreToolUse` modül hook'u; ve ajanın bıraktığı `TODO(usta)` işaretleri çözülene kadar durmasını engelleyen `Stop` modül hook'u. Gerçek modelle denendi: model bir dosyaya `TODO(usta)` yazıp "bitti" deyince hook devam ettirdi ve model işareti temizledi.
