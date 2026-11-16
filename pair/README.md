# Single-Stock Relative-Value & Statistical Arbitrage Engine

Institutional multi-horizon (`1W`, `1M`, `1Q`) Single-Stock Peer Parity Divergence Scanner.
Screens 16 Core Peer Clusters + 25+ Breakout-Sector Equity Twins, pulls live Forward P/E, dividend yields, and next earnings dates from StockAnalysis, enforces strict **Anti-Trap Fundamental & Earnings Binary Filters**, generates 4 dark-mode 200-DPI institutional charts, and compiles a self-contained interactive HTML tearsheet (`outputs/relative_value_parity_report.html`).

## Daily Agent Workflow
1. Ensure dependencies are installed (`pip install -r ../requirements.txt`).
2. Paste `PROMPT.md` into any AI agent with shell + web search access.
3. The agent runs `scripts/01` → `02` → `03`, executes **live Q3/recent-quarter earnings, guidance, M&A & governance web checks** on candidate laggards, writes `data/selected_setups.json`, runs `scripts/04` → `05` → `06`, visually inspects all 4 PNG charts, and delivers the HTML tearsheet + executive brief.

## Customizing the Stock Peer Universe
Edit `config/universe.json` to add or edit peer pairs (`["TICKER_A", "TICKER_B", "Peer Cluster", "CORE|EXP"]`). The scanner dynamically orients Leader vs. Laggard on every run.
