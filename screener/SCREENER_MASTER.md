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

## Pass 2 — LLM reasoning over the dump (HARD-GATED)
1. Open `screener_dump.json`; follow its embedded `instructions` rubric. Use ONLY numbers in the file. Web-search 7-day news per candidate — the `fuel` field is MANDATORY for every row: state the catalyst found, or write exactly "No fresh catalyst found in 7-day search" (proves the search ran).
2. Write the strict JSON array to `pass2.json`. Required keys per row: `sym, conviction, hold, thesis, invalidation, fuel`.
3. **Gate:** `node screener/lint_pass2.js pass2.json screener_dump.json` — if it exits non-zero, FIX pass2.json and rerun. Rendering or publishing un-linted output is FORBIDDEN.
4. **Render:** `node screener/render_v5.js pass2.json screener_dump.json` → `screener_report_YYYY-MM-DD.html`. The renderer is deterministic — NEVER hand-write the report HTML; the approved format is locked in code.

## Verification & ledger (maintainer)
`screener_v5.js` auto-APPENDS every TRIGGERED signal to `screener_log.jsonl` — one JSON line per signal, never overwritten. This is the forward-return ledger; the scorecard computes +7/+30/+90d returns per row.

**Commit after every run:** `screener_log.jsonl` (appended), `screener_dump.json` (overwritten — latest evidence), `pass2.json`, and the dated `screener_report_YYYY-MM-DD.html` (history preserved by filename).

## File contract
| File | Producer | Consumer |
|---|---|---|
| `screener_dump.json` | screener_v5.js | LLM Pass 2 |
| `top_tickers.txt` | screener_v5.js | stock_analyzer/run_pipeline.js |
| `pass2.json` | LLM Pass 2 | lint_pass2.js → render_v5.js |
| `screener_log.jsonl` | screener_v5.js (auto-append, NEVER overwrite) | forward-return scorecard |
| `screener_report_YYYY-MM-DD.html` | render_v5.js (deterministic) | human review / repo history |

Legacy files `screener.js`, `neuralmd.js`, `screener_report.html`, `neural_insights.txt` are retained for history only. Delete them once v5 has produced 5 clean daily runs.
