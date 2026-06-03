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
| **`PROMPT.md`** | Paste into any LLM (Claude / GPT / Gemini / Grok / Kimi / Qwen) → produces a conformant `report.json`. Follows the **4-phase workflow** (outline → JSON → lint → daily wrap). |
| **`report.schema.json`** | The JSON contract — what every `report.json` must look like |
| **`report.json`** | Today's content (LLM- or script-generated; ~50 KB; human-editable) |
| **`render.js`** | Pure converter: `report.json → marketbeat_report_<date>.html` (no fetch, no LLM, <50 ms) |
| **`sources.js`** | 🆕 RSS + HTML source registry (20+ feeds: Yahoo, CNBC, MarketWatch, WSJ, Bloomberg, FT, NYT, Benzinga, Seeking Alpha, Investing.com, …) |
| **`newsbeat.js`** | Fully autonomous: fetches all sources, scores, writes `report.json`, calls renderer. Auto-detects `sources.js` if present. |
| **`diff.js`** | 🆕 Yesterday-vs-today diff: NEW/DROPPED/CHANGED tickers, sentiment flips, sector rotation, fresh headlines hitting tracked tickers |
| **`scoreboard.js`** | 🆕 Cumulative ticker scoreboard across N days (append-only JSONL log + HTML rollup with spark grid + persistent-theme tags) |
| **`enrich.js`** | 🆕 LLM enrichment loop for agent mode (Arena/etc.): flags thin cards, writes an agent prompt, applies the agent's JSON patch back + re-renders |
| **`lint.js`** | 🆕 Schema + content linter. Catches missing macro tiles, thin L2/L3, placeholders, missing beneficiaries/victims, etc. Can write `lint.prompt.md` so an agent can read its own homework and fix it. Exit codes are CI-friendly (0/1/2). |
| **`daily.js`** | 🆕 One-command end-of-day wrap: **lint** → snapshot → log → render → diff → scoreboard. **Gap-tolerant** (weekends/holidays/missed days). `--strict` aborts on lint errors. |
| **`scoreboard.jsonl`** | 🆕 Append-only log of daily ticker scores (commit this — it's your history) |
| **`scripts/precommit.sh`** | 🆕 Git pre-commit hook: validates JSON, lints `report.json`, re-renders HTML, auto-stages snapshot. Blocks bad commits. |
| **`.gitignore`** | 🆕 Ignores transient files (`lint.prompt.md`, `diff.*.json`, `scoreboard_*.html`, etc.) |
| **`INSTALL.md`** | This file |

### 🎨 Report sections (v0.4)

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

## 🚀 Quick start

```bash
cd news

# 1. Generate today's content — choose one:
#    A) paste PROMPT.md into Arena / Claude / GPT / Gemini → writes report.json
#    B) node newsbeat.js                                    → autonomous baseline

# 2. One-command wrap (the only command you need most days):
node daily.js --strict
# This runs: lint → snapshot → render → diff → scoreboard → auto-prune
```

That's it for the daily routine. The sections below explain each piece if you
need to use them individually.

### 🔧 Individual tools (run any of these on their own)

```bash
# Render only — instant HTML refresh after hand-editing report.json (~50ms)
node render.js
node render.js report.json                       # explicit input
cat report.json | node render.js --stdin > out.html

# Autonomous fetch (no-LLM baseline; refine afterwards with the enrichment loop)
node newsbeat.js                                 # use full sources.js registry
node newsbeat.js --date=2026-06-02               # override report date

# LLM enrichment loop (Arena agent mode — no API key needed)
node enrich.js plan                              # → enrich.prompt.md (thin cards)
# (agent reads prompt, writes enrich.patch.json)
node enrich.js apply                             # merge patch + re-render

# Day-over-day diff (auto-finds yesterday's snapshot, gap-tolerant)
node diff.js
node diff.js report.2026-06-02.json report.2026-06-03.json

# Cumulative scoreboard across N days (defaults to 7)
node scoreboard.js append report.json            # log today's tickers
node scoreboard.js show  --days=7                # render N-day HTML rollup
node scoreboard.js top   --days=14               # console summary

# Source health check (which of the 20 RSS/HTML feeds are alive)
node sources.js
node sources.js --list                           # show the full registry
```

### 🪝 Git pre-commit hook (recommended)

Install the hook once so bad reports never reach the repo:

```bash
# from your repo root, after `git init` / `git clone`:
ln -sf ../../news/scripts/precommit.sh .git/hooks/pre-commit
# or, if symlinks aren't your thing:
cp news/scripts/precommit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

The hook will, on every `git commit` that touches `news/`:

1. Validate JSON syntax for every staged `report*.json`
2. Validate `scoreboard.jsonl` line-by-line
3. Run `lint.js --strict` on `news/report.json` — **blocks** if errors
4. Re-render `marketbeat_report_<date>.html` from the staged `report.json`
5. Auto-stage the regenerated HTML + a `report.<date>.json` snapshot
6. Warn (not block) if transient files were staged by mistake

Bypass for emergencies: `git commit --no-verify`.

### 🔍 The lint loop (the new safety net)

LLMs sometimes forget sections. The linter catches that **before** rendering
so you never end up with a half-rendered HTML.

```bash
node lint.js                    # human-readable, exit 0 unless errors
node lint.js --strict           # explicit (same default behaviour)
node lint.js --warn-as-error    # picky mode — fail on warnings too
node lint.js --fix-prompt       # write lint.prompt.md for an agent to fix
node lint.js --json             # JSON output for piping into agents
node lint.js report.2026-06-03.json   # lint a specific snapshot
```

**Hard checks (errors)** include:
- `macro` block missing or missing Fed/NFP/CPI keyEvents tiles
- Any L1/L2/L3 narrative under 80 chars, or containing placeholder scaffolding
- Empty beneficiaries on a bullish card / empty victims on a bearish card
- Missing D/W/M/L timeline keys
- Invalid sentiment/confidence/priority values
- `leaderboard.winners` or `losers` with < 3 entries
- Empty `tickers[]` on a card; ticker scores outside ±3

**Soft checks (warnings)** include:
- Cards with < 3 tickers
- Both L2 (no peer/supplier language) AND L3 (no macro lens) being thin
- Missing category or URL on a card
- No priority-10 cards (probably missed the market-moving headline)
- > 70% of cards share one sentiment (suspicious monoculture)
- Tickers in news cards missing from the `tickerTable` (consistency)

**Agent-friendly loop**: with `--strict --fix-prompt`, the linter writes
`lint.prompt.md` listing every error with its JSON path. An agent reads
that, fixes only those fields, re-runs `lint.js`, and continues until exit 0.

### 📅 Suggested daily routine

```bash
# Step 1 — fresh content (paste PROMPT.md into an agent, OR run autonomous)
node newsbeat.js
node enrich.js plan && # (agent fulfils enrich.prompt.md) && node enrich.js apply

# Step 2 — one-command wrap (lints, snapshots, renders, diffs, prunes)
node daily.js             # default: lints but proceeds even on warnings
node daily.js --strict    # aborts if linter finds ERRORS (recommended in CI / agent loops)
```

`daily.js` auto-prunes to keep only **today + yesterday** files (snapshots,
HTML reports, diff). The repo stays small and the LLM only sees one previous
day's reference.

### 📆 Calendar-gap handling

The tools never assume "yesterday = today minus one calendar day". `diff.js`
finds the **most-recent prior snapshot strictly before today**, regardless of
weekends, holidays, or missed days:

| Scenario | What `diff.js` does |
|---|---|
| Tue ↦ Wed (consecutive) | Uses Tue snapshot. Banner: *consecutive days* |
| Fri ↦ Mon | Uses Fri snapshot. Banner: *Mon-after-Fri — weekend skipped* |
| Fri ↦ Tue (holiday Mon) | Uses Fri snapshot. Banner: *4-day gap — weekend/holiday/missed* |
| You forgot for a week | Uses last available snapshot. Banner: *7-day gap* |
| First-ever run, no priors | Graceful warning, exits 0 (safe for cron) |

`scoreboard.js show --days=7` uses **last 7 dates with logged data**, not
last 7 calendar days — so a 4-day window over a holiday week still shows 4
solid columns rather than blank cells.

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

### Sources (`sources.js`)

The full registry of 20+ RSS + HTML news feeds lives in **`sources.js`**.
Add or remove feeds by editing the `SOURCES` array:

```js
{ name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss',
  type: 'rss', weight: 3 },
```

Run `node sources.js` to health-check which feeds respond. `newsbeat.js`
auto-detects `sources.js` and uses it; if you delete the file it falls back
to a small legacy 5-source list embedded in `newsbeat.js`.

### Visual style (`render.js`)

All CSS lives in the `CSS` constant near the top of `render.js`. Edit once,
re-render every existing `report.json` instantly with `node render.js`.

### Ticker knowledge base (`newsbeat.js`)

The autonomous heuristic scorer uses `TICKER_DB` in `newsbeat.js` to map
company-name mentions → ticker symbols and to know each ticker's peers.
Add a ticker like:

```js
TICKER_DB.NTSK = { n:'Netskope', s:'CYBERSECURITY', peers:['PANW','ZS','CRWD'] };
```

LLM-authored runs (PROMPT.md) don't need this — the LLM recognizes any ticker.

---

## 🧪 Validating a `report.json`

Use the linter — it covers JSON validity, schema shape, content depth, and
macro block all in one:

```bash
node news/lint.js              # human-readable
node news/lint.js --strict     # exit 1 on errors (CI / agent loop)
node news/lint.js --fix-prompt # also write lint.prompt.md for an agent to fix
```

See the **Lint loop** section above for the full list of E001-E109 checks.

For strict JSON-Schema validation against `report.schema.json` you can also use:

```bash
npm i -g ajv-cli
ajv validate -s news/report.schema.json -d news/report.json
```

---

## 🛠 Troubleshooting

| Problem | Fix |
|---------|-----|
| `fetch is not defined` | Use Node ≥ 20 (`node --version`) |
| Source returns 401/403 | The site blocks bots; remove that entry from `sources.js`, or fall back to LLM-authored mode (PROMPT.md) |
| Report has 0 cards | Increase `CONFIG.maxHeadlines` in `newsbeat.js`, or add more feeds in `sources.js` |
| HTML looks unstyled in preview | The report is fully inline (no external CSS/JS) — if it looks broken, open the `.html` file directly in a browser |
| Linter complains about W202 / W203 | Soft warnings about thin L2/L3 narrative — deepen one of them or ignore |
| Agent wrote HTML instead of JSON | Re-paste `PROMPT.md` and stress the "do NOT generate HTML" line in the 4-phase workflow |
| `lint.js --strict` keeps failing | Read `lint.prompt.md` — it lists every error with its JSON path |
| `diff.js` says "no prior snapshot" | First-ever run — `daily.js` creates one; tomorrow's diff will work |

---

## 🚧 Roadmap

Completed in v0.3:
- [x] **RSS feed support** — 20+ feeds via `sources.js` (Yahoo, CNBC, MarketWatch, WSJ, Bloomberg, FT, NYT, Benzinga, Seeking Alpha, Investing.com)
- [x] **LLM enrichment loop** (`enrich.js`) — works with Arena agent mode, no API key
- [x] **Yesterday-vs-today diff** (`diff.js`) — ticker movement, sentiment flips, sector rotation
- [x] **Cumulative ticker scoreboard** (`scoreboard.js`) — append-only JSONL log + N-day HTML rollup with spark grid
- [x] **Macro & economic-calendar block** — Fed/NFP/CPI tiles + today/tomorrow/week calendar

Completed in v0.4 (this release):
- [x] **`lint.js`** — schema + content linter with `--strict` / `--fix-prompt` / `--json` modes
- [x] **`daily.js` integrates lint** — runs lint first; `--strict` aborts on errors
- [x] **PROMPT.md adds lint loop** — agents read `lint.prompt.md` to fix their own gaps
- [x] **Gap-tolerant diff** — handles weekends, holidays, missed days, first runs
- [x] **`previous-day = diff baseline ONLY` rule** documented and enforced in PROMPT.md
- [x] **`scripts/precommit.sh`** — git hook that blocks bad reports from entering the repo
- [x] **`.gitignore`** — keeps transient files out of git

Still on the wishlist:
- [ ] AJV schema-validation in `render.js` (with `--strict` flag) — currently the linter handles this functionally
- [ ] Real-time market data wired into `mood[]` (Yahoo quote API or Finnhub free tier)
- [ ] CSV / PDF export
- [ ] Optional Slack / email push when priority ≥ 9
- [ ] Multi-region presets (US / EU / APAC sources via region flag in sources.js)
- [ ] Ticker-detail drill-down page (history of every mention of one symbol)

---

## 📦 Repo layout suggestion

```
researchshipper/equity/
└── news/
    ├── .gitignore                   ← ignores transient files
    ├── PROMPT.md                    ← agent instructions (lint-loop)
    ├── INSTALL.md                   ← this file
    ├── report.schema.json           ← JSON contract
    ├── sources.js                   ← 20+ RSS/HTML source registry
    ├── newsbeat.js                  ← autonomous fetch + score
    ├── lint.js                      ← schema + content linter
    ├── render.js                    ← JSON → HTML (pure, <50ms)
    ├── diff.js                      ← prior-snapshot vs today (gap-tolerant)
    ├── scoreboard.js                ← cumulative N-day rollup
    ├── enrich.js                    ← LLM enrichment loop
    ├── daily.js                     ← one-command end-of-day wrap
    │
    ├── scripts/
    │   └── precommit.sh             ← git hook: lint + render + auto-stage
    │
    │
    │  ── DATA (committed) ──
    ├── report.json                  ← canonical "today" content
    ├── scoreboard.jsonl             ← append-only daily log (keep forever)
    │
    │  ── 2-day rolling window (auto-pruned by daily.js) ──
    ├── report.<yesterday>.json      ← yesterday snapshot (diff baseline only)
    ├── report.<today>.json          ← today snapshot
    ├── marketbeat_report_<yesterday>.html  ← yesterday HTML (LLM style reference)
    ├── marketbeat_report_<today>.html      ← today HTML
    ├── marketbeat_diff_<today>.html        ← today's diff vs yesterday
    │
    │  ── transients (gitignored — never commit) ──
    ├── scoreboard_*.html            ← regenerated by `scoreboard.js show`
    ├── diff.*.json                  ← derivable from any two snapshots
    ├── lint.prompt.md               ← agent reads + discards
    └── enrich.prompt.md / patch.*.json
```

**What you commit at end of each day** (after `node daily.js`):

```bash
# daily.js already auto-prunes old files. Just add the survivors:
git add news/report.json \
        news/report.*.json \
        news/scoreboard.jsonl \
        news/marketbeat_report_*.html \
        news/marketbeat_diff_*.html
git commit -m "Daily wrap <today>"
```

Because of pruning, you'll only ever stage **at most ~6 changed files per day**.
The repo size stays flat over time. The LLM only ever sees ONE previous day's
HTML as a style reference.

`.gitignore` (already in repo):
```
news/scoreboard_*.html
news/diff.*.json
news/lint.prompt.md
news/enrich.prompt.md
news/enrich.patch*.json
```

---

*Built for the `researchshipper/equity` framework — institutional-style market reads, in one prompt.*
