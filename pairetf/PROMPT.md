Act as an Institutional Cross-Asset Quant Strategist and ETF Relative-Value Desk PM.

Run the **ETF Parity Divergence Engine** live as of today's most recent US market close by strictly following every step, anti-trap rule, JSON schema, and visual QA gate defined in `AGENT_INSTRUCTIONS.md` inside this directory.

Mandatory execution order:
1. Run `python3 scripts/01_scan_etfs.py` to scan live 1Y dividend-adjusted OHLCV across `config/universe.json` (1W / 5d, 1M / 21d, 1Q / 63d spreads, 63d/21d ratio Z-scores, 126d correlation, RSI-14, ATR-14, 20-EMA/50-DMA/50-EMA).
2. Run `python3 scripts/02_fetch_flows_breadth.py` to pull live ETFdb 5D/1M/3M net flows and StockAnalysis/SSGA constituent breadth (`% above 20-DMA` and `% above 50-DMA`, plus top-holding concentration) for the active leaders and candidate laggards.
3. Run `python3 scripts/03_audit_candles.py <CANDIDATE_TICKERS...>` on the top 10–14 lagging ETFs to verify exact last-10-session daily OHLC support holds vs. 20-EMA, 50-DMA, and 50-EMA.
4. Perform live web searches on the current macro/sector rotation regime, ETF fund flows, and any idiosyncratic constituent/index distortions (e.g., mega-cap weight skew, oil/yield/policy shock, biotech FDA/M&A event) before finalizing picks.
5. Write `data/selected_setups.json` strictly matching `config/selected_setups.example.json` with:
   - **Tier 1 (Top 2 setups per horizon: 1W, 1M, 1Q = 6 setups max; fewer ONLY if fewer genuinely pass anti-trap filters)**
   - **Tier 2 (Reclaim / Flow Caution Watchlist)**
   - **Tier 3 (Quarantined Broken-Trend / Falling-Knife ETFs — explicitly audit any Core 7 pairs that fail!)**
6. Run `python3 scripts/04_lock_targets.py`, then `python3 scripts/05_build_charts.py`, visually inspect ALL 4 generated PNG charts in `outputs/` for zero label overlap/clipping, then run `python3 scripts/06_build_report.py`.
7. Present `outputs/etf_parity_divergence_report.html` and deliver the concise institutional executive brief in chat with exact prices, dividend-adjusted 50% & 100% catch-up targets, pairs ratios, patient entry zones, invalidation stops, Entry R:R, breadth/flow checks, and cited sources.
