# Single-Stock Relative-Value Engine (v2 · S&P 500 Funnel) — Agent Operating Manual (SOP)

Follow this Standard Operating Procedure verbatim on every run to guarantee **broad full-market coverage**, **deterministic ranking**, **strict anti-trap verification**, and **consistent publication-grade charts & HTML tearsheets** across any AI agent and any trading day.

---

## Architecture: 3-Layer Funnel (Wide Deterministic Net → Narrow Enrichment)
1. **Layer 1 — Curated Anchors (`config/universe.json`):** 41 high-conviction `CORE` + `EXP` peer pairs (preserved every day, including cross-sub-industry twins and non-S&P 500 leaders like `WCN/WM`).
2. **Layer 2 — Full S&P 500 GICS Auto-Pairs (`config/sp500_gics.json`):** ~500 CIK-deduplicated S&P 500 stocks grouped across ~98 active GICS Sub-Industries → **~1,450+ deterministic peer pairs** (`SP500`). Auto-refreshes from Wikipedia every 14 days (or on `--refresh-sp500`) with seamless fallback to the committed JSON snapshot.
3. **Layer 3 — Bounded Dynamic Hot-Theme Radar (`data/dynamic_pairs.json`, Optional Step 0):** Up to 8–10 agent-discovered current-market dislocation pairs (`DYNAMIC` — e.g., non-S&P 500 names, ADRs, AI/Power/Gold/Space themes). Every dynamic pair is still **strictly gated by Step 1 deterministic math** — the agent cannot bypass correlation, spread, Z-score, or moving-average rules.
4. **Deterministic Smart Funnel (~5–7s scan → ~3–5s valuation scrape):**
   - Step 1 runs vectorized correlation & Z-score math across all **~1,500 pairs** and outputs a **deduplicated ~30–40 pair Shortlist** (max 1 per laggard, max 2 per sub-industry across `1W_ACTION`, `1M_ACTION`, `1Q_ACTION`, `CORE_ANCHOR`, `DYNAMIC`, and `QUARANTINE`).
   - Step 2 scrapes StockAnalysis **only** for the ~45–75 unique Shortlist tickers (~3–5s, zero rate-limit risk).

---

## Non-Negotiable Anti-Trap Rules
1. **Zero Fabricated Data:** Never estimate prices, Forward P/E multiples, earnings dates, or Z-scores from memory. Every numeric value MUST come from `data/*.json` generated during the current run.
2. **Dividend-Adjusted Total Return Math:** All spreads, ratio Z-scores, and 50%/100% catch-up targets MUST use `adjclose` so ex-dividend drops never fabricate false parity gaps.
3. **Mandatory Earnings & Fundamental Anti-Trap Verification (Live Web Search):**
   Before assigning ANY stock to **Tier 1**, you MUST verify via live web search:
   - Most recent quarterly revenue, EPS, and **full-year guidance** (reaffirmed or raised = pass; guidance cut = downgrade to Tier 2 Caution or Tier 3!).
   - Zero accounting investigations, governance/CEO crises, recalls, or balance-sheet distress.
   - Zero active M&A merger between the Leader and Laggard (if a merger is live, move to `special_exclusions`, NOT Tier 1/2!).
   - **No Imminent Earnings Binary:** Laggard MUST NOT report earnings within `< 7` trading days. If a clean setup reports next week, place it in **Tier 2 Watchlist (Post-Earnings Trigger)** instead of Tier 1.
4. **Strict Tier Classification:**
   - **Tier 1 (Actionable — Top 2 per Horizon: 1W, 1M, 1Q = up to 6 distinct laggards):**
     - Leader in confirmed breakout/uptrend (ideally within `-5%` to `-8%` of 52-week high).
     - Laggard holding verified 10-day daily candle support near/above 20-EMA, 50-EMA, and 50-DMA.
     - Verified intact recent earnings/guidance, zero imminent earnings binary, and favorable/justified Forward P/E parity.
   - **Tier 2 (Watchlist):** Clean statistical stretch with ONE clear caveat (e.g., imminent earnings print, guidance-cut digestion despite deep P/E discount, leader just shy of breakout, or multiple premium).
   - **Tier 3 (Quarantined Traps):** Laggard broken below 50-DMA, governance/earnings shock, destocking/margin collapse, or dual-leg earnings binary. Always audit top failing pairs from the `QUARANTINE` / `CORE_ANCHOR` buckets transparently.
5. **Patient Entry Zones & Realistic Entry R:R:**
   - Anchor `entry_rng: [low, high]` around the laggard's 20-EMA / recent swing floor — never chase extended closes.
   - Match the stop horizon to the trade horizon targeting `Entry R:R >= 1.2x` (50% target) and `>= 2.0x` (100% target).

---

## Step-by-Step Execution Protocol

### Step 0 (Optional): Dynamic Hot-Theme Radar (`data/dynamic_pairs.json`)
Run 1–2 quick web searches for *"biggest US sector movers and earnings dislocations this week"*. If any hot current-market peer dislocations exist **outside the S&P 500** or across GICS sub-industries (e.g., ADRs like `TSM/ASML`, non-S&P 500 leaders like `ARM/MRVL`, `SPOT/NFLX`, `VRT/ETN`, `AEM/NEM`), write 4–8 pairs to `data/dynamic_pairs.json` matching `config/dynamic_pairs.example.json`. (If none are needed, skip — Step 1 still scans all ~1,500 S&P 500 + Core pairs.)

### Step 1: Run Full S&P 500 GICS + Core + Dynamic Scan (~5–7s)
```bash
python3 scripts/01_scan_stocks.py
```
Optional flags:
- `--refresh-sp500` — force live Wikipedia refresh of `config/sp500_gics.json`
- `--core-only` — scan only `config/universe.json` + `data/dynamic_pairs.json`
- `--use-cache` — reuse existing `data/stock_ohlcv_cache.json` for rapid re-ranking

Outputs: `data/stock_rv_scan.json` (containing the deterministic 6-bucket Funnel Shortlist + top 250 pairs) and `data/stock_ohlcv_cache.json`.

### Step 2: Scrape Live Valuations & Next Earnings Dates (~3–5s Funnel)
```bash
python3 scripts/02_fetch_valuations.py
```
Automatically scrapes **only** Step 1's Funnel Shortlist tickers (~45–75 unique stocks). To inspect any extra ticker from the broader scan, append cleanly with:
```bash
python3 scripts/02_fetch_valuations.py TICKER1 TICKER2
```
Outputs: `data/stock_valuations.json`.

### Step 3: Audit Recent Daily Candles (Support Verification)
```bash
python3 scripts/03_audit_candles.py
```
By default audits the last 10 daily OHLC candles vs. 20-EMA, 50-DMA, and 50-EMA for all actionable Funnel Shortlist laggards (or pass explicit tickers: `python3 scripts/03_audit_candles.py SYK PM PPL ...`).

### Step 4: Live Web Fundamental Anti-Trap Verification
Run targeted web searches (`"<TICKER> Q[1-4] <YEAR> earnings guidance"`, `"<TICKER> news"`) on every top candidate laggard before locking picks. Verify there are no M&A mergers between paired stocks (e.g., rail/telecom/pharma buyouts) and record source URLs for your executive brief citations.

### Step 5: Write `data/selected_setups.json`
Create `data/selected_setups.json` strictly following `config/selected_setups.example.json`:
- `regime_title`, `regime_summary`, `regime_pills` (3 pills), `special_exclusions` (optional M&A / corporate-action exclusions).
- `setups`: 12–18 setups spanning Tier 1 (up to 6: 2×1W, 2×1M, 2×1Q), Tier 2 Watchlist, and Tier 3 Quarantined Traps.
- Set `"cat"` accurately to `"SP500"`, `"CORE"`, `"EXP"`, or `"DYNAMIC"` matching Step 1's source tag.
- *(For Tier 3 setups, set `"entry_rng": null` and populate `"short_tag"` like `"EarnCut"` or `"Breakdown"` for Chart 1 callouts.)*

### Step 6: Deterministic Math Lock, Chart Generation, Visual QA & HTML Build
```bash
python3 scripts/04_lock_targets.py
python3 scripts/05_build_charts.py
```
*(Note: `04_lock_targets.py` is self-healing — if you picked a ticker outside the shortlist cache, it auto-fetches its OHLCV and StockAnalysis multiples on the fly.)*

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
1. **Live Tape, Universe Breadth & Sector Rotation Context** (dated to exact market close, citing total stocks/pairs scanned & shortlisted)
2. **Top 6 Tier 1 Actionable Parity Setups** (unified Markdown table across 1W / 1M / 1Q with Source tag `CORE`/`SP500`/`DYNAMIC` + bulleted Verified Anti-Trap Fundamental Checks with inline citations)
3. **Tier 2 Watchlist** (Earnings Binary / Guidance Caution / Pending Triggers)
4. **Tier 3 Quarantined Traps & Broken-Trend Table**
5. **Execution & Risk Controls** (Patient Limit Entries, Long-Only vs. Dollar-Neutral Pairs Sizing, Daily Close Stop Protocol)
