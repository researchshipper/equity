# ETF Parity Divergence Engine — Agent Operating Manual (SOP)

Follow this Standard Operating Procedure verbatim on every run to guarantee consistent institutional formatting, deterministic math, anti-trap rigor, and publication-grade charts.

---

## Non-Negotiable Rules
1. **Zero Fabricated Data:** Never estimate prices, spreads, Z-scores, flows, or breadth from memory. Every numeric figure MUST come from `data/*.json` generated in the current run.
2. **Dividend-Adjusted Total Return Math:** All 1W (5 trading days), 1M (21 trading days), and 1Q (63 trading days) spreads, ratio Z-scores, and 50%/100% targets MUST use Yahoo Finance `adjclose` (already enforced inside `scripts/01` and `04`).
3. **Strict Anti-Trap Classification:**
   - **Tier 1 (Actionable):**
     - Sector/style **Leader** is in a confirmed uptrend / breakout (ideally within `-5%` of 52-week high and above 20-EMA & 50-DMA).
     - **Laggard** holds verified 10-day candle support above its **20-EMA, 50-EMA, and/or 50-DMA** (NO falling knives broken below 50-DMA!).
     - No structural index flaw or severe outflow divergence invalidating catch-up.
     - Distinct laggards across the Top 2 per horizon (`1W`, `1M`, `1Q` = up to 6 unique Tier 1 setups).
   - **Tier 2 (Watchlist / Reclaim / Flow Caution):** Meaningful parity lag (`Z < -1.0σ` or wide spread), but waiting on 20-EMA/50-DMA reclaim, leader breakout confirmation, or flow stabilization.
   - **Tier 3 (Quarantined Traps):** Laggard broken below 50-DMA, severe breadth deterioration (`<35%` above 50-DMA), or structural regime headwind (e.g., collapsing commodity/rate shock). **Always audit and classify all Core 7 pairs honestly**, even if most are Tier 2/3 on a given tape.
4. **Patient Entry Zones & Realistic R:R:** Set `entry_rng: [low, high]` near the laggard's 20-EMA / recent multi-session pivot (never chasing extended closes), and place `stop` cleanly below the invalidation MA/swing low (0.5x–1.0x ATR buffer). Target `Entry R:R >= 1.1x` at 50% parity and `>= 1.8x` at 100% parity.

---

## Step-by-Step Execution Protocol

### Step 1: Run Live Market Scan
```bash
python3 scripts/01_scan_etfs.py
```
Outputs:
- `data/etf_scan.json` (ranked 1W, 1M, 1Q spreads, 63d/21d ratio Z-scores, 126d correlation, MAs, RSI-14, ATR-14)
- `data/etf_ohlcv_cache.json` (1Y daily OHLCV for all universe tickers)

### Step 2: Pull Live Flows & Constituent Breadth
```bash
python3 scripts/02_fetch_flows_breadth.py
```
Pass optional ticker list if you want to focus on specific candidates, or run with no arguments to enrich the top divergent leaders & laggards automatically.
Outputs:
- `data/etf_flows.json` (AUM, 5D, 1M, 3M net flows from ETFdb)
- `data/etf_breadth.json` (Top holdings concentration + `% constituents > 20-DMA` and `% > 50-DMA`)

### Step 3: Audit Recent Daily Candles (Support Verification)
Pick the top 10–14 lagging ETFs from Step 1 and run:
```bash
python3 scripts/03_audit_candles.py TICKER1 TICKER2 ...
```
Verify whether each candidate actually held 20-EMA / 50-EMA / 50-DMA on closing and intraday basis over the last 8–10 sessions.

### Step 4: Live Web Macro & Flow Verification
Run 3–5 focused web searches covering:
- Today's macro / equity sector rotation drivers (rates, Fed, earnings season, policy shocks).
- Recent ETF fund flows or structural constituent news for your top Tier 1 & Tier 3 pairs.
Record concrete URLs and takeaways to cite in the final executive summary.

### Step 5: Write `data/selected_setups.json`
Create `data/selected_setups.json` matching `config/selected_setups.example.json` **exactly**:
- `regime_title`: Short headline for current tape regime.
- `regime_summary`: 2–4 sentence macro/rotation context (plain text, no raw HTML).
- `regime_pills`: Array of 3 objects `{"label": "...", "text": "..."}`.
- `setups`: Array of 12–16 objects covering **Tier 1 (up to 6: 2×1W, 2×1M, 2×1Q)** + **Tier 2** + **Tier 3 (including all failing Core 7 pairs)**.
  Required fields per setup:
  ```json
  {
    "ldr": "XLF",
    "lag": "KRE",
    "tier": "Tier 1",
    "win": "1M",
    "cat": "CORE",
    "cluster": "Financials (Broad vs Regional Banks)",
    "entry_rng": [62.50, 64.20],
    "stop": 60.40,
    "twin_note": "Optional short blue pill note (or empty string)",
    "note": "Concise verified catalyst, breadth & flow anti-trap rationale."
  }
  ```
  *(For Tier 3 setups, set `"entry_rng": null`.)*

### Step 6: Deterministic Math Lock, Chart Generation, Visual QA & HTML Build
```bash
python3 scripts/04_lock_targets.py
python3 scripts/05_build_charts.py
```
**MANDATORY VISUAL QA GATE:** Open and visually inspect ALL FOUR charts in `outputs/`:
1. `outputs/etf_chart1_regime_quadrant.png`
2. `outputs/etf_chart2_tier1_technicals.png`
3. `outputs/etf_chart3_breadth_flows_zscore.png`
4. `outputs/etf_chart4_rebased_parity.png`

Verify:
- Zero overlapping text labels or boxes.
- No clipped right-margin prices or legends overlapping bars.
- Every Tier 1 panel shows readable Entry Zone, 50%/100% targets, and Stop.
If anything overlaps, adjust only layout spacing in `scripts/05_build_charts.py` and re-run.

Finally, build the standalone HTML tearsheet:
```bash
python3 scripts/06_build_report.py
```
Deliverable: `outputs/etf_parity_divergence_report.html` (zero external dependencies, base64-embedded PNGs, interactive filters).

---

## Executive Chat Response Template
Always structure your final chat response in 5 clean sections matching the HTML report:
1. **Live Tape & Macro Rotation Context** (dated to exact market close)
2. **Top Tier 1 Actionable ETF Parity Setups** (unified Markdown table across 1W / 1M / 1Q + bulleted Breadth/Flow/Macro Anti-Trap Checks with citations)
3. **Tier 2 Watchlist** (Reclaim / Flow Caution triggers)
4. **Tier 3 Quarantined Traps & Core 7 Audit Table**
5. **Execution & Risk Controls** (Long-Only vs. Pairs Ratio sizing + Daily Close Stop Protocol)
