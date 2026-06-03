#!/usr/bin/env node
/**
 * daily.js — one-command daily wrap (fixed-name strategy)
 *
 * Filename strategy:
 *   The repo always has the SAME 6 working files, never date-suffixed:
 *
 *     report.json                       ← today's content
 *     report.previous.json              ← yesterday's content (overwritten each new day)
 *     marketbeat_report.html            ← today's rendered HTML
 *     marketbeat_report.previous.html   ← yesterday's rendered HTML
 *     marketbeat_diff.html              ← today vs previous
 *     scoreboard_7d.html                ← 7-day cumulative ticker scoreboard
 *
 *   The DATE lives INSIDE each file (in JSON's `.date` field and in the
 *   rendered HTML's <title> + header). No filename ever changes day-to-day.
 *
 *   Long-term archive: news/history.jsonl — one line per day with the full
 *   compacted report. Append-only, grep-friendly, never overwritten.
 *
 * What daily.js does (in order):
 *   1. Lints report.json  (--strict aborts on errors)
 *   2. Rotates yesterday's files: report.json → report.previous.json,
 *                                 marketbeat_report.html → marketbeat_report.previous.html
 *      (only if the existing file's date is DIFFERENT from today's — idempotent
 *      across multiple same-day runs)
 *   3. Renders new marketbeat_report.html from today's report.json
 *   4. Appends to scoreboard.jsonl (idempotent per date)
 *   5. Appends to history.jsonl (idempotent per date)
 *   6. Runs diff.js (report.previous.json → report.json)
 *   7. Refreshes scoreboard_7d.html
 *   8. Auto-prunes any stray date-suffixed files (migration from old layout)
 *
 * Designed to be safe to run multiple times per day and to handle gaps
 * (weekends / holidays / missed days) gracefully.
 *
 * Usage:
 *   node daily.js                # full wrap
 *   node daily.js --strict       # abort if linter finds errors
 *   node daily.js --no-diff      # skip diff step
 *   node daily.js --no-board     # skip scoreboard refresh
 *   node daily.js --no-lint      # skip linter
 *   node daily.js --quiet        # less console output
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT      = __dirname;
const REPORT    = path.join(ROOT, 'report.json');
const PREV      = path.join(ROOT, 'report.previous.json');
const HTML      = path.join(ROOT, 'marketbeat_report.html');
const HTML_PREV = path.join(ROOT, 'marketbeat_report.previous.html');
const HISTORY   = path.join(ROOT, 'history.jsonl');
const LOG       = path.join(ROOT, 'scoreboard.jsonl');

// Rolling-window cap: history.jsonl keeps the last N daily summaries.
// 90 days ≈ 1 quarter ≈ ~90 KB at ~1 KB/day. Override: HISTORY_MAX_DAYS=180
const HISTORY_MAX_DAYS = parseInt(process.env.HISTORY_MAX_DAYS, 10) || 90;

const args = process.argv.slice(2);
const skipDiff  = args.includes('--no-diff');
const skipBoard = args.includes('--no-board');
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

function readDate(p){
  try { return JSON.parse(fs.readFileSync(p,'utf8')).date; }
  catch { return null; }
}

function main(){
  if (!fs.existsSync(REPORT)){
    console.error(`❌ ${REPORT} not found. Run \`node newsbeat.js\` or paste PROMPT.md output first.`);
    process.exit(1);
  }
  const report   = JSON.parse(fs.readFileSync(REPORT,'utf8'));
  const date     = report.date;
  if (!date){
    console.error(`❌ report.json has no .date field.`);
    process.exit(1);
  }
  const prevDate = fs.existsSync(PREV) ? readDate(PREV) : null;

  log(`📅 daily wrap for ${date}`);
  if (prevDate) log(`   previous on file: ${prevDate}`);
  log('');

  // ─── 1. LINT ─────────────────────────────────────────────────────────────
  if (!skipLint){
    log(`🔍 Linting report.json…`);
    const lintCmd = `node lint.js "${REPORT}" --fix-prompt` + (strict ? ' --strict' : '');
    const ok = run(lintCmd, { silent: false, tolerant: true });
    if (strict && ok === null){
      console.error(`\n❌ Linter found errors. See lint.prompt.md for an agent-readable fix list.`);
      console.error(`   Once fixed, re-run: node daily.js --strict\n`);
      process.exit(1);
    }
    log('');
  }

  // ─── 2. ROTATE HTML (idempotent) ─────────────────────────────────────────
  // The existing marketbeat_report.html on disk is yesterday's render (since
  // we haven't re-rendered today yet). Copy it to marketbeat_report.previous.html
  // BEFORE we re-render — but only if its embedded date differs from today's
  // (so same-day re-runs don't clobber the real "yesterday" HTML).
  //
  // For report.previous.json: yesterday's daily.js already promoted yesterday's
  // report.json → report.previous.json as its FINAL step, so PREV is already
  // correct when today's daily.js starts. We just verify and announce.
  if (fs.existsSync(PREV)){
    if (prevDate === date){
      log(`🔁 report.previous.json already matches today (${date}) — same-day re-run.`);
    } else if (prevDate > date){
      log(`⚠️  report.previous.json (${prevDate}) is AFTER today (${date}). Check your dates.`);
    } else {
      log(`🔁 report.previous.json is ${prevDate} — good baseline for diff.`);
    }
  } else {
    log(`🔁 First run — no report.previous.json exists yet (diff will be skipped).`);
  }

  if (fs.existsSync(HTML)){
    const htmlContent = fs.readFileSync(HTML, 'utf8');
    const titleMatch  = htmlContent.match(/<title>[^·]*·\s*([0-9-]{10})/);
    const htmlDate    = titleMatch ? titleMatch[1] : null;
    if (htmlDate && htmlDate !== date){
      fs.copyFileSync(HTML, HTML_PREV);
      log(`   ✓ marketbeat_report.html (${htmlDate}) → marketbeat_report.previous.html`);
    } else if (htmlDate === date){
      log(`   ✓ marketbeat_report.html already matches today — no HTML rotation needed`);
    }
  }

  // ─── 3. RENDER (overwrites marketbeat_report.html) ───────────────────────
  run(`node render.js "${REPORT}"`, { silent: quiet });

  // ─── 4. SCOREBOARD APPEND ────────────────────────────────────────────────
  run(`node scoreboard.js append "${REPORT}"`, { silent: quiet });

  // ─── 5. HISTORY.JSONL APPEND (idempotent per date) ───────────────────────
  appendHistory(date, report);

  // ─── 6. DIFF (uses fixed names: report.previous.json → report.json) ──────
  // Skip if previous == today (same-day re-run where diff would be meaningless),
  // or if no previous exists at all (first ever run).
  if (skipDiff){
    // user opted out
  } else if (!fs.existsSync(PREV)){
    log(`\n⏭  Diff skipped — no report.previous.json yet (first run).`);
    log(`   Tomorrow, daily.js will use today's report.json as the previous.`);
  } else if (prevDate === date){
    log(`\n⏭  Diff skipped — report.previous.json already matches today (${date}).`);
    log(`   This is normal on a same-day re-run.`);
  } else {
    log('');
    run(`node diff.js`, { silent: quiet, tolerant: true });
  }

  // ─── 7. SCOREBOARD ROLLUP ────────────────────────────────────────────────
  if (!skipBoard){
    log('');
    run(`node scoreboard.js show --days=7`, { silent: quiet });
  }

  // ─── 8. MIGRATE: clean up any old date-suffixed files ────────────────────
  pruneLegacyDateSuffixed();

  // ─── 9. PROMOTE today → previous (for tomorrow's run) ────────────────────
  // We write report.previous.json LAST so that if anything above failed,
  // we still have the OLD previous as a safety net. Only after a clean run
  // do we promote today's report to be tomorrow's "previous".
  fs.copyFileSync(REPORT, PREV);
  log(`\n   ✓ report.json (${date}) copied to report.previous.json for tomorrow's diff`);

  log(`\n✅ Daily wrap complete for ${date}`);
  log(`   • report.json                  (today: ${date})`);
  log(`   • report.previous.json         (will become "yesterday" tomorrow)`);
  log(`   • marketbeat_report.html       (today's render)`);
  if (fs.existsSync(HTML_PREV))
    log(`   • marketbeat_report.previous.html (yesterday's render — for LLM reference)`);
  if (!skipDiff && fs.existsSync(PREV))
    log(`   • marketbeat_diff.html         (today vs previous)`);
  log(`   • history.jsonl                (full-report archive, one line per day)`);
  log(`   • scoreboard.jsonl             (per-ticker daily log)`);

  log(`\n   Commit:  git add news/report.json news/report.previous.json \\`);
  log(`                   news/marketbeat_*.html news/history.jsonl news/scoreboard.jsonl`);
}

// ─── history.jsonl ──────────────────────────────────────────────────────────
// One JSON line per day with a compact summary of the full report.
// Rolling-window: keeps the last HISTORY_MAX_DAYS days (default 90).
// Idempotent: re-running the same date replaces the existing line.
//
// Why bounded? The repo is committed; an unbounded log would grow ~1 KB/day
// (~365 KB/year forever). Capping at 90 days keeps it under 100 KB while
// still letting an LLM say "MRVL was a top winner 2 months ago today".
function appendHistory(date, report){
  const entry = {
    date,
    title: report.title,
    subtitle: report.subtitle,
    cards: report.news?.length || 0,
    tickers: report.tickerTable?.length || 0,
    topWinners: (report.leaderboard?.winners || []).slice(0,3).map(w => w.name),
    topLosers:  (report.leaderboard?.losers  || []).slice(0,3).map(l => l.name),
    macroHeadline: report.macro?.headline || null,
    regime: report.macro?.regime || null,
    appended: new Date().toISOString(),
  };

  let lines = [];
  if (fs.existsSync(HISTORY)){
    lines = fs.readFileSync(HISTORY,'utf8').split('\n').filter(Boolean);
  }
  // Drop existing line for this date (idempotent re-run)
  lines = lines.filter(l => {
    try { return JSON.parse(l).date !== date; }
    catch { return true; }
  });
  lines.push(JSON.stringify(entry));
  // Sort chronologically
  lines.sort((a,b) => {
    try { return JSON.parse(a).date.localeCompare(JSON.parse(b).date); }
    catch { return 0; }
  });
  // Rolling-window prune: keep only last HISTORY_MAX_DAYS
  const before = lines.length;
  lines = lines.slice(-HISTORY_MAX_DAYS);
  const dropped = before - lines.length;

  fs.writeFileSync(HISTORY, lines.join('\n') + '\n');
  const sizeKB = (fs.statSync(HISTORY).size / 1024).toFixed(1);
  log(`📚 history.jsonl: ${lines.length} day(s), ${sizeKB} KB (cap: ${HISTORY_MAX_DAYS} days)${dropped > 0 ? ` — pruned ${dropped} older entry(ies)` : ''}`);
}

// ─── migration: clean up old date-suffixed files from previous version ──
function pruneLegacyDateSuffixed(){
  const stale = fs.readdirSync(ROOT).filter(f =>
    /^report\.\d{4}-\d{2}-\d{2}\.json$/.test(f) ||
    /^marketbeat_report_\d{4}-\d{2}-\d{2}\.html$/.test(f) ||
    /^marketbeat_diff_\d{4}-\d{2}-\d{2}\.html$/.test(f) ||
    /^diff\.\d{4}-\d{2}-\d{2}\.json$/.test(f)
  );
  if (stale.length){
    for(const f of stale) fs.unlinkSync(path.join(ROOT, f));
    log(`   🧹 migrated away from legacy date-suffixed names (removed ${stale.length} file${stale.length===1?'':'s'})`);
  }
}

if (require.main === module) main();
