# 📈 STOCK RESEARCH MASTER PLAYBOOK (ULTRA-LEAN WORKFLOW)
> **Lightweight, High-Precision Prompt Schema.**
> Fully optimized to eliminate large code contexts. All executable scripts (`stockfetch.js`, `stockmd.js`, `insiderfetch.js`, `report_linter.js`, `run_pipeline.js`) are already part of the local workspace. 
> Do NOT copy or maintain JS source code in this playbook — simply run the scripts via terminal.

---

## ⚡ QUICK START (Copy-paste into a new agent-mode chat)

```
Analyze ticker {TICKER} using the local STOCK_RESEARCH_MASTER workspace scripts.
Run Phase 1 of the pipeline using: node run_pipeline.js {TICKER} {PEERS...}
Anchor ALL metrics on the database json before doing web research.
Then write {TICKER}_report.txt and run Phase 2 to validate and generate the HTML dashboard.
```

---

## 🗑️ Before starting a NEW ticker analysis, DELETE old files:

```bash
rm -f {PREV_TICKER}_data.json {PREV_TICKER}_report.txt {prev_ticker}_rich_report.html pipeline_execution.log
```

---

## 🔄 EXECUTION ORDER (The 4-Phase Gating Pipeline)

**The golden rule: DATABASE FIRST, RESEARCH SECOND, TEXT THIRD, LINT FOURTH, HTML LAST.**

```
  [ PHASE 1: DATA ]   ──>   [ PHASE 2: GEN ]   ──>   [ PHASE 3: LINT ]   ──>   [ PHASE 4: HTML ]
   node run_pipeline.js      Write {TICKER}_report.txt  node report_linter.js       node stockmd.js
```

### PHASE 1: Fetching Database & SEC Insider Scraping
Execute the master pipeline orchestration script:
```bash
node run_pipeline.js {TICKER} {PEER1} {PEER2} {PEER3} {PEER4} {PEER5}
```
*   This automatically fetches financials/statements (`stockfetch.js`), scrapes SEC EDGAR for insider Form 4 trades (`insiderfetch.js`), and logs results to `pipeline_execution.log`.
*   **Action:** Copy the `DATA_INTEGRITY` line printed on stdout; you will paste it verbatim at the bottom of your report text file.

### PHASE 2: Plain Text Synthesis
Write the qualitative research in **plain text format** to `{TICKER}_report.txt` (see formatting rules below). Ensure every price and ratio exactly matches `{TICKER}_data.json`.

### PHASE 3: Mandatory Schema & Quality Linting
Run the compiler-like gating linter on your text report:
```bash
node report_linter.js {TICKER}_report.txt
```
*   **Gating Rule:** If this script prints `STATUS: FAILED`, analyze the output, correct/regenerate `{TICKER}_report.txt`, and re-run. Only proceed once it prints `STATUS: PASSED`.

### PHASE 4: HTML Compilation
Render the rich, dark-themed dashboard containing interactive peer coordinate graphs, macro radar charts, and quality metrics:
```bash
node stockmd.js {TICKER}_report.txt
```

---

## 🔬 STEP 1 — PEER SELECTION RULES

Pick 4–5 peers. Rules:
*   Same sector is not enough — must overlap in business model, customer wallet, or platform economics.
*   Include ≥3 direct peers and ≥1 premium/valuation comparison comp.
*   Output peer list: `PEERS: SYM1 SYM2 SYM3 SYM4 SYM5`

---

## 🧒 STEP 2 — ELI5 BUSINESS ANALOGY RULES

The **ELI5** section must explain the business simply and answer these four questions:
1.  **What they do:** Plain-English analogy, no jargon.
2.  **Who pays them:** Customer type + how they charge.
3.  **The moat / superpower:** What keeps competitors from eating their lunch (switching costs, regulatory compliance).
4.  **Real-world analogy:** "Think of it like ___"

⚠️ **Strict Gating:** Forbidden words in ELI5 include: *valuation, price, P/E, forward P/E, target, technicals, RSI, bull/bear case*.

---

## 📝 STEP 3 — PLAIN TEXT REPORT SCHEMA (`{TICKER}_report.txt`)

Write `{TICKER}_report.txt` in exactly this plain-text format (no markdown, no HTML).

```
TICKER: ROP
NAME: Roper Technologies, Inc.
PEERS: FTV AME TYL TDY HEI
DESC: Vertical Market Software · Technology-Enabled Products · Network Software
NEXT_EARNINGS: Late July 2026
ELI5: Roper Technologies is a giant collection...
SETUP: ROP is consolidating near its major support level...
STORY: Three paragraphs separated by blank lines...

BULL: Point one | Point two | Point three
BEAR: Risk one | Risk two | Risk three
VARIANT_PERCEPTION: Consensus Believes X ~ We Believe Y ~ Catalyst: Z
ALT_DATA: Per credit card data, segment growth is +15% YoY | HYP: Job postings indicate flat hiring QoQ
COMPETITIVE_ARENA: Segment Name ~ Dominant/Strong/Neutral/Weak ~ Strategic description
SUPPLY: 🟢 Bullets starting with emoji | ✅ Bullet two | 🔴 Bullet three | ⚠️ Bullet four
WHATS_NEW: Point one | Point two
PATTERN: Double Bottom | Consolidating on declining volume
VAL_METHOD: High-growth serial acquirer valuation requires...
VAL_MATRIX:
ROP | 325.53 | 430.20 | 410.00 | 453.82 | 431.23 | +32.47% | Undervalued
FTV | 58.32 | 61.18 | 60.50 | 63.56 | 61.69 | +5.78% | Fair Value
VAL_BASE: TARGET=453.82 | Assumption one | Assumption two
VAL_BULL: TARGET=550.00 | Assumption one | Assumption two
VAL_BEAR: TARGET=365.00 | Assumption one | Assumption two
SECTOR: Industry rotation commentary...
PEER1: Direct peer comparison sentence.
PEER2: Second peer comparison sentence.
SUPPLY_UP: Cloud hosting providers | Specialized component suppliers
SUPPLY_DOWN: Municipal water utilities | Healthcare clinics | freight brokers
SUPPLY_SIGNALS:
Amazon | AWS Hosting | Beat/Raised | Cloud hosting prices stable
Microsoft | Azure Cloud | Beat/Raised | Cloud demand resilient
SUPPLY_RISK: Low to Medium | Segmented supply chain analysis detailing chokepoint impact on operating margins.
INSIDER: SCORE=7 SENTIMENT=Bullish BUYS=1 ($0.50M) SELLS=1 ($2.67M) SIGNAL=Insider scoring analysis.
AI_OPP: Opportunity one | Opportunity two
AI_THR: Threat one | Threat two
AI_NET: Summary sentence of net artificial intelligence exposure.
CATALYSTS_HIST:
2026-04-23 | Q1 Earnings | Earnings | Positive | Beat adjusted DEPS with $5.16 vs $4.95-5.00 guide
RISKS: Jargon Risk ~ High Impact ~ Category ~ Detailed risk description
UPCOMING: Event one | Event two
TRADE: ENTRY=$315.00 STOP=$295.00 T1=$410.00 T2=$450.00 SIZE=Half_Position (¼ starter, add ¼ on confirmation) CONFIRM=Daily close back above 20D MA on above-average volume AVOID=Buying during sharp momentum downslope
VERDICT: RATING=STRONG BUY STARS=5 CONVICTION=High BOTTOM=Prescriptive, definitive concluding paragraph.
SOURCES: Name1 URL1 | Name2 URL2
THESIS_WEIGHTS: Valuation=35% | Moat_Stability=25% | Capital_Allocation=20% | Technicals=10% | Catalysts=10%
TECH_SETUP: Lagging moving averages vs near-term RSI exhaustion...
FOLLOW_THE_CASH: FCF conversion rate bullets | CapEx intensity | buyback capital recycling
PRE_MORTEM: Failure path one | Failure path two | Failure path three
DATA_INTEGRITY: PRICE=325.53 FWDPE=13.62 TGTMEAN=453.82 REVGR=11.3 MA50=345.82 MA200=419.41 W52H=576.49 W52L=305.96 ROIC=5.95 WACC=7.47 VALUE_SPREAD=-1.52 FSCORE=5/9 EVA_SPREAD=-1.52 CASH_CONV=1.654 MOS=28.3 COMPOSITE=5.9 SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=2026-06-01
```

---

## 📋 COMPLETE EXECUTION CHECKLIST

```
[ ] 0. DELETE old report files: rm -f {PREV_TICKER}_data.json {PREV_TICKER}_report.txt {prev_ticker}_rich_report.html pipeline_execution.log
[ ] 1. Identify peers → output: PEERS line
[ ] 2. Run master orchestrator: node run_pipeline.js {TICKER} {PEER1} {PEER2} {PEER3} {PEER4} {PEER5}
[ ] 3. Confirm {TICKER}_data.json exists and review live quality scores (F-Score, Cash Conv., EVA)
[ ] 4. Web research: earnings + guidance (search)
[ ] 5. Write {TICKER}_report.txt using ONLY numbers from the JSON database
[ ] 6. Run schema and quality linter: node report_linter.js {TICKER}_report.txt
       If "STATUS: FAILED", correct the errors and re-run. Only proceed when it shows "STATUS: PASSED".
[ ] 7. Run compiler: node stockmd.js {TICKER}_report.txt
[ ] 8. Verify rop_rich_report.html numbers match database and that linter contains 0 warnings.
```

---

## ⚖️ DATA INTEGRITY RULES (Non-Negotiable)

1.  **Price & Ratios:** Every single price, P/E ratio, margin percentage, moving average, and F-Score must match the values in `{TICKER}_data.json` exactly.
2.  **Piotroski Gating:** The reported `FSCORE`, `EVA_SPREAD`, `CASH_CONV`, `MOS`, and `COMPOSITE` in the `DATA_INTEGRITY` line must match the JSON calculations. The linter will automatically reject any guessed or drifted values.
3.  **Trade Levels:** ENTRY, STOP, T1, T2, CONFIRM, and AVOID are set independently by analyst judgment.

---

*Not financial advice. Playbook is for educational and research purposes only.*
