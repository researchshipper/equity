# 📰 Market Beat — News Impact Workflow

> **One prompt in. Beautiful HTML out.**
> Two-stage architecture: an LLM (or `newsbeat.js`) writes structured JSON;
> a deterministic Node script renders it to a self-contained HTML in <100 ms.

```
                  ┌───────────────────────────┐
   any LLM   ──▶  │   report.json (content)   │  ◀── newsbeat.js
                  │   conforms to schema      │      (fully autonomous)
                  └─────────────┬─────────────┘
                                │
                                ▼  (fast, deterministic, no LLM, no network)
                  ┌───────────────────────────┐
                  │   render.js  →  HTML      │
                  └───────────────────────────┘
```

---

## 📂 Files in this folder

| File | Purpose |
|------|---------|
| **`PROMPT.md`** | Paste this into any LLM (Claude / GPT / Gemini / Grok / Kimi / Qwen) → get a conformant `report.json`. Uses a **two-phase trick** (outline in TXT, then serialize to JSON) for ~30% faster authoring. |
| **`report.schema.json`** | The JSON contract — what every `report.json` must look like |
| **`report.json`** | Today's content (LLM- or script-generated; ~50 KB; human-editable) |
| **`render.js`** | Pure converter: `report.json → marketbeat_report_<date>.html` (no fetch, no LLM, <50 ms) |
| **`newsbeat.js`** | Fully autonomous: fetches Yahoo/CNBC/etc., heuristically scores, writes `report.json`, calls renderer |
| **`INSTALL.md`** | This file |

### 🎨 Report sections (v0.2)

1. **Hero** — title, date, source badges, 10-cell market mood bar, color legend
2. **🏛️ Macro & Economic Calendar** — top tiles: regime badge + headline, **key-event tiles** (Fed rate decision / Jobs-NFP / CPI / ADP), a **Today** vs **Tomorrow** release grid, and a Mon→Fri **week-at-a-glance** with done/today/ahead tags and high/med/low importance dots
3. **News Cards** — each card has 🟢🔴🟡⚪ sentiment dot + headline + priority/category/confidence pills + L1/L2/L3 narratives + beneficiaries/victims columns + D/W/M/L timeline
4. **🏆 Bottom Line** — 🥇🥈🥉 ranked leaderboard of winners and losers
5. **📌 Other Stories** — compact mini-table of low-priority headlines
6. **📊 Ticker Reference Table** — every mentioned ticker with name, sector, color, driver
7. **🌡️ Sector Heatmap** — sector net-score tiles (green/red gradient)
8. **🎯 Action Summary** — 3-column buys / sells / watchlist
9. **Footer**

Outputs (gitignored):
| File | Purpose |
|------|---------|
| `marketbeat_report_YYYY-MM-DD.html` | The shippable report |
| `report.YYYY-MM-DD.json`            | `newsbeat.js` autonomous run output |

---

## 🚀 Quick start — three ways to use it

### A · LLM-authored (best content quality)

Open a new chat in any agent and paste the prompt from **`PROMPT.md`**. The
agent will fetch news, write `report.json`, then run `render.js`.

You will get an HTML at `marketbeat/news/marketbeat_report_<date>.html`.

### B · Fully autonomous (no LLM, no human)

```bash
cd marketbeat/news
node newsbeat.js
# → report.2026-06-02.json
# → marketbeat_report_2026-06-02.html
```

Variants:
```bash
node newsbeat.js --json-only         # write JSON only, skip HTML
node newsbeat.js --date=2026-06-02   # override report date
node newsbeat.js --out=my-report.json
```

### C · Render only (hand-edit content, fast iterate on data)

```bash
# Just regenerate HTML from the current report.json
node render.js

# Or render a specific file
node render.js report.2026-06-02.json

# Or pipe JSON in
cat report.json | node render.js --stdin > out.html
```

`render.js` is ~50 ms — instant feedback if you tweak a card by hand.

---

## ⚡ Why this split matters

| Concern | Old way (LLM writes HTML) | New way (LLM writes JSON, script renders) |
|---|---|---|
| Tokens | ~30k output | ~8k output |
| Latency | 20–60 s | 5–15 s (LLM) + 50 ms (render) |
| Cross-LLM consistency | Visual drift between models | **Byte-identical HTML for the same JSON** |
| Hand-editing | Edit HTML → fragile | Edit JSON → safe, schema-validated |
| Diffing yesterday vs today | Hard | Trivial — `diff report-yesterday.json report-today.json` |
| Style updates | Re-prompt every LLM | Edit CSS in `render.js` once |
| Validation | None | JSON schema |

---

## 🧠 Data contract (summary)

The full schema is in **`report.schema.json`**. The shape:

```jsonc
{
  "date": "2026-06-02",
  "title": "Market Beat — News Impact Analysis",
  "subtitle": "17 headlines · 3 levels · 48 tickers",
  "region": "GLOBAL",
  "sources": ["Yahoo Finance", "Reuters", "Bloomberg"],

  "mood": [
    { "label": "S&P 500 (fut)", "value": "7,620", "delta": "-0.04%", "tone": "neg" }
  ],

  "macro": {
    "headline": "Jobs week; payrolls Friday is the swing event",
    "regime": "HAWKISH TILT — markets price a hike by year-end",
    "keyEvents": [
      { "label": "Fed (FOMC)", "value": "Jun 16-17", "detail": "Decision Jun 17", "when": "ahead", "tone": "neu" },
      { "label": "Jobs (NFP)", "value": "Fri Jun 5", "detail": "fcst ~85k vs +115k", "when": "week", "tone": "neu" },
      { "label": "CPI", "value": "Jun 13", "detail": "last +3.8% YoY", "when": "ahead", "tone": "neg" }
    ],
    "today":    [ { "time": "8:15a ET", "event": "ADP Employment (May)", "importance": "high", "forecast": "+116k", "prior": "+109k", "tone": "neu" } ],
    "tomorrow": [ { "time": "8:30a ET", "event": "Weekly Jobless Claims", "importance": "high", "forecast": "~213k", "prior": "215k", "tone": "neu" } ],
    "week": [
      { "date": "Tue Jun 2", "event": "JOLTS (Apr): 7.62M, 2-yr high", "importance": "high", "status": "done", "tone": "pos" },
      { "date": "Fri Jun 5", "event": "NONFARM PAYROLLS (May)", "importance": "high", "status": "ahead", "tone": "neg" }
    ]
  },

  "news": [
    {
      "id": 1,
      "headline": "Marvell soars +32.5% — Huang calls it 'next $1T'",
      "source":   "Yahoo Finance · 2h ago",
      "url":      "https://...",
      "category": "AI · Semis",
      "priority": 10,
      "confidence": "HIGH",
      "tickers": [
        { "symbol": "MRVL", "score":  3 },
        { "symbol": "INTC", "score": -1 }
      ],
      "levels": {
        "L1": { "text": "Direct impact narrative…",      "tickers": [...] },
        "L2": { "text": "Peers / ecosystem ripple…",     "tickers": [...] },
        "L3": { "text": "Macro / sector / structural…",  "tickers": [...] }
      },
      "beneficiaries": ["MRVL — re-rating", "AVGO — halo trade"],
      "victims":       ["INTC — falling behind"],
      "timeline": {
        "D": "Momentum chase…",
        "W": "Sell-side PT hikes…",
        "M": "FY29 guide…",
        "L": "Hyperscaler custom-silicon model wins."
      }
    }
  ],

  "tickerTable":   [ { "symbol": "MRVL", "name":"Marvell", "sector":"AI/Semis", "score":3, "driver":"Huang nod" } ],
  "sectorHeatmap": [ { "sector": "AI / Semiconductors", "score": 12 } ],
  "actionSummary": { "buys":[...], "sells":[...], "watchlist":[...] },
  "footer": "Not investment advice."
}
```

Scoring (everywhere a `score` field appears):

| Score | Color | Meaning |
|------:|-------|---------|
| +3 | 🟢 bright green | strong direct beneficiary |
| +2 | 🟢 green | clear beneficiary |
| +1 | 🟡 olive | mild / sympathy positive |
| -1 | 🟡 amber | mild headwind |
| -2 | 🔴 red | clear victim |
| -3 | 🔴 bright red | strong direct victim |

Timeline labels: **D**=days · **W**=weeks · **M**=months · **L**=long-term.

---

## 🔧 Configuration

### Sources (`newsbeat.js`)

Edit the `CONFIG.sources` array near the top of `newsbeat.js`:

```js
sources: [
  { name: 'Yahoo Finance',   url: 'https://finance.yahoo.com/',                       weight: 3 },
  { name: 'CNBC',            url: 'https://www.cnbc.com/finance/',                    weight: 2 },
  { name: 'Reuters Markets', url: 'https://www.reuters.com/markets/',                 weight: 2 },
  { name: 'MarketWatch',     url: 'https://www.marketwatch.com/latest-news',          weight: 1 },
  // Add Bloomberg/FT/Investing/Benzinga/SeekingAlpha as needed
],
```

Some sites (Bloomberg/FT/Reuters) gate non-browser UAs. Use Path A (LLM) for
those if your agent has tool access; the autonomous path will skip them.

### Visual style (`render.js`)

All CSS lives in the `CSS` constant near the top of `render.js`. Edit once,
re-render every existing `report.json` instantly.

### Tickers (`newsbeat.js` only — Path B)

Add to `TICKER_DB`:

```js
TICKER_DB.NTSK = { n:'Netskope', s:'CYBERSECURITY', peers:['PANW','ZS','CRWD'] };
```

Path A (LLM-authored) does not need this — the agent recognizes any ticker.

---

## 🧪 Validating a `report.json`

```bash
# 1. Valid JSON?
node -e "JSON.parse(require('fs').readFileSync('marketbeat/news/report.json'))" && echo OK

# 2. Required fields present?
node -e "
const r = require('./marketbeat/news/report.json');
const ok = r.date && Array.isArray(r.news) &&
           r.news.every(n => n.levels?.L1 && n.levels?.L2 && n.levels?.L3);
const macroOk = r.macro && Array.isArray(r.macro.keyEvents) && r.macro.keyEvents.length >= 3;
console.log(ok ? '✅ schema-shaped' : '❌ missing required fields');
console.log(macroOk ? '✅ macro block present (Fed/Jobs/CPI tiles)' : '⚠️  macro block missing/short');
"

# 3. Render it
node marketbeat/news/render.js
```

If you want full JSON-Schema validation, install `ajv` and run:

```bash
npm i -g ajv-cli
ajv validate -s report.schema.json -d report.json
```

---

## 🛠 Troubleshooting

| Problem | Fix |
|---------|-----|
| `fetch is not defined` | Use Node ≥ 20 (`node --version`) |
| Source returns 401/403 | That site blocks bots; remove from `CONFIG.sources` or use Path A |
| Report has 0 cards | Increase `maxHeadlines`, lower `priority >= 6` filter, add sources |
| HTML looks unstyled in preview | Some sandboxes block external resources — this report is fully inline, so this shouldn't happen. If it does, open the file directly in a browser. |
| Score showed as `0` | `0` is allowed but ugly; tighten the rubric in the LLM prompt |
| Agent wrote HTML instead of JSON | Re-paste `PROMPT.md` and stress the "do not generate HTML" line |

---

## 🚧 Roadmap

- [ ] AJV schema-validation in `render.js` (with `--strict` flag)
- [ ] RSS feed support for Path B
- [ ] LLM scorer plugin for `newsbeat.js` (call API to refine L2/L3 narrative)
- [ ] Yesterday vs today diff page
- [ ] CSV / PDF export
- [ ] Optional Slack / email push
- [ ] Multi-region presets (US / EU / APAC)
- [ ] Multi-day rollup ("week in review")

---

## 📦 Repo layout suggestion

```
researchshipper/equity/
└── marketbeat/
    └── news/
        ├── PROMPT.md
        ├── INSTALL.md
        ├── newsbeat.js
        ├── render.js
        ├── report.schema.json
        ├── report.json                  ← canonical "today" content
        ├── report.2026-06-02.json       ← (gitignored) autonomous-run snapshots
        └── marketbeat_report_*.html     ← (gitignored) rendered outputs
```

`.gitignore`:
```
marketbeat/news/marketbeat_report_*.html
marketbeat/news/report.2*.json
```

---

*Built for the `researchshipper/equity` framework — institutional-style market reads, in one prompt.*
