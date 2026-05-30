# Elite AI Equity Research Stack

This repository contains two completely independent, quantitative/qualitative hybrid research tools built for institutional-grade stock analysis. 

The architecture is divided into two distinct applications that share a common mathematical library.

---

## 📂 Project Structure

```text
/
├── lib/                             # Shared Mathematical & Coherence logic
│   ├── indicators.js                # Correct Wilder's Smoothing for RSI, ATR, ADX, MACD
│   └── sanity.js                    # Outlier clamping & Coherence Linter (e.g. ROIC vs WACC checks)
│
├── stock_analyzer/                  # Application 1: The Deep-Dive Institutional Pitch Deck
│   ├── STOCK_RESEARCH_MASTER.md     # The Agent Playbook & Instruction Prompt
│   ├── stockfetch.js                # Fetches live YF data, peer comparisons, and calculates ROIC/WACC
│   ├── insiderfetch.js              # Deterministic SEC EDGAR scraper for Form 4 filings
│   └── stockmd.js                   # The HTML/CSS generator (Dashboard rendering engine)
│
├── screener/                        # Application 2: The Unified Alpha Screener
│   ├── SCREENER_MASTER.md           # The Agent Playbook & Instruction Prompt
│   ├── screener.js                  # Concurrently scans the S&P 500 for Coiled Springs & News Catalysts
│   └── neuralmd.js                  # Injects the AI's deep-web qualitative research into the dashboard
```

---

## 🚀 How to Use (Prompts for the AI Agent)

You can run these applications either independently or sequentially by providing the AI agent with specific prompts.

### Option 1: Run the Screener Only
Use this prompt when you want to hunt the market for new, actionable setups.
> **Prompt:** "I want to find the best actionable setups in the market right now. Follow the workflow defined in `screener/SCREENER_MASTER.md`. Run the technical screener, perform the AI Neural Hunt on the top 5 tickers, and generate the final dashboard."

### Option 2: Run a Deep-Dive on a Single Stock
Use this prompt when you already have a ticker in mind and want a 5-page institutional HTML pitch deck.
> **Prompt:** "I want to analyze ticker [INSERT TICKER]. Please use the workflow defined in `stock_analyzer/STOCK_RESEARCH_MASTER.md`. Execute the data gathering scripts, compile the research into the text format, and generate the final HTML report."

### Option 3: The Complete Alpha Workflow (Screen → Analyze)
Use this prompt to run the entire pipeline end-to-end.
> **Prompt:** "Run the market screener using `screener/SCREENER_MASTER.md` to identify the top setups and complete the AI Neural Hunt dashboard. Once finished, pick the absolute best idea from the screener and run a full deep-dive analysis on it using the `stock_analyzer/STOCK_RESEARCH_MASTER.md` workflow."

---

## 🛠️ Requirements & Setup
- Environment: Node.js (>= 20)
- Dependencies: `npm install yahoo-finance2`
- Ensure all execution occurs within the respective application directories (`cd stock_analyzer` or `cd screener`) so the relative paths to the `../lib` folder resolve correctly.
