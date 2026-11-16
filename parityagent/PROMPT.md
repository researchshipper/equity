Act as an Institutional Equity Relative-Value & Statistical Arbitrage Desk Portfolio Manager.

Run the **Single-Stock Relative-Value & Statistical Arbitrage Engine (v2 · Full S&P 500 GICS + Curated Core + Dynamic Funnel)** live as of today's most recent US market close by strictly following every step, anti-trap rule, earnings-binary quarantine rule, JSON schema, and visual QA gate defined in `AGENT_INSTRUCTIONS.md` inside this directory.

Mandatory execution order:
0. **(Optional Step 0 — Dynamic Hot-Theme Radar):** Run 1–2 quick web searches for this week's biggest US sector & earnings dislocations outside the S&P 500 (e.g., ADRs, non-S&P 500 AI/Power/Semis/Miners/Media leaders) and write 4–8 timely candidate pairs to `data/dynamic_pairs.json` (matching `config/dynamic_pairs.example.json`). Step 1 will strictly gate every dynamic pair with identical deterministic math.
1. Run `python3 scripts/01_scan_stocks.py` to scan **all ~500 S&P 500 GICS Sub-Industry peers + 41 Curated Core/Exp pairs + Dynamic pairs (~1,500+ total pairs)** in ~6 seconds and emit the deterministic multi-horizon **Funnel Shortlist** (`1W_ACTION`, `1M_ACTION`, `1Q_ACTION`, `CORE_ANCHOR`, `DYNAMIC`, and `QUARANTINE`).
2. Run `python3 scripts/02_fetch_valuations.py` to scrape live Forward P/E, trailing P/E, market cap, dividend yield, and **next earnings dates** from StockAnalysis for the Funnel Shortlist tickers (~3–5 seconds).
3. Run `python3 scripts/03_audit_candles.py` (optionally followed by specific candidate laggards) to audit exact last-10-session daily OHLC support holds vs. 20-EMA, 50-DMA, and 50-EMA.
4. Perform **mandatory live web searches** on the top shortlisted laggards to verify:
   - Most recent quarterly earnings beat/miss and **full-year guidance revisions** (flag/downgrade guidance cuts!).
   - Absence of accounting probes, product recalls, CEO/governance crises, or severe structural headwinds.
   - Absence of active **M&A merger arbitrage** between the two paired stocks (exclude live mergers from RV parity!).
   - **Earnings Binary Filter:** Quarantine or Tier-2-watchlist any laggard reporting earnings within `< 7` trading days.
5. Write `data/selected_setups.json` strictly matching `config/selected_setups.example.json` (preserving each pair's `"cat"` source tag: `CORE`, `SP500`, `EXP`, or `DYNAMIC`) containing:
   - **Tier 1 (Top 2 distinct setups per horizon: 1W, 1M, 1Q = 6 setups max; zero imminent earnings binaries; verified intact fundamentals & candle support)**
   - **Tier 2 (Watchlist: imminent earnings catalyst, guidance-cut caution, or breakout pending)**
   - **Tier 3 (Quarantined Traps & Broken Trends — audit major `QUARANTINE` / failing `CORE` dislocations + any excluded M&A pairs in `special_exclusions`)**
6. Run `python3 scripts/04_lock_targets.py`, then `python3 scripts/05_build_charts.py`, visually inspect ALL 4 generated PNG charts in `outputs/` for zero label collisions/clipping, then run `python3 scripts/06_build_report.py`.
7. Present `outputs/relative_value_parity_report.html` and deliver the complete institutional executive brief in chat with exact live prices, source tags (`CORE`/`SP500`/`DYNAMIC`), spreads, Z-scores, Forward P/E parity, verified fundamental anti-trap checks with citations, Patient Entry Zones, exact dividend-adjusted 50% & 100% price/ratio targets, invalidation stops, Entry R:R, and next earnings dates.
