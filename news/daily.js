#!/usr/bin/env node
/**
 * daily.js — one-command daily wrap
 *
 * What it does:
 *   1. Reads the date from report.json
 *   2. Snapshots it as report.<date>.json (idempotent — overwrites if exists)
 *   3. Appends today's tickers to scoreboard.jsonl (idempotent per date)
 *   4. Renders marketbeat_report_<date>.html
 *   5. Runs diff.js against the most recent prior snapshot
 *   6. Refreshes scoreboard_7d.html
 *
 * Designed to be safe to run multiple times per day and to handle gaps
 * (weekends / holidays / missed days) without complaining — diff falls back
 * to "last available prior snapshot" rather than requiring strict yesterday.
 *
 * Usage:
 *   node daily.js                # full wrap
 *   node daily.js --no-diff      # skip the day-over-day diff step
 *   node daily.js --no-board     # skip the scoreboard refresh
 *   node daily.js --quiet        # less console output
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT      = __dirname;
const REPORT    = path.join(ROOT, 'report.json');
const LOG       = path.join(ROOT, 'scoreboard.jsonl');

const args = process.argv.slice(2);
const skipDiff  = args.includes('--no-diff');
const skipBoard = args.includes('--no-board');
const skipLint  = args.includes('--no-lint');
const strict    = args.includes('--strict');  // fail (exit 1) on linter errors
const quiet     = args.includes('--quiet');
const log = (...m) => { if (!quiet) console.log(...m); };

function run(cmd, opts = {}){
  try {
    const out = execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit', cwd: ROOT });
    return out ? out.toString() : '';
  } catch (e) {
    if (!opts.tolerant) throw e;
    // tolerant: surface the failure as a warning, keep going
    log(`  ⚠️  step failed (tolerated): ${cmd.split(' ').slice(0,2).join(' ')}`);
    return null;
  }
}

function main(){
  if (!fs.existsSync(REPORT)){
    console.error(`❌ ${REPORT} not found. Run \`node newsbeat.js\` or paste PROMPT.md output first.`);
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(REPORT,'utf8'));
  const date   = report.date;
  if (!date){
    console.error(`❌ report.json has no .date field.`);
    process.exit(1);
  }

  log(`📅 daily wrap for ${date}\n`);

  // 0. LINT — fail fast if the report is missing required sections.
  // In strict mode, abort with exit 1 + write lint.prompt.md so an agent
  // can read it and re-emit a corrected report.json before retrying daily.js.
  if (!skipLint){
    log(`🔍 Linting report.json…`);
    const lintCmd = `node lint.js "${REPORT}" --fix-prompt` + (strict ? ' --strict' : '');
    // lint.js exits 1 on errors. In strict mode we honour that and abort.
    // In default mode we surface the errors but keep going (warnings/errors
    // get printed but daily.js still snapshots + renders).
    const ok = run(lintCmd, { silent: false, tolerant: true });
    if (strict && ok === null){
      console.error(`\n❌ Linter found errors. See lint.prompt.md for an agent-readable fix list.`);
      console.error(`   Once fixed, re-run: node daily.js --strict\n`);
      process.exit(1);
    }
    log(``);
  }

  // 1. Snapshot report.<date>.json
  const snap = path.join(ROOT, `report.${date}.json`);
  fs.writeFileSync(snap, JSON.stringify(report, null, 2));
  log(`  ✓ snapshot → report.${date}.json`);

  // 2. Append to scoreboard (idempotent per date)
  run(`node scoreboard.js append "${REPORT}"`, { silent: quiet });

  // 3. Render today's HTML
  run(`node render.js "${REPORT}"`, { silent: quiet });

  // 4. Diff against last prior snapshot (gap-tolerant)
  if (!skipDiff){
    log(``);
    run(`node diff.js`, { silent: quiet, tolerant: true });
  }

  // 5. Refresh 7-day scoreboard
  if (!skipBoard){
    log(``);
    run(`node scoreboard.js show --days=7`, { silent: quiet });
  }

  log(``);
  log(`✅ Daily wrap complete for ${date}`);
  log(`   • report.${date}.json (snapshot)`);
  log(`   • marketbeat_report_${date}.html`);
  if (!skipDiff)  log(`   • marketbeat_diff_${date}.html (if a prior snapshot exists)`);
  if (!skipBoard) log(`   • scoreboard_7d.html`);

  // 6. Prune old snapshots — keep only the most-recent prior snapshot
  // (the one diff.js needs tomorrow) plus today's. Older ones are deleted.
  // This keeps the repo focused: the LLM sees at most 1 prior reference,
  // and never confuses it for input data.
  pruneOldSnapshots(date);

  log(`\n   Commit:  git add news/report.json news/report.${date}.json news/scoreboard.jsonl news/marketbeat_*${date}.html`);
}

function pruneOldSnapshots(currentDate){
  const snaps = fs.readdirSync(ROOT)
    .filter(f => /^report\.\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => ({ file: f, date: f.replace(/^report\./,'').replace(/\.json$/,'') }))
    .sort((a,b) => a.date.localeCompare(b.date));

  // Always keep today's. Keep the most-recent strictly-before-today as the "yesterday" baseline.
  const today    = snaps.filter(s => s.date === currentDate);
  const priors   = snaps.filter(s => s.date < currentDate);
  const yesterday = priors.length ? priors[priors.length - 1] : null;
  const keep = new Set([...today.map(s=>s.file), ...(yesterday ? [yesterday.file] : [])]);

  let pruned = 0;
  for(const s of snaps){
    if (!keep.has(s.file)){
      fs.unlinkSync(path.join(ROOT, s.file));
      pruned++;
    }
  }

  // Also prune old rendered HTML reports — keep only previous + current
  const htmls = fs.readdirSync(ROOT)
    .filter(f => /^marketbeat_report_\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .map(f => ({ file: f, date: f.match(/(\d{4}-\d{2}-\d{2})/)[1] }))
    .sort((a,b) => a.date.localeCompare(b.date));

  const htmlToday    = htmls.filter(h => h.date === currentDate);
  const htmlPriors   = htmls.filter(h => h.date < currentDate);
  const htmlYday     = htmlPriors.length ? htmlPriors[htmlPriors.length - 1] : null;
  const htmlKeep     = new Set([...htmlToday.map(h=>h.file), ...(htmlYday ? [htmlYday.file] : [])]);

  for(const h of htmls){
    if (!htmlKeep.has(h.file)){
      fs.unlinkSync(path.join(ROOT, h.file));
      pruned++;
    }
  }

  // Diff HTML too — keep only today's
  const diffs = fs.readdirSync(ROOT)
    .filter(f => /^marketbeat_diff_\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .map(f => ({ file: f, date: f.match(/(\d{4}-\d{2}-\d{2})/)[1] }));
  for(const d of diffs){
    if (d.date !== currentDate){
      fs.unlinkSync(path.join(ROOT, d.file));
      pruned++;
    }
  }

  if (pruned > 0){
    log(`   🧹 pruned ${pruned} old file(s) — keeping only current + previous day`);
  }
}

if (require.main === module) main();
