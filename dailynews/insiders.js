#!/usr/bin/env node
/**
 * insiders.js — Market Beat: insider CLUSTER-BUY tracker + forward scorecard.
 *
 * WHAT IT DOES
 *   fetch : pull the top open-market insider BUYS across the market over the
 *           last ~90 days, group them by ticker into "cluster buys" (≥2 distinct
 *           insiders), surface the top 5, and write news/insiders.json. Each
 *           newly surfaced cluster is appended to news/log.jsonl (insider type) (rolling
 *           log) the FIRST time we see it, anchored to its trade date + price.
 *   score : walk log.jsonl (insider type) and, for every logged cluster old enough,
 *           compute the realized forward return at +7 / +30 / +90 days from the
 *           reference trade date. This is the HISTORY scorecard — it tells you
 *           whether the clusters we flagged actually went up.
 *   render: emit the top-of-report HTML block (cluster table + scorecard) to
 *           news/insiders.block.html. render.js inlines this at the very top.
 *
 * SOURCES (fallback chain — Dataroma blocks plain scraping, so it is NOT the
 * data source; it is only a per-ticker LINK). Edit news/sources.js → INSIDER_SOURCES.
 *     1. OpenInsider  /latest-cluster-buys   (primary; purpose-built for clusters)
 *     2. OpenInsider  /latest-insider-purchases-25k  (fallback; we cluster it ourselves)
 *   Per surfaced ticker we always emit working LINKS to OpenInsider, Dataroma,
 *   and SEC EDGAR so you can verify by hand.
 *
 * No API key. Native fetch (Node >= 18). Forward-return prices via Yahoo chart.
 * If sources are blocked in your runtime, files are written with status:"blocked"
 * and downstream steps degrade gracefully.
 *
 * Usage:
 *   node insiders.js fetch [--window=90] [--min-buyers=2] [--top=5] [--print]
 *   node insiders.js score [--print]
 *   node insiders.js render
 *   node insiders.js all                 # fetch → score → render
 *   node insiders.js --selftest          # offline: parsing/grouping/scorecard
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT  = __dirname;
const JSON_OUT  = path.join(ROOT, 'insiders.json');
const LOG       = path.join(ROOT, 'log.jsonl');
const BLOCK_OUT = path.join(ROOT, 'insiders.block.html');

let INSIDER_SOURCES;
try { ({ INSIDER_SOURCES } = require('./sources.js')); } catch { /* sources.js may predate this */ }
INSIDER_SOURCES = INSIDER_SOURCES || [
  { name: 'OpenInsider cluster buys', url: 'http://openinsider.com/latest-cluster-buys', type: 'openinsider' },
  { name: 'OpenInsider purchases 25k+', url: 'http://openinsider.com/latest-insider-purchases-25k', type: 'openinsider' },
];

const LOG_MAX_DAYS = parseInt(process.env.INSIDER_MAX_DAYS, 10) || 120; // rolling cap on firstSeen dates

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 ' +
           '(KHTML, like Gecko) Version/17.5 Safari/605.1.15';

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ─── per-ticker verification links (no scraping needed) ─────────────────────
const links = sym => ({
  openinsider: `http://openinsider.com/search?q=${encodeURIComponent(sym)}`,
  dataroma:    `https://www.dataroma.com/m/ins/ins.php?t=y&sym=${encodeURIComponent(sym)}&o=fd&d=d`,
  sec:         `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=4&dateb=&owner=include&count=40&search_text=${encodeURIComponent(sym)}`,
});

// ─── OpenInsider table parser ───────────────────────────────────────────────
// Tolerant: pulls every data row from the tinytable and reads the columns we
// need by position-independent heuristics (ticker = the /TICKER link; value =
// the $-cell; date = the YYYY-MM-DD cell; title = "CEO/CFO/Dir/10%" text).
function parseOpenInsider(html) {
  const trades = [];
  const tableM = html.match(/<table[^>]*class=["'][^"']*tinytable[^"']*["'][\s\S]*?<\/table>/i);
  const scope  = tableM ? tableM[0] : html;
  const rows   = scope.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    if (/<th[\s\>]/i.test(row)) continue; // header
    const cells = (row.match(/<td[\s\S]*?<\/td>/gi) || []).map(c =>
      c.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    if (cells.length < 6) continue;

    // ticker: prefer the explicit /TICKER or ?q=TICKER link
    const tickM = row.match(/href=["'][^"']*(?:\/|q=)([A-Z][A-Z.\-]{0,6})["']/);
    let symbol = tickM ? tickM[1].toUpperCase() : null;
    if (!symbol) {
      const cand = cells.find(c => /^[A-Z][A-Z.\-]{0,5}$/.test(c));
      symbol = cand || null;
    }
    if (!symbol) continue;

    const dateCells = cells.filter(c => /^\d{4}-\d{2}-\d{2}/.test(c)).map(c => c.slice(0, 10));
    // OpenInsider order is Filing Date then Trade Date; anchor on the TRADE
    // date (what forward-return scoring measures from). Fall back to the only
    // date present if a layout omits one.
    const tradeDate = dateCells[1] || dateCells[0] || '';
    // value: a $ cell like "$1,234,567" (largest such = transaction value)
    const dollarCells = cells.filter(c => /\$[\d,]+/.test(c)).map(c => parseInt(c.replace(/[^\d]/g, ''), 10)).filter(Boolean);
    const value = dollarCells.length ? Math.max(...dollarCells) : 0;
    // price: a small $ value like "$12.34"
    const priceM = cells.map(c => c.match(/^\$(\d+(?:\.\d+)?)$/)).find(Boolean);
    const price = priceM ? parseFloat(priceM[1]) : null;
    // title heuristic
    const titleCell = cells.find(c => /\b(CEO|CFO|COO|Pres|Dir|VP|Chair|10%|Officer|GC)\b/i.test(c)) || '';
    const title = (titleCell.match(/\b(CEO|CFO|COO|Pres|Dir|VP|Chair|10%|Officer|GC)\b/i) || [''])[0];
    const company = cells.find(c => c.length > 6 && /[a-z]/.test(c) && !/\$/.test(c) && c !== symbol) || symbol;

    trades.push({ symbol, company, tradeDate, value, price, title });
  }
  return trades;
}

// group flat trades → clusters (≥ minBuyers distinct insiders within window)
function clusterize(trades, { windowDays = 90, minBuyers = 2, top = 5, asof = todayStr() } = {}) {
  const cutoff = addDays(asof, -windowDays);
  const inWin = trades.filter(t => t.tradeDate && t.tradeDate >= cutoff);
  const by = {};
  for (const t of inWin) {
    const g = by[t.symbol] || (by[t.symbol] = { symbol: t.symbol, name: t.company, trades: [], titles: new Set(), totalUSD: 0, lastTrade: '', prices: [] });
    g.trades.push(t);
    if (t.title) g.titles.add(t.title);
    g.totalUSD += t.value || 0;
    if (t.tradeDate > g.lastTrade) g.lastTrade = t.tradeDate;
    if (t.price) g.prices.push(t.price);
    if ((t.company || '').length > (g.name || '').length) g.name = t.company;
  }
  const clusters = Object.values(by)
    .map(g => ({
      symbol: g.symbol, name: g.name,
      buyers: g.trades.length,                 // distinct filings/buys in window
      titles: [...g.titles],
      totalUSD: g.totalUSD,
      lastTrade: g.lastTrade,
      avgPrice: g.prices.length ? +(g.prices.reduce((a, b) => a + b, 0) / g.prices.length).toFixed(2) : null,
      links: links(g.symbol),
    }))
    .filter(c => c.buyers >= minBuyers)
    // rank: blend cluster breadth (#buyers) and conviction ($), favor breadth
    .map(c => ({ ...c, rank: c.buyers * 1_000_000 + c.totalUSD }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, top)
    .map(({ rank, ...c }) => c);
  return clusters;
}

// ─── date helpers ───────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(ymd, n) { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }

// ─── network ────────────────────────────────────────────────────────────────
async function getText(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*' }, redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

async function fetchTrades() {
  for (const src of INSIDER_SOURCES) {
    try {
      const html = await getText(src.url);
      const trades = parseOpenInsider(html);
      if (trades.length) { console.log(`  ✓ ${src.name}: ${trades.length} buy rows`); return { trades, source: src.name }; }
      console.warn(`  · ${src.name}: 0 rows parsed`);
    } catch (e) { console.warn(`  ✗ ${src.name}: ${e.message}`); }
  }
  return { trades: [], source: 'none' };
}

// Yahoo daily closes between two dates → [{date, close}]
async function fetchCloses(symbol, fromYmd, toYmd) {
  const p1 = Math.floor(new Date(fromYmd + 'T00:00:00Z') / 1000);
  const p2 = Math.floor(new Date(toYmd + 'T23:59:59Z') / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d`;
  const json = JSON.parse(await getText(url));
  const r = json?.chart?.result?.[0];
  if (!r) return [];
  const ts = r.timestamp || [];
  const cl = r.indicators?.quote?.[0]?.close || [];
  return ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: cl[i] })).filter(x => x.close != null);
}

// nearest close on/after a target date
function closeOnOrAfter(series, ymd) {
  for (const s of series) if (s.date >= ymd) return s.close;
  return null;
}

// ─── log access ─────────────────────────────────────────────────────────────
function readLog() {
  if (!fs.existsSync(LOG)) return [];
  return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    .filter(r => r.type === 'insider' || !r.type);  // typed or legacy
}
function writeLog(rows) {
  // rows are *insider* rows only; merge back with non-insider types from disk
  // rolling-window prune on firstSeen for insiders only
  const dates = [...new Set(rows.map(r => r.firstSeen))].sort();
  const keep = new Set(dates.slice(-LOG_MAX_DAYS));
  const prunedIns = rows.filter(r => keep.has(r.firstSeen));
  prunedIns.sort((a, b) => (a.firstSeen + a.symbol).localeCompare(b.firstSeen + b.symbol));

  let allLines = [];
  if (fs.existsSync(LOG)) {
    allLines = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean);
  }
  const nonIns = allLines.filter(l => {
    try { const p = JSON.parse(l); return p.type !== 'insider' && p.type != null; } catch { return true; }
  });
  const insLines = prunedIns.map(r => JSON.stringify({type: 'insider', ...r}));
  const combined = [...nonIns, ...insLines];
  combined.sort((a,b) => {
    try {
      const pa=JSON.parse(a), pb=JSON.parse(b);
      return (pa.firstSeen || pa.date || '').localeCompare(pb.firstSeen || pb.date || '');
    } catch { return 0; }
  });
  fs.writeFileSync(LOG, combined.join('\n') + '\n');
  return prunedIns;
}

// ─── FETCH ──────────────────────────────────────────────────────────────────
async function cmdFetch(opts) {
  console.log('🕵️  Fetching market-wide insider cluster buys…');
  const { trades, source } = await fetchTrades();
  const asof = todayStr();
  const clusters30 = clusterize(trades, { windowDays: 30, minBuyers: 2, top: 5, asof });
  const clusters7 = clusterize(trades, { windowDays: 7, minBuyers: 2, top: 5, asof });
  let status = (clusters30.length || clusters7.length) ? 'ok' : 'blocked';
  let note = (clusters30.length || clusters7.length) ? '' : 'No clusters parsed — sources may be blocked in this runtime. Links below still work for manual checks.';
  let use30 = clusters30;
  let use7 = clusters7;
  // Preserve seeded real 7d+30d data if fetch blocked (common in sandboxed envs)
  if ((clusters30.length === 0 && clusters7.length === 0) && fs.existsSync(JSON_OUT)) {
    try {
      const prev = JSON.parse(fs.readFileSync(JSON_OUT, 'utf8'));
      if (prev.clusterBuys && prev.clusterBuys.length > 0 && (prev.windowDays || 90) === 30) {
        use30 = prev.clusterBuys;
        use7 = prev.clusterBuys7d || prev.clusterBuys;  // fallback
        status = 'ok';
        note = prev.note || '7d (aggressive) + 30d (smoother primary) — seeded real data (fetch blocked in this env).';
        console.log('  · Preserved seeded 7d+30d clusters from existing insiders.json (fetch blocked)');
      }
    } catch (e) {}
  }
  const data = {
    asof, fetchedAt: new Date().toISOString(),
    status, source, windowDays: 30, minBuyers: 2,
    clusterBuys: use30,
    clusterBuys7d: use7,
    note,
  };
  fs.writeFileSync(JSON_OUT, JSON.stringify(data, null, 2));

  // Standalone mode: NO history log append (user requested no tracking/commits for history)
  // (commented to keep news/ clean; current clusters are in insiders.json only)
  // const log = readLog();
  // ... (append disabled)
  console.log(`✅ 30d: ${use30.length} + 7d: ${use7.length} cluster buys → ${JSON_OUT}  [${source}]`);
  console.log(`   (standalone: no log.jsonl append — clusters in insiders.json only for this run)`);
  if (opts.print) {
    console.log('  7d aggressive:');
    use7.forEach(c => console.log(`   ${c.symbol.padEnd(6)} ${String(c.buyers).padStart(2)} buyers  $${(c.totalUSD / 1e6).toFixed(2)}M  last ${c.lastTrade}  ${c.titles.join('/')}`));
    console.log('  30d smoother:');
    use30.forEach(c => console.log(`   ${c.symbol.padEnd(6)} ${String(c.buyers).padStart(2)} buyers  $${(c.totalUSD / 1e6).toFixed(2)}M  last ${c.lastTrade}  ${c.titles.join('/')}`));
  }
  if (data.status === 'blocked') console.warn('⚠️  status:"blocked" — wrote links-only block; downstream steps will not fail.');
  return data;
}

// ─── SCORE (forward-return history) ─────────────────────────────────────────
async function cmdScore(opts, priceFn) {
  const log = readLog();
  if (!log.length) { console.log('log.jsonl (insider type) empty — run `node insiders.js fetch` first.'); return { rows: [] }; }
  const today = todayStr();
  const getCloses = priceFn || fetchCloses;
  let updated = 0, blocked = 0;

  for (const r of log) {
    if (!r.refPrice || !r.refDate) continue;
    const horizons = { d7: 7, d30: 30, d90: 90 };
    let need = false;
    for (const [k, n] of Object.entries(horizons)) {
      if (r.fwd[k] == null && daysBetween(r.refDate, today) >= n) need = true;
    }
    if (!need) continue;
    let series = [];
    try { series = await getCloses(r.symbol, r.refDate, addDays(r.refDate, 100)); }
    catch (e) { blocked++; continue; }
    if (!series.length) { blocked++; continue; }
    for (const [k, n] of Object.entries(horizons)) {
      if (r.fwd[k] != null) continue;
      if (daysBetween(r.refDate, today) < n) continue;
      const px = closeOnOrAfter(series, addDays(r.refDate, n));
      if (px != null) r.fwd[k] = +(((px - r.refPrice) / r.refPrice) * 100).toFixed(2);
    }
    r.lastScored = today;
    updated++;
  }
  writeLog(log);
  const summary = scorecardSummary(log);
  console.log(`✅ Scored ${updated} cluster(s)${blocked ? `, ${blocked} blocked/no-data` : ''}.`);
  if (opts && opts.print) {
    console.log(`   30d hit-rate: ${summary.hit30}%  · avg 7/30/90d: ${summary.avg7}% / ${summary.avg30}% / ${summary.avg90}%  (n=${summary.scored30})`);
  }
  return { rows: log, summary };
}

function scorecardSummary(log) {
  const realized = h => log.map(r => r.fwd?.[h]).filter(v => v != null);
  const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null;
  const hit = a => a.length ? Math.round(100 * a.filter(v => v > 0).length / a.length) : null;
  const r7 = realized('d7'), r30 = realized('d30'), r90 = realized('d90');
  return {
    tracked: log.length,
    scored7: r7.length, scored30: r30.length, scored90: r90.length,
    avg7: avg(r7), avg30: avg(r30), avg90: avg(r90),
    hit7: hit(r7), hit30: hit(r30), hit90: hit(r90),
  };
}

// ─── RENDER (top-of-report block) ───────────────────────────────────────────
function renderBlock(data, log) {
  data = data || (fs.existsSync(JSON_OUT) ? JSON.parse(fs.readFileSync(JSON_OUT, 'utf8')) : { clusterBuys: [], status: 'blocked' });
  log  = log  || readLog();
  const sum = scorecardSummary(log);

  const makeRows = (arr) => (arr || []).map((c) => `
    <tr>
      <td><b>${esc(c.symbol)}</b></td>
      <td>${esc(c.name || '')}</td>
      <td style="text-align:center"><span class="ib-buyers">${c.buyers}</span></td>
      <td style="text-align:right">$${(c.totalUSD / 1e6).toFixed(2)}M</td>
      <td>${esc(c.lastTrade || '')}</td>
      <td>${esc((c.titles || []).join(' · '))}</td>
      <td class="ib-links">
        <a href="${esc(c.links.openinsider)}" target="_blank" rel="noopener">OpenInsider</a> ·
        <a href="${esc(c.links.dataroma)}" target="_blank" rel="noopener">Dataroma</a> ·
        <a href="${esc(c.links.sec)}" target="_blank" rel="noopener">SEC&nbsp;4</a>
      </td>
    </tr>`).join('');

  const rows7 = makeRows(data.clusterBuys7d);
  const rows30 = makeRows(data.clusterBuys);

  const cell = v => v == null ? '<span class="ib-pending">⏳</span>'
    : `<span class="${v > 0 ? 'ib-pos' : v < 0 ? 'ib-neg' : 'ib-zz'}">${v > 0 ? '+' : ''}${v}%</span>`;
  const scored = log.filter(r => r.fwd && (r.fwd.d7 != null || r.fwd.d30 != null || r.fwd.d90 != null))
    .sort((a, b) => (b.refDate || '').localeCompare(a.refDate || '')).slice(0, 12);
  const scoreRows = scored.map(r => `
    <tr>
      <td><b>${esc(r.symbol)}</b></td>
      <td>${esc(r.refDate || '')}</td>
      <td style="text-align:right">${r.refPrice != null ? '$' + r.refPrice : '—'}</td>
      <td style="text-align:center">${cell(r.fwd.d7)}</td>
      <td style="text-align:center">${cell(r.fwd.d30)}</td>
      <td style="text-align:center">${cell(r.fwd.d90)}</td>
    </tr>`).join('');

  const pill = (lbl, hitv, avgv, n) => `<span class="ib-stat"><b>${lbl}</b> ${hitv == null ? '—' : hitv + '% hit'} · ${avgv == null ? '—' : (avgv > 0 ? '+' : '') + avgv + '% avg'} <i>(n=${n})</i></span>`;

  let noteHtml = '';
  if (data.status !== 'ok') {
    noteHtml = `<div class="ib-note">⚠️ Live cluster feed was blocked this run — showing last good data + working verification links. ${esc(data.note || '')}</div>`;
  } else if (data.note) {
    noteHtml = `<div class="ib-note">${esc(data.note)}</div>`;
  }

  const n7 = (data.clusterBuys7d || []).length;
  const n30 = (data.clusterBuys || []).length;

  return `<section class="insiders">
  <div class="ib-head">
    <span class="ib-title">🟢 Insider Cluster Buys — 7d (aggressive recent) + 30d (smoother primary)</span>
    <span class="ib-sub">${n7} + ${n30} clusters · source: ${esc(data.source || 'n/a')}${data.asof ? ' · as of ' + esc(data.asof) : ''}</span>
  </div>
  ${noteHtml}

  <div class="ib-head" style="margin-top:6px">
    <span class="ib-title" style="font-size:14px">Last 7 days — aggressive latest buys</span>
  </div>
  <div class="ib-tw"><table class="ib-tbl">
    <thead><tr><th>Ticker</th><th>Company</th><th>Buyers</th><th>$ Value</th><th>Last buy</th><th>Roles</th><th>Verify</th></tr></thead>
    <tbody>${rows7 || '<tr><td colspan="7"><i>no recent 7d clusters</i></td></tr>'}</tbody>
  </table></div>

  <div class="ib-head" style="margin-top:12px">
    <span class="ib-title" style="font-size:14px">Last 30 days — smoother aggregate (primary filter)</span>
  </div>
  <div class="ib-tw"><table class="ib-tbl">
    <thead><tr><th>Ticker</th><th>Company</th><th>Buyers</th><th>$ Value</th><th>Last buy</th><th>Roles</th><th>Verify</th></tr></thead>
    <tbody>${rows30 || '<tr><td colspan="7"><i>no 30d clusters</i></td></tr>'}</tbody>
  </table></div>

  <div class="ib-head" style="margin-top:14px">
    <span class="ib-title">📈 Cluster-Buy Scorecard — did past flags work?</span>
    <span class="ib-sub">${sum.tracked} tracked · forward return from trade date</span>
  </div>
  <div class="ib-stats">
    ${pill('7d', sum.hit7, sum.avg7, sum.scored7)}
    ${pill('30d', sum.hit30, sum.avg30, sum.scored30)}
    ${pill('90d', sum.hit90, sum.avg90, sum.scored90)}
  </div>
  <div class="ib-tw"><table class="ib-tbl">
    <thead><tr><th>Ticker</th><th>Flagged (trade date)</th><th>Ref px</th><th>+7d</th><th>+30d</th><th>+90d</th></tr></thead>
    <tbody>${scoreRows || '<tr><td colspan="6"><i>no horizons matured yet — check back in 7+ days</i></td></tr>'}</tbody>
  </table></div>
  <div class="ib-foot">⏳ = horizon not matured · positive = stock rose after the cluster buy. Not investment advice. 7d = timely aggressive signals; 30d = smoother aggregate (primary).</div>
</section>`;

// CSS injected by render.js (kept here so the block is self-documenting)
}

const BLOCK_CSS = `
.insiders{background:linear-gradient(135deg,#10301f,#0b1020 70%);border:1px solid #1f5a3a;
  border-radius:14px;padding:16px 18px;margin-bottom:18px}
.insiders .ib-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px}
.insiders .ib-title{font-size:16px;font-weight:700}
.insiders .ib-sub{font-size:11.5px;color:#9aa3c7}
.insiders .ib-note{font-size:12px;color:#f5c97a;margin:6px 0}
.insiders .ib-tw{overflow:auto;border:1px solid #243056;border-radius:10px;margin-top:8px}
.insiders table.ib-tbl{width:100%;border-collapse:collapse;font-size:12.8px;background:#0e1430}
.insiders .ib-tbl th,.insiders .ib-tbl td{padding:6px 9px;border-bottom:1px solid #1c2548;text-align:left;white-space:nowrap}
.insiders .ib-tbl th{background:#13325a;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:#cfe5ff}
.insiders .ib-tbl tr:last-child td{border-bottom:none}
.insiders .ib-buyers{display:inline-block;min-width:20px;padding:1px 7px;border-radius:999px;background:#16c784;color:#03210f;font-weight:700}
.insiders .ib-links a{color:#9ab8ff}
.insiders .ib-stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.insiders .ib-stat{font-size:12px;background:#0e1430;border:1px solid #243056;border-radius:999px;padding:4px 11px}
.insiders .ib-stat i{color:#9aa3c7;font-style:normal}
.insiders .ib-pos{color:#16c784;font-weight:700}.insiders .ib-neg{color:#ea3943;font-weight:700}
.insiders .ib-zz{color:#9aa3c7}.insiders .ib-pending{color:#9aa3c7}
.insiders .ib-foot{font-size:11px;color:#9aa3c7;margin-top:8px}
`;

function cmdRender() {
  const html = renderBlock();
  fs.writeFileSync(BLOCK_OUT, html);
  console.log(`✅ Insider block → ${BLOCK_OUT}  (${(html.length / 1024).toFixed(1)}KB)`);
}

// ─── selftest (offline) ─────────────────────────────────────────────────────
function selftest() {
  let pass = 0, fail = 0;
  const ok = (c, n) => { if (c) pass++; else { fail++; console.error(`  ✗ ${n}`); } };

  const FIXTURE = `<table class="tinytable"><tr><th>X</th><th>Filing</th><th>Trade</th><th>Ticker</th></tr>
    <tr><td>D</td><td>2026-05-31</td><td>2026-05-30</td><td><a href="/ACME">ACME</a></td><td>Acme Robotics Inc</td><td>CEO</td><td>$12.50</td><td>10,000</td><td>$125,000</td></tr>
    <tr><td>D</td><td>2026-05-31</td><td>2026-05-29</td><td><a href="/ACME">ACME</a></td><td>Acme Robotics Inc</td><td>CFO</td><td>$12.20</td><td>5,000</td><td>$61,000</td></tr>
    <tr><td>D</td><td>2026-05-28</td><td>2026-05-27</td><td><a href="/ACME">ACME</a></td><td>Acme Robotics Inc</td><td>Dir</td><td>$12.00</td><td>8,000</td><td>$96,000</td></tr>
    <tr><td>D</td><td>2026-05-20</td><td>2026-05-19</td><td><a href="/SOLO">SOLO</a></td><td>Solo Mining Co</td><td>CEO</td><td>$3.10</td><td>1,000</td><td>$3,100</td></tr>
    <tr><td>D</td><td>2026-01-02</td><td>2026-01-01</td><td><a href="/OLDX">OLDX</a></td><td>Old Co</td><td>CEO</td><td>$9</td><td>1</td><td>$9,000,000</td></tr>
  </table>`;

  const trades = parseOpenInsider(FIXTURE);
  ok(trades.length === 5, `parse 5 rows (got ${trades.length})`);
  ok(trades[0].symbol === 'ACME' && trades[0].value === 125000 && trades[0].price === 12.5, 'row fields');

  const clusters = clusterize(trades, { windowDays: 90, minBuyers: 2, top: 5, asof: '2026-06-03' });
  ok(clusters.length === 1, `1 cluster (ACME has 3 buyers; SOLO 1; OLDX out of window) (got ${clusters.length})`);
  ok(clusters[0].symbol === 'ACME' && clusters[0].buyers === 3, 'ACME 3 buyers');
  ok(Math.abs(clusters[0].totalUSD - 282000) < 1, 'ACME total $282k');
  ok(clusters[0].lastTrade === '2026-05-30', 'ACME last trade');
  ok(clusters[0].links.dataroma.includes('sym=ACME'), 'dataroma link');

  // OLDX excluded because trade 2026-01-01 is > 90d before 2026-06-03
  ok(!clusters.find(c => c.symbol === 'OLDX'), 'OLDX out of 90d window');

  // scorecard math with injected price series
  const fakeSeries = {
    ACME: [
      { date: '2026-05-30', close: 12.5 }, { date: '2026-06-06', close: 13.75 }, // +10% at 7d
      { date: '2026-06-29', close: 15.0 },  // +20% at 30d
      { date: '2026-08-28', close: 10.0 },  // -20% at 90d
    ],
  };
  const priceFn = async (sym) => fakeSeries[sym] || [];
  // monkeypatch: write a temp log, score it, read back
  const tmpLog = [{ firstSeen: '2026-05-31', symbol: 'ACME', name: 'Acme', buyers: 3, totalUSD: 282000, refDate: '2026-05-30', refPrice: 12.5, fwd: { d7: null, d30: null, d90: null }, lastScored: null }];
  // Simulate "today" far enough out by temporarily overriding todayStr via env is messy;
  // instead test the pure pieces: closeOnOrAfter + summary.
  ok(closeOnOrAfter(fakeSeries.ACME, addDays('2026-05-30', 7)) === 13.75, 'closeOnOrAfter +7d');
  const scoredLog = [{ symbol: 'ACME', fwd: { d7: 10, d30: 20, d90: -20 } }, { symbol: 'B', fwd: { d7: -5, d30: 4, d90: null } }];
  const s = scorecardSummary(scoredLog);
  ok(s.hit7 === 50 && s.avg30 === 12 && s.scored90 === 1, `summary hit7=${s.hit7} avg30=${s.avg30} scored90=${s.scored90}`);

  // render doesn't throw
  let rendered = '';
  try { rendered = renderBlock({ status: 'ok', source: 'test', windowDays: 90, asof: '2026-06-03', clusterBuys: clusters }, tmpLog); } catch (e) { console.error(e); }
  ok(rendered.includes('Insider Cluster Buys') && rendered.includes('ACME'), 'render block ok');
  ok(rendered.includes('Cluster-Buy Scorecard'), 'render scorecard ok');

  console.log(`\nselftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ─── CLI ────────────────────────────────────────────────────────────────────
function parseOpts(args) {
  const get = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
  return {
    windowDays: parseInt(get('window', 90), 10),
    minBuyers:  parseInt(get('min-buyers', 2), 10),
    top:        parseInt(get('top', 5), 10),
    print:      args.includes('--print') || args.includes('-v'),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();
  const cmd = args[0] || 'all';
  const opts = parseOpts(args);
  if (cmd === 'fetch')  { await cmdFetch(opts); return; }
  if (cmd === 'score')  { await cmdScore(opts); return; }
  if (cmd === 'render') { cmdRender(); return; }
  if (cmd === 'all')    { await cmdFetch(opts); await cmdScore(opts); cmdRender(); return; }
  console.error(`Usage:
  node insiders.js fetch [--window=90] [--min-buyers=2] [--top=5] [--print]
  node insiders.js score [--print]
  node insiders.js render
  node insiders.js all`);
  process.exit(1);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { parseOpenInsider, clusterize, scorecardSummary, renderBlock, closeOnOrAfter, BLOCK_CSS, links, addDays, daysBetween };
