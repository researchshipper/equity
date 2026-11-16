# Single-Stock Relative-Value Engine — Agent Operating Manual (SOP)

Follow this Standard Operating Procedure verbatim on every run to guarantee consistent institutional formatting, deterministic math, strict anti-trap verification, and publication-grade charts.

---

## Non-Negotiable Anti-Trap Rules
1. **Zero Fabricated Data:** Never estimate prices, Forward P/E multiples, earnings dates, or Z-scores from memory. Every numeric value MUST come from `data/*.json` generated during the current run.
2. **Dividend-Adjusted Total Return Math:** All spreads, ratio Z-scores, and 50%/100% catch-up targets MUST use `adjclose` so ex-dividend drops on high-yielders never fabricate false parity gaps.
3. **Mandatory Earnings & Fundamental Anti-Trap Verification (Live Web Search):**
   Before assigning ANY stock to **Tier 1**, you MUST verify via live web search:
   - Most recent quarterly revenue, EPS, and **full-year guidance** (reaffirmed or raised = pass; guidance cut = downgrade to Tier 2 Caution or Tier 3!).
   - Zero accounting investigations, governance/CEO crises, recalls, or balance-sheet distress.
   - Zero active M&A merger between the Leader and Laggard (if a merger is live, move to `special_exclusions`, NOT Tier 1/2!).
   - **No Imminent Earnings Binary:** Laggard MUST NOT report earnings within `< 7` trading days. If a clean setup reports next week, place it in **Tier 2 Watchlist (Post-Earnings Trigger)** instead of Tier 1.
4. **Strict Tier Classification:**
   - **Tier 1 (Actionable — Top 2 per Horizon: 1W, 1M, 1Q = up to 6 distinct laggards):**
     - Leader in confirmed breakout/uptrend (ideally within `-5%` of 52-week high).
     - Laggard holding verified 10-day daily candle support above 20-EMA, 50-EMA, and 50-DMA.
     - Verified intact recent earnings/guidance, zero imminent earnings binary, and favorable/justified Forward P/E parity.
   - **Tier 2 (Watchlist):** Clean statistical stretch with ONE clear caveat (e.g., imminent earnings print, guidance-cut digestion despite deep P/E discount, leader just shy of breakout, or multiple premium).
   - **Tier 3 (Quarantined Traps):** Laggard broken below 50-DMA, governance/earnings shock, destocking/margin collapse, or dual-leg earnings binary. Always audit major failing Core pairs transparently.
5. **Patient Entry Zones & Realistic Entry R:R:**
   - Anchor `entry_rng: [low, high]` around the laggard's 20-EMA / recent swing floor — never chase extended closes.
   - Match the stop horizon to the trade horizon (e.g., 1W tactical stop below 20-EMA/50-EMA; 1Q structural stop below 50-DMA/swing low) targeting `Entry R:R >= 1.2x` (50% target) and `>= 2.0x` (100% target).

---

## Step-by-Step Execution Protocol

### Step 1: Run Live 1Y Peer-Pair Scan
```bash
python3 scripts/01_scan_stocks.py
```
Outputs: `data/stock_rv_scan.json` and `data/stock_ohlcv_cache.json`.

### Step 2: Scrape Live Valuations & Next Earnings Dates
```bash
python3 scripts/02_fetch_valuations.py
```
Outputs: `data/stock_valuations.json` (Forward P/E, trailing P/E, market cap, dividend yield, next earnings date).

### Step 3: Audit Recent Daily Candles (Support Verification)
Pick the top 12–15 lagging stocks from Step 1 and run:
```bash
python3 scripts/03_audit_candles.py TICKER1 TICKER2 ...
```
Confirm closing and intraday support holds against 20-EMA, 50-EMA, and 50-DMA.

### Step 4: Live Web Fundamental Anti-Trap Verification
Run targeted web searches (`"<TICKER> Q[1-4] <YEAR> earnings guidance"`, `"<TICKER> news"`) on every candidate laggard before locking picks. Record source URLs for your executive brief citations.

### Step 5: Write `data/selected_setups.json`
Create `data/selected_setups.json` strictly following `config/selected_setups.example.json`:
- `regime_title`: Concise market regime headline.
- `regime_summary`: 2–4 sentence macro & sector rotation summary.
- `regime_pills`: Array of 3 objects `{"label": "...", "text": "..."}`.
- `special_exclusions`: Optional array of excluded M&A / corporate-action pairs `{"badge": "EXCLUDED · M&A ARB", "cluster": "...", "title": "...", "note": "..."}`.
- `setups`: Array of 12–18 setups across Tier 1 (up to 6: 2×1W, 2×1M, 2×1Q), Tier 2, and Tier 3.
  Required fields per setup:
  ```json
  {
    "ldr": "MDLZ",
    "lag": "HSY",
    "tier": "Tier 1",
    "win": "1Q",
    "cat": "EXP",
    "cluster": "Staples / Confectionery",
    "entry_rng": [169.50, 173.50],
    "stop": 166.20,
    "short_tag": "",
    "twin_note": "",
    "note": "Verified quarterly beat & guidance check + why lag is temporary."
  }
  ```
  *(For Tier 3 setups, set `"entry_rng": null` and populate `"short_tag"` like `"CEO/Earn"` or `"Destock"` for Chart 1 callouts.)*

### Step 6: Deterministic Math Lock, Chart Generation, Visual QA & HTML Build
```bash
python3 scripts/04_lock_targets.py
python3 scripts/05_build_charts.py
```
**MANDATORY VISUAL QA GATE:** Open and visually inspect ALL FOUR charts in `outputs/`:
1. `outputs/rv_chart1_regime_quadrant.png`
2. `outputs/rv_chart2_tier1_technicals.png`
3. `outputs/rv_chart3_valuation_zscore.png`
4. `outputs/rv_chart4_rebased_parity.png`

Verify zero overlapping labels, zero clipped prices, unobstructed legends, and clear active-horizon parity ribbons.

Finally, compile the interactive HTML tearsheet:
```bash
python3 scripts/06_build_report.py
```
Deliverable: `outputs/relative_value_parity_report.html` (zero external dependencies, base64-embedded PNGs, interactive filters).

---

## Executive Chat Response Template
Structure your final chat response in 5 clean sections matching the HTML tearsheet:
1. **Live Tape & Sector Rotation Context** (dated to exact market close)
2. **Top 6 Tier 1 Actionable Parity Setups** (unified Markdown table across 1W / 1M / 1Q + bulleted Verified Anti-Trap Fundamental Checks with inline citations)
3. **Tier 2 Watchlist** (Earnings Binary / Guidance Caution / Pending Triggers)
4. **Tier 3 Quarantined Traps & Broken-Trend Table**
5. **Execution & Risk Controls** (Patient Limit Entries, Long-Only vs. Dollar-Neutral Pairs Sizing, Daily Close Stop Protocol)
