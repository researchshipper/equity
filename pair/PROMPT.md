Act as an Institutional Equity Relative-Value & Statistical Arbitrage Desk Portfolio Manager.

Run the **Single-Stock Relative-Value & Statistical Arbitrage Engine** live as of today's most recent US market close by strictly following every step, anti-trap rule, earnings-binary quarantine rule, JSON schema, and visual QA gate defined in `AGENT_INSTRUCTIONS.md` inside this directory.

Mandatory execution order:
1. Run `python3 scripts/01_scan_stocks.py` to fetch live 1Y dividend-adjusted OHLCV across all peer pairs in `config/universe.json` and compute 1W (5d), 1M (21d), and 1Q (63d) spreads, 63d/21d ratio Z-scores, 126d correlations, MAs, RSI-14, and ATR-14.
2. Run `python3 scripts/02_fetch_valuations.py` to scrape live Forward P/E, trailing P/E, market cap, dividend yield, and **next earnings dates** from StockAnalysis across all active pairs.
3. Run `python3 scripts/03_audit_candles.py <CANDIDATE_LAGGARDS...>` on the top 12–15 lagging candidates to audit their exact last-10-session daily OHLC support holds vs. 20-EMA, 50-DMA, and 50-EMA.
4. Perform **mandatory live web searches** on the top candidate laggards (and major diverging Core pairs) to verify:
   - Most recent quarterly earnings beat/miss and **full-year guidance revisions** (flag/downgrade guidance cuts!).
   - Absence of accounting probes, product recalls, CEO/governance crises, or severe structural headwinds.
   - Absence of active **M&A merger arbitrage** between the two paired stocks (exclude live mergers from RV parity!).
   - **Earnings Binary Filter:** Quarantine or Tier-2-watchlist any laggard reporting earnings within `< 7` trading days.
5. Write `data/selected_setups.json` strictly matching `config/selected_setups.example.json` containing:
   - **Tier 1 (Top 2 distinct setups per horizon: 1W, 1M, 1Q = 6 setups max; zero imminent earnings binaries; verified intact fundamentals & candle support)**
   - **Tier 2 (Watchlist: imminent earnings catalyst, guidance-cut caution, or breakout pending)**
   - **Tier 3 (Quarantined Traps & Broken Trends — explicitly audit failing Core pairs + any excluded M&A pairs in `special_exclusions`)**
6. Run `python3 scripts/04_lock_targets.py`, then `python3 scripts/05_build_charts.py`, visually inspect ALL 4 generated PNG charts in `outputs/` for zero label collisions/clipping, then run `python3 scripts/06_build_report.py`.
7. Present `outputs/relative_value_parity_report.html` and deliver the complete institutional executive brief in chat with exact live prices, spreads, Z-scores, Forward P/E parity, verified fundamental anti-trap checks with citations, Patient Entry Zones, exact dividend-adjusted 50% & 100% price/ratio targets, invalidation stops, Entry R:R, and next earnings dates.
