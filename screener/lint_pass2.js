#!/usr/bin/env node
'use strict';
/**
 * lint_pass2.js — HARD GATE for the LLM Pass-2 output. Exit 1 on ANY error.
 *
 * WHY: instructions alone get skipped (the rubric required a `fuel` field and a
 * news check; the LLM omitted both). Same philosophy as Market Beat's linter:
 * the prompt asks, the linter ENFORCES. Agents must rerun Pass 2 until exit 0.
 *
 * Usage: node lint_pass2.js pass2.json screener_dump.json
 *
 * Rules:
 *  E101 pass2 is not a JSON array of objects
 *  E102 missing/empty required key: sym, conviction, hold, thesis, invalidation, fuel
 *  E103 conviction not an integer 1–10
 *  E104 hold not one of days|weeks|months
 *  E105 sym not present in screener_dump.json candidates (invented ticker)
 *  E106 earningsRisk=true in dump but conviction > 4 (rubric violation)
 *  E107 fuel is a placeholder ("n/a", "-", "none") — must state the catalyst
 *       found, or explicitly "no fresh catalyst found in 7-day search" (proves
 *       the search happened)
 *  E108 price-like number in thesis/invalidation not traceable to that
 *       candidate's dump values (entry/stop/t1/t2/pivot/price/atr) — invented number
 *  E109 word limits: thesis ≤ 40, invalidation ≤ 20, fuel ≤ 25
 *  E110 a dump candidate with state TRIGGERED missing from pass2 (must be rated)
 */
const fs = require('fs');

const [, , pass2File = 'pass2.json', dumpFile = 'screener_dump.json'] = process.argv;
const errors = [];
const err = (code, msg) => errors.push(`${code}: ${msg}`);

let pass2, dump;
try { pass2 = JSON.parse(fs.readFileSync(pass2File, 'utf8')); }
catch (e) { console.error(`E101: cannot parse ${pass2File}: ${e.message}`); process.exit(1); }
try { dump = JSON.parse(fs.readFileSync(dumpFile, 'utf8')); }
catch (e) { console.error(`E101: cannot parse ${dumpFile}: ${e.message}`); process.exit(1); }

if (!Array.isArray(pass2) || pass2.some(x => typeof x !== 'object' || x === null)) {
  console.error('E101: pass2 must be a JSON array of objects'); process.exit(1);
}

const bySym = Object.fromEntries((dump.candidates || []).map(c => [c.sym, c]));
const REQUIRED = ['sym', 'conviction', 'hold', 'thesis', 'invalidation', 'fuel'];
const PLACEHOLDER = /^(n\/?a|none|nil|-|—|tbd|\s*)$/i;
const words = s => String(s).trim().split(/\s+/).filter(Boolean).length;

for (const row of pass2) {
  const tag = row.sym || '(no sym)';
  for (const k of REQUIRED) {
    if (row[k] === undefined || row[k] === null || String(row[k]).trim() === '')
      err('E102', `${tag}: missing/empty "${k}"`);
  }
  if (!Number.isInteger(row.conviction) || row.conviction < 1 || row.conviction > 10)
    err('E103', `${tag}: conviction must be integer 1-10 (got ${row.conviction})`);
  if (!['days', 'weeks', 'months'].includes(row.hold))
    err('E104', `${tag}: hold must be days|weeks|months (got "${row.hold}")`);

  const cand = bySym[row.sym];
  if (!cand) { err('E105', `${tag}: not in screener_dump.json — invented ticker`); continue; }

  if (cand.earningsRisk === true && row.conviction > 4)
    err('E106', `${tag}: earningsRisk=true but conviction ${row.conviction} > 4`);

  if (row.fuel != null && PLACEHOLDER.test(String(row.fuel).trim()))
    err('E107', `${tag}: fuel is a placeholder — state the catalyst, or "no fresh catalyst found in 7-day search"`);

  // E108: every price-like number must trace to dump values for this candidate
  const valid = new Set();
  const add = v => { if (typeof v === 'number') { valid.add(v.toFixed(2)); valid.add(String(v)); } };
  [cand.price, cand.rs, cand.medDollarVolM, cand.earningsInDays].forEach(add);
  if (cand.setup) Object.values(cand.setup).forEach(v => add(v));
  if (cand.tape) Object.values(cand.tape).forEach(v => add(v));
  if (cand.fund) Object.values(cand.fund).forEach(v => add(v));
  const cited = String(row.thesis + ' ' + row.invalidation).match(/\d+\.\d{1,2}/g) || [];
  for (const n of cited) {
    const norm = parseFloat(n).toFixed(2);
    if (![...valid].some(v => parseFloat(v).toFixed(2) === norm))
      err('E108', `${tag}: cited number ${n} not found in dump for this candidate`);
  }

  if (words(row.thesis) > 40) err('E109', `${tag}: thesis ${words(row.thesis)} words > 40`);
  if (words(row.invalidation) > 20) err('E109', `${tag}: invalidation ${words(row.invalidation)} words > 20`);
  if (words(row.fuel) > 25) err('E109', `${tag}: fuel ${words(row.fuel)} words > 25`);
}

for (const c of dump.candidates || []) {
  if (c.setup?.state === 'TRIGGERED' && !pass2.some(r => r.sym === c.sym))
    err('E110', `${c.sym}: TRIGGERED in dump but missing from pass2 — every TRIGGERED name must be rated`);
}

if (errors.length) {
  console.error(`❌ lint_pass2: ${errors.length} error(s)\n` + errors.map(e => '  ' + e).join('\n'));
  console.error('\nFix the Pass-2 JSON and rerun. Do NOT render or publish until exit 0.');
  process.exit(1);
}
console.log(`✅ lint_pass2: ${pass2.length} rows clean.`);
