# ETF Parity Divergence Engine

Institutional multi-horizon (`1W`, `1M`, `1Q`) ETF Relative-Value & Catch-Up Scanner.
Screens Core 7 + 25+ Sector, Style & Thematic ETF pairs, pulls live ETFdb net flows and constituent breadth (`% > 20-DMA` / `% > 50-DMA`), enforces strict Anti-Trap trend/support filters, generates 4 high-DPI dark-mode charts, and compiles a self-contained interactive HTML tearsheet (`outputs/etf_parity_divergence_report.html`).

## Daily Agent Workflow
1. Ensure dependencies are installed (`pip install -r ../requirements.txt`).
2. Paste `PROMPT.md` into any AI agent with shell + web search access.
3. The agent executes `scripts/01` → `02` → `03`, runs live macro/flow/constituent web checks, writes `data/selected_setups.json`, runs `scripts/04` → `05` → `06`, visually inspects all 4 PNG charts, and delivers the HTML tearsheet + executive summary.

## Customizing the ETF Universe
Edit `config/universe.json` to add or modify ETF pairs (`["LEADER_OR_A", "LAGGARD_OR_B", "Cluster Label", "CORE|EXP"]`). The scanner automatically assigns the outperforming leg as Leader for each horizon.
