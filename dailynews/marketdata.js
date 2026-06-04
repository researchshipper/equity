#!/usr/bin/env node
/**
 * marketdata.js — Market Beat: real, verifiable market numbers fetcher.
 *
 * WHY: the LLM was hand-typing mood[] / macro numbers (index levels, oil,
 * 10Y, BTC, VIX, USD/JPY). Those drift from reality. This script pulls the
 * ACTUAL prints and writes news/marketdata.json. The renderer/linter then
 * anchor and fact-check the report against this file — any mood/macro number
 * that deviates beyond tolerance from the fetched truth is flagged by lint.js.
 *
 * No API key. Native fetch (Node >= 18). Source fallback chain per symbol:
 *     1. Yahoo Finance  query1 chart endpoint  (primary)
 *     2. Stooq          CSV endpoint           (fallback, UA-resistant)
 * If both are blocked in your runtime, the script still writes a file with
 * status:"blocked" so downstream steps degrade gracefully instead of crashing.
 *
 * Usage:
 *   node marketdata.js              # fetch all symbols → news/marketdata.json
 *   node marketdata.js --print      # also print a human summary
 *   node marketdata.js --selftest   # offline: validate parsing/shaping logic
 *   node marketdata.js --check      # compare report.json mood/macro vs marketdata.json
 *
 * Output: news/marketdata.json  { asof, fetchedAt, source, quotes{}, errors[] }
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'marketdata.json');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 ' +
           '(KHTML, like Gecko) Version/17.5 Safari/605.1.15';

// Symbols we anchor on. label is the human name used to MATCH mood[] cells.
// stooq maps the Yahoo symbol → Stooq ticker for the fallback path.
const UNIVERSE = [
  { y: '^GSPC',     stooq: '^spx',  label: 'S&P 500',     group: 'index'  },
  { y: '^NDX',      stooq: '^ndx',  label: 'Nasdaq 100',  group: 'index'  },
  { y: '^DJI',      stooq: '^dji',  label: 'Dow',         group: 'index'  },
  { y: '^RUT',      stooq: '^rut',  label: 'Russell 2000',group: 'index'  },
  { y: '^VIX',      stooq: '^vix',  label: 'VIX',         group: 'vol'    },
  { y: 'ES=F',      stooq: null,    label: 'S&P 500 (fut)',   group: 'fut' },
  { y: 'NQ=F',      stooq: null,    label: 'Nasdaq 100 (fut)',group: 'fut' },
  { y: 'YM=F',      stooq: null,    label: 'Dow (fut)',       group: 'fut' },
  { y: 'CL=F',      stooq: 'cl.f',  label: 'WTI Crude',   group: 'cmdty'  },
  { y: 'BZ=F',      stooq: 'cb.f',  label: 'Brent',       group: 'cmdty'  },
  { y: 'GC=F',      stooq: 'gc.f',  label: 'Gold',        group: 'cmdty'  },
  { y: '^TNX',      stooq: null,    label: '10Y Treasury',group: 'rate'   }, // ^TNX = yield x10
  { y: 'DX-Y.NYB',  stooq: null,    label: 'US Dollar',   group: 'fx'     },
  { y: 'JPY=X',     stooq: null,    label: 'USD/JPY',     group: 'fx'     },
  { y: 'BTC-USD',   stooq: null,    label: 'Bitcoin',     group: 'crypto' },
];

// ─── fetch helpers ──────────────────────────────────────────────────────────
async function getText(url, { timeoutMs = 9000, accept = '*/*' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': accept },
      redirect: 'follow', signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

// Yahoo chart JSON → { price, prevClose, chgPct, asof }
function parseYahooChart(json, ySym) {
  const r = json?.chart?.result?.[0];
  if (!r) return null;
  const meta = r.meta || {};
  let price = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  // ^TNX is yield × 10 on Yahoo's legacy feed in some regions; normalize if huge
  if (ySym === '^TNX' && price != null && price > 30) price = +(price / 10).toFixed(3);
  if (price == null) return null;
  const chgPct = (prev != null && prev !== 0) ? +(((price - prev) / prev) * 100).toFixed(2) : null;
  const ts = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null;
  return { price: +(+price).toFixed(price < 10 ? 4 : 2), prevClose: prev != null ? +(+prev).toFixed(2) : null, chgPct, asof: ts };
}

async function fetchYahoo(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
  const json = JSON.parse(await getText(url, { accept: 'application/json' }));
  const q = parseYahooChart(json, sym);
  if (!q) throw new Error('no chart result');
  return { ...q, via: 'yahoo' };
}

// Stooq CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
function parseStooqCsv(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return null;
  const cols = lines[1].split(',');
  const close = parseFloat(cols[6]);
  const open  = parseFloat(cols[3]);
  if (!isFinite(close)) return null;
  const chgPct = isFinite(open) && open !== 0 ? +(((close - open) / open) * 100).toFixed(2) : null;
  return { price: +close.toFixed(close < 10 ? 4 : 2), prevClose: isFinite(open) ? +open.toFixed(2) : null, chgPct, asof: cols[1] || null, via: 'stooq' };
}

async function fetchStooq(stooqSym) {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcv&h&e=csv`;
  const csv = await getText(url, { accept: 'text/csv,*/*' });
  const q = parseStooqCsv(csv);
  if (!q) throw new Error('stooq parse failed');
  return q;
}

async function fetchOne(u) {
  try { return await fetchYahoo(u.y); }
  catch (e1) {
    if (u.stooq) { try { return await fetchStooq(u.stooq); } catch (e2) { return { error: `${e1.message} / stooq:${e2.message}` }; } }
    return { error: e1.message };
  }
}

// ─── main fetch ─────────────────────────────────────────────────────────────
async function fetchAll({ verbose = false } = {}) {
  const quotes = {};
  const errors = [];
  // bounded concurrency = 5
  const queue = [...UNIVERSE];
  const workers = Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const u = queue.shift();
      const q = await fetchOne(u);
      if (q.error) { errors.push(`${u.y} (${u.label}): ${q.error}`); if (verbose) console.warn(`  ✗ ${u.label.padEnd(18)} ${q.error}`); }
      else { quotes[u.y] = { label: u.label, group: u.group, ...q }; if (verbose) console.log(`  ✓ ${u.label.padEnd(18)} ${q.price}  (${q.chgPct != null ? (q.chgPct > 0 ? '+' : '') + q.chgPct + '%' : '—'})  [${q.via}]`); }
    }
  });
  await Promise.all(workers);
  const blocked = Object.keys(quotes).length === 0;
  return {
    asof: new Date().toISOString().slice(0, 10),
    fetchedAt: new Date().toISOString(),
    status: blocked ? 'blocked' : 'ok',
    source: blocked ? 'none' : [...new Set(Object.values(quotes).map(q => q.via))].join('+'),
    quotes, errors,
  };
}

// ─── fact-check: compare report.json mood/macro vs marketdata.json ───────────
// Returns an array of discrepancy strings (used by lint.js E0xx fact-check).
const num = s => {
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

function factCheck(report, market) {
  const out = [];
  if (!market || market.status !== 'ok') return out; // nothing to check against
  const byLabel = {};
  for (const k in market.quotes) byLabel[market.quotes[k].label.toLowerCase()] = market.quotes[k];

  // tolerance per group: indices/levels 1.5%, rates 0.25 abs, vix 15%, fx 1.5%, crypto 4%
  const tol = (group, real) => {
    if (group === 'rate')   return { abs: 0.25 };
    if (group === 'vol')    return { pct: 0.15 };
    if (group === 'crypto') return { pct: 0.05 };
    if (group === 'fx')     return { pct: 0.02 };
    return { pct: 0.02 }; // index / fut / cmdty
  };

  for (const cell of (report.mood || [])) {
    const lbl = String(cell.label || '').toLowerCase();
    // match by label prefix (mood label may add "(fut)", "(prev close)" etc.)
    let hit = null;
    for (const key in byLabel) { if (lbl.includes(key)) { hit = byLabel[key]; break; } }
    if (!hit) continue;
    const reported = num(cell.value);
    if (reported == null) continue;
    const v = String(cell.value).trim();
    // Skip cells whose value is a *change*, not a level: a leading +/- sign
    // (e.g. "+0.90%") can't be level-checked. A bare "4.46%" on a rate IS a
    // level, so only skip percent-form values for non-rate instruments.
    if (/^[+-]/.test(v)) continue;
    if (/%$/.test(v) && hit.group !== 'rate') continue;
    const real = hit.price;
    const t = tol(hit.group, real);
    const drift = t.abs != null ? Math.abs(reported - real) : Math.abs(reported - real) / real;
    const lim   = t.abs != null ? t.abs : t.pct;
    if (drift > lim) {
      out.push(`mood "${cell.label}" = ${cell.value} but live ${hit.label} = ${real} (${t.abs != null ? 'Δ ' + drift.toFixed(2) : (drift * 100).toFixed(1) + '%'} off; tol ${t.abs != null ? t.abs : (t.pct * 100) + '%'})`);
    }
  }
  return out;
}

// build mood[] cells straight from market truth (handy seed for the LLM)
function moodFromMarket(market) {
  if (!market || market.status !== 'ok') return [];
  const want = ['ES=F', 'NQ=F', 'YM=F', '^RUT', 'CL=F', 'BZ=F', '^TNX', 'DX-Y.NYB', 'JPY=X', 'BTC-USD', '^VIX', 'GC=F'];
  const fmt = (q) => {
    if (q.group === 'rate') return `${q.price}%`;
    if (q.group === 'fx' && q.label === 'US Dollar') return `${q.price}`;
    if (q.group === 'crypto' || q.group === 'cmdty') return `$${q.price.toLocaleString()}`;
    return q.price.toLocaleString();
  };
  return want.filter(s => market.quotes[s]).map(s => {
    const q = market.quotes[s];
    return {
      label: q.label,
      value: fmt(q),
      delta: q.chgPct != null ? `${q.chgPct > 0 ? '+' : ''}${q.chgPct}%` : '',
      tone: q.chgPct == null ? 'neu' : q.chgPct > 0 ? 'pos' : q.chgPct < 0 ? 'neg' : 'neu',
    };
  });
}

// ─── selftest (offline) ─────────────────────────────────────────────────────
function selftest() {
  let pass = 0, fail = 0;
  const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error(`  ✗ ${name}`); } };

  // Yahoo parse
  const yj = { chart: { result: [{ meta: { regularMarketPrice: 5912.34, chartPreviousClose: 5900, regularMarketTime: 1717430400 } }] } };
  const yq = parseYahooChart(yj, '^GSPC');
  ok(yq.price === 5912.34, 'yahoo price');
  ok(yq.chgPct === 0.21, 'yahoo chgPct');

  // ^TNX normalization (45.6 → 4.56)
  const tnx = parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 45.6, chartPreviousClose: 45.0 } }] } }, '^TNX');
  ok(tnx.price === 4.56, '^TNX /10 normalization');

  // Stooq parse
  const sq = parseStooqCsv('Symbol,Date,Time,Open,High,Low,Close,Volume\n^SPX,2026-06-03,21:00:00,5900,5950,5890,5912.34,0\n');
  ok(sq && sq.price === 5912.34, 'stooq close');

  // factCheck flags a bad index level
  const market = { status: 'ok', quotes: { '^GSPC': { label: 'S&P 500', group: 'index', price: 5912.34 } } };
  const fc1 = factCheck({ mood: [{ label: 'S&P 500 (prev close)', value: '7,609.78' }] }, market);
  ok(fc1.length === 1, 'factCheck flags 28% drift');
  const fc2 = factCheck({ mood: [{ label: 'S&P 500 (prev close)', value: '5,920' }] }, market);
  ok(fc2.length === 0, 'factCheck passes 0.1% drift');

  // factCheck respects rate tolerance (absolute 0.25)
  const mkt2 = { status: 'ok', quotes: { '^TNX': { label: '10Y Treasury', group: 'rate', price: 4.46 } } };
  ok(factCheck({ mood: [{ label: '10Y Treasury', value: '4.50%' }] }, mkt2).length === 0, 'rate within 0.25');
  ok(factCheck({ mood: [{ label: '10Y Treasury', value: '5.10%' }] }, mkt2).length === 1, 'rate beyond 0.25');

  // moodFromMarket shapes cells
  const seed = moodFromMarket({ status: 'ok', quotes: { 'CL=F': { label: 'WTI Crude', group: 'cmdty', price: 71.2, chgPct: -1.1 } } });
  ok(seed[0] && seed[0].value === '$71.2' && seed[0].tone === 'neg', 'moodFromMarket cell');

  console.log(`\nselftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ─── CLI ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();

  if (args.includes('--check')) {
    const rp = path.join(__dirname, 'report.json');
    if (!fs.existsSync(OUT))  { console.error(`❌ ${OUT} not found — run \`node marketdata.js\` first.`); process.exit(2); }
    if (!fs.existsSync(rp))   { console.error(`❌ report.json not found.`); process.exit(2); }
    const market = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const report = JSON.parse(fs.readFileSync(rp, 'utf8'));
    const issues = factCheck(report, market);
    if (market.status !== 'ok') { console.log(`⚠️  marketdata.json status=${market.status} — cannot fact-check (sources blocked at fetch time).`); return; }
    if (!issues.length) { console.log(`✅ Fact-check passed — all matched mood numbers within tolerance of live data (${market.source}).`); return; }
    console.log(`❌ Fact-check found ${issues.length} discrepancy(ies) vs live data:`);
    issues.forEach(i => console.log(`   • ${i}`));
    process.exit(1);
  }

  const verbose = args.includes('--print') || args.includes('-v');
  console.log('📡 Fetching live market data (Yahoo → Stooq fallback)…');
  const data = await fetchAll({ verbose });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
  if (data.status === 'blocked') {
    console.warn(`⚠️  All sources blocked in this runtime. Wrote ${OUT} with status:"blocked".`);
    console.warn(`   Downstream steps will skip the fact-check rather than fail.`);
  } else {
    console.log(`✅ ${Object.keys(data.quotes).length}/${UNIVERSE.length} symbols → ${OUT}  [${data.source}]`);
  }
  if (verbose && data.status === 'ok') {
    console.log('\n── Suggested mood[] seed (paste-ready) ──');
    console.log(JSON.stringify(moodFromMarket(data), null, 2));
  }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { fetchAll, factCheck, moodFromMarket, parseYahooChart, parseStooqCsv, UNIVERSE };
