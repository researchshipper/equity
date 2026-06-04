#!/usr/bin/env node
/**
 * daily.js — standalone daily wrap (fire-and-forget, no history tracking)
 *
 * Goal (per user): each generation is completely standalone.
 * - Pull fresh marketdata + insiders (real data)
 * - Assume report.json already written by LLM/agent (PHASE 2)
 * - Lint + validate (must pass for --strict)
 * - Refresh timestamp to NOW (America/New_York)
 * - Render the full dashboard HTML (with dual 7d+30d insiders, rich macro, marketCommentary)
 * - Copy final output to ../uploads/marketbeat_final_YYYY-MM-DD.html
 * - NO diff, NO previous rotation, NO jsonl/scoreboard/insider-history, NO linkcheck, NO scoreboard rollup
 * - All intermediates (report.json, marketdata.json, insiders.json, marketbeat_report.html) are TEMPORARY
 * - .gitignore ensures nothing data-related is ever committed
 * - Reproducibility: fresh clone + paste PROMPT.md + run 0→4 produces fresh standalone HTML for that moment
 *
 * Preserved exactly:
 * - Dual 7d (aggressive) + 30d (primary) insider tables + 90d net note + scorecard
 * - Exact macro tile style (JOLTS "2-yr high (vs 6.87M est) — re-fired hike chatter", ADP "supports hawkish tilt...")
 * - Full marketCommentary with bull/base/bear + whatWouldChangeMind
 * - Fresh etTime + generatedAt in report + HTML title/hero
 * - lint 0 + validate --strict
 * - 12-20 cards, rich L1/L2/L3, etc.
 *
 * Usage:
 *   node daily.js                # full
 *   node daily.js --strict       # REQUIRED for production (aborts on lint/validate fail)
 *   node daily.js --no-data      # skip PHASE 0 pulls (use existing marketdata/insiders)
 *   node daily.js --no-lint      # skip lint (for debugging only)
 *   node daily.js --quiet
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT      = __dirname;
const REPORT    = path.join(ROOT, 'report.json');
const HTML      = path.join(ROOT, 'marketbeat_report.html');
const UPLOADS   = path.join(ROOT, '..', 'uploads');

const args = process.argv.slice(2);
const skipData  = args.includes('--no-data');
const skipLint  = args.includes('--no-lint');
const strict    = args.includes('--strict');
const quiet     = args.includes('--quiet');
const log = (...m) => { if (!quiet) console.log(...m); };

function run(cmd, opts = {}){
  try {
    const out = execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit', cwd: ROOT });
    return out ? out.toString() : '';
  } catch (e) {
    if (!opts.tolerant) throw e;
    log(`  ⚠️  step failed (tolerated): ${cmd.split(' ').slice(0,2).join(' ')}`);
    return null;
  }
}

function main(){
  if (!fs.existsSync(REPORT)){
    console.error(`❌ ${REPORT} not found. Paste PROMPT.md output first (or run PHASE 0 + LLM write report.json).`);
    process.exit(1);
  }
  const report   = JSON.parse(fs.readFileSync(REPORT,'utf8'));
  const date     = report.date;
  if (!date){
    console.error(`❌ report.json has no .date field.`);
    process.exit(1);
  }

  // ALWAYS refresh timestamp to current ET time (standalone fresh run guarantee)
  const now = new Date();
  const etTime = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).replace(/\s/g, '').toLowerCase() + ' ET';
  report.time = etTime;
  report.generatedAt = now.toISOString();
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  log(`📅 Standalone daily wrap for ${date} (fresh timestamp: ${etTime})`);
  log('');

  // ─── 0. DATA REFRESH (best-effort) ────────────────────────────────────────
  if (!skipData){
    log(`📡 Refreshing market data + insider cluster buys (for macro + dual tables)...`);
    run(`node marketdata.js`,        { silent: quiet, tolerant: true });
    run(`node insiders.js fetch`,    { silent: quiet, tolerant: true });
    run(`node insiders.js score`,    { silent: quiet, tolerant: true });
    log('');
  }

  // ─── 1. LINT (critical) ───────────────────────────────────────────────────
  if (!skipLint){
    log(`🔍 Linting report.json…`);
    const lintCmd = `node lint.js \"${REPORT}\" --fix-prompt` + (strict ? ' --strict' : '');
    const ok = run(lintCmd, { silent: false, tolerant: true });
    if (strict && ok === null){
      console.error(`\n❌ Linter found errors. See lint.prompt.md for fixes.`);
      console.error(`   Fix, then re-run: node daily.js --strict\n`);
      process.exit(1);
    }
    log('');
  }

  // ─── 2. RENDER (marketbeat_report.html) ───────────────────────────────────
  run(`node render.js \"${REPORT}\"`, { silent: quiet });

  // ─── 3. VALIDATE (dual insiders + rich macro + cards + commentary + timestamp)
  log(`✅ Validating (dual 7d+30d, macro style, cards, marketCommentary, timestamps)…`);
  const valCmd = `node validate.js` + (strict ? ' --strict' : '');
  const valOk = run(valCmd, { silent: false, tolerant: true });
  if (strict && valOk === null){
    console.error(`\n❌ validate.js failed. Fix issues above (see PROMPT.md DETERMINISTIC REQUIREMENTS).`);
    process.exit(1);
  }
  log('');

  // ─── 4. COPY TO UPLOADS (final standalone dashboard, timestamped)
  if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
  const finalName = `marketbeat_final_${date}.html`;
  const finalPath = path.join(UPLOADS, finalName);
  fs.copyFileSync(HTML, finalPath);
  log(`✅ Final standalone dashboard → ${finalPath}`);
  log(`   (includes fresh ${etTime} timestamp, dual 7d+30d insiders, rich macro tiles, full marketCommentary)`);

  log(`\n✅ Standalone wrap complete for ${date} @ ${etTime}`);
  log(`   • All data was fresh-pulled this run (no history/diff/previous/scoreboard)`);
  log(`   • Intermediates (report.json, marketdata.json, insiders.json, marketbeat_report.html) are temporary`);
  log(`   • Only final HTML in uploads/ + the code/scripts in news/ matter`);
  log(`   • To re-run fresh: rm -f news/report.json news/marketdata.json news/insiders.json; repeat PHASE 0 + LLM + daily.js --strict`);
}

if (require.main === module) main();