# DEV_NOTES — Equity Research Stack (stock_analyzer)

Running log of what was built, why, and where to resume. Companion to
`stock_analyzer/STOCK_RESEARCH_MASTER.md` (the agent playbook).

---

## Core principle (do not break)

**Every number in a report must come from Yahoo and be double-verified — never LLM recall.**
- `stockfetch.js` fetches live data and computes all math deterministically → writes `{TICKER}_data.json`.
- `stockmd.js` re-fetches live, cross-checks the report's `DATA_INTEGRITY` line, and renders the
  ✅ VERIFIED / ⚠️ PARTIAL / ❌ DRIFT badge.
- The LLM only writes prose + the trade plan levels (ENTRY/STOP/T1/T2) and the `CONFIRM` trigger.

Proof this matters: when the quality metrics were hand-written by the LLM, it guessed ANET's
Piotroski F-Score at **7/9**; the deterministic engine computed **4/9** from the actual annual
statements (ROA, current ratio, gross margin, asset turnover all slipped YoY as the balance
sheet grew faster than profit). Always compute, never recall.

---

## Architecture

```
lib/
  indicators.js   Wilder RSI/ATR/ADX, SMA, MACD
  valuation.js    capital-structure-aware ROIC / WACC / value spread (+regime detection)
  sanity.js       outlier clamp + coherence linter (BUY vs ROIC<WACC, BUY vs RSI<30)
  quality.js      ★NEW★ Piotroski F-Score, Earnings Quality, EVA, Margin of Safety, 0–10 composite
stock_analyzer/
  stockfetch.js   fetch live Yahoo (quoteSummary + chart + fundamentalsTimeSeries) → {TICKER}_data.json
  insiderfetch.js SEC EDGAR Form-4 scraper → insider conviction score (1–10)
  stockmd.js      reads report.txt + data.json → renders dark-theme tabbed HTML
tests/
  test_quality.js 16 unit tests for lib/quality.js (all passing)
```

---

## Session history

### 1. Baseline ANET deep-dive
Ran the `stock_analyzer` workflow on ANET. Peers: CSCO, NVDA, AVGO, HPE (dropped JNPR — acquired
by HPE/delisted; dropped CIEN — Yahoo returned glitched price). Verdict: **BUY, 4★**.

### 2. Fixed the dangling "add ¼ on confirmation" trade instruction
- Added a `CONFIRM=` field to the `TRADE` schema in `stockmd.js` (parsed) + a "📈 Scale-In /
  Confirmation Trigger" render box, and wired the previously-parsed-but-unshown `AVOID=`.
- Documented `CONFIRM` as **mandatory whenever SIZE is scaled** in `STOCK_RESEARCH_MASTER.md`
  (8 schema/example/glossary spots updated).

### 3. Compared with yennanliu/InvestSkill, then merged the best of it
InvestSkill is a pure *prompt* framework (21 Claude/Cursor/Gemini skills, no executable code,
no live fetch). Its standout content: Piotroski F-Score, Earnings Quality, EVA, Margin of Safety,
0–10 weighted scorecard. We ported those as **deterministic code** (`lib/quality.js`) fed by Yahoo
`fundamentalsTimeSeries` annual statements (the legacy `*History` modules have returned ~nothing
since Nov-2024).
- `stockfetch.js` now computes the quality block and a composite baseline (ex-insider) and prints
  them on the `DATA_INTEGRITY` line (`FSCORE EVA_SPREAD CASH_CONV MOS COMPOSITE`).
- `stockmd.js` renders the 🏅 Quality & Scoring panel: F-Score breakdown (⚠️ marks fields Yahoo
  can't supply — scored 0, never estimated), weighted-composite bars (insider folded in), and an
  Exact-Fundamentals annual-statement table.

### 4. ★THIS SESSION★ Extended quality to peers + cash-conversion guard
- **Peer-wide quality:** `stockfetch.js` now fetches statements for *every* ticker (primary +
  peers) and computes a quality block + composite for each, so scores are comparable. New stdout
  "Peer Quality Comparison" block.
- **Peer-comparable HTML table** added to `stockmd.js` (F-Score / Cash Conv. / EVA Spread /
  Margin of Safety / Composite across all tickers, primary ★-highlighted).
- **Earnings-quality guard:** cash-conversion (CFO/NI) is now suppressed (shows "—", verdict
  "N/M") when net income is ≤0 or <1% of revenue, so a near-zero denominator can't print a
  misleading ratio (HPE was showing 51x; now correctly "—"). Added `cashConvReliable` flag.

Latest peer comparison (2026-05-31, ex-insider composite):

| Ticker | F-Score | Cash Conv | EVA Spread | MoS | Composite |
|--------|---------|-----------|-----------|-----|-----------|
| ANET ★ | 4/9 | 1.25x | +11.6% | 15.3% | 8.0 BULLISH |
| CSCO | 8/9 | 1.39x | +6.0% | 4% | 6.2 BULLISH |
| NVDA | 4/9 | 0.86x | +61.9% | 28.9% | 9.0 BULLISH |
| AVGO | 8/9 | 1.19x | +5.2% | 7.3% | 7.8 BULLISH |
| HPE | 5/9 | — (N/M) | −4.5% | −43.9% | 3.4 BEARISH |

(ANET's report composite is 7.3/10 *with* its bearish insider score folded in — that step is
primary-only by design.)

---

## Known limitations / gotchas

- **Node version:** sandbox runs Node 20; `yahoo-finance2` prints a "requires Node ≥22" warning.
  Non-fatal — all fetches succeed. Production should use Node ≥22.
- **Piotroski leverage criterion** often shows ⚠️ n/a for zero-debt names (ANET, NVDA) because
  Yahoo's `fundamentalsTimeSeries` returns no debt field for them. The engine scores it 0 and
  reports `evaluated < 9` rather than inventing a value. This makes F-Scores for debt-free
  compounders look optically lower — read alongside the `evaluated` count.
- **fundamentalsTimeSeries coverage** varies by ticker/locale; if <2 annual rows return,
  `quality.available=false` and the panel/row degrade gracefully.
- **Composite weights** live in `lib/quality.js` `compositeScore()` (Fundamentals 25→folds
  catalysts, Quality 20, Valuation 20, Technical 15, Insider 10). Tune there if desired.

---

## Where we paused — candidate next steps

1. **Per-criterion verification badge against an independent source** (deferred). Cross-check the
   F-Score inputs (e.g. revenue, net income) against a second feed (stockanalysis.com / SEC
   companyfacts) and show a ✓ per row. Keeps the "double-verify" promise literal.
2. **Persist peer composite into the peer KPI table** at the top of the Peer Comparison section
   (currently the new quality table lives in the Scenarios tab; could echo a Composite column in
   the main peer table too).
3. **Sector-relative banding** — grade F-Score/composite vs the peer median rather than absolute
   thresholds, so a "4/9" debt-free grower isn't unfairly dinged.
4. **Push upstream** — these edits live in the local clone only; commit `lib/quality.js`,
   `tests/test_quality.js`, the `stockfetch.js`/`stockmd.js` diffs and the `STOCK_RESEARCH_MASTER.md`
   updates back to the `finaltest` branch (no push access from here).

---

## How to run (from `stock_analyzer/`)

```bash
npm install yahoo-finance2 --silent
node stockfetch.js ANET CSCO NVDA AVGO HPE     # → ANET_data.json (+ quality for all)
node insiderfetch.js ANET                       # → SEC Form-4 conviction score
# write ANET_report.txt (prose + DATA_INTEGRITY copied from stockfetch stdout)
node stockmd.js ANET_report.txt                 # → anet_rich_report.html
node ../tests/test_quality.js                   # 16 unit tests
```

*Not financial advice. Research/educational use only.*
