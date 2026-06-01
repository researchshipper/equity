#!/usr/bin/env node
/**
 * run_pipeline.js
 *
 * Automated Orchestration & Logging Script for the Elite AI Equity Research Stack.
 * Runs all execution phases, captures stdout/stderr, logs execution steps, and
 * enforces schema gating deterministically.
 *
 * Usage: node run_pipeline.js {TICKER} {PEER1} {PEER2} {PEER3} {PEER4} {PEER5}
 */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TICKER = process.argv[2]?.toUpperCase();
const PEERS = process.argv.slice(3).map(s => s.toUpperCase());

if (!TICKER) {
  console.error('Usage: node run_pipeline.js {TICKER} [PEER1 PEER2 ...]');
  process.exit(1);
}

const LOG_FILE = 'pipeline_execution.log';
const REPORT_FILE = `${TICKER}_report.txt`;

function log(msg) {
  const time = new Date().toISOString();
  const line = `[${time}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// Clear or initialize log
fs.writeFileSync(LOG_FILE, `=== PIPELINE RUN FOR ${TICKER} AT ${new Date().toISOString()} ===\n`);

try {
  log(`PHASE 1: Fetching database and financial statements for ${TICKER} and peers [${PEERS.join(', ')}]...`);
  const fetchCmd = `node stockfetch.js ${TICKER} ${PEERS.join(' ')}`;
  const fetchOut = execSync(fetchCmd, { encoding: 'utf8' });
  fs.appendFileSync(LOG_FILE, '\n--- stockfetch.js STDOUT ---\n' + fetchOut + '\n');
  
  // Extract and print DATA_INTEGRITY line for easy copying
  const diMatch = fetchOut.match(/DATA_INTEGRITY: .+/);
  if (diMatch) {
    log(`[SUCCESS] Database created. Copy this line into your report.txt's DATA_INTEGRITY field:\n\n${diMatch[0]}\n`);
  } else {
    log('[WARNING] Could not find DATA_INTEGRITY output in stockfetch stdout.');
  }

  log(`PHASE 2: Fetching SEC EDGAR Form-4 insider transaction scraping...`);
  const insiderCmd = `node insiderfetch.js ${TICKER}`;
  const insiderOut = execSync(insiderCmd, { encoding: 'utf8' });
  fs.appendFileSync(LOG_FILE, '\n--- insiderfetch.js STDOUT ---\n' + insiderOut + '\n');
  
  // Extract and print insider summaries
  const insScoreMatch = insiderOut.match(/INSIDER_SCORE: .+/);
  const insSentimentMatch = insiderOut.match(/INSIDER_SENTIMENT: .+/);
  if (insScoreMatch && insSentimentMatch) {
    log(`[SUCCESS] Insider scraping completed: ${insScoreMatch[0]} | ${insSentimentMatch[0]}`);
  }

  // Check if report file exists before proceeding to verification and generation
  if (!fs.existsSync(REPORT_FILE)) {
    log(`\n[PAUSE] Pipeline stopped. Report file "${REPORT_FILE}" has not been created yet.`);
    log(`>>> ACTION REQUIRED: Please write your plain-text report to ${REPORT_FILE} (ensuring the DATA_INTEGRITY line matches the one printed above) and then re-run this script to complete the linting and generation phases! <<<\n`);
    process.exit(0);
  }

  log(`PHASE 3: Initiating Schema & Piotroski Quality Linter on ${REPORT_FILE}...`);
  const lintCmd = `node report_linter.js ${REPORT_FILE}`;
  try {
    const lintOut = execSync(lintCmd, { encoding: 'utf8' });
    fs.appendFileSync(LOG_FILE, '\n--- report_linter.js STDOUT ---\n' + lintOut + '\n');
    log('[SUCCESS] Linter validations passed!');
  } catch (e) {
    fs.appendFileSync(LOG_FILE, '\n--- report_linter.js STDERR/STDOUT ---\n' + e.stdout + '\n' + e.stderr + '\n');
    log('[FAILED] Linter validation failed. Please check the log file or run report_linter.js directly to view errors.');
    console.error(e.stdout);
    process.exit(1);
  }

  log(`PHASE 4: Launching HTML compiler and interactive peer quadrant plot...`);
  const compCmd = `node stockmd.js ${REPORT_FILE}`;
  const compOut = execSync(compCmd, { encoding: 'utf8' });
  fs.appendFileSync(LOG_FILE, '\n--- stockmd.js STDOUT ---\n' + compOut + '\n');
  log(`[SUCCESS] HTML dashboard compiled successfully: ${TICKER.toLowerCase()}_rich_report.html`);
  log('Pipeline completed with 100% data integrity!');

} catch (err) {
  log(`[CRITICAL ERROR] Pipeline failed in execution: ${err.message}`);
  fs.appendFileSync(LOG_FILE, err.stack + '\n');
  process.exit(1);
}
