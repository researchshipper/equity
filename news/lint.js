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

  // Macro block (mandatory since v0.3)
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

// ─── companion-file checks ─────────────────────────────────────────────────
// These check the OTHER 7 committed files for integrity. The LLM can corrupt
// scoreboard.jsonl by appending bad lines, break history.jsonl rolling window,
// render stale HTML out of sync with report.json, etc.
//
// Each check is keyed on a file existing — none of these fire on first run
// before daily.js has been executed.

const SCOREBOARD_MAX_DAYS = 30;   // must match scoreboard.js cap
const HISTORY_MAX_DAYS    = 90;   // must match daily.js cap
const PREV_DATE_BOUND_DAYS = 30;  // sanity bound: previous shouldn't be > 30 days old

function readJsonSafe(p){
  try { return JSON.parse(fs.readFileSync(p,'utf8')); }
  catch { return null; }
}
function readJsonl(p){
  if (!fs.existsSync(p)) return null;
  const lines = fs.readFileSync(p,'utf8').split('\n').filter(Boolean);
  const parsed = [], errors = [];
  lines.forEach((l, i) => {
    try { parsed.push(JSON.parse(l)); }
    catch (e) { errors.push({ line: i+1, error: e.message, raw: l.slice(0,80) }); }
  });
  return { parsed, errors, total: lines.length };
}
function daysBetween(a, b){
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function today(){ return new Date().toISOString().slice(0,10); }

// ─── companion: report.previous.json (E2xx) ────────────────────────────────
function checkPrevious(dir, currentReport, out){
  const p = path.join(dir, 'report.previous.json');
  if (!fs.existsSync(p)){
    out.push({ code:'W201', ...warn('report.previous.json not found — normal on first run (diff will be skipped)', 'report.previous.json') });
    return;
  }
  const prev = readJsonSafe(p);
  if (!prev){
    out.push({ code:'E202', ...errs('report.previous.json is not valid JSON', 'report.previous.json') });
    return;
  }
  if (!prev.date){
    out.push({ code:'E203', ...errs('report.previous.json missing .date', 'report.previous.json') });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prev.date)){
    out.push({ code:'E204', ...errs(`report.previous.json.date "${prev.date}" not YYYY-MM-DD`, 'report.previous.json') });
    return;
  }
  if (currentReport?.date){
    // E204: prev should be EARLIER than today.
    // It's allowed to EQUAL today (same-day re-run state after daily.js finishes,
    // because daily.js promotes today→previous at the end so tomorrow's diff works).
    // It must NEVER be AFTER today (genuine rotation bug).
    if (prev.date > currentReport.date){
      out.push({ code:'E204', ...errs(`report.previous.json.date (${prev.date}) is AFTER report.json.date (${currentReport.date}). This breaks the diff baseline — check your rotation.`, 'report.previous.json') });
    } else if (prev.date === currentReport.date){
      out.push({ code:'W204', ...warn(`report.previous.json.date == report.json.date (${prev.date}). This is the normal post-daily.js state; tomorrow's run will rotate.`, 'report.previous.json') });
    } else {
      const gap = daysBetween(prev.date, currentReport.date);
      if (gap > PREV_DATE_BOUND_DAYS){
        out.push({ code:'E205', ...warn(`report.previous.json is ${gap} days old (cap suggestion: ${PREV_DATE_BOUND_DAYS}). Diff still works but baseline is stale.`, 'report.previous.json') });
      }
    }
  }
  // Lightweight schema check — same rules as report.json but as warnings
  if (!Array.isArray(prev.news) || prev.news.length < 1){
    out.push({ code:'W203', ...warn('report.previous.json has no news[] cards', 'report.previous.json') });
  }
}

// ─── companion: scoreboard.jsonl (E3xx) ────────────────────────────────────
function checkScoreboard(dir, currentReport, out){
  const p = path.join(dir, 'scoreboard.jsonl');
  if (!fs.existsSync(p)){
    out.push({ code:'E301', ...errs('scoreboard.jsonl is missing — run `node scoreboard.js append report.json`', 'scoreboard.jsonl') });
    return;
  }
  const r = readJsonl(p);
  if (r.errors.length){
    for (const e of r.errors.slice(0, 5))
      out.push({ code:'E302', ...errs(`line ${e.line}: ${e.error}`, 'scoreboard.jsonl') });
    if (r.errors.length > 5)
      out.push({ code:'E302', ...errs(`(+${r.errors.length - 5} more bad lines)`, 'scoreboard.jsonl') });
    return;
  }

  const dates  = new Set();
  const pairs  = new Set();
  let badShape = 0, badScore = 0, futureDate = 0, dupPairs = 0;
  const t = today();

  for (const row of r.parsed){
    if (!row.date || !row.symbol || !row.name || row.score == null || !row.sector) badShape++;
    if (typeof row.score === 'number' && (row.score < -3 || row.score > 3)) badScore++;
    if (row.date && row.date > t) futureDate++;
    const key = `${row.date}|${row.symbol}`;
    if (pairs.has(key)) dupPairs++;
    pairs.add(key);
    if (row.date) dates.add(row.date);
  }

  if (badShape)  out.push({ code:'E303', ...errs(`${badShape} row(s) missing required fields (date/symbol/name/sector/score)`, 'scoreboard.jsonl') });
  if (badScore)  out.push({ code:'E304', ...errs(`${badScore} row(s) have score outside [-3..3]`, 'scoreboard.jsonl') });
  if (futureDate) out.push({ code:'E306', ...errs(`${futureDate} row(s) have dates in the future`, 'scoreboard.jsonl') });
  if (dupPairs)  out.push({ code:'E307', ...errs(`${dupPairs} duplicate (date,symbol) tuple(s) — should be unique per day`, 'scoreboard.jsonl') });
  if (dates.size > SCOREBOARD_MAX_DAYS){
    out.push({ code:'E305', ...errs(`scoreboard.jsonl has ${dates.size} unique dates — exceeds ${SCOREBOARD_MAX_DAYS}-day rolling cap. Run \`node scoreboard.js append report.json\` to re-prune.`, 'scoreboard.jsonl') });
  }
}

// ─── companion: history.jsonl (E4xx) ───────────────────────────────────────
function checkHistory(dir, currentReport, out){
  const p = path.join(dir, 'history.jsonl');
  if (!fs.existsSync(p)){
    out.push({ code:'W401', ...warn('history.jsonl not found — will be created on first daily.js run', 'history.jsonl') });
    return;
  }
  const r = readJsonl(p);
  if (r.errors.length){
    for (const e of r.errors.slice(0, 5))
      out.push({ code:'E402', ...errs(`line ${e.line}: ${e.error}`, 'history.jsonl') });
    return;
  }

  const dates = [];
  let badShape = 0, futureDate = 0;
  const t = today();

  for (const row of r.parsed){
    if (!row.date || !row.title || row.cards == null || row.tickers == null) badShape++;
    if (row.date && row.date > t) futureDate++;
    if (row.date) dates.push(row.date);
  }

  if (badShape)   out.push({ code:'E403', ...errs(`${badShape} row(s) missing required fields (date/title/cards/tickers)`, 'history.jsonl') });
  if (futureDate) out.push({ code:'E405', ...errs(`${futureDate} row(s) have dates in the future`, 'history.jsonl') });

  const uniqDates = new Set(dates);
  if (dates.length !== uniqDates.size){
    out.push({ code:'E406', ...errs(`history.jsonl has duplicate date entries (one line per day expected)`, 'history.jsonl') });
  }
  if (uniqDates.size > HISTORY_MAX_DAYS){
    out.push({ code:'E404', ...errs(`history.jsonl has ${uniqDates.size} unique dates — exceeds ${HISTORY_MAX_DAYS}-day rolling cap.`, 'history.jsonl') });
  }
  if (currentReport?.date && !uniqDates.has(currentReport.date)){
    out.push({ code:'W407', ...warn(`history.jsonl has no entry for today (${currentReport.date}) — will be added by next daily.js run`, 'history.jsonl') });
  }
}

// ─── companion: rendered HTMLs (E5xx, E6xx, E7xx, E8xx) ────────────────────
function readDateFromHtml(html, kind = 'last'){
  // For report HTMLs: title is "Market Beat — News Impact Analysis · YYYY-MM-DD"
  //   → one date, take it (kind='last' = 'first' here, doesn't matter).
  // For diff HTML: title is "Market Beat Diff · YYYY-MM-DD → YYYY-MM-DD"
  //   → take the LAST date (the "to" / current date).
  const all = html.match(/<title>([^<]*)<\/title>/);
  if (!all) return null;
  const dates = all[1].match(/\d{4}-\d{2}-\d{2}/g) || [];
  if (!dates.length) return null;
  return kind === 'last' ? dates[dates.length - 1] : dates[0];
}

function checkHtmls(dir, currentReport, out){
  const checks = [
    {
      file: 'marketbeat_report.html', codeBase: 'E5', required: true,
      expectDate: () => currentReport?.date,
      extras: (html) => {
        const issues = [];
        if (!/class="macro"/.test(html))
          issues.push({ code:'E503', ...errs('marketbeat_report.html missing macro section (class="macro"). Re-run render.js.', 'marketbeat_report.html') });
        const cardCount = (html.match(/<article class="news">/g) || []).length;
        const expected = currentReport?.news?.length || 0;
        if (expected && cardCount !== expected){
          issues.push({ code:'E504', ...errs(`marketbeat_report.html has ${cardCount} news cards but report.json has ${expected}. Re-run render.js.`, 'marketbeat_report.html') });
        }
        return issues;
      },
    },
    {
      file: 'marketbeat_report.previous.html', codeBase: 'E6',
      required: () => fs.existsSync(path.join(dir, 'report.previous.json')),
      expectDate: () => readJsonSafe(path.join(dir, 'report.previous.json'))?.date,
    },
    {
      file: 'marketbeat_diff.html', codeBase: 'E7',
      required: () => fs.existsSync(path.join(dir, 'report.previous.json')),
      expectDate: () => currentReport?.date,
    },
    {
      file: 'scoreboard_7d.html', codeBase: 'E8', required: true,
    },
  ];

  for (const c of checks){
    const fp = path.join(dir, c.file);
    const isRequired = typeof c.required === 'function' ? c.required() : c.required;
    if (!fs.existsSync(fp)){
      if (isRequired){
        out.push({ code:`${c.codeBase}01`, ...errs(`${c.file} missing — run \`node daily.js\``, c.file) });
      }
      continue;
    }
    const html = fs.readFileSync(fp,'utf8');
    if (c.expectDate){
      const want = c.expectDate();
      const have = readDateFromHtml(html);
      if (want && have && want !== have){
        out.push({ code:`${c.codeBase}02`, ...errs(`${c.file} title shows date ${have} but should be ${want}. Re-run render.js (or daily.js).`, c.file) });
      }
    }
    if (c.extras){
      for (const e of c.extras(html)) out.push(e);
    }
  }

  // E802: scoreboard_7d.html window claim should match scoreboard.jsonl unique dates
  const sb = path.join(dir, 'scoreboard.jsonl');
  const sbHtml = path.join(dir, 'scoreboard_7d.html');
  if (fs.existsSync(sb) && fs.existsSync(sbHtml)){
    const sbData = readJsonl(sb);
    const dates = new Set((sbData?.parsed || []).map(r => r.date).filter(Boolean));
    const html = fs.readFileSync(sbHtml,'utf8');
    const m = html.match(/last (\d+) day\(s\)/);
    const claimed = m ? +m[1] : null;
    if (claimed != null && claimed !== Math.min(7, dates.size)){
      out.push({ code:'E802', ...warn(`scoreboard_7d.html says "last ${claimed} day(s)" but scoreboard.jsonl has ${dates.size} unique dates. Regenerate with \`node scoreboard.js show --days=7\`.`, 'scoreboard_7d.html') });
    }
  }
}

// ─── cross-file consistency (C9xx) ─────────────────────────────────────────
function checkCrossFileConsistency(dir, currentReport, out){
  if (!currentReport?.date) return;

  // C901: report.json.date should equal latest scoreboard.jsonl date
  const sb = readJsonl(path.join(dir, 'scoreboard.jsonl'));
  if (sb?.parsed?.length){
    const latest = sb.parsed.map(r => r.date).filter(Boolean).sort().pop();
    if (latest && latest !== currentReport.date){
      out.push({ code:'C901', ...warn(`scoreboard.jsonl latest date (${latest}) ≠ report.json.date (${currentReport.date}). Run \`node scoreboard.js append report.json\`.`, 'consistency') });
    }
  }

  // C902: report.json.date should equal latest history.jsonl date
  const hist = readJsonl(path.join(dir, 'history.jsonl'));
  if (hist?.parsed?.length){
    const latest = hist.parsed.map(r => r.date).filter(Boolean).sort().pop();
    if (latest && latest !== currentReport.date){
      out.push({ code:'C902', ...warn(`history.jsonl latest date (${latest}) ≠ report.json.date (${currentReport.date}). Run \`node daily.js\` to refresh.`, 'consistency') });
    }
  }

  // C903: all tickers in report.json.tickerTable should appear in today's scoreboard rows
  if (sb?.parsed?.length){
    const todayRows = sb.parsed.filter(r => r.date === currentReport.date);
    if (todayRows.length){
      const sbSyms = new Set(todayRows.map(r => r.symbol));
      const repSyms = new Set((currentReport.tickerTable || []).map(t => t.symbol));
      const missing = [...repSyms].filter(s => !sbSyms.has(s));
      if (missing.length){
        const sample = missing.slice(0,5).join(', ');
        out.push({ code:'C903', ...warn(`${missing.length} ticker(s) in report.json.tickerTable missing from today's scoreboard rows (${sample}${missing.length>5?'…':''}). Run \`node scoreboard.js append report.json\`.`, 'consistency') });
      }
    }
  }

  // C904: report.json.title should match today's history.jsonl entry.title
  if (hist?.parsed?.length){
    const todayEntry = hist.parsed.find(r => r.date === currentReport.date);
    if (todayEntry && todayEntry.title !== currentReport.title){
      out.push({ code:'C904', ...warn(`history.jsonl entry for ${currentReport.date} has different title than report.json.`, 'consistency') });
    }
  }
}

// ─── run ────────────────────────────────────────────────────────────────────
function lint(report, opts = {}){
  const findings = [];
  const dir = opts.dir || __dirname;

  // primary report
  checkTopLevel(report, findings);
  for(const c of (report.news || [])) checkCard(c, findings);
  checkQuality(report, findings);

  // companion files (skip with opts.skipCompanions for back-compat)
  if (!opts.skipCompanions){
    checkPrevious(dir, report, findings);
    checkScoreboard(dir, report, findings);
    checkHistory(dir, report, findings);
    checkHtmls(dir, report, findings);
    checkCrossFileConsistency(dir, report, findings);
  }

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

  const findings = lint(report, { dir: path.dirname(filePath) });
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
