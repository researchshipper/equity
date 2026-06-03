# 📋 Market Beat — LLM Prompt (paste this into any agent)

> **Goal:** get the agent to spend its time on *content quality* and write a
> structured `report.json` file. **Do not let the LLM write HTML.**
> A 200-line deterministic renderer (`render.js`) converts JSON → HTML in <50ms.

---

## 🔁 The 4-phase workflow

```
PHASE 1 — Outline today's news in plain text (fast, no JSON yet)
PHASE 2 — Serialize the outline into one valid news/report.json
PHASE 3 — Lint loop: node news/lint.js --strict --fix-prompt
              if exit ≠ 0 → read news/lint.prompt.md, fix listed errors only,
              re-run lint until exit 0 (max 3 retry passes)
PHASE 4 — node news/daily.js  (snapshot, render, diff, scoreboard, auto-prune)
```

Why split content from rendering? An LLM that hand-writes HTML produces
inconsistent style across runs and across providers. By writing structured
JSON validated by a schema + linter, **any LLM gives byte-identical HTML**.

## 🚦 Critical rule: previous-day files are REFERENCES, not inputs

The `news/` folder will contain (at most) ONE previous day's artifacts:
- `news/marketbeat_report_<yesterday>.html` — the rendered report from yesterday
- `news/report.<yesterday>.json` — its underlying data (used only by `diff.js`)

**Read the previous HTML for ONE purpose only:** to see the *visual structure*
you should match (section ordering, ticker formatting, narrative depth, etc.).

**Never:**
- copy yesterday's headlines into today's report
- reuse yesterday's narratives, ticker scores, beneficiaries, or victims
- treat the previous `report.json` as a starting template — start from blank

**Always:**
- fetch TODAY's actual headlines from the source URLs below
- build today's report from scratch, then let `diff.js` compute movement vs yesterday

The reason: if you copy yesterday's content, the diff is meaningless and the
report misses today's actual news. The reference HTML is just a style guide.

> The `daily.js` script auto-prunes to keep only YESTERDAY's snapshot. So you'll
> only ever see ONE previous report file — no temptation to merge across days.

## 🔁 The required lint loop (do NOT skip)

```
write report.json  →  node lint.js --strict --fix-prompt
                                │
                ┌───────────────┴───────────────┐
                │ exit 0 → done                 │ exit 1 → read lint.prompt.md, fix the listed
                │ run node daily.js             │ errors only, then loop back to lint
                ▼                               ▼
          render + commit                 (max 3 retry passes — if still failing,
                                           tell the user which check is unhappy)
```

The linter checks for: macro block (Fed/NFP/CPI tiles), all 3 L1/L2/L3 narratives ≥ 80
chars with no placeholders, beneficiaries/victims lists, D/W/M/L timeline, valid
sentiment enum, leaderboard ≥ 3 winners + 3 losers, etc. **Every error must be
resolved before rendering.**

## ✅ Copy-paste prompt (works with Claude / GPT / Gemini / Grok / Kimi / Qwen)

```
You are a senior equity-research analyst. Produce a Market Beat news-impact
report. Use this 4-phase workflow:

  PHASE 1 — outline in plain text (think fast, don't worry about JSON yet)
  PHASE 2 — serialize that outline into one valid news/report.json
  PHASE 3 — LINT LOOP: `node news/lint.js --strict --fix-prompt`
              if exit code != 0:
                read news/lint.prompt.md
                fix ONLY the listed errors in report.json
                re-run lint.js — loop until exit 0 (max 3 passes)
  PHASE 4 — `node news/daily.js`  (snapshot, render, diff, scoreboard)

Do NOT generate HTML yourself. A 200-line renderer handles that.

═══════════════════════════════════════════════════════════════════════
🚦 CRITICAL — PREVIOUS-DAY REPORT IS DIFF BASELINE, NOT INPUT 🚦

If news/report.YYYY-MM-DD.json files exist from prior days:
  • DO NOT read them as a source.
  • DO NOT copy their headlines, narratives, tickers, or scores.
  • DO NOT seed today's report from yesterday's content.
  • They exist ONLY so diff.js can compute day-over-day movement
    AFTER you write today's fresh report from real news.

Start every report from a blank slate. Always fetch today's news fresh
from the source URLs below.
═══════════════════════════════════════════════════════════════════════

INPUTS (fetch with whatever tool you have — pull TODAY's headlines):
  - https://finance.yahoo.com/
  - https://www.cnbc.com/finance/
  - https://www.reuters.com/markets/
  - https://www.marketwatch.com/latest-news
  - https://www.bloomberg.com/markets         (if accessible)
  - any RSS feed listed in news/sources.js    (parallel fetch supported)

MACRO / ECONOMIC CALENDAR (fetch REAL dates & times — never guess):
  - https://www.kiplinger.com/investing/economy/this-weeks-economic-calendar
  - https://www.investing.com/economic-calendar/
  - https://www.newyorkfed.org/research/calendars   (release times, ET)
  - the NEXT FOMC meeting date + current Fed-chair stance, plus the next
    CPI, PCE, and Nonfarm-Payrolls (NFP) release dates with forecast/prior.

OUTPUT: write exactly one file to news/report.json that conforms to
news/report.schema.json AND passes `node news/lint.js --strict`.

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
       - macro{}: the economic-calendar block rendered as TOP TILES below the hero.
                  MANDATORY. Use real, verified dates/times (ET). Shape:
           macro.headline : one-line summary of today's / this week's macro story
           macro.regime   : rate/policy regime read; text before an "—" becomes a
                            pill badge, e.g. "HAWKISH TILT — markets price a hike…"
           macro.keyEvents[] : 3–5 HEADLINE tiles — ALWAYS include Fed rate
                            decision (next FOMC), Jobs/NFP, and CPI; add ADP/PCE/
                            PPI when relevant. Each: { label, value (date/time),
                            detail (forecast vs prior + why it matters),
                            when: today|tomorrow|week|ahead, tone: pos|neg|neu }
           macro.today[]    : today's scheduled releases & Fed speakers
           macro.tomorrow[] : tomorrow's scheduled releases
           macro.week[]     : Mon→Fri week-at-a-glance, each with status
                            done|today|ahead
           today/tomorrow items: { time, event, importance: high|med|low,
                                   forecast, prior, tone }. Use "—"/"n/a" to hide
                                   forecast/prior. importance drives the dot color
                                   (high=red, med=amber, low=grey).

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
Refresh news/report.json with TODAY's actual headlines (do NOT reuse
yesterday's content from any report.YYYY-MM-DD.json file — those are diff
baselines only). Keep the exact JSON schema. Update: date, mood[], macro{}
(today/tomorrow/week + keyEvents: Fed/NFP/CPI with verified dates), news[]
(12–20 cards with sentiment dots), leaderboard, otherStories, tickerTable,
sectorHeatmap, actionSummary.

Then run the lint loop until clean, then daily.js:
   node news/lint.js --strict --fix-prompt   # repeat until exit 0
   node news/daily.js
```

---

## 🧱 Why split content (JSON) from rendering (HTML)?

The LLM writes `report.json` (slow, creative). A 200-line script renders
HTML deterministically (fast, no drift). Same JSON in any LLM = byte-identical
HTML. See **INSTALL.md** → *Why this split matters* for the full comparison
table.

---

## 🧪 Verifying the agent's output (the lint loop)

The linter is your safety net. It catches missing sections, weak narratives,
placeholder text, missing Fed/NFP/CPI tiles, etc. Use it as a hard gate:

```bash
# 1. Lint — exit code is the contract (0 = pass, 1 = errors, 2 = bad file)
node news/lint.js --strict --fix-prompt

# If exit 1:
#   → lint.prompt.md was written with a complete fix list
#   → tell the agent: "Read news/lint.prompt.md, fix only those errors, save report.json"
#   → re-run lint.js until exit 0
#
# Then:
node news/daily.js   # snapshots, renders, diffs, scoreboard — all guarded
```

### What the linter checks (high signal)

| Code  | Catches |
|-------|---------|
| E001-E011 | Top-level: macro block + Fed/NFP/CPI tiles, mood, ticker table, leaderboard |
| E101-E109 | Each card: valid sentiment/confidence/priority, L1/L2/L3 ≥ 80 chars, no placeholders, beneficiaries/victims present, full D/W/M/L timeline |
| W201-W209 | Warnings: thin ticker counts, weak L2/L3 narratives, missing categories |
| Q301-Q303 | Consistency: tickers in news vs tickerTable vs sectorHeatmap |

```bash
# Run modes:
node news/lint.js                    # human-readable, exit 0 unless errors
node news/lint.js --strict           # same — explicit
node news/lint.js --warn-as-error    # also fail on warnings (very picky)
node news/lint.js --json             # machine output, for piping to agents
node news/lint.js --fix-prompt       # write lint.prompt.md for agent to read
```

### Manual sanity checks (if you want to peek without lint.js)

```bash
node -e "
const r = require('./news/report.json');
console.log('date:',     r.date);
console.log('news cards:',r.news?.length);
console.log('tickers:',  r.tickerTable?.length);
console.log('all news have L1/L2/L3:',
  r.news.every(n => n.levels?.L1 && n.levels?.L2 && n.levels?.L3));
console.log('macro keyEvents:', r.macro?.keyEvents?.length, '(want Fed/Jobs/CPI)');
"
```

---

## 💡 Tips for getting consistent results across LLMs

1. **Pin sources.** The copy-paste prompt above lists exact URLs — keep them.
2. **Quantify counts.** "12–20 headlines" beats "many headlines."
3. **Force priority distribution.** Add: *"At least 3 cards must have priority ≥ 8."*
4. **Force ticker discipline.** Scores must be in {−3,−2,−1,+1,+2,+3} (never 0).
5. **Lean on the linter.** It catches drift automatically; don't ask the LLM
   to "validate against the schema" — just tell it to **run `node news/lint.js
   --strict` and fix anything that fails**.
6. **Give the agent permission to skip locked sources.** Some sites return 401/403
   to non-browser User-Agents; tell the agent to skip rather than retry forever.

---

## 📦 What you commit to the repo

See **`INSTALL.md`** → *Repo layout suggestion* for the full file inventory
and `.gitignore` policy. `daily.js` auto-prunes old snapshots, so each
day's commit only stages today's report + yesterday's snapshot.
