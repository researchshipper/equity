#!/usr/bin/env node
/**
 * lint.js — Market Beat report.json schema + content linter
 *
 * Catches the gaps that some LLMs leave when generating the report (missing
 * macro block, weak L2/L3 narratives, missing beneficiaries/victims, etc.)
 * and produces both a human-readable console report AND a machine-readable
 * lint.<date>.json that the LLM can read to know exactly what to fix.
 *
 * Usage:
 *   node lint.js                          # lint report.json, exit 0 if no errors
 *   node lint.js report.2026-06-03.json   # lint a specific file
 *   node lint.js --strict                 # exit 1 on ANY error (for CI / agent loop)
 *   node lint.js --warn-as-error          # treat warnings as errors too
 *   node lint.js --json                   # output JSON only (for piping to agents)
 *   node lint.js --fix-prompt             # write lint.prompt.md telling agent what to fix
 *
 * Exit codes:
 *   0  no errors (warnings allowed)
 *   1  errors found (or --strict + warnings)
 *   2  file missing / invalid JSON
 *
 * Designed so an agent can loop:
 *   1. write report.json
 *   2. node lint.js --strict --fix-prompt
 *   3. if exit != 0, read lint.prompt.md, fix, goto 1
 *   4. else, render
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── checks registry ────────────────────────────────────────────────────────
// Each check returns: { code, level, msg, where? }
// level: 'error' | 'warn' | 'quality'
const CHECKS = [];
const errs  = (msg, where) => ({ level:'error',   msg, where });
const warn  = (msg, where) => ({ level:'warn',    msg, where });
const qual  = (msg, where) => ({ level:'quality', msg, where });

// helper
const len  = s => (s || '').toString().trim().length;
const has  = (o, k) => o && o[k] != null && (Array.isArray(o[k]) ? o[k].length > 0 : true);
const txt  = (s, n=80) => (s || '').slice(0, n);

const PLACEHOLDERS_FULL = [
  // these match the FULL text (so legitimate uses of "TBD" inside sentences pass)
  /^(direct impact from headline\.?|peer\s*\/\s*ecosystem ripple.*|macro\s*\/\s*sector etf read\.?|peer\s*\/\s*ecosystem ripple \(auto-derived from ticker_db peers\)\.?|macro\s*\/\s*sector\s*\/\s*structural\.?)$/i,
];
const PLACEHOLDERS_SUBSTR = [
  // these are substring matches — only the most egregious "I haven't filled this in" markers
  'auto-derived from ticker_db',
  'lorem ipsum',
  'fill me in',
  'add narrative here',
  'placeholder text',
];
// "TODO" / "TBD" only flagged when used as a standalone scaffolding marker,
// not embedded in real prose like "pricing TBD".
const PLACEHOLDER_STANDALONE = /^\s*(todo|tbd|xxx|fixme)[\s.:!]*$/i;

const MACRO_LABELS_REQUIRED = [
  { key: 'fed',   match: /fed|fomc|powell|warsh|rate decision/i },
  { key: 'nfp',   match: /nfp|nonfarm|jobs report|payrolls|employment situation/i },
  { key: 'cpi',   match: /cpi|inflation|consumer price/i },
];

const L3_MACRO_WORDS = /\b(rate|rates|fed|fomc|cpi|inflation|usd|dollar|yield|oil|crude|gold|china|tariff|regulation|geopolit|recession|gdp|jobs|unemploy|pce|ppi)\b/i;
const L2_RIPPLE_WORDS = /\b(peer|peers|supplier|suppliers|customer|customers|partner|partners|competitor|competitors|ecosystem|read[- ]through|sympathy|halo|spillover|knock[- ]on)\b/i;

// ─── checks ─────────────────────────────────────────────────────────────────
function checkTopLevel(r, out){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || ''))
    out.push({ code:'E001', ...errs(`date must be YYYY-MM-DD (got "${r.date}")`, 'date') });
  if (!len(r.title))
    out.push({ code:'E002', ...errs('title is missing', 'title') });
  if (!has(r, 'sources'))
    out.push({ code:'E003', ...errs('sources[] is empty', 'sources') });
  if (!has(r, 'mood') || r.mood.length < 5)
    out.push({ code:'E004', ...errs(`mood[] needs ≥ 5 cells (got ${r.mood?.length || 0})`, 'mood') });

  const nNews = r.news?.length || 0;
  if (nNews < 8)
    out.push({ code:'E005', ...errs(`news[] needs ≥ 8 cards (got ${nNews})`, 'news') });
  else if (nNews > 25)
    out.push({ code:'E005', ...warn(`news[] has ${nNews} cards (>25 is unwieldy)`, 'news') });

  if ((r.tickerTable?.length || 0) < 10)
    out.push({ code:'E006', ...errs(`tickerTable[] needs ≥ 10 entries (got ${r.tickerTable?.length || 0})`, 'tickerTable') });
  if ((r.sectorHeatmap?.length || 0) < 4)
    out.push({ code:'E007', ...errs(`sectorHeatmap[] needs ≥ 4 sectors (got ${r.sectorHeatmap?.length || 0})`, 'sectorHeatmap') });

  const a = r.actionSummary || {};
  if (!has(a, 'buys') || !has(a, 'sells') || !has(a, 'watchlist'))
    out.push({ code:'E008', ...errs('actionSummary must have non-empty buys / sells / watchlist', 'actionSummary') });

  const lb = r.leaderboard || {};
  if ((lb.winners?.length || 0) < 3 || (lb.losers?.length || 0) < 3)
    out.push({ code:'E009', ...errs(`leaderboard needs ≥ 3 winners and ≥ 3 losers (got ${lb.winners?.length || 0}w / ${lb.losers?.length || 0}l)`, 'leaderboard') });

  // Macro block (mandatory in v0.3+)
  const m = r.macro;
  if (!m){
    out.push({ code:'E010', ...errs('macro{} block is missing (required: headline, regime, keyEvents[], today[], week[])', 'macro') });
  } else {
    const missing = [];
    if (!len(m.headline))         missing.push('headline');
    if (!len(m.regime))           missing.push('regime');
    if (!has(m,'keyEvents'))      missing.push('keyEvents');
    if (!has(m,'today'))          missing.push('today');
    if (!has(m,'week'))           missing.push('week');
    if (missing.length)
      out.push({ code:'E010', ...errs(`macro.{${missing.join(',')}} missing or empty`, 'macro') });

    // E011: must include Fed/NFP/CPI keyEvents
    const labels = (m.keyEvents || []).map(e => (e.label||'') + ' ' + (e.detail||'')).join(' || ');
    for(const req of MACRO_LABELS_REQUIRED){
      if (!req.match.test(labels))
        out.push({ code:'E011', ...errs(`macro.keyEvents missing a tile for "${req.key.toUpperCase()}" (Fed/NFP/CPI all required)`, `macro.keyEvents`) });
    }
  }
}

function checkCard(c, out){
  const W = `news[#${c.id}]`;
  // E101
  if (c.id == null)         out.push({ code:'E101', ...errs('missing id', W) });
  if (!len(c.headline))     out.push({ code:'E101', ...errs('missing headline', W) });
  if (typeof c.priority !== 'number' || c.priority < 1 || c.priority > 10)
    out.push({ code:'E101', ...errs(`priority must be 1..10 (got ${c.priority})`, W) });
  if (!['HIGH','MED','LOW'].includes(c.confidence))
    out.push({ code:'E101', ...errs(`confidence must be HIGH|MED|LOW (got "${c.confidence}")`, W) });
  if (!['bull','bear','mixed','neutral'].includes(c.sentiment))
    out.push({ code:'E101', ...errs(`sentiment must be bull|bear|mixed|neutral (got "${c.sentiment}")`, W) });

  // E102
  const ts = c.tickers || [];
  if (ts.length < 1)
    out.push({ code:'E102', ...errs('tickers[] is empty', W) });
  for(const t of ts){
    if (typeof t.score !== 'number' || t.score < -3 || t.score > 3)
      out.push({ code:'E102', ...errs(`ticker ${t.symbol} score must be in [-3..3] (got ${t.score})`, W) });
    if (t.score === 0)
      out.push({ code:'E102', ...warn(`ticker ${t.symbol} has score 0 (prefer ±1..±3)`, W) });
  }

  // E103/E104 — levels
  const L = c.levels || {};
  for(const k of ['L1','L2','L3']){
    if (!L[k] || !len(L[k].text)){
      out.push({ code:'E103', ...errs(`levels.${k} is missing or empty`, W) });
    } else {
      if (len(L[k].text) < 80)
        out.push({ code:'E104', ...errs(`levels.${k} text too short (${len(L[k].text)} chars; need ≥ 80) — "${txt(L[k].text,60)}…"`, W) });
      const text = L[k].text.trim();
      const lo = text.toLowerCase();
      let hit = null;
      if      (PLACEHOLDERS_FULL.some(re => re.test(text)))         hit = 'matches a known scaffolding template';
      else if (PLACEHOLDER_STANDALONE.test(text))                   hit = 'standalone TODO/TBD/XXX';
      else { const s = PLACEHOLDERS_SUBSTR.find(s => lo.includes(s)); if (s) hit = `"${s}"`; }
      if (hit){
        out.push({ code:'E108', ...errs(`levels.${k} contains placeholder text (${hit}) — replace with real analysis`, W) });
      }
    }
  }

  // W202/W203 — content depth (only WARN if BOTH L2 ripple AND L3 macro lens
  // are missing — a single missing one is often OK for purely industry-structural stories)
  const l2Weak = L.L2 && len(L.L2.text) >= 80 && !L2_RIPPLE_WORDS.test(L.L2.text);
  const l3Weak = L.L3 && len(L.L3.text) >= 80 && !L3_MACRO_WORDS.test(L.L3.text);
  if (l2Weak && l3Weak){
    out.push({ code:'W202', ...warn('BOTH L2 (no peer/supplier/customer language) AND L3 (no macro lens) feel thin — deepen at least one', W) });
  }

  // E105/E106 — beneficiaries/victims
  const benN = (c.beneficiaries || []).length;
  const vicN = (c.victims || []).length;
  if (benN < 1 && c.sentiment !== 'bear')
    out.push({ code:'E105', ...errs(`beneficiaries[] empty (sentiment=${c.sentiment})`, W) });
  if (vicN < 1 && c.sentiment !== 'bull')
    out.push({ code:'E106', ...errs(`victims[] empty (sentiment=${c.sentiment})`, W) });

  // E107 — timeline
  const tl = c.timeline || {};
  for(const k of ['D','W','M','L']){
    if (!len(tl[k]))
      out.push({ code:'E107', ...errs(`timeline.${k} is missing or empty`, W) });
  }

  // W201/W205/W206
  if (ts.length < 3)
    out.push({ code:'W201', ...warn(`only ${ts.length} ticker(s) — usually 3-8 expected`, W) });
  if (!len(c.category))
    out.push({ code:'W205', ...warn('category field empty', W) });
  if (!len(c.url))
    out.push({ code:'W206', ...warn('url field empty (sourcing matters)', W) });

  // E109 — source format
  if (len(c.source) && !/·| - | – | — /.test(c.source))
    out.push({ code:'W209', ...warn(`source "${txt(c.source,40)}" lacks the "Outlet · timeago" pattern`, W) });
}

function checkQuality(r, out){
  // W204 — at least one priority-10 card
  if (!(r.news || []).some(n => n.priority >= 10))
    out.push({ code:'W204', ...warn('no priority-10 cards — probably missing the day\'s market-moving headline', 'news') });

  // W207 — sentiment diversity
  const sentCount = {};
  for(const n of (r.news || [])) sentCount[n.sentiment] = (sentCount[n.sentiment] || 0) + 1;
  const total = (r.news || []).length;
  for(const [k,v] of Object.entries(sentCount)){
    if (v > total * 0.7)
      out.push({ code:'W207', ...warn(`${v}/${total} cards are "${k}" — sentiment monoculture is suspicious`, 'news') });
  }

  // Q302 — tickers in news appear in tickerTable
  const inTable = new Set((r.tickerTable || []).map(t => t.symbol));
  const inNews  = new Set();
  for(const n of (r.news || [])){
    for(const t of (n.tickers || [])) inNews.add(t.symbol);
  }
  const missing = [...inNews].filter(s => !inTable.has(s));
  if (missing.length){
    const sample = missing.slice(0, 8).join(', ');
    out.push({ code:'Q302', ...qual(`${missing.length} tickers in news cards are missing from tickerTable (${sample}${missing.length>8?'…':''})`, 'tickerTable') });
  }

  // Q303 — sector heatmap covers ticker sectors
  const heatSectors = new Set((r.sectorHeatmap || []).map(s => (s.sector||'').toLowerCase().split(/[\/(]/)[0].trim()));
  // (loose check — sector strings differ in punctuation)
}

// ─── run ────────────────────────────────────────────────────────────────────
function lint(report){
  const findings = [];
  checkTopLevel(report, findings);
  for(const c of (report.news || [])) checkCard(c, findings);
  checkQuality(report, findings);
  return findings;
}

function summarize(findings){
  return {
    errors:   findings.filter(f => f.level === 'error').length,
    warnings: findings.filter(f => f.level === 'warn').length,
    quality:  findings.filter(f => f.level === 'quality').length,
    total:    findings.length,
  };
}

// ─── output formatters ─────────────────────────────────────────────────────
const RED = '\x1b[31m', YEL = '\x1b[33m', CYAN = '\x1b[36m', DIM = '\x1b[2m', RESET = '\x1b[0m';
const noColor = !process.stdout.isTTY;
const c = (col, s) => noColor ? s : col + s + RESET;

function printConsole(findings, sum, filePath, date){
  console.log(`\n🔍 Linting ${filePath} ${date ? `(date=${date})` : ''}\n`);

  if (!findings.length){
    console.log(`✅ ${c(CYAN,'PASS')} — no issues.\n`);
    return;
  }

  const grouped = {};
  for(const f of findings){
    (grouped[f.where || 'top'] ||= []).push(f);
  }

  for(const [where, items] of Object.entries(grouped)){
    console.log(c(CYAN, `── ${where} ──`));
    for(const f of items){
      const tag = f.level === 'error'   ? c(RED,'ERROR') :
                  f.level === 'warn'    ? c(YEL,'WARN ') :
                                          c(DIM,'QUAL ');
      console.log(`  ${tag} ${c(DIM,f.code)}  ${f.msg}`);
    }
    console.log('');
  }

  console.log(`📊 Summary: ${c(RED,sum.errors+' errors')}, ${c(YEL,sum.warnings+' warnings')}, ${c(DIM,sum.quality+' quality notes')}\n`);
}

function writeFixPrompt(findings, sum, reportPath, date){
  const promptPath = path.join(__dirname, 'lint.prompt.md');
  if (!findings.filter(f => f.level === 'error').length){
    if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);
    return null;
  }

  // group by location, format with the actual offending data
  let report;
  try { report = JSON.parse(fs.readFileSync(reportPath,'utf8')); } catch { report = {}; }

  const grouped = {};
  for(const f of findings.filter(x => x.level === 'error')){
    (grouped[f.where || 'top'] ||= []).push(f);
  }

  const md = `# Fix report.json — linter errors must be resolved

The linter found **${sum.errors} error(s)** in \`${path.basename(reportPath)}\`
(date: ${date || 'unknown'}). Please re-emit a corrected \`report.json\` that
fixes every error below, then re-run \`node lint.js --strict\` until it passes.

## How to fix

1. Read each error below. The "where" field tells you which JSON path is broken.
2. Update **only the broken fields** — leave the rest of the report untouched.
3. Save the corrected \`report.json\` back to \`news/report.json\`.
4. Run: \`node news/lint.js --strict --fix-prompt\`
5. If still errors, repeat. If clean, run: \`node news/daily.js\`.

## Errors to fix

${Object.entries(grouped).map(([where, items]) => `
### \`${where}\`

${items.map(f => `- **${f.code}** — ${f.msg}`).join('\n')}
`).join('\n')}

## Style reminders

- L1/L2/L3 narratives: ≥ 80 chars, specific numbers, no placeholders.
- L2 must name **peers / suppliers / customers / ecosystem**.
- L3 must connect to a **macro lens**: rates, Fed, USD, CPI, oil, China, regulation.
- macro.keyEvents[] must include tiles for **Fed (FOMC), Jobs (NFP), and CPI**
  (real dates — never guess; if not known, leave as "Date TBD" but the tile must exist).
- beneficiaries[] / victims[]: 3–6 bullets each, format \`"TICKER — short reason"\`.
- timeline: 4 short sentences keyed D / W / M / L (Days / Weeks / Months / Long-term).
`;

  fs.writeFileSync(promptPath, md);
  return promptPath;
}

// ─── CLI ────────────────────────────────────────────────────────────────────
function main(){
  const args = process.argv.slice(2);
  const strict        = args.includes('--strict');
  const warnAsError   = args.includes('--warn-as-error');
  const jsonOnly      = args.includes('--json');
  const writePrompt   = args.includes('--fix-prompt');
  const positional    = args.filter(a => !a.startsWith('--'));
  const filePath      = positional[0]
    ? (path.isAbsolute(positional[0]) ? positional[0] : path.join(__dirname, positional[0]))
    : path.join(__dirname, 'report.json');

  if (!fs.existsSync(filePath)){
    console.error(`❌ File not found: ${filePath}`);
    process.exit(2);
  }

  let report;
  try { report = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e){ console.error(`❌ Invalid JSON: ${e.message}`); process.exit(2); }

  const findings = lint(report);
  const sum      = summarize(findings);

  if (jsonOnly){
    process.stdout.write(JSON.stringify({
      file: filePath, date: report.date, summary: sum, findings,
    }, null, 2) + '\n');
  } else {
    printConsole(findings, sum, filePath, report.date);
  }

  // write fix prompt for the agent
  if (writePrompt){
    const p = writeFixPrompt(findings, sum, filePath, report.date);
    if (p) console.log(`📝 Fix instructions → ${p}`);
    else   console.log(`✨ No errors — no fix prompt needed.`);
  }

  // exit codes:
  //   default     → exit 1 only on hard errors
  //   --strict    → same (explicit)
  //   --warn-as-error → exit 1 on errors OR warnings (regardless of --strict)
  const fail = (sum.errors > 0) || (warnAsError && sum.warnings > 0);
  process.exit(fail ? 1 : 0);
}

if (require.main === module) main();

module.exports = { lint, summarize, CHECKS };
