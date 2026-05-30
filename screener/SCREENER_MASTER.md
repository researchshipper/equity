# 🚀 UNIFIED ALPHA SCREENER — PLAYBOOK

This is a standalone project separate from individual stock analysis. It hunts the market for explosive technical setups and layers on an AI Neural Hunt to identify unpriced fundamental catalysts.

## 🔄 EXECUTION ORDER

**STEP 1 ── Run the Technical Screener**
Run the highly-concurrent Node engine to scan the Top 70+ universe (or S&P500).
```bash
node screener.js
# Or to scan the S&P500: node screener.js --universe=sp500
```
*This generates `screener_report.html` (Tab 1) and exports the top 5 tickers to `top_tickers.txt`.*

**STEP 2 ── Read the Top 5 Tickers**
```bash
cat top_tickers.txt
```

**STEP 3 ── Execute AI Neural Hunt (Double Verification Directive)**
For each of the 5 tickers:
- Perform deep `web_search` specifically hunting for: Unannounced M&A rumors, Government contract awards (DoD/NASA), AI infrastructure partnerships, or macro tailwinds.
- Double verify facts. Do not rely solely on Yahoo Finance news; search alternative data sources, Reddit/Twitter sentiment mentions, or recent SEC filings.

**STEP 4 ── Write `neural_insights.txt`**
Format your research exactly like this, separated by `---`:

```text
TICKER: KTOS
RATING: STRONG BUY
ENTRY: 64.13
EXIT: 75.36
VAL_MOAT: Dominant provider of target drones for the DoD. Low-cost attritable mass is the new Pentagon procurement strategy.
TAILWINDS_RISKS: Tailwind: Rising geopolitical tensions. Risk: Margin compression from supply chain bottlenecks on solid rocket motors.
FUEL_NEWS: Recently awarded a $7M Counter-UAS contract. Rumors circulating about a new hypersonic testing facility in Indiana.
STORY_CHANGERS: 1. Transitioning from test drones to armed tactical drones (Valkyrie). 2. Potential acquisition target for larger defense primes.
---
TICKER: META
RATING: BUY
ENTRY: 632.51
EXIT: 673.01
VAL_MOAT: 3 billion Daily Active Users. Irreplaceable advertising duopoly with Google.
TAILWINDS_RISKS: Tailwind: AI dramatically improving ad targeting. Risk: $145B AI capex cycle compressing near-term FCF.
FUEL_NEWS: Quietly rolling out paid Meta AI subscriptions across WhatsApp, creating a massive new recurring revenue stream.
STORY_CHANGERS: 1. WhatsApp business API monetization finally scaling. 2. Llama 4 open-source models undercutting competitors' licensing revenues.
```

**STEP 5 ── Generate Final Dashboard**
```bash
node neuralmd.js neural_insights.txt
```
*This reads your text file and injects beautiful HTML cards into the second tab, creating `final_screener_report.html`.*
