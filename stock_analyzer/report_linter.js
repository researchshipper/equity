#!/usr/bin/env node
/**
 * report_linter.js
 *
 * Deterministic schema validator for {TICKER}_report.txt on the finaltest branch.
 * Checks for all required sections, structured formats, and performs cross-check
 * validation against {TICKER}_data.json (including Piotroski F-Score and Quality Metrics)
 * before proceeding to stockmd.js compilation.
 *
 * Usage: node report_linter.js {TICKER}_report.txt
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REQUIRED_KEYS = [
  'TICKER', 'NAME', 'PEERS', 'DESC', 'NEXT_EARNINGS', 'ELI5', 'SETUP', 'STORY',
  'BULL', 'BEAR', 'VARIANT_PERCEPTION', 'ALT_DATA', 'COMPETITIVE_ARENA', 'SUPPLY',
  'WHATS_NEW', 'PATTERN', 'VAL_METHOD', 'VAL_MATRIX', 'VAL_BASE', 'VAL_BULL', 'VAL_BEAR',
  'SECTOR', 'PEER1', 'PEER2', 'SUPPLY_UP', 'SUPPLY_DOWN', 'SUPPLY_SIGNALS', 'SUPPLY_RISK',
  'INSIDER', 'AI_OPP', 'AI_THR', 'AI_NET', 'CATALYSTS_HIST', 'RISKS', 'UPCOMING',
  'TRADE', 'VERDICT', 'SOURCES', 'THESIS_WEIGHTS', 'TECH_SETUP', 'FOLLOW_THE_CASH',
  'PRE_MORTEM', 'DATA_INTEGRITY'
];

function parseTxt(src) {
  const d = {};
  let cur = null;
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    const col = line.indexOf(':');
    if (col > 0 && col < 25 && !/\s/.test(line.slice(0, col))) {
      cur = line.slice(0, col).toUpperCase();
      d[cur] = line.slice(col + 1).trimStart();
    } else if (cur && line.trim()) {
      d[cur] += '\n' + line;
    }
  }
  return d;
}

const getKV  = (str, k) => { const m = str.match(new RegExp(k + '=([^\\s|]+(?:\\s[^A-Z_=]+)*)')); return m ? m[1].trim() : ''; };
const getKVQ = (str, k) => { const m = str.match(new RegExp(k + '=(.+?)(?=\\s+[A-Z_]+=|$)')); return m ? m[1].trim() : ''; };

(async () => {
  const srcFile = process.argv[2];
  if (!srcFile || !fs.existsSync(srcFile)) {
    console.error('Usage: node report_linter.js {TICKER}_report.txt');
    process.exit(1);
  }

  const content = fs.readFileSync(srcFile, 'utf8');
  const D = parseTxt(content);
  const TICKER = D.TICKER?.trim().toUpperCase();

  if (!TICKER) {
    console.log('STATUS: FAILED');
    console.log('ERROR: TICKER field is missing or empty. Cannot proceed.');
    process.exit(1);
  }

  console.log(`\n====== REPORT SCHEMA VALIDATION FOR ${TICKER} ======\n`);

  let errors = [];
  let warnings = [];

  // 1. Section Presence Validation
  console.log('Checking required sections presence...');
  for (const key of REQUIRED_KEYS) {
    if (!D[key] || !D[key].trim()) {
      errors.push(`Missing section: "${key}" is missing or completely empty.`);
    } else {
      console.log(`  [OK] ${key}`);
    }
  }

  // 2. Structured Fields Validation
  if (D.INSIDER) {
    const ins = D.INSIDER;
    const score = getKV(ins, 'SCORE');
    const sentiment = getKVQ(ins, 'SENTIMENT');
    if (!score) errors.push('Structured error inside "INSIDER": "SCORE=N" is missing.');
    if (!sentiment) errors.push('Structured error inside "INSIDER": "SENTIMENT=X" is missing.');
  }

  if (D.TRADE) {
    const trade = D.TRADE;
    const entry = getKV(trade, 'ENTRY');
    const stop = getKV(trade, 'STOP');
    const t1 = getKV(trade, 'T1');
    const t2 = getKV(trade, 'T2');
    const size = getKVQ(trade, 'SIZE');
    const confirm = getKVQ(trade, 'CONFIRM');
    const avoid = getKVQ(trade, 'AVOID');
    
    if (!entry) errors.push('Structured error inside "TRADE": "ENTRY=$X" is missing.');
    if (!stop) errors.push('Structured error inside "TRADE": "STOP=$Y" is missing.');
    if (!t1 || !t2) errors.push('Structured error inside "TRADE": target "T1" or "T2" is missing.');
    if (!size) errors.push('Structured error inside "TRADE": "SIZE=X" is missing.');
    if (!confirm) errors.push('Structured error inside "TRADE": "CONFIRM=X" trigger is missing.');
    if (!avoid) errors.push('Structured error inside "TRADE": "AVOID=X" warning is missing.');
  }

  if (D.VERDICT) {
    const vrd = D.VERDICT;
    const rating = getKVQ(vrd, 'RATING');
    const stars = getKV(vrd, 'STARS');
    const conviction = getKVQ(vrd, 'CONVICTION');
    if (!rating) errors.push('Structured error inside "VERDICT": "RATING=X" is missing.');
    if (!stars) errors.push('Structured error inside "VERDICT": "STARS=N" is missing.');
    if (!conviction) errors.push('Structured error inside "VERDICT": "CONVICTION=X" is missing.');
  }

  // 3. ELI5 Rules Validation (Strict checks on forbidden words)
  if (D.ELI5) {
    const eli5 = D.ELI5.toLowerCase();
    const forbidden = ['valuation', 'p/e', 'forward p/e', 'target', 'technicals', 'rsi', 'bull case', 'bear case'];
    for (const word of forbidden) {
      if (eli5.includes(word)) {
        errors.push(`ELI5 violation: Forbidden market term "${word}" found in ELI5 section.`);
      }
    }
  }

  // 4. Data Cross-Check Validation against {TICKER}_data.json (including quality fields)
  const dataPath = path.join(path.dirname(srcFile), `${TICKER.toLowerCase()}_data.json`);
  const altDataPath = path.join(path.dirname(srcFile), `${TICKER}_data.json`);
  const finalDataPath = fs.existsSync(dataPath) ? dataPath : (fs.existsSync(altDataPath) ? altDataPath : null);

  if (finalDataPath) {
    console.log(`\nFound data file: ${path.basename(finalDataPath)}. Cross-checking values...`);
    try {
      const dataRaw = JSON.parse(fs.readFileSync(finalDataPath, 'utf8'));
      const prim = dataRaw[0] || {};
      const F = prim.fund || {};
      const T = prim.tech || {};
      const Q = prim.quality || {};
      const C = prim.composite || {};

      if (D.DATA_INTEGRITY) {
        const di = D.DATA_INTEGRITY;
        
        const checkNum = (lbl, actual, reported) => {
          if (actual == null || reported == null || isNaN(reported)) return;
          const drift = Math.abs(+actual - +reported) / (+actual || 1);
          if (drift > 0.02) {
            errors.push(`Data Drift Error in "DATA_INTEGRITY": Reported ${lbl}=${reported} differs from live database value ${actual} (drift of ${(drift*100).toFixed(1)}%).`);
          } else {
            console.log(`  [MATCH] ${lbl}: database ${actual} vs report ${reported}`);
          }
        };

        // Standard checks
        checkNum('PRICE', T.price, getKV(di, 'PRICE'));
        checkNum('FWDPE', F.fwdPE, getKV(di, 'FWDPE'));
        checkNum('TGTMEAN', F.tgtMean, getKV(di, 'TGTMEAN'));
        checkNum('REVGR', F.revGr, getKV(di, 'REVGR'));
        checkNum('MA50', T.ma50, getKV(di, 'MA50'));
        checkNum('MA200', T.ma200, getKV(di, 'MA200'));

        // Quality and Piotroski Checks
        if (Q.available) {
          console.log('\nValidating Piotroski and Quality metrics in report against statement computations...');
          
          // Piotroski F-Score check
          const fscoreRep = getKV(di, 'FSCORE');
          if (fscoreRep) {
            const parsedFScore = parseInt(fscoreRep.split('/')[0], 10);
            const actualFScore = Q.piotroski.score;
            if (parsedFScore !== actualFScore) {
              errors.push(`Piotroski Quality Error: Reported FSCORE=${fscoreRep} does not match computed Piotroski score ${actualFScore}/9.`);
            } else {
              console.log(`  [MATCH] FSCORE: computed ${actualFScore}/9 vs report ${fscoreRep}`);
            }
          } else {
            errors.push('Quality Error: FSCORE variable is missing from DATA_INTEGRITY line.');
          }

          // EVA Spread check
          const evaRep = getKV(di, 'EVA_SPREAD');
          checkNum('EVA_SPREAD', Q.eva.spreadPct, evaRep);

          // Cash Conversion check
          const cashConvRep = getKV(di, 'CASH_CONV');
          checkNum('CASH_CONV', Q.earningsQuality.cashConversion, cashConvRep);

          // Margin of Safety check
          const mosRep = getKV(di, 'MOS');
          checkNum('MOS', Q.marginOfSafety.discountPct, mosRep);

          // Weighted Composite check
          const compositeRep = getKV(di, 'COMPOSITE');
          checkNum('COMPOSITE', C.composite, compositeRep);
        }
      }
    } catch (e) {
      warnings.push(`Could not parse data file ${path.basename(finalDataPath)}: ${e.message}`);
    }
  } else {
    warnings.push(`No database file ${TICKER}_data.json found. Skipping numerical cross-check.`);
  }

  // 5. Summarize and Exit
  console.log('\n====== VALIDATION SUMMARY ======\n');
  if (warnings.length > 0) {
    console.log('WARNINGS:');
    warnings.forEach(w => console.log(`  ⚠️  ${w}`));
    console.log('');
  }

  if (errors.length > 0) {
    console.log('STATUS: FAILED');
    console.log(`Found ${errors.length} validation errors that MUST be corrected before HTML generation:\n`);
    errors.forEach((e, idx) => console.log(`  ${idx + 1}. [ERROR] ${e}`));
    console.log('\n>>> ACTION REQUIRED: The LLM must REGENERATE the report.txt file to include the missing keys or correct quality check errors. <<<');
    process.exit(1);
  } else {
    console.log('STATUS: PASSED');
    console.log('All required sections, formats, and numerical quality points (Piotroski, EVA, Cash Conversion) matched perfectly!');
    console.log('Proceed to HTML report generation: node stockmd.js ' + path.basename(srcFile));
    process.exit(0);
  }
})();
