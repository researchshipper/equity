# HTML Report Generation & Log Tracking Guide (v5)

## What we improved:
1. **Built-in Ledger Tracking:** `screener_v5.js` now natively auto-appends `TRIGGERED` events to `screener_log.jsonl` immediately upon generating the daily output. You don't have to manage this log manually anymore!
2. **Missing Dependency Fix:** Added `lib/scorecard.js` which was causing `screener_v5.js` to crash when trying to evaluate the ledger.
3. **Strict LLM Verification:** Verified compatibility with your new `lint_pass2.js` by ensuring the report generator supports all newly enforced schemas (e.g., the `fuel` catalyst metric). 
4. **Unified HTML View:** The newly built `build_report.js` generates a single HTML document that displays BOTH the daily LLM-analyzed candidates AND your entire chronological history parsed directly from `screener_log.jsonl`.

---

## Workflow Instructions

### 1. Run the Quantitative Screener
This will evaluate S&P 500 candidates, save to `screener/screener_dump.json`, and **automatically** append any newly triggered candidates to your `screener/screener_log.jsonl`.
```bash
node screener/screener_v5.js --universe=sp500 --top=15
```

### 2. Generate LLM Analysis (Pass 2)
Supply `screener/screener_dump.json` to your agent/LLM to generate `screener/pass2.json`. Ensure it strictly adheres to the formatting enforced by the linter.
```bash
node screener/lint_pass2.js screener/pass2.json screener/screener_dump.json
```
*(Only proceed if this returns `✅ lint_pass2: X rows clean.`)*

### 3. Build the Unified HTML Report
Merge your daily outputs and your historical ledger tracking into a single HTML file.
```bash
node screener/build_report.js
```

### 4. Review
Open the outputted **`screener/screener_report_v5.html`**. You will find your ranked setups for the day on top, and your ongoing historical `jsonl` log tracked seamlessly at the bottom.

## Git Committing & Pushing
When you are ready to persist these changes back to GitHub, run the following:

```bash
git add lib/scorecard.js screener/build_report.js screener/REPORT_INSTRUCTIONS.md screener/screener_log.jsonl screener/screener_report_v5.html
git commit -m "feat: implement unified html report and fix missing scorecard dependency"
git push origin update
```
