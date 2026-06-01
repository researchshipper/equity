# 📈 STOCK RESEARCH MASTER PLAYBOOK
> **One-file playbook.** Upload this single `.md` in any new agent-mode chat and say: `Analyze ticker {TICKER}`.
> This file holds the **workflow, prompt, text-report contract, validation gates, and glossary**. The
> executable scripts (`stockfetch.js`, `insiderfetch.js`, `report_linter.js`, `stockmd.js`) and the shared
> `../lib/*.js` are **installed once via the FASTER SETUP curl block** — they are NOT pasted in here on purpose.

> **🛠️ MAINTAINER / AGENT NOTE — do not "fix" by re-embedding code.** This playbook intentionally
> references the scripts by `curl` rather than inlining their source. That keeps the file small and keeps
> one source of truth in the repo. Do **not** delete the curl block, and do **not** paste script source back
> into this file. To change behavior, edit the script in the repo, not this playbook.

---

## ⚡ QUICK START (copy-paste into a new chat after uploading this file)

```
Analyze ticker {TICKER} using the STOCK_RESEARCH_MASTER workflow.
Install the scripts via the FASTER SETUP curl block, then run stockfetch.js FIRST to download live Yahoo Finance data.
Anchor ALL numbers on the downloaded JSON before doing any research.
Copy the ENTIRE DATA_INTEGRITY stdout line from stockfetch.js — including FSCORE, EVA_SPREAD, CASH_CONV, MOS, COMPOSITE — verbatim into the report.
Then write the plain-text report.
‼️ MANDATORY GATE: run `node report_linter.js {TICKER}_report.txt` BEFORE generating any HTML.
   If it prints STATUS: FAILED, read the errors, regenerate the report, and re-run. Only proceed when it prints STATUS: PASSED.
Only then, run `node stockmd.js {TICKER}_report.txt` to produce the HTML. NEVER generate HTML/JS/CSS manually — stockmd.js does it all from scratch with live data refresh, interactive tooltips, and the correct dark theme.
```

---

## 🗑️ Before starting a NEW ticker analysis, DELETE old files:

```
rm -f {PREVIOUS_TICKER}_data.json {PREVIOUS_TICKER}_report.txt {prev_ticker}_rich_report.html
```

This removes the **previous report's LLM-generated files** — only 3 files get deleted.

**NEVER delete these files (they are setup permanents):**
- STOCK_RESEARCH_MASTER.md
- stockfetch.js
- stockmd.js
- insiderfetch.js
- report_linter.js
- README.md
- ../lib/ (indicators.js, sanity.js, valuation.js, quality.js)

**At any given time, the workspace should contain:**
```
PERMANENT (6 + lib): STOCK_RESEARCH_MASTER.md, stockfetch.js, stockmd.js, insiderfetch.js, report_linter.js, README.md, ../lib/*.js
CURRENT  (3): {TICKER}_data.json, {TICKER}_report.txt, {ticker}_rich_report.html
```

---

## ⚡ FASTER SETUP (download JS once, reuse forever)

```bash
# Scripts (run from the stock_analyzer/ working dir):
curl -sLO https://raw.githubusercontent.com/researchshipper/equity/main/stock_analyzer/stockfetch.js
curl -sLO https://raw.githubusercontent.com/researchshipper/equity/main/stock_analyzer/stockmd.js
curl -sLO https://raw.githubusercontent.com/researchshipper/equity/main/stock_analyzer/insiderfetch.js
curl -sLO https://raw.githubusercontent.com/researchshipper/equity/main/stock_analyzer/report_linter.js
curl -sLO https://raw.githubusercontent.com/researchshipper/equity/main/stock_analyzer/run_pipeline.js
# Shared libs (one level up, in ../lib/):
mkdir -p ../lib
curl -sL https://raw.githubusercontent.com/researchshipper/equity/main/lib/indicators.js -o ../lib/indicators.js
curl -sL https://raw.githubusercontent.com/researchshipper/equity/main/lib/sanity.js     -o ../lib/sanity.js
curl -sL https://raw.githubusercontent.com/researchshipper/equity/main/lib/valuation.js  -o ../lib/valuation.js
curl -sL https://raw.githubusercontent.com/researchshipper/equity/main/lib/quality.js    -o ../lib/quality.js
npm install yahoo-finance2 --silent
```

**This is the only setup you need.** The four scripts + four libs above are the entire system.
curl is faster than copy-paste and eliminates transcription bugs. If a download fails, check
network/proxy settings rather than re-typing source by hand.

---


## 🧠 DOUBLE VERIFICATION DIRECTIVE
Act as an elite institutional equity analyst. You must **double-verify** all qualitative inputs (supply chain dependencies, historical catalysts, competitor positioning) using multiple trustworthy sources. Ensure all valuation math (WACC, DCF targets, Blended Averages) is logically sound and accurately reflects the current macro environment.

**ALT_DATA RULE:** Each `ALT_DATA` item must EITHER cite a real source you found via `web_search` (e.g. "Per LinkedIn data, AI engineer postings +40% QoQ"), OR be explicitly prefixed with `HYP:` to mark it as an unverified hypothesis. Never present an unsourced figure as measured fact.

## 🚨 PATCH OVERRIDE — AUTHORITATIVE DECISION FRAMEWORK

If this playbook's embedded code differs from the local repo files, the local repo files are authoritative. In particular:
- `stockfetch.js` must use the same valuation engine as `stockmd.js` / `../lib/valuation.js`
- the LLM should anchor on the **headline ROIC**, **WACC**, and **value spread** written into `{TICKER}_data.json`
- if `stockfetch.js` exposes `roicNaive`, `roicAdjusted`, `valueSpread`, or `valuationBasis`, use those fields directly rather than recomputing from memory

## 🏅 DETERMINISTIC QUALITY ENGINE (`../lib/quality.js`)

`stockfetch.js` now pulls Yahoo **annual financial statements** via `fundamentalsTimeSeries`
(the legacy `*History` modules return almost nothing since Nov-2024) and computes a full
quality block in code — never by LLM recall. The primary ticker's `{TICKER}_data.json`
gains a `quality` object and a `composite` object:

- **Piotroski F-Score (0–9)** — 9 binary criteria on the two latest fiscal years. Criteria
  whose Yahoo fields are missing are marked `⚠️ n/a` (scored 0, never estimated) and the
  `evaluated` count is shown. Verdict: 8–9 strong · 5–7 average · 0–4 weak.
- **Earnings Quality** — accruals ratio `(NI − CFO)/avg assets` (negative = cash-backed) and
  cash-conversion `CFO/NI` (≥1.0x healthy, <0.7x suspect).
- **Economic Value Added (EVA)** — `(ROIC − WACC) × invested capital`, consistent with the
  headline value spread from `valuation.js`.
- **Margin of Safety** — discount of price to the Yahoo analyst-mean target, banded
  (>30% compelling · 10–30% attractive · 0–10% fair · <0 premium).
- **Composite Score (0–10)** — deterministic weighted blend of fundamentals, quality
  (F-Score + EVA + cash conversion), valuation (margin of safety), technicals, and insider
  score. `stockfetch.js` writes a baseline (ex-insider); `stockmd.js` recomputes it with the
  SEC insider score folded in and renders the 🏅 Quality & Scoring panel + Exact Fundamentals
  annual-statement table.

**RULE:** The F-Score, EVA, cash-conversion, margin-of-safety and composite shown in the
report MUST be the values printed by `stockfetch.js` / stored in `{TICKER}_data.json`. Never
hand-write these — they are measured, and the LLM frequently guesses them wrong (e.g. it will
assume a fast-grower has F-Score 7/9 when balance-sheet growth outpacing profit makes it 4/9).
Copy `FSCORE`, `EVA_SPREAD`, `CASH_CONV`, `MOS`, `COMPOSITE` from the stdout `DATA_INTEGRITY`
line into the report's `DATA_INTEGRITY` line so they are double-verified.

### Verdict rules
The final call must synthesize **valuation, supply chain, insider signal, technical setup, and ROIC/WACC value spread**.
- Positive value spread strengthens conviction
- Negative value spread must be discussed explicitly, not ignored
- If technicals are weak but the fundamental call is bullish, explain why timing risk is acceptable
- If technicals are strong but value spread / fundamentals are weak, avoid issuing a lazy momentum-only BUY

### Required decision transparency
The report should explicitly state what is carrying the call and how much weight each factor has.
Add these keys when possible:
- `THESIS_WEIGHTS:` e.g. `Valuation=30% | Technicals=20% | Value_Spread=20% | Supply_Chain=15% | Catalysts=10% | Insider=5%`
- `TECH_SETUP:` one short paragraph on how the technical structure affects conviction and timing
- `FOLLOW_THE_CASH:` pipe-separated bullets on cash generation, capex intensity, working capital, buybacks/dividends, or finance-arm considerations
- `PRE_MORTEM:` pipe-separated bullets describing the most likely reasons the thesis could fail over the next 6–18 months

### Value spread interpretation guardrails
- `Value Spread > +5%` → supports BUY / STRONG BUY if the rest of the thesis is coherent
- `+1% to +5%` → mildly supportive; do not overstate it
- `0% to -3%` → caution; conviction must be tempered or justified with a specific catalyst
- `< -3%` → treat as a real warning sign unless a documented capital-structure artifact explains it

## 🔄 EXECUTION ORDER

**The golden rule: DATA FIRST, RESEARCH SECOND, TEXT THIRD, LINT FOURTH, HTML LAST.**

```
STEP 0 ── DELETE old report files from previous analysis
 rm -f {PREVIOUS_TICKER}_data.json {PREVIOUS_TICKER}_report.txt {prev_ticker}_rich_report.html
STEP 1 ── Agent identifies 4-5 peers (AI reasoning only, no data needed)
STEP 2 ── Run stockfetch.js → writes {TICKER}_data.json ← ANCHOR POINT
STEP 2b ─ Run insiderfetch.js → reads definitive SEC insider trades
STEP 3 ── Agent reads {TICKER}_data.json → does web research
 ALL numbers in the report MUST come from the JSON.
STEP 4 ── Agent writes {TICKER}_report.txt in PLAIN TEXT FORMAT
STEP 4b ─ ⚠️ MANDATORY SCHEMA LINTER: Run `node report_linter.js {TICKER}_report.txt`
 If report_linter.js prints "STATUS: FAILED", read the errors, REGENERATE the report, and re-run.
 ONLY proceed when report_linter.js prints "STATUS: PASSED".
STEP 5 ── ⚠️ MANDATORY HTML GENERATION: Run `node stockmd.js {TICKER}_report.txt` → writes {ticker}_rich_report.html. NEVER write the HTML yourself.
```

---

## STEP 1 — PEER IDENTIFICATION RULES

Pick 4–5 peers. Rules:
- Same sector is not enough — must overlap in business model, customer wallet, or platform economics
- Include ≥3 direct peers and ≥1 aspirational/valuation comp
- Output peer list before proceeding: `PEERS: SYM1 SYM2 SYM3 SYM4 SYM5`

Examples:
- GEHC → SYK BSX MDT ISRG EW
- GOOG → MSFT META AMZN AAPL NFLX
- AMZN → MSFT GOOG WMT BABA MELI
- ZS → PANW CRWD NET OKTA FTNT
- HUBS → CRM NOW WDAY NET ZM

---

## STEP 2 — DATA FETCHER: `stockfetch.js`

**Run `stockfetch.js` (installed via FASTER SETUP) BEFORE writing any research.**

```bash
# Install dependency if needed:
npm install yahoo-finance2

# Run:
node stockfetch.js {TICKER} {PEER1} {PEER2} {PEER3} {PEER4} {PEER5}
# Writes: {TICKER}_data.json
```

> **Source of truth: `stock_analyzer/stockfetch.js` in the repo.** It is installed by the
> FASTER SETUP `curl` block above — do **not** paste, inline, or re-embed the source here.
> This playbook describes how to *use* the script, not how to rebuild it. If you are an
> agent editing this repo: the script is intentionally not embedded; removing the curl line
> breaks setup. Leave it.

**What `stockfetch.js` does (so you can trust its output):**
- Pulls live quote, key stats, financial data, ESG, and 1y daily history from Yahoo (`yahoo-finance2`).
- Pulls **annual financial statements** via `fundamentalsTimeSeries` (`type:'annual', module:'all'`) — the
  legacy `*History` modules return almost nothing post-Nov-2024, so this is the correct path.
- Computes a unified valuation block (ROIC, WACC, value spread) and a deterministic **quality block**
  in code via `../lib/quality.js`: Piotroski F-Score, earnings quality, EVA, margin of safety, composite.
- Writes `{TICKER}_data.json` (with `quality` + `composite` objects on the primary ticker) and prints a
  `DATA_INTEGRITY:` line to stdout. **Copy that entire line verbatim into the report.**

## STEP 2b — INSIDER FETCHER: `insiderfetch.js`

**Run `insiderfetch.js` (installed via FASTER SETUP):**


```bash
node insiderfetch.js {TICKER}
```

> **Source of truth: `stock_analyzer/insiderfetch.js` in the repo** (installed by FASTER SETUP).
> Do not re-embed it. It queries the SEC EDGAR API directly for the last 6 months of Form 4
> buys/sells. Use its stdout to fill the `INSIDER:` line.

## STEP 3 — RESEARCH INSTRUCTIONS (after reading the JSON)

**Read `{TICKER}_data.json` completely before starting research.**
Every price, ratio, and return figure must match the JSON. Do not invent or estimate numbers.

### 3a — Web Research Required Sections

Run web searches for each. Use the live data numbers as anchors when writing commentary.

1. **Latest Earnings & Guidance** — `{TICKER} Q1 2026 earnings results guidance EPS revenue`
2. **Catalysts & News** — `{TICKER} 2026 catalysts analyst upgrade downgrade`
3. **Insider Activity** — Use the output from `node insiderfetch.js {TICKER}`. This script directly queries the SEC EDGAR API to give you the exact Form 4 Buys and Sells over the last 6 months.

4. **Competition / Moat** — `{TICKER} competitive moat 2026`
5. **AI Opportunity/Threat** — `{TICKER} artificial intelligence opportunity risk 2026`
6. **Supply Chain / Dependencies** — sector-appropriate dependencies
7. **Next Earnings Date** — `{TICKER} next earnings date 2026`

### 3b — Insider Signal Classification

Always classify insider transactions:

| Type | Signal |
|------|--------|
| Open-market purchase by CEO/CFO/director post-drawdown | ⭐ Strong bullish |
| Small open-market buy, single executive | Moderate bullish |
| RSU award / option grant / equity compensation | Noise — neutral |
| 10b5-1 planned sale / tax-withholding sell-to-cover | Noise — mild bearish |
| Large discretionary open-market sale, cluster selling | Strong bearish |

Insider conviction score: 1 (heavy sell) → 10 (cluster open-market buy)

### 3c — Assumptions & Defaults

Unless user says otherwise:
- Investor style: Momentum trader
- Risk: Medium
- Position: Half position (¼ starter, add ¼ on confirmation)
- Horizon: 3–6 months

---

## STEP 4 — PLAIN TEXT REPORT FORMAT

**Write `{TICKER}_report.txt` in exactly this format. No HTML. No JSON. No markdown.**
**DO NOT start writing the report without reading every rule in this section.**
One key per line. Use the JSON numbers exactly as fetched.

```
TICKER: ANET
NAME: Arista Networks, Inc.
PEERS: CSCO JNPR NTAP SMCI NVDA
DESC: Cloud Networking · AI Infrastructure · Data Center Switches
NEXT_EARNINGS: August 5, 2026
ELI5: Arista builds the super-fast switches...
SETUP: ANET is consolidating after a slight post-earnings dip...
STORY: Three paragraphs...

BULL: Point one | Point two
BEAR: Risk one | Risk two
VARIANT_PERCEPTION: Consensus Believes capex will destroy margins ~ We Believe proprietary silicon halves internal inference costs ~ Catalyst: Gross margins expand sequentially in Q3
ALT_DATA: Per SensorTower data, App store downloads up 15% YoY | HYP: Open job postings for AI engineers likely increased QoQ | HYP: Channel checks may show limited discounting on enterprise tiers
COMPETITIVE_ARENA: High-Speed Switching (800G) ~ Dominant ~ Over 40% market share in 400G+ ports | Enterprise Campus ~ Neutral ~ Expanding but still trails Cisco | AI Back-end Fabrics ~ Strong ~ Winning key designs in Meta/Microsoft clusters
SUPPLY: 🟢 Expanding 800G switch capacity | ✅ Securing CoWoS allocation from TSMC | 🔴 Vulnerable to China-Taiwan trade wars | ⚠️ High reliance on Broadcom ASIC roadmap
WHATS_NEW: Massive Q1 Beat | Broadcom supply constraints easing
PATTERN: [Pattern Name] | [Narrative Description]
RULE: If no textbook chart pattern (e.g., Bull Flag, Head & Shoulders) is present, you MUST synthesize a "Price Action Signal."
SYNTHESIS GUIDE:
- If Price ≈ 52w Low → "Bottom Fishing / Testing Support at 52w Lows"
- If Price ≈ 52w High → "Breakout Attempt / Testing 52w Highs"
- If Price is far below MA50/MA200 → "Strong Bearish Regime / Searching for Floor"
- If Price is between MA50 and MA200 → "Mean Reversion / Range Bound"
- If MA50 just crossed MA200 → "Golden/Death Cross Transition"
NEVER omit this key. Always provide a signal based on the data.
VAL_METHOD: High-growth networking requires PEG and EV/EBITDA normalization. WACC assumed at 8.5%, Terminal Growth at 4.0%. Blended Fair Value = (0.4 * Multiple) + (0.3 * DCF) + (0.3 * Analyst Target).
VAL_MATRIX:
ANET | 154.03 | 186.90 | 182.50 | 188.20 | 185.97 | +20.74% | Undervalued
CSCO | 120.41 | 124.02 | 122.50 | 124.45 | 123.70 | +2.73% | Fair Value
VAL_BASE: TARGET=185.97 | AI networking TAM expands | Margins hold
VAL_BULL: TARGET=220.00 | InfiniBand replacement accelerates | 800G upgrade cycle pulls forward
VAL_BEAR: TARGET=130.00 | Hyperscaler capex drops | Broadcom supply constraints choke shipments
SECTOR: Networking is bifurcating between legacy enterprise (weak) and AI cloud (hyper-growth).
PEER1: ANET dwarfs CSCO in net margins (38% vs 19%) due to software-first EOS.
PEER2: ANET is taking share from JNPR in routing.
SUPPLY: 🟢 Expanding 800G switch capacity | ✅ Securing CoWoS allocation from TSMC | 🔴 Vulnerable to China-Taiwan trade wars | ⚠️ High reliance on Broadcom ASIC roadmap
SUPPLY_UP: Broadcom (AVGO) - Merchant Silicon ASICs | TSMC (TSM) - Advanced Packaging
SUPPLY_DOWN: Microsoft (MSFT) - 26% of revenue | Meta (META) - 16% of revenue
SUPPLY_SIGNALS:
Broadcom | Supplier | Beat/Raised | Bullish demand for Tomahawk 5 silicon
Microsoft | Customer | Beat/Raised | Accelerating AI capex directly benefits ANET
SUPPLY_RISK: High | Systemic: Deep reliance on TSMC (Taiwan) for advanced node manufacturing exposes the company to severe geopolitical tailrisk. Idiosyncratic: Extreme reliance on Broadcom for merchant switching silicon. Margin Impact: Chokepoints in CoWoS packaging could artificially constrain supply and compress gross margins by 150-200 bps if alternative sourcing is required.
INSIDER: SCORE=7 SENTIMENT=Bullish BUYS=... SELLS=... SIGNAL=Signal analysis text
AI_OPP: Ethernet replacing InfiniBand in AI clusters | ...
AI_THR: Nvidia Spectrum-X end-to-end bundling | ...
AI_NET: Arista is the primary beneficiary of the open Ethernet AI standard.
CATALYSTS_HIST:
2026-05-05 | Q1 Earnings | Earnings | Negative | Beat EPS but fell 13% on supply worries
2026-05-19 | JP Morgan Conf | Event | Positive | Shipment growth 54% YoY
RISKS: Supply Chain ~ High Impact ~ Operational ~ CoWoS packaging bottlenecks | Concentration ~ Medium Impact ~ Revenue ~ MSFT and META account for >40% of sales
UPCOMING: Q2 Earnings | 800G shipments scale
TRADE: ENTRY=$150 STOP=$135 T1=$185 T2=$220 SIZE=Half_Position (¼ starter, add ¼ on confirmation) CONFIRM=Daily close back above the post-earnings gap ($165) on above-average volume, OR a successful retest that holds the 50-day MA AVOID=Chasing pre-earnings
VERDICT: RATING=STRONG BUY STARS=5 CONVICTION=High BOTTOM=ANET is a definitive buy at these levels. Despite the systemic geopolitical supply chain risks regarding TSMC dependency, the aggressive AI capex cycle is fundamentally extending its networking monopoly. We reject the generic fear of margin compression; the underlying EOS software integration has structurally raised the margin floor. The valuation at 42x forward earnings offers a rare margin of safety for a hyper-scaler entering an AI production supercycle.
SOURCES: Source1 URL1 | Source2 URL2
DATA_INTEGRITY: PRICE=201.97 FWDPE=12.94 TGTMEAN=280.16 REVGR=23.4 MA50=226.35 MA200=349.23 W52H=632.39 W52L=173.25 SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=2026-05-25
```

**HOW TO FILL DATA_INTEGRITY (copy from stockfetch.js stdout):**

After running `node stockfetch.js {TICKER} ...`, the stdout prints a data summary block.
Copy these exact values into the DATA_INTEGRITY line:

```
DATA_INTEGRITY: PRICE=201.97 FWDPE=12.94 TGTMEAN=280.16 REVGR=23.4 MA50=226.35 MA200=349.23 W52H=632.39 W52L=173.25 SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=2026-05-25
```

`stockmd.js` will cross-check these against its own live fetch and render a **VERIFIED / PARTIAL / DRIFT** badge in the HTML report.

**CRITICAL RULES for the text file:**

- TICKER, PEERS, DESC, NEXT_EARNINGS — one line each
- **ELI5** — Plain-English explanation of what the BUSINESS DOES. Follow the ANET pattern below. Every ELI5 must answer:
  1. **What they do** — Plain-English analogy, no jargon
  2. **Who pays them** — Customer type + how they charge
  3. **The moat / superpower** — What keeps competitors from eating their lunch
  4. **Real-world analogy** — "Think of it like ___"
  
  **Forbidden in ELI5:** stock price, valuation, P/E, bull/bear points, analyst targets, technicals.
  
  **ANET example (adapt this pattern to any ticker):**
  ```
  ELI5: Arista Networks builds the super-fast switches and routers that connect all the computers inside giant data centers — think of them as the highway system for the internet's brain. Without Arista's equipment, the GPUs that power ChatGPT and other AI models would sit idle, unable to talk to each other.

  Their biggest customers are Microsoft, Meta, and other cloud giants who pay millions for Arista's hardware. Their moat is EOS — a single software brain that runs on every Arista device. Once a company like Microsoft builds their entire data center around EOS, switching to Cisco is like trying to change the engine of a plane mid-flight.

  Think of it like the traffic control system for AI — NVIDIA makes the race cars (GPUs), Arista builds the racetrack.
  ```

- STORY — use double blank lines between paragraphs
- BULL, BEAR, SUPPLY, CATALYSTS, RISKS, UPCOMING, AI_OPP, AI_THR — pipe `|` separated items
- INSIDER — `SCORE=N SENTIMENT=X BUYS=... SELLS=... SIGNAL=...`
- VALUATION — `FAIR=$X BEAR=$Y UPSIDE=Z%` then `METHOD=` then description
- TRADE — `ENTRY=$X STOP=$Y T1=$A T2=$B SIZE=... CONFIRM=... AVOID=...`
  - **CONFIRM** is MANDATORY whenever SIZE is a scaled/partial position (e.g. "add ¼ on confirmation"). It must state the exact, observable trigger (a price level, MA reclaim, volume condition, or post-earnings event) that justifies adding the second tranche. Never leave "on confirmation" undefined.
- VERDICT — `RATING=... STARS=N CONVICTION=...` then `BOTTOM=` then paragraph
- DATA_INTEGRITY — copy exact values from `stockfetch.js` stdout output. Format: `PRICE=X.XX FWDPE=X.XX TGTMEAN=X.XX REVGR=X.X MA50=X.XX MA200=X.XX W52H=X.XX W52L=X.XX ROIC=X WACC=X VALUE_SPREAD=X FSCORE=N/9 EVA_SPREAD=X CASH_CONV=X MOS=X COMPOSITE=X SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=YYYY-MM-DD` (copy ALL fields verbatim from stockfetch.js stdout)
- Use real numbers from `{TICKER}_data.json` — never placeholders

---


---

## STEP 5 — ⚠️ MANDATORY HTML CONVERTER: `stockmd.js`

**🚨 CRITICAL: You MUST run this script. NEVER generate HTML/JS/CSS yourself.**
**The HTML, CSS, quadrant chart, tooltips, data tables, and theme are all generated by stockmd.js.**

Run `stockmd.js` (installed via FASTER SETUP) after the linter passes:

```bash
node stockmd.js {TICKER}_report.txt
# Reads: {TICKER}_report.txt + {TICKER}_data.json (for live price refresh)
# Writes: {ticker}_rich_report.html
# Includes: interactive peer quadrant plot (hover/touch for live metrics)
```

### 📊 INTERACTIVE PEER QUADRANT PLOT

`stockmd.js` auto-generates an **inline SVG scatter plot** with hover/touch tooltips:

- **X-axis:** Forward P/E (valuation) — auto-falls back to EV/Revenue if most peers are loss-making
- **Y-axis:** Revenue Growth %
- **Four quadrants** (split on peer median):
  - 🟢 **VALUE PICK** — high growth, cheap multiple
  - 🟣 **PREMIUM GROWTH** — high growth, expensive multiple
  - 🟡 **VALUE TRAP?** — low growth, cheap multiple
  - 🔴 **HIGH RISK** — low growth, expensive multiple
- **Hover/touch any dot → floating tooltip** with 8 live metrics per company:
  - Fwd P/E · Rev Growth · Net Margin · FCF Yield
  - Price · 1M Return · YTD Return · RSI-14
- **Primary ticker** glows gold with a ★; peers shown in silver
- Uses symmetric-log scaling when peer dispersion is extreme (so a $155B giant and a $380M micro-cap both fit cleanly)
- Pure inline SVG + vanilla JS — zero external dependencies, works in sandboxed iframe previews

---


⛔ **FORBIDDEN: Writing HTML/JS/CSS manually. You MUST run the installed `stockmd.js`.**
⛔ **FORBIDDEN: Using document.createElement, innerHTML, or any DOM API to build the report.**
✅ **REQUIRED: run `node stockmd.js {TICKER}_report.txt` (the installed script does all rendering).**




> **Source of truth: `stock_analyzer/stockmd.js` in the repo** (installed by FASTER SETUP).
> Do **not** write HTML yourself and do **not** re-embed this ~1,300-line script in the playbook.
> It reads `{TICKER}_report.txt` + `{TICKER}_data.json`, re-fetches live price to render the
> VERIFIED/PARTIAL/DRIFT badge, reads the `quality`/`composite` objects straight from the JSON,
> recomputes the composite with the insider score folded in, and emits the full dark-theme HTML,
> the interactive peer quadrant plot, and the 🏅 Quality & Scoring panel.

## COMPLETE EXECUTION CHECKLIST

Copy this into chat when running a new ticker. Check off each step.

```
[ ] 0. DELETE old report files: rm -f {PREV_TICKER}_data.json {PREV_TICKER}_report.txt {prev_ticker}_rich_report.html
[ ] 1. Identify peers → output: PEERS line
[ ] 2. Confirm stockfetch.js + ../lib/*.js exist (install via FASTER SETUP curl block if missing)
[ ] 3. Run: node stockfetch.js {TICKER} {PEER1} {PEER2} {PEER3} {PEER4} {PEER5}
[ ] 3b. Run: node insiderfetch.js {TICKER} to get definitive 6-month insider activity
[ ] 4. Confirm {TICKER}_data.json exists and price/ratios look reasonable
[ ] 5. Read the JSON summary output completely
[ ] 6. Web research: earnings + guidance (search)
[ ] 7. Read output from `node insiderfetch.js` for definitive SEC insider activity
[ ] 8. Web research: catalysts, moat, AI, supply chain
[ ] 8b. QUALITY CHECK: confirm ../lib/quality.js exists and stockfetch.js computed F-Score, EVA,
        margin-of-safety, and composite for the primary ticker. Copy FSCORE / EVA_SPREAD /
        CASH_CONV / MOS / COMPOSITE from the stockfetch.js stdout DATA_INTEGRITY line.
        (If "Quality block unavailable" printed, note it — those fields will read NA and that is OK.)
[ ] 9. Write {TICKER}_report.txt using ONLY numbers from the JSON
[ ]    — verify: every price/ratio/return in txt matches _data.json
[ ]    — verify: DATA_INTEGRITY line carries FSCORE, EVA_SPREAD, CASH_CONV, MOS, COMPOSITE verbatim
[ ] 9b. ‼️ GATE — Run schema linter: node report_linter.js {TICKER}_report.txt
        If "STATUS: FAILED", read the errors, regenerate/correct the text, and re-run.
        Only proceed once linter outputs "STATUS: PASSED".
[ ] 10. Confirm stockmd.js exists (install via FASTER SETUP curl block if missing)
[ ] 11. Run: node stockmd.js {TICKER}_report.txt
[ ] 12. Open {ticker}_rich_report.html and verify numbers match JSON
[ ] 13. Check the DATA INTEGRITY badge — must show ✅ VERIFIED (green)
        If ⚠️ PARTIAL or ❌ DRIFT: fix DATA_INTEGRITY line in report.txt and re-run
[ ] 14. Hover over quadrant plot dots to verify peer tooltip metrics appear
[ ] 15. Workspace is clean: only the permanent files + 3 new report files
```

---

## DATA INTEGRITY RULES

**These are non-negotiable:**

1. **Price in report.txt = price in _data.json.** If they differ, the txt is wrong.
2. **Fwd P/E, EV/EBITDA, margins, returns** — all from JSON, never estimated.
3. **Analyst mean target** — from JSON `fund.tgtMean`. Upside% calculated as `(tgtMean - price) / price * 100`.
4. **Peer table numbers** — from JSON `peerTable` array. No estimates.
5. **Trade plan levels (ENTRY, STOP, T1, T2)** — agent's judgment, not from Yahoo. These are the only numbers the agent may set independently.
6. **DATA_INTEGRITY field** — must be filled by copying stockfetch.js stdout values verbatim. `stockmd.js` cross-checks these on every run and shows:
   - ✅ `VERIFIED` badge (green) — all anchor numbers match within 2% tolerance
   - ⚠️ `PARTIAL` badge (amber) — 1-2 numbers drifted, possible news vs Yahoo lag
   - ❌ `DRIFT` badge (red) — 3+ numbers wrong; agent must re-read data and fix report

**If stockfetch.js fails for a symbol**, note `[DATA UNAVAILABLE]` for that ticker's peer row. Never fill in numbers from memory.

---

## QUICK REFERENCE: PLAIN TEXT KEY GLOSSARY

| Key | What to write |
|-----|--------------|
| TICKER | Symbol only, e.g. `GEHC` |
| NAME | Full company name |
| PEERS | Space-separated symbols |
| DESC | 3–5 segment descriptors separated by ` · ` |
| NEXT_EARNINGS | Human-readable date, e.g. `Late July 2026` |
| SETUP | One sentence — price context + key signal |
| STORY | 3 paragraphs separated by blank lines |
| BULL | Pipe-separated items (6–8 items) |
| BEAR | Pipe-separated items (5–7 items) |
| SECTOR | One paragraph prose |
| PEER1 / PEER2 | One sentence each |
| SUPPLY | Pipe-separated, start items with ✅🟢⚠️🔴 |
| INSIDER | `SCORE=N SENTIMENT=X BUYS=... SELLS=...` then signal analysis |
| AI_OPP | Pipe-separated (4–5 items) |
| AI_THR | Pipe-separated (2–4 items) |
| AI_NET | One sentence |
| VAL_BASE/BULL/BEAR | `TARGET=$X \| Assumption 1` |
| VAL_METHOD | Detailed prose explaining Sector-Specific Valuation Lens, Target Multiple Assumptions, WACC, and DCF formula |
| VAL_MATRIX | Multiline pipe-separated table: `TICKER \| Price \| Multiple Val \| DCF Val \| Analyst Tgt \| Blended Val \| Upside% \| Verdict` |
| SUPPLY_UP | Pipe-separated list of Upstream Suppliers (e.g. `Broadcom (AVGO) - ASICs`) |
| SUPPLY_DOWN | Pipe-separated list of Downstream Customers (e.g. `Microsoft (MSFT) - 26% Rev`) |
| SUPPLY_SIGNALS | Multiline pipe-separated table of recent earnings signals: `Company \| Relationship (Supplier/Customer) \| Result (Beat/Miss) \| Implication` |
| SUPPLY_RISK | `Risk Level (High/Med/Low) \| Detailed analysis of systemic/idiosyncratic risks, geo-political chokepoints, and exact impact on margins` | Description of dependency risks` |
| CATALYSTS_HIST | Multiline pipe-separated table: `Date \| Catalyst Name \| Type (Earnings/Event/Product) \| Impact (Positive/Negative) \| Detail/Source` | `TARGET=$X \| Assumption 1 \| Assumption 2` (Base must = TGTMEAN. Bull > Base. Bear < Base) |
| CATALYSTS | Pipe-separated (5–6 items) |
| RISKS | Pipe-separated list of `Title ~ Impact(High/Medium/Low) ~ Category ~ Description` |
| UPCOMING | Pipe-separated (3–4 items) |
| TRADE | `ENTRY=$X STOP=$Y T1=$A T2=$B SIZE=... CONFIRM=... AVOID=...` — if SIZE is scaled (¼ starter / add ¼), CONFIRM MUST define the exact observable trigger (price level, MA reclaim, volume, or event) for the add. |
| VERDICT | `RATING=... STARS=N CONVICTION=...` then `BOTTOM=Prescriptive, definitive stance. No generic filler. Synthesize supply chain, risks, and valuation to make a firm call. Use the actual COMPANY NAME (not just the ticker). Do not give conflicting statements; weigh the risks but take a definitive stand.` |
| SOURCES | `Name URL` pairs separated by pipes |
| DATA_INTEGRITY | Copy exact values from `stockfetch.js` stdout. `PRICE=X FWDPE=X TGTMEAN=X REVGR=X MA50=X MA200=X W52H=X W52L=X ROIC=X WACC=X VALUE_SPREAD=X FSCORE=N/9 EVA_SPREAD=X CASH_CONV=X MOS=X COMPOSITE=X SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=YYYY-MM-DD` |

---

*Not financial advice. This playbook is for research and educational purposes only.*
