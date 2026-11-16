# Single-Stock Relative-Value & Statistical Arbitrage Engine (v2 · S&P 500 Funnel)

Institutional multi-horizon (**1W / 1M / 1Q**) single-stock parity divergence scanner, anti-trap fundamental verification protocol, chart engine, and self-contained interactive dark-mode HTML tearsheet generator.

### What's New in v2 (3-Layer Full-Market Funnel)
* **Full Market Breadth (~1,500+ Pairs, Not Locked to 41 Static Pairs):** Automatically combines:
  1. **Curated `CORE` + `EXP` Anchors** (`config/universe.json` — 41 flagship pairs including cross-sub-industry twins)
  2. **Full S&P 500 GICS Sub-Industry Auto-Pairs** (`config/sp500_gics.json` — 500 CIK-deduplicated constituents across 98 GICS sub-industries → ~1,450+ peer pairs; drops dual-class self-clones like `GOOGL/GOOG`, `FOXA/FOX`, `NWSA/NWS`; auto-syncs via Wikipedia every 14 days or `--refresh-sp500` with offline fallback)
  3. **Optional Bounded `DYNAMIC` Hot-Theme Radar** (`data/dynamic_pairs.json` — agent can propose 4–8 current-market non-S&P 500 / ADR / thematic pairs in Step 0, all strictly gated by the exact same deterministic math!)
* **Blazing-Fast ~11s Pipeline Runtime (No Bloat, No Rate Limits):**
  * **Step 1 (`01_scan_stocks.py`):** Pooled 20-thread Yahoo Finance OHLCV fetch + single-call vectorized correlation & Z-score matrix across **~480 stocks / ~1,500 pairs** finishes in **~5–7 seconds** and outputs a deterministic **6-bucket Funnel Shortlist** (anti-spam caps: max 1 per laggard, max 2 per sub-industry).
  * **Step 2 (`02_fetch_valuations.py`):** Scrapes StockAnalysis Forward P/E, dividend yields, and next earnings dates **only for the Funnel Shortlist (~45–75 unique tickers)** in **~3–5 seconds** — never triggers rate limits even at full S&P 500 scale.
  * **Step 3 (`03_audit_candles.py`):** Audits last-10-session daily OHLC support vs. 20-EMA, 50-DMA & 50-EMA for all actionable shortlist laggards in **<0.3 seconds**.
  * **Step 4 (`04_lock_targets.py`):** Self-healing deterministic math lock (auto-fetches any selected ticker missing from cache/valuations).

### Folder Contents
* `PROMPT.md` — Copy-paste daily execution prompt for **any AI agent** (Claude Code, Cursor, Codex, Arena.ai, Gemini CLI).
* `AGENT_INSTRUCTIONS.md` / `CLAUDE.md` — Complete Step 0–6 SOP, anti-trap rules, JSON schema, and mandatory visual QA gates.
* `config/universe.json` — Curated `CORE` + `EXP` anchor pairs & tunable funnel settings (`min_sp500_corr`, shortlist caps, `include_sp500_gics`).
* `config/sp500_gics.json` — Committed live CIK-deduplicated S&P 500 GICS Sub-Industry snapshot (auto-refreshes cleanly or via `--refresh-sp500`).
* `config/dynamic_pairs.example.json` — Schema template for optional Step 0 `data/dynamic_pairs.json`.
* `config/selected_setups.example.json` — Exact schema template for Step 5 `data/selected_setups.json`.
* `scripts/01_scan_stocks.py` … `06_build_report.py` — Deterministic Python execution, charting, and HTML tearsheet pipeline.

### Quick Start
```bash
pip install -r ../requirements.txt   # pandas numpy requests beautifulsoup4 matplotlib

# Optional Step 0: write timely non-S&P 500 pairs to data/dynamic_pairs.json
python3 scripts/01_scan_stocks.py              # ~6s: Full S&P 500 + Core + Dynamic -> Funnel Shortlist
python3 scripts/02_fetch_valuations.py         # ~4s: StockAnalysis Fwd P/E & Earnings for Shortlist only
python3 scripts/03_audit_candles.py            # <1s: 10-session OHLC candle audit for Shortlist laggards
# -> Run live web anti-trap QA & write data/selected_setups.json
python3 scripts/04_lock_targets.py             # Deterministic 50%/100% targets & Entry R:R
python3 scripts/05_build_charts.py             # 4 dark-mode 200-DPI PNG charts (visually QA!)
python3 scripts/06_build_report.py             # Self-contained HTML tearsheet -> outputs/
```

### Useful CLI Flags
```bash
python3 scripts/01_scan_stocks.py --refresh-sp500   # Force live Wikipedia S&P 500 constituent refresh
python3 scripts/01_scan_stocks.py --core-only       # Run curated config/universe.json + dynamic only
python3 scripts/01_scan_stocks.py --use-cache       # Re-rank locally without re-downloading OHLCV
python3 scripts/02_fetch_valuations.py AAPL MSFT    # Append extra tickers into stock_valuations.json
```
