# 📋 Market Beat — LLM Prompt (paste this into any agent)

> **Goal:** get the agent to spend its time on *content quality* and write a
> structured `report.json` file. **Do not let the LLM write HTML.**
> A 200-line deterministic renderer (`render.js`) converts JSON → HTML in <100ms.

---

## ⚡ The two-phase trick (FAST authoring)

LLMs are slow at writing perfect JSON in one pass because they keep
self-correcting commas/quotes. Solution: ask them to **think in plain text
first, then serialize**. Same content, ~30-40% faster, much lower error rate.

```
PHASE 1 — Outline in plain text (fast):
   For each headline, write 6 lines:
     # HEADLINE | TICKERS:scores | L1 narrative | L2 narrative | L3 narrative | Timeline DWML
   No JSON, no quoting, no escaping. Just brain-dump.

PHASE 2 — Serialize to JSON (cheap):
   Convert your outline into one valid report.json conforming to the schema.
   Wrap it in ```json``` fences. Write it to marketbeat/news/report.json.

PHASE 3 — Render (deterministic, ~50ms):
   Run:  node marketbeat/news/render.js
```

## ✅ Copy-paste prompt (works with Claude / GPT / Gemini / Grok / Kimi / Qwen)

```
You are a senior equity-research analyst. Produce a Market Beat news-impact
report. Use this two-phase workflow:

  PHASE 1 — outline in plain text (think fast, don't worry about JSON yet)
  PHASE 2 — serialize that outline into one valid report.json
  PHASE 3 — run `node marketbeat/news/render.js` to produce HTML

Do NOT generate HTML yourself. A 200-line renderer handles that.

INPUTS (fetch with whatever tool you have):
  - https://finance.yahoo.com/
  - https://www.cnbc.com/finance/
  - https://www.reuters.com/markets/
  - https://www.marketwatch.com/latest-news
  - https://www.bloomberg.com/markets   (if accessible)

OUTPUT: write exactly one file to marketbeat/news/report.json that conforms
to marketbeat/news/report.schema.json. After writing it, run:
    node marketbeat/news/render.js marketbeat/news/report.json
and report the path of the generated HTML file. Do nothing else.

CONTENT REQUIREMENTS:
  1. Pull 12–20 top finance headlines from today. Dedupe near-duplicates.
  2. For each headline produce ONE news card with:
       - id (1..N), headline, source ("Outlet · 3h ago"), url, category
       - priority 1..10 (10 = market-moving), confidence HIGH/MED/LOW
       - sentiment: "bull" | "bear" | "mixed" | "neutral"
         (renders as 🟢 / 🔴 / 🟡 / ⚪ dot on the headline)
       - tickers[]: PRIMARY tickers with score -3..+3
       - levels.L1: direct impact (1–3 sentence paragraph + optional tickers[])
       - levels.L2: ecosystem / peer ripple
       - levels.L3: macro / sector / structural
       - beneficiaries[]: 3–6 lines, each like "TICKER — why"
       - victims[]: 3–6 lines, each like "TICKER — why"
       - timeline: { D: "...", W: "...", M: "...", L: "..." }
  3. Then aggregate:
       - tickerTable[]: every ticker mentioned, with name, sector, net score,
                        and 1-line driver
       - sectorHeatmap[]: sector -> net signed score
       - actionSummary: { buys[], sells[], watchlist[] }
       - leaderboard: { winners: [{rank, name, why}], losers: [{rank, name, why}] }
         (5 of each; renders as 🥇🥈🥉 "Bottom Line" board)
       - otherStories[]: low-priority headlines compressed into
                         { headline, keyPoint, beneficiaries }
       - mood[]: futures + commodities + crypto + VIX (use today's prints)

SCORING RUBRIC (BE STRICT):
  +3 strong direct beneficiary       -3 strong direct victim
  +2 clear beneficiary               -2 clear victim
  +1 mild / sympathy tailwind        -1 mild headwind
   0 neutral (omit unless useful)

STYLE:
  - Analyst voice. Specific numbers (price moves, multiples, dollar amounts).
  - Trace 2nd- and 3rd-order effects (e.g. PANW beat → ZS/CRWD/FTNT peer bid
    → enterprise security spend crowding out CRM/WDAY share-of-wallet).
  - Always name PEERS, SUPPLIERS, CUSTOMERS as L2 ripple.
  - L3 should connect to macro: rates, USD, CPI, oil, geopolitics, regulation.

DO NOT:
  - Output HTML.
  - Add commentary outside the JSON file.
  - Invent tickers that don't exist.
  - Use scores outside -3..+3.

Now do it: (1) outline in text, (2) serialize one report.json, (3) run
render.js, (4) tell me the HTML path.
```

---

## 🧊 Faster prompt for "just the data" runs

If you already have the analysis context loaded and just want to refresh data:

```
Refresh marketbeat/news/report.json with today's headlines from Yahoo Finance.
Keep the exact same JSON schema. Update: date, mood[], news[] (12–20 cards
with sentiment dots), leaderboard, otherStories, tickerTable, sectorHeatmap,
actionSummary. Then run: node marketbeat/news/render.js
```

---

## 🧱 Why split content from rendering?

| Phase | What does it | Cost / latency | Who runs it |
|------|----|----|----|
| **Content** (`report.json`) | Headline pull, ticker scoring, L1/L2/L3 narrative, peer mapping, timeline | Slow (LLM, fetches, reasoning) | An AI agent, or `newsbeat.js` heuristic |
| **Render** (`render.js`) | JSON → fully styled, self-contained, dark-mode HTML | ~50ms, no network, no LLM | Anyone (`node render.js`) |

Benefits:
- Same `report.json` in any LLM ⇒ **byte-identical HTML** every time.
- You can hand-edit `report.json` and re-render in 50ms.
- Front-end never depends on which model produced the content.
- Easy to diff yesterday vs today (just diff two JSONs).
- The LLM can't drift on visual style — it literally never sees the CSS.

---

## 🔁 The two run paths

### Path A · LLM-authored (richest quality)
```
You (paste PROMPT.md into agent)
        │
        ▼
Agent fetches news → writes report.json
        │
        ▼
node render.js  ← fast, deterministic
        │
        ▼
marketbeat_report_<date>.html
```

### Path B · Fully automatic (no LLM needed)
```
node newsbeat.js
   ├── fetch sources (Node 20 native fetch)
   ├── heuristic ticker matching + sentiment
   ├── write report.<date>.json
   └── call renderReport() from render.js
        │
        ▼
marketbeat_report_<date>.html
```

Both paths share `render.js` ⇒ identical visual output.

---

## 🧪 Verifying the agent's output

After the agent writes `report.json`, you can sanity-check it before rendering:

```bash
# 1. Is it valid JSON?
node -e "JSON.parse(require('fs').readFileSync('marketbeat/news/report.json'))"

# 2. Does it have the required fields?
node -e "
const r = require('./marketbeat/news/report.json');
console.log('date:',     r.date);
console.log('news cards:',r.news?.length);
console.log('tickers:',  r.tickerTable?.length);
console.log('all news have L1/L2/L3:',
  r.news.every(n => n.levels?.L1 && n.levels?.L2 && n.levels?.L3));
"

# 3. Render
node marketbeat/news/render.js
```

If any of those checks fail, re-run the agent with: *"Your last report.json
was missing X. Re-emit a corrected version conforming to report.schema.json."*

---

## 💡 Tips for getting consistent results across LLMs

1. **Pin sources.** List the exact URLs in the prompt. Different models pick
   different defaults otherwise.
2. **Quantify counts.** "12–20 headlines" beats "many headlines."
3. **Force priority distribution.** Add: *"At least 3 cards must have priority ≥ 8."*
4. **Force ticker discipline.** Add: *"Every score must be one of {-3,-2,-1,1,2,3}.
   Never 0."*
5. **Force the schema explicitly.** Add: *"Validate against
   marketbeat/news/report.schema.json before writing."*
6. **Give the agent permission to skip locked sources.** Some models will hang
   on Bloomberg/FT 401s; tell them: *"Skip any source that returns 401/403."*

---

## 📦 What you commit to the repo

```
marketbeat/news/
├── PROMPT.md              # this file — the one-paste prompt
├── INSTALL.md             # human setup + usage
├── newsbeat.js            # autonomous fetch + heuristic scorer
├── render.js              # JSON → HTML pure converter
├── report.schema.json     # JSON contract
└── report.json            # latest content (regenerated daily, can .gitignore)
```

`.gitignore`:
```
marketbeat/news/marketbeat_report_*.html
marketbeat/news/report.*.json
```
(keep `report.json` itself — it's the canonical "today's report" data.)
