#!/usr/bin/env python3
"""Draws the charts in docs/assets from measured numbers (TR + EN).

    python3 scripts/make-charts.py

The Script A/B chart reads evals/results/2026-10-29-final.jsonl; the other numbers are the
measurements recorded in docs/token-economy.md, docs/subagents.md, docs/auto-mode.md.
"""
import json
import statistics
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "assets"

BG, PANEL, BORDER = "#0d1117", "#161b22", "#30363d"
TEXT, MUTED = "#c9d1d9", "#8b949e"
CYAN, GREEN, RED, AMBER, INDIGO = "#56d4dd", "#3fb950", "#f85149", "#d29922", "#818cf8"
FONT = "ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono',monospace"
SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"


def fmt(n, lang):
    s = f"{round(n):,}"
    return s.replace(",", ".") if lang == "tr" else s


class Svg:
    def __init__(self, w, h, title, desc):
        self.w, self.h = w, h
        self.parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{escape(title)}">',
            f"<title>{escape(title)}</title><desc>{escape(desc)}</desc>",
            f'<rect width="{w}" height="{h}" rx="14" fill="{BG}" stroke="{BORDER}"/>',
        ]

    def text(self, x, y, s, size=13, fill=TEXT, anchor="start", weight="400", mono=False):
        fam = FONT if mono else SANS
        self.parts.append(
            f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" fill="{fill}" '
            f'text-anchor="{anchor}" font-weight="{weight}">{escape(str(s))}</text>'
        )

    def rect(self, x, y, w, h, fill, rx=4, opacity=1):
        self.parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{max(w, 0):.1f}" height="{h}" rx="{rx}" fill="{fill}" opacity="{opacity}"/>'
        )

    def line(self, x1, y1, x2, y2, stroke=BORDER, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}"{d}/>')

    def header(self, title, sub):
        self.text(28, 38, title, 18, TEXT, weight="700")
        self.text(28, 60, sub, 12.5, MUTED)

    def legend(self, x, y, items):
        for label, color in items:
            self.rect(x, y - 10, 12, 12, color, rx=3)
            self.text(x + 18, y, label, 12, MUTED)
            x += 28 + len(label) * 7

    def save(self, name):
        self.parts.append("</svg>")
        (OUT / name).write_text("\n".join(self.parts) + "\n", encoding="utf-8")


def grouped_bars(svg, rows, x0, y0, width, series, lang, row_h=58, bar_h=17, gap=5, unit=""):
    """rows: [(label, [v1, v2...], note)]; series: [(name, color)]. Bars scaled to the global max."""
    vmax = max(v for _, vals, _ in rows for v in vals)
    label_w = 215
    scale = (width - label_w - 150) / vmax
    for i, (label, vals, note) in enumerate(rows):
        y = y0 + i * row_h
        svg.text(x0, y + bar_h + 2, label, 13, TEXT, weight="600")
        for j, v in enumerate(vals):
            by = y + j * (bar_h + gap)
            svg.rect(x0 + label_w, by, v * scale, bar_h, series[j][1])
            svg.text(x0 + label_w + v * scale + 8, by + 13, f"{fmt(v, lang)}{unit}", 12, TEXT, mono=True)
        if note:
            ny = y + bar_h + gap / 2 + 4
            svg.text(x0 + width - 8, ny, note[0], 14, note[1], anchor="end", weight="700")


T = {
    "tr": {
        "ab_title": "Toplu düzenlemede Script: aynı iş, yarısından az token",
        "ab_sub": "qwen3-vl-30b · 3 tekrarın ortancası · başarı: ikisinde de 3/3",
        "ab_tasks": {
            "bulk-rename": "12 dosyada yeniden adlandır",
            "bulk-header": "15 dosyaya başlık ekle",
            "bulk-version": "10 JSON'da sürüm",
            "csv-to-json": "CSV → JSON (60 satır)",
        },
        "ab_series": ["Script açık", "Script kapalı"],
        "ab_foot": "Toplam (4 görev × 3 tekrar): {a} ↔ {b} token",
        "pay_title": "Her istekteki sabit yük (sistem istemi + araç şemaları)",
        "pay_sub": "gateway count_tokens ile ölçüldü · değişmeyen önek önbellekten gelir",
        "pay": [("M1–M3 · 7 araç, Türkçe açıklama", 1190), ("M4 sonu · kısa İngilizce açıklama", 989), ("M5 · + Task, TaskOutput", 1281)],
        "pay_note": "Asıl tasarruf önbellekten: aynı oturumda ikinci istekte önekin %49–97'si önbellekten gelir.",
        "sub_title": "Alt ajanlar iki kenarlı: büyük işte kazandırır, küçükte kaybettirir",
        "sub_sub": "ana bağlamdaki / oturumdaki toplam girdi token'ı · gerçek model",
        "sub_rows": [("Büyük dosyayı özetle", [7406, 2973], ("−%60", GREEN)), ("  oturum toplamı", [7610, 5925], ("−%22", GREEN)), ("Tek küçük grep", [3316, 3545], ("+%7", AMBER)), ("  oturum toplamı", [3440, 6268], ("+%82", RED))],
        "sub_series": ["Satır içi", "Task ile devret"],
        "auto_title": "Auto modu: tehlikeli çağrıların hiçbiri 'güvenli' sayılmadı",
        "auto_sub": "39 çağrılık elle yazılmış küme · qwen3-vl-30b · deneysel",
        "auto_rows": [("Tehlikeli (20)", [("yerel katman", 13, CYAN), ("model", 7, INDIGO), ("güvenli sayıldı", 0, RED)]), ("Güvenli (15)", [("güvenli", 14, GREEN), ("gereksiz soru", 1, AMBER)])],
        "auto_foot": "Model çağrısı başına ortanca gecikme: 274 ms. Küme küçük ve geliştiricinin; ayrıntı: docs/auto-mode.md",
        "road_title": "Yol haritası: M0–M7 tamam",
        "road_sub": "her aşama bir PR · her PR gerçek modelle ve temiz klonda doğrulandı",
        "road": ["İskelet", "Çekirdek", "Arayüz", "Güvenlik", "Token ekonomisi", "Lokalizasyon", "Alt ajanlar", "Auto modu", "Genişletilebilirlik", "Eval + binary"],
    },
    "en": {
        "ab_title": "Script for bulk edits: the same work in less than half the tokens",
        "ab_sub": "qwen3-vl-30b · median of 3 repetitions · success: 3/3 in both",
        "ab_tasks": {
            "bulk-rename": "Rename across 12 files",
            "bulk-header": "Add a header to 15 files",
            "bulk-version": "Version in 10 JSON files",
            "csv-to-json": "CSV → JSON (60 rows)",
        },
        "ab_series": ["Script on", "Script off"],
        "ab_foot": "Total (4 tasks × 3 runs): {a} ↔ {b} tokens",
        "pay_title": "Fixed payload of every request (system prompt + tool schemas)",
        "pay_sub": "measured with the gateway's count_tokens · the unchanged prefix is served from the cache",
        "pay": [("M1–M3 · 7 tools, Turkish descriptions", 1190), ("End of M4 · short English descriptions", 989), ("M5 · + Task, TaskOutput", 1281)],
        "pay_note": "The real saving is the cache: on a second request in a session 49–97% of the prefix is cached.",
        "sub_title": "Subagents cut both ways: they pay off on big jobs and cost on small ones",
        "sub_sub": "input tokens in the main context / the whole session · real model",
        "sub_rows": [("Summarize a big file", [7406, 2973], ("−60%", GREEN)), ("  session total", [7610, 5925], ("−22%", GREEN)), ("One small grep", [3316, 3545], ("+7%", AMBER)), ("  session total", [3440, 6268], ("+82%", RED))],
        "sub_series": ["Inline", "Delegated with Task"],
        "auto_title": "Auto mode: none of the dangerous calls was judged 'safe'",
        "auto_sub": "hand-written set of 39 calls · qwen3-vl-30b · experimental",
        "auto_rows": [("Dangerous (20)", [("local layer", 13, CYAN), ("model", 7, INDIGO), ("judged safe", 0, RED)]), ("Safe (15)", [("safe", 14, GREEN), ("needless question", 1, AMBER)])],
        "auto_foot": "Median latency per model call: 274 ms. The set is small and the developer's own; details: docs/en/auto-mode.md",
        "road_title": "Roadmap: M0–M7 done",
        "road_sub": "one PR per stage · every PR verified with the real model and a clean clone",
        "road": ["Skeleton", "Core", "Interface", "Security", "Token economy", "Localization", "Subagents", "Auto mode", "Extensibility", "Evals + binary"],
    },
}


def script_ab(lang):
    t = T[lang]
    rows_data = [json.loads(line) for line in (ROOT / "evals/results/2026-10-29-final.jsonl").read_text().splitlines()]
    tot = lambda r: (r["prompt_tokens"] or 0) + (r["completion_tokens"] or 0)
    med = lambda task, v: statistics.median(tot(r) for r in rows_data if r["task"] == task and r["variant"] == v)
    order = ["bulk-rename", "bulk-header", "bulk-version", "csv-to-json"]
    rows = []
    for task in order:
        a, b = med(task, "baseline"), med(task, "no-script")
        pct = round(100 * (b - a) / b)
        rows.append((t["ab_tasks"][task], [a, b], (f"−%{pct}" if lang == "tr" else f"−{pct}%", GREEN)))
    sums = {v: sum(tot(r) for r in rows_data if r["category"] == "bulk edit" and r["variant"] == v) for v in ("baseline", "no-script")}
    svg = Svg(820, 90 + len(rows) * 62 + 70, t["ab_title"], t["ab_sub"])
    svg.header(t["ab_title"], t["ab_sub"])
    svg.legend(28, 88, [(t["ab_series"][0], GREEN), (t["ab_series"][1], RED)])
    grouped_bars(svg, rows, 28, 112, 764, [(t["ab_series"][0], GREEN), (t["ab_series"][1], RED)], lang)
    y = 112 + len(rows) * 62 + 14
    svg.line(28, y - 12, 792, y - 12)
    svg.text(28, y + 12, t["ab_foot"].format(a=fmt(sums["baseline"], lang), b=fmt(sums["no-script"], lang)), 13, TEXT, weight="600")
    svg.save(f"chart-script-ab{'' if lang == 'tr' else '.en'}.svg")


def payload(lang):
    t = T[lang]
    svg = Svg(820, 262, t["pay_title"], t["pay_sub"])
    svg.header(t["pay_title"], t["pay_sub"])
    vmax = max(v for _, v in t["pay"])
    colors = [MUTED, GREEN, CYAN]
    for i, (label, v) in enumerate(t["pay"]):
        y = 92 + i * 46
        svg.text(28, y + 15, label, 13, TEXT)
        w = (v / vmax) * 330
        svg.rect(330, y, w, 22, colors[i])
        svg.text(330 + w + 10, y + 16, f"{fmt(v, lang)} token", 13, TEXT, mono=True)
    svg.text(28, 240, t["pay_note"], 12.5, MUTED)
    svg.save(f"chart-payload{'' if lang == 'tr' else '.en'}.svg")


def subagents(lang):
    t = T[lang]
    svg = Svg(820, 90 + 4 * 62 + 24, t["sub_title"], t["sub_sub"])
    svg.header(t["sub_title"], t["sub_sub"])
    series = [(t["sub_series"][0], MUTED), (t["sub_series"][1], INDIGO)]
    svg.legend(28, 88, series)
    grouped_bars(svg, t["sub_rows"], 28, 112, 764, series, lang)
    svg.save(f"chart-subagents{'' if lang == 'tr' else '.en'}.svg")


def auto(lang):
    t = T[lang]
    svg = Svg(820, 250, t["auto_title"], t["auto_sub"])
    svg.header(t["auto_title"], t["auto_sub"])
    x0, width = 190, 590
    for i, (label, segs) in enumerate(t["auto_rows"]):
        y = 92 + i * 58
        total = sum(n for _, n, _ in segs)
        svg.text(28, y + 19, label, 13, TEXT, weight="600")
        x = x0
        for name, n, color in segs:
            if n == 0:
                svg.text(28, y + 40, f"{name}: 0", 12, color, weight="700")
                continue
            w = width * n / (20 if i == 0 else 20)
            svg.rect(x, y, w - 2, 26, color, rx=5)
            svg.text(x + (w - 2) / 2, y + 18, str(n), 13, BG, anchor="middle", weight="700")
            svg.text(x + (w - 2) / 2, y + 42, name, 11.5, MUTED, anchor="middle")
            x += w
    svg.text(28, 232, t["auto_foot"], 12, MUTED)
    svg.save(f"chart-auto{'' if lang == 'tr' else '.en'}.svg")


def roadmap(lang):
    t = T[lang]
    items = t["road"]
    cols, cw, ch = 5, 148, 46
    svg = Svg(820, 84 + 2 * (ch + 14) + 22, t["road_title"], t["road_sub"])
    svg.header(t["road_title"], t["road_sub"])
    for i, name in enumerate(items):
        r, c = divmod(i, cols)
        x, y = 28 + c * (cw + 8), 84 + r * (ch + 14)
        svg.rect(x, y, cw, ch, PANEL, rx=10)
        svg.parts.append(f'<rect x="{x}" y="{y}" width="{cw}" height="{ch}" rx="10" fill="none" stroke="{BORDER}"/>')
        svg.text(x + 14, y + 20, f"M{i if i < 5 else ['4.5', '5', '5.5', '6', '7'][i - 5]}", 11.5, CYAN, weight="700", mono=True)
        svg.text(x + 14, y + 37, name, 12.5, TEXT, weight="600")
        svg.text(x + cw - 14, y + 20, "✓", 14, GREEN, anchor="end", weight="700")
    svg.save(f"roadmap{'' if lang == 'tr' else '.en'}.svg")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for lang in ("tr", "en"):
        script_ab(lang)
        payload(lang)
        subagents(lang)
        auto(lang)
        roadmap(lang)
    print("charts written to", OUT)
