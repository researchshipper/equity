# 📋 Market Beat — LLM Prompt (paste this into any agent)

> **Goal:** get the agent to spend its time on *content quality* and write a
> structured `report.json` file. **Do not let the LLM write HTML.**
> A 200-line deterministic renderer (`render.js`) converts JSON → HTML in <50ms.

---

## 🔁 The workflow (now 0→4)

```
PHASE 0 — Pull REAL data first (numbers you will anchor everything to):
              node news/marketdata.js --print     → marketdata.json (live index/oil/rates/VIX/BTC/FX)
              node news/insiders.js fetch          → insiders.json (current 7d+30d clusters for dual tables)
              node news/insiders.js score          → updates 7/30/90d forward-return scorecard
              node news/insiders.js render         → insiders.block.html (top-of-report block)
PHASE 1 — RESEARCH + outline in plain text. Spend real time here. Read today's
              headlines from the source URLs, THEN form a multi-view thesis:
              what moved, by how much (use marketdata.json numbers), and WHY —
              argued bull / base / bear. Don't settle for one narrative.
PHASE 2 — Serialize the outline into news/report.json (FIXED filename — overwrite it).
              Set date, time ("9:35a ET"), generatedAt (ISO). Anchor every mood/
              macro number to marketdata.json. Write the marketCommentary section.
PHASE 3 — Lint loop: node news/lint.js --strict --fix-prompt
              if exit ≠ 0 → read news/lint.prompt.md, fix listed errors only,
              re-run lint until exit 0 (max 3 retry passes).
              ⚠️ E012 = a number disagrees with live data — copy the real value
              from marketdata.json, never hand-type levels from memory.
PHASE 4 — node news/daily.js --strict
              **Required final step.** Refreshes data (marketdata + insiders), lints,
              refreshes timestamp to NOW, renders the full dashboard HTML (with dual 7d+30d
              insiders + rich macro + marketCommentary), runs validate.js --strict,
              copies final standalone HTML to uploads/marketbeat_final_YYYY-MM-DD.html.
              All data files (report.json, marketdata.json, insiders.json) are temporary
              per run — .gitignore keeps them out of commits. No diff, no previous rotation,
              no jsonl history. Each run is fully standalone for that moment's news.
              Always use --strict (guarantees 0 lint errors, validate pass, fresh ET timestamp).
```

> **Why pull data first?** The #1 failure mode was hand-typed/hallucinated
> numbers (index levels, oil, the 10Y, BTC). `marketdata.js` fetches the real
> prints; the linter's **E012 fact-check** then refuses any mood/macro number
> that drifts beyond tolerance from live data. Run `node news/marketdata.js
> --print` to get a paste-ready `mood[]` seed built from the truth.

Why split content from rendering? An LLM that hand-writes HTML produces
inconsistent style across runs and across providers. By writing structured
JSON validated by a schema + linter, **any LLM gives byte-identical HTML**.

Why fixed filenames? Date-suffixed files (`report.2026-06-03.json`, etc.)
accumulate in the repo and confuse LLMs about which file is "the current one".
Fixed names = always 6 working files, dates live INSIDE each file, no ambiguity.

## 🚦 Critical rule (standalone): previous-day files (if any) are style references ONLY — never use as input or template. Start fresh every run.

The `news/` folder uses **fixed filenames** that never change day-to-day:

| File | Role |
|---|---|
| `news/report.json` | **Today's content** — you write this |
| (no report.previous in standalone) | Style reference only if present (not required) |
| `news/marketbeat_report.html` | Today's rendered HTML — `render.js` produces it |
| (temp if present) | Previous HTML only for visual style reference (optional) |
| (removed) | No diff in standalone mode |
| (none) | No history logs / diff / previous in standalone mode — each run is self-contained for the current moment |

> **Standalone mode** — no history logs; repo stays minimal (code + final HTMLs only)
> Each run produces a fresh self-contained HTML. Data files are temporary.
> don't need to manage retention manually.

The date lives **inside** each file (in JSON's `.date` field and the HTML
`<title>` + header). Filenames stay constant — no confusion about which is
"current" vs "old".

**Previous HTML (if present) is for visual style reference only** —
*visual structure* you should match (section ordering, ticker formatting,
narrative depth, color scoring conventions).

**Never:**
- copy yesterday's headlines into today's report
- reuse yesterday's narratives, ticker scores, beneficiaries, or victims

- no rotation in standalone mode

**Always:**
- fetch TODAY's actual headlines from the source URLs below
- write `report.json` from scratch, then let `daily.js` handle rotation + diff

The reason: if you copy yesterday's content, the diff is meaningless and you
miss today's actual news. The previous HTML is just a style guide.

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

The linter validates ALL 8 committed files: `report.json` schema + content
quality, final HTML, dual insiders, rich macro (standalone: no history)

to their source JSON, plus cross-file consistency (dates aligned across
report ↔ scoreboard ↔ history). **Every error must be resolved before
committing.** Run with `--fix-prompt` to get a remediation list.

## ✅ Copy-paste prompt (works with Claude / GPT / Gemini / Grok / Kimi / Qwen)

```
You are a senior equity-research analyst. Produce a Market Beat news-impact
report. Use this workflow:

  PHASE 0 — pull REAL data first, then anchor everything to it:
              node news/marketdata.js --print   (live numbers + paste-ready mood seed)
              node news/insiders.js fetch        (market-wide insider cluster buys)
              node news/insiders.js score        (7/30/90d forward-return scorecard)
              node news/insiders.js render       (top-of-report insider block)
  PHASE 1 — RESEARCH + outline in plain text. Read today's headlines, then form a
              MULTI-VIEW thesis (bull / base / bear) on why the tape moved. Spend
              real effort; don't ship one flat narrative.
  PHASE 2 — serialize that outline into one valid news/report.json
              (set date + time + generatedAt; anchor numbers to marketdata.json;
               write the marketCommentary section)
  PHASE 3 — LINT LOOP: `node news/lint.js --strict --fix-prompt`
              if exit code != 0:
                read news/lint.prompt.md
                fix ONLY the listed errors in report.json
                (E012 = a number disagrees with live data → copy the real value
                 from marketdata.json; never hand-type levels from memory)
                re-run lint.js — loop until exit 0 (max 3 passes)
              Then also run: node news/validate.js --strict   # catches dual insiders + rich macro style
  PHASE 4 — `node news/daily.js --strict`  (data refresh, snapshot, render, diff, links, scoreboard)
              **This is the required final step** for any commit / production report.
              - Always run with `--strict` unless you have a very specific reason (e.g. temporary data source outage you are intentionally skipping).
              - This guarantees:
                • Fresh timestamps (time + generatedAt)
                • Lint passes with 0 errors
                • validate.js passes (dual 7d+30d insiders + rich macro style + card count)
                • Proper rotation of previous files
   • Final standalone HTML copied to uploads/marketbeat_final_YYYY-MM-DD.html (with fresh timestamp)
              • All data (report/marketdata/insiders/*.jsonl) are temporary and gitignored.
              After daily.js --strict succeeds, you can optionally re-run `node validate.js --strict` for extra confirmation.

Do NOT generate HTML yourself. A 200-line renderer handles that.

═══════════════════════════════════════════════════════════════════════
🚦 CRITICAL — PREVIOUS-DAY REPORT IS DIFF BASELINE, NOT INPUT 🚦

If news/report.YYYY-MM-DD.json files exist from prior days:
  • DO NOT read them as a source.
  • DO NOT copy their headlines, narratives, tickers, or scores.
  • DO NOT seed today's report from yesterday's content.

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
       - date, time ("9:35a ET"), generatedAt (ISO) — the timestamp lets multiple
         same-day runs be told apart in the header + title.
       - marketCommentary{}: the holistic, MULTI-VIEW read rendered near the top.
         MANDATORY when a sector or basket is clearly up/down. Shape:
           headline : one line, e.g. "Semis lead a risk-off tape as oil spikes"
           summary  : 2-4 sentences — what moved, how much (real numbers), the driver
           drivers[]: 3-6 "THEME/TICKER — mechanism" lines pushing the tape
           views{}  : { bull, base, bear } — same facts, three lenses
           whatWouldChangeMind[] : 2-4 falsifiers that would flip the base case
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

## 🔒 DETERMINISTIC REQUIREMENTS — MUST FOLLOW EXACTLY (prevents drift across LLMs)

**Insider Cluster Buys (MANDATORY dual view):**
- Final rendered HTML **must** contain TWO separate tables:
  1. "Last 7 days — aggressive latest buys" (recent, timely signals)
  2. "Last 30 days — smoother aggregate (primary filter)" (your main 30-day view)
- Top header must read exactly: **🟢 Insider Cluster Buys — 7d (aggressive recent) + 30d (smoother primary)**
- Note must contain: "7-day (aggressive/recent latest buys) + 30-day (smoother aggregate — primary filter for signals). Strong net buying pressure in 90-day window (purchases outweigh sells). Scorecard tracks 7d/30d/90d forward returns."
- Use the current insiders.json (it already contains both clusterBuys and clusterBuys7d).

**Macro Tiles — Exact Analytical Style (MANDATORY, neutral & data-anchored):**
Use the reference style from previous good reports. Examples of required tone + detail:
- JOLTS: "Tue Jun 2 JOLTS Job Openings (Apr): 7.62M, 2-yr high (vs 6.87M est) — re-fired hike chatter"
- ADP: "May ADP +122k (vs +118k fcst, prior +105k). Stronger print keeps labor market resilience narrative intact and supports hawkish tilt (higher jobs reduce odds of near-term cuts)"
- Always include: specific number vs forecast/prior + clear implication for rates/Fed/markets/stocks/sectors.
- Regime pill examples: "HAWKISH TILT — ...", "Pre-NFP drift: ..."
- NEVER make directional calls ("bullish"); stay analytical/neutral/explanatory.

**Other hard rules:**
- 12–20 news cards (not 8 or fewer).
- Full marketCommentary with explicit {bull, base, bear} views.
- All L1/L2/L3 must be rich (≥80 chars, with peers/suppliers/macro links).
- Run the full lint + validate until clean.

SCORING RUBRIC (BE STRICT):
  +3 strong direct beneficiary       -3 strong direct victim
  +2 clear beneficiary               -2 clear victim
  +1 mild / sympathy tailwind        -1 mild headwind
   0 neutral (omit unless useful)

STYLE:
  - Analyst voice. Specific numbers (price moves, multiples, dollar amounts).
  - ANCHOR every market level to marketdata.json — never hand-type index/oil/
    rate/BTC/FX levels from memory. If you can't verify a macro figure, mark it
    "est." instead of inventing precision.
  - Argue MORE THAN ONE VIEW in marketCommentary (bull / base / bear). Synthesis
    beats a single flat narrative.
  - Trace 2nd- and 3rd-order effects (e.g. PANW beat → ZS/CRWD/FTNT peer bid
    → enterprise security spend crowding out CRM/WDAY share-of-wallet).
  - Always name PEERS, SUPPLIERS, CUSTOMERS as L2 ripple.
  - L3 should connect to macro: rates, USD, CPI, oil, geopolitics, regulation.

DO NOT:
  - Output HTML.
  - Hand-type or hallucinate market numbers (E012 will reject them).
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

Then run the lint loop until clean, then:
   node news/lint.js --strict --fix-prompt   # repeat until exit 0
   node news/validate.js --strict
   node news/daily.js --strict               # REQUIRED for final committed output (fresh timestamps + full validation)
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

### What the linter checks (all 8 committed data files)

| Code | File / area | Catches |
|---|---|---|
| **E001–E011** | `report.json` top-level | macro block + Fed/NFP/CPI tiles, mood, ticker table, leaderboard |
| **E101–E109** | each news card | valid sentiment/confidence/priority, L1/L2/L3 ≥ 80 chars, no placeholders, beneficiaries/victims, full D/W/M/L timeline |

| **E501–E504** | `marketbeat_report.html` | exists, title date matches `report.json.date`, has macro section, card count matches |
| **E602/E702** | `*.previous.html` / `*_diff.html` | title date matches the right source file |

| **C901–C904** | cross-file consistency | report ↔ scoreboard ↔ history dates all align; tickers in `tickerTable` appear in today's scoreboard |
| **W201–W209** | warnings (don't block) | thin tickers, weak narratives, missing categories |

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

See **`INSTALL.md`** → *Repo layout suggestion*. In standalone mode:
- Only commit the *code* (PROMPT.md, *.js, schema, etc.) once.
- The final dashboard HTML goes to `uploads/marketbeat_final_YYYY-MM-DD.html`.
- Never commit report.json / marketdata.json / insiders.json / any .jsonl (all temporary, gitignored).
- Each run is fire-and-forget for that timestamp's news + data.
