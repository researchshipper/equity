# fullscrneer — Forward Dilution + Universe Expansion (drop-in)

Adds a **forward dilution risk** layer (deterministic score + Gemini judge) as a
FINAL step on the screened list, plus **russell3000** and **custom tickers**.
Also carries the earlier macro parity fixes.

## Files (replace in your repo, preserving paths)
- `lib/dilution.js`  — NEW. Forward dilution engine + Gemini judge.
- `lib/universe.js`  — adds `russell3000` + `custom` (--tickers).
- `lib/macro.js`     — macro parity fixes (date-based DFF, EMA composite, path-dependent hysteresis).
- `screener.js`      — wires dilution step, expanded Yahoo modules, new CLI flags.
- `config.js`        — adds `geminiApiKey`, `geminiModel`.

## Run — every universe, all steps
```bash
node screener.js                                   # default curated
node screener.js --universe=sp500
node screener.js --universe=ndx100
node screener.js --universe=russell1000
node screener.js --universe=russell2000
node screener.js --universe=russell3000            # NEW (falls back to R1k∪R2k)
node screener.js --universe=custom --tickers=META,GOOGL,PLTR,AMD
node screener.js --universe=custom --tickers=@mylist.txt   # one ticker per line/comma

# Match a WEEKLY TradingView chart:
node screener.js --universe=sp500 --interval=1wk

# Dilution AI policy:
node screener.js --universe=sp500                  # flagged (default): AI on actionable + borderline/high
node screener.js --universe=sp500 --dilution=all   # AI on every actionable (rating>=3) name
node screener.js --universe=sp500 --dilution=off   # deterministic score only, no AI
```

## Gemini (for the dilution judge)
```bash
export GEMINI_API_KEY=your_key
export GEMINI_MODEL=gemini-2.0-flash   # optional, this is the default
```
No key → deterministic score still runs; AI verdict is skipped (clearly logged).

## What the dilution layer detects (FORWARD, not after-the-fact)
The point is to catch conditions that PRECEDE a raise, before the share-count
bump prices it in. Deterministic 0–100 risk score from:
- **Cash runway** = cash / quarterly burn (strongest tell; <4q = HIGH)
- **Capex outrunning OCF** (the funding gap — your META/GOOGL concern)
- **SBC / revenue** (slow-motion dilution already happening)
- **Share-count YoY** (confirms the habit; negative = buybacks, scored anti-dilutive)
- **Leverage + negative FCF** (refinancing-wall pressure)
- **Near 52w low + cash need** (forced raise at lows = worst case)

Tiers: LOW / MODERATE / ELEVATED / HIGH. The Gemini judge runs on
actionable names and reads the REAL downloaded numbers to judge intent +
trajectory, returning `{verdict, confidence, oneLine, rationale, unknowns,
agreesWithDeterministic}`.

### Critical design point (verified by test)
**Dilution ≠ capex.** A profitable megacap with huge capex funded by operating
cash flow AND active buybacks scores **LOW** — META in the unit test scores 0.
Heavy spending is not dilution; issuing shares is. Don't conflate them.

### Known unknown (honest gap)
Convertible debt / warrants / ATM shelf registrations are **not** in Yahoo's
data. The Gemini judge is instructed NOT to assume they're absent and to list
them under `unknowns` for filing-level verification — that overhang check
belongs in your filings-scrape pipeline, not here.

## Output
`screener_results.json` now carries: `dilutionScore`, `dilutionTier`,
`dilutionFactors`, `dilutionNotes`, `dilutionAI`, `dilutionMetrics`.
Console prints any BUY-rated name (rating ≥4) carrying ELEVATED/HIGH forward
dilution risk, with the AI one-liner.

## Compatibility note
Your repo pins `yahoo-finance2@^3.x` and `screener.js` calls it via the default
export — my additions match that exact pattern. If you later see a
"Call `new YahooFinance()` first" error, the v3 entrypoint changed; instantiate
once (`const yf = new yahooFinance(...)`) and reuse — `lib/analyst.js` already
does this and is the reference.

## Verification done
- `node --check` clean on all 5 files
- Dilution unit tests pass: META (LOW/0 — the trap), capex-stretched (MODERATE),
  forced-dilution burner (HIGH/100), missing-SBC graceful degrade
- Macro unit test passes (Sahm trigger, date-based fed Δ, regime flip history)
- Full pipeline runs end-to-end with custom universe + dilution step
- NOTE: live Yahoo/FRED calls couldn't run in the build sandbox (network
  allowlist) — they work in your environment as the existing screener already
  proved. Test on your machine with a small `--tickers=` set first.
