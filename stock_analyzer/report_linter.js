#!/usr/bin/env node
/**
 * report_linter.js
 *
 * Deterministic schema validator for {TICKER}_report.txt.
 * Checks required sections, structured formats, and cross-checks
 * against {TICKER}_data.json (including Piotroski F-Score and Quality Metrics)
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

  // 1. Section Presence
  console.log('Checking required sections...');
  for (const key of REQUIRED_KEYS) {
    if (!D[key] || !D[key].trim()) {
      errors.push(`Missing section: "${key}" is missing or empty.`);
    } else {
      console.log(`  [OK] ${key}`);
    }
  }

  // 2. Structured Fields
  if (D.INSIDER) {
    if (!getKV(D.INSIDER, 'SCORE')) errors.push('INSIDER: "SCORE=N" is missing.');
    if (!getKVQ(D.INSIDER, 'SENTIMENT')) errors.push('INSIDER: "SENTIMENT=X" is missing.');
  }

  if (D.TRADE) {
    if (!getKV(D.TRADE, 'ENTRY')) errors.push('TRADE: "ENTRY=$X" is missing.');
    if (!getKV(D.TRADE, 'STOP')) errors.push('TRADE: "STOP=$Y" is missing.');
    if (!getKV(D.TRADE, 'T1') || !getKV(D.TRADE, 'T2')) errors.push('TRADE: "T1" or "T2" target is missing.');
    if (!getKVQ(D.TRADE, 'SIZE')) errors.push('TRADE: "SIZE=X" is missing.');
    if (!getKVQ(D.TRADE, 'CONFIRM')) errors.push('TRADE: "CONFIRM=X" trigger is missing.');
    if (!getKVQ(D.TRADE, 'AVOID')) errors.push('TRADE: "AVOID=X" warning is missing.');
  }

  if (D.VERDICT) {
    if (!getKVQ(D.VERDICT, 'RATING')) errors.push('VERDICT: "RATING=X" is missing.');
    if (!getKV(D.VERDICT, 'STARS')) errors.push('VERDICT: "STARS=N" is missing.');
    if (!getKVQ(D.VERDICT, 'CONVICTION')) errors.push('VERDICT: "CONVICTION=X" is missing.');
  }

  // 3. ELI5 forbidden-words
  if (D.ELI5) {
    const eli5 = D.ELI5.toLowerCase();
    const forbidden = ['valuation', 'p/e', 'forward p/e', 'target', 'technicals', 'rsi', 'bull case', 'bear case'];
    for (const word of forbidden) {
      if (eli5.includes(word)) {
        errors.push(`ELI5 violation: Forbidden term "${word}" found.`);
      }
    }
  }

  // 4. Data cross-check against {TICKER}_data.json
  const dataPath = path.join(path.dirname(srcFile), `${TICKER.toLowerCase()}_data.json`);
  const altDataPath = path.join(path.dirname(srcFile), `${TICKER}_data.json`);
  const finalDataPath = fs.existsSync(dataPath) ? dataPath : (fs.existsSync(altDataPath) ? altDataPath : null);

  if (finalDataPath) {
    console.log(`\nCross-checking against ${path.basename(finalDataPath)}...`);
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
          if (actual == null || reported == null || reported === 'NA' || isNaN(reported)) return;
          const drift = Math.abs(+actual - +reported) / (+actual || 1);
          if (drift > 0.02) {
            errors.push(`Data Drift: ${lbl} reported=${reported} vs live=${actual} (drift ${(drift*100).toFixed(1)}%).`);
          } else {
            console.log(`  [MATCH] ${lbl}: ${actual} vs ${reported}`);
          }
        };

        // Standard anchors
        checkNum('PRICE', T.price, getKV(di, 'PRICE'));
        checkNum('FWDPE', F.fwdPE, getKV(di, 'FWDPE'));
        checkNum('TGTMEAN', F.tgtMean, getKV(di, 'TGTMEAN'));
        checkNum('REVGR', F.revGr, getKV(di, 'REVGR'));
        checkNum('MA50', T.ma50, getKV(di, 'MA50'));
        checkNum('MA200', T.ma200, getKV(di, 'MA200'));

        // Quality anchors (when available)
        if (Q.available) {
          console.log('\nValidating quality metrics...');
          const fscoreRep = getKV(di, 'FSCORE');
          if (fscoreRep) {
            const parsed = parseInt(fscoreRep.split('/')[0], 10);
            if (parsed !== Q.piotroski.score) {
              errors.push(`Piotroski drift: reported FSCORE=${fscoreRep} vs computed ${Q.piotroski.score}/9.`);
            } else {
              console.log(`  [MATCH] FSCORE: ${Q.piotroski.score}/9`);
            }
          } else {
            errors.push('FSCORE missing from DATA_INTEGRITY line.');
          }
          checkNum('EVA_SPREAD', Q.eva.spreadPct, getKV(di, 'EVA_SPREAD'));
          checkNum('CASH_CONV', Q.earningsQuality.cashConversion, getKV(di, 'CASH_CONV'));
          checkNum('MOS', Q.marginOfSafety.discountPct, getKV(di, 'MOS'));
          checkNum('COMPOSITE', C.composite, getKV(di, 'COMPOSITE'));
        }
      }
    } catch (e) {
      warnings.push(`Could not parse ${path.basename(finalDataPath)}: ${e.message}`);
    }
  } else {
    warnings.push(`No data file ${TICKER}_data.json found. Skipping cross-check.`);
  }

  // 5. Summary
  console.log('\n====== VALIDATION SUMMARY ======\n');
  if (warnings.length > 0) {
    console.log('WARNINGS:');
    warnings.forEach(w => console.log(`  W: ${w}`));
    console.log('');
  }

  if (errors.length > 0) {
    console.log('STATUS: FAILED');
    console.log(`${errors.length} errors must be corrected before HTML generation:\n`);
    errors.forEach((e, idx) => console.log(`  ${idx + 1}. [ERROR] ${e}`));
    console.log('\n>>> REGENERATE the report.txt to fix the above errors, then re-run this linter. <<<');
    process.exit(1);
  } else {
    console.log('STATUS: PASSED');
    console.log('All sections, formats, and numerical anchors verified.');
    console.log('Proceed: node stockmd.js ' + path.basename(srcFile));
    process.exit(0);
  }
})();
