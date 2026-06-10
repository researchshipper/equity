# SCREENER MASTER — v5 (READ THIS FIRST, AGENT)

⚠️ **AUTHORITATIVE WORKFLOW. The legacy path (screener.js + neuralmd.js, repo `arena2`) is DEPRECATED.**
Do NOT curl from `researchshipper/arena2` — that reference was stale. All code lives in THIS repo (`researchshipper/equity`), already checked out. Do not fetch scripts from the network.

## Run order (exactly this, fail loudly, never fall back to legacy)

```bash
# 0. Preflight — MUST print "13 passed, 0 failed". If it errors, STOP and report; do not run anything else.
node tests/selftest_v2.js

# 1. Screen (curated 75) or full S&P 500 merge:
node screener/screener_v5.js --top=15
node screener/screener_v5.js --universe=sp500 --top=15
```

**Hard rules for the agent:**
- If `screener_v5.js` throws (missing module, network error), REPORT THE ERROR. Falling back to `screener.js` is FORBIDDEN — it has known bugs (unclamped stops, analyst-target R:R inflation) that v5 exists to fix.
- Success criteria: console shows a `Regime:` line + a `STATE` column with values in {TRIGGERED, COILING, REVERSAL, EXTENDED}, and `screener_dump.json` + `top_tickers.txt` exist. If the output table says "COILED SPRING" or "WATCHING", you ran the WRONG script.

## What v5 does (so you can sanity-check it)
1. **Regime gate** — SPY/QQQ/IWM/HYG/IEF/VIX/RSP → RISK_ON / NEUTRAL / RISK_OFF, exposure multiplier, sector ETF leadership. In RISK_OFF only TRIGGERED setups survive.
2. **Liquidity gate** — price > $5, median $20M+ daily dollar volume.
3. **RS gate** — weighted 1m/3m/6m excess return vs SPY; only top 40% advance.
4. **Setup state machine** (`lib/setups.js`) — COILING (watch + alert level) → TRIGGERED (pivot break ≤3% past pivot, ≥1.4x vol, strong close = the entry) → EXTENDED (no chase; wait for retest). Stops clamped ≤8%; targets are measured-move with a 2R floor — NEVER analyst targets.
5. **Earnings flag** — ⚠️ if earnings within 7 days.

## Pass 2 — LLM reasoning over the dump (replaces legacy neuralmd flow)
Open `screener_dump.json`. It embeds its own rubric in the `instructions` field. Follow it exactly:
- Use ONLY numbers present in the file. Never invent prices, never cite from memory.
- Web-search 7-day news per candidate for catalyst fuel; conflicts between tape evidence and setup state cap conviction at 5.
- `earningsRisk: true` → conviction ≤4 or explicit gap-sizing note.
- Respect `regime.exposure` as the position-size ceiling.
- Output the strict JSON array the rubric specifies, then a 3-line portfolio note.

## Verification (maintainer)
Every cited price in the Pass-2 output must exist in `screener_dump.json` (same E012 discipline as Market Beat). Log every TRIGGERED signal to `screener_log.jsonl` for +7/+30/+90d forward-return scoring.

## File contract
| File | Producer | Consumer |
|---|---|---|
| `screener_dump.json` | screener_v5.js | LLM Pass 2 |
| `top_tickers.txt` | screener_v5.js | stock_analyzer/run_pipeline.js |
| `screener_log.jsonl` | maintainer/agent appends TRIGGERED rows | forward-return scorecard |

Legacy files `screener.js`, `neuralmd.js`, `screener_report.html`, `neural_insights.txt` are retained for history only. Delete them once v5 has produced 5 clean daily runs.
