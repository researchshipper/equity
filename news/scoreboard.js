#!/usr/bin/env node
/**
 * scoreboard.js — Cumulative ticker scoreboard for Market Beat
 *
 * Maintains an append-only JSONL log (scoreboard.jsonl) of daily ticker
 * scores. Each line is:
 *   { "date":"2026-06-02", "symbol":"MRVL", "name":"Marvell", "sector":"AI/CHIPS",
 *     "score": 3, "driver":"Huang nod", "mentions": 1 }
 *
 * Three commands:
 *   node scoreboard.js append [report.json]    # log today's report (idempotent per date+symbol)
 *   node scoreboard.js show   [--days=N]       # render HTML rollup of last N days
 *   node scoreboard.js top    [--days=N]       # print top winners/losers to console
 *
 * The HTML rollup shows:
 *   • Cumulative score per ticker across N days
 *   • Day-by-day spark grid (▲▼ heat)
 *   • Sector totals
 *   • New entries vs persistent themes
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const LOG  = path.join(__dirname, 'scoreboard.jsonl');
const HTML = (n) => path.join(__dirname, `scoreboard_${n}d.html`);

// Rolling-window cap: scoreboard.jsonl keeps only the last N days of data.
// This bounds file size (~60 KB at 30 days × ~45 tickers/day). Older days
// are dropped on every `append` call. Override with env: SCOREBOARD_MAX_DAYS=90
const MAX_DAYS = parseInt(process.env.SCOREBOARD_MAX_DAYS, 10) || 30;

const esc = s => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

const colorClass = score => {
  if (score >=  3) return 'p3';
  if (score >=  2) return 'p2';
  if (score >=  1) return 'p1';
  if (score <= -3) return 'n3';
  if (score <= -2) return 'n2';
  if (score <= -1) return 'n1';
  return 'zz';
};

// ─── log access ─────────────────────────────────────────────────────────────
function readLog(){
  if (!fs.existsSync(LOG)) return [];
  return fs.readFileSync(LOG,'utf8')
    .split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
}

function writeLog(rows){
  fs.writeFileSync(LOG, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
}

// ─── append ─────────────────────────────────────────────────────────────────
function appendReport(reportPath){
  const reportFile = reportPath || path.join(__dirname,'report.json');
  if (!fs.existsSync(reportFile)){
    console.error(`❌ Report not found: ${reportFile}`);
    process.exit(1);
  }
  const r = JSON.parse(fs.readFileSync(reportFile,'utf8'));
  if (!r.date || !r.tickerTable){
    console.error(`❌ Report missing date or tickerTable.`);
    process.exit(1);
  }

  // count mentions per ticker across all news cards (for weight)
  const mentions = {};
  for(const n of (r.news||[])){
    for(const grp of [n.tickers, n.levels?.L1?.tickers, n.levels?.L2?.tickers, n.levels?.L3?.tickers]){
      for(const t of (grp||[])){
        mentions[t.symbol] = (mentions[t.symbol] || 0) + 1;
      }
    }
  }

  const existing  = readLog();
  // Remove any rows for this date (idempotent re-run)
  const keep      = existing.filter(row => row.date !== r.date);
  const newRows   = (r.tickerTable||[]).map(t => ({
    date:    r.date,
    symbol:  t.symbol,
    name:    t.name,
    sector:  t.sector,
    score:   t.score,
    driver:  t.driver || '',
    mentions: mentions[t.symbol] || 1,
  }));

  // Rolling-window prune: keep only the last MAX_DAYS unique dates.
  const combined = [...keep, ...newRows];
  const allDates = [...new Set(combined.map(x => x.date))].sort();
  const keepDates = new Set(allDates.slice(-MAX_DAYS));
  const pruned = combined.filter(x => keepDates.has(x.date));
  const droppedDays = allDates.length - keepDates.size;
  const droppedRows = combined.length - pruned.length;

  writeLog(pruned);
  const dates = [...keepDates].sort();
  console.log(`✅ Appended ${newRows.length} ticker rows for ${r.date}`);
  if (droppedRows > 0){
    console.log(`🧹 Pruned ${droppedRows} row(s) from ${droppedDays} day(s) older than the ${MAX_DAYS}-day window`);
  }
  console.log(`📚 Log spans ${dates.length} day(s): ${dates[0]} → ${dates[dates.length-1]}  (cap: ${MAX_DAYS} days)`);
  console.log(`💾 ${LOG}  (${fs.statSync(LOG).size} bytes)`);
}

// ─── aggregation ────────────────────────────────────────────────────────────
function aggregate(rows, days = 7){
  // "last N trading days with logged data" — gracefully handles weekends,
  // holidays, and missed runs. If only 3 dates are logged and days=7, the
  // window is just those 3.
  const bySym = {};
  const allDates = [...new Set(rows.map(r=>r.date))].sort();
  const window = allDates.slice(-days);
  const inWin  = rows.filter(r => window.includes(r.date));

  for(const r of inWin){
    if (!bySym[r.symbol]){
      bySym[r.symbol] = {
        symbol: r.symbol,
        name:   r.name,
        sector: r.sector,
        cum:    0,
        days:   0,
        mentions: 0,
        history:{},
        lastDriver: r.driver,
      };
    }
    const s = bySym[r.symbol];
    s.cum      += r.score;
    s.days     += 1;
    s.mentions += r.mentions || 1;
    s.history[r.date] = r.score;
    s.lastDriver = r.driver || s.lastDriver;
  }

  // average score
  const tickers = Object.values(bySym).map(s => ({
    ...s,
    avg: +(s.cum / s.days).toFixed(2),
    breadth: s.days,  // how many days mentioned (persistence)
  }));

  // sector totals
  const bySect = {};
  for(const t of tickers){
    if (!t.sector) continue;
    bySect[t.sector] = (bySect[t.sector]||0) + t.cum;
  }
  const sectors = Object.entries(bySect)
    .map(([sector, cum]) => ({ sector, cum }))
    .sort((a,b) => b.cum - a.cum);

  return { window, tickers, sectors };
}

// ─── HTML rollup ────────────────────────────────────────────────────────────
function renderScoreboardHtml({ window, tickers, sectors }, days){
  const CSS = `
:root{--bg:#0b1020;--panel:#121935;--ink:#e8ecf8;--muted:#9aa3c7;--line:#243056;
  --green:#16c784;--green2:#0d8c5d;--red:#ea3943;--red2:#a51e26;--yellow:#f5b21a;--blue:#3b82f6}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);
  font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif}
a{color:#9ab8ff;text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1320px;margin:0 auto;padding:24px 20px 80px}
header.hero{background:linear-gradient(135deg,#1a2454,#0b1020 60%);border:1px solid var(--line);
  border-radius:14px;padding:22px 24px;margin-bottom:18px}
.hero h1{margin:0 0 6px;font-size:24px}.hero .sub{color:var(--muted);font-size:13px}
.badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;
  background:#1f2a55;color:#cfd8ff;margin-right:6px}
h2.section{margin:26px 0 10px;font-size:18px;border-left:3px solid var(--blue);padding-left:10px}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);
  border-radius:10px;overflow:hidden;font-size:13px}
th,td{padding:7px 9px;border-bottom:1px solid #1c2548;text-align:left;vertical-align:middle}
th{background:#1a2348;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#cfd8ff}
tr:last-child td{border-bottom:none}
.cum{font-weight:700;font-size:15px}
.cum.pos{color:var(--green)} .cum.neg{color:var(--red)} .cum.zz{color:var(--muted)}
.cell{display:inline-block;width:18px;height:18px;border-radius:3px;margin-right:2px;
  text-align:center;line-height:18px;font-size:10px;font-weight:700}
.cell.p3{background:var(--green);color:#03210f}
.cell.p2{background:var(--green2);color:#eafff5}
.cell.p1{background:#3a4a2a;color:#d6f5a6}
.cell.n1{background:#4a3a2a;color:#f5d8a6}
.cell.n2{background:var(--red2);color:#ffeaea}
.cell.n3{background:var(--red);color:#1a0203}
.cell.zz{background:#2a3050;color:#cfd8ff;opacity:.5}
.cell.empty{background:transparent;border:1px dashed #2a3050;color:#3a4670;opacity:.5}
.spark{white-space:nowrap}
.tag{display:inline-block;font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;
  background:#1a2c4a;color:#9ec3ff;margin-left:5px}
.tag.hot{background:#3a2010;color:#f5c97a}
footer{margin-top:30px;color:var(--muted);font-size:12px;text-align:center}
`;

  const sparkFor = t => window.map(d => {
    const sc = t.history[d];
    if (sc == null) return `<span class="cell empty" title="${d} (no data)">·</span>`;
    return `<span class="cell ${colorClass(sc)}" title="${d}: ${sc>0?'+':''}${sc}">${sc>0?'+':sc<0?'−':'·'}</span>`;
  }).join('');

  const sortByCum = (a,b) => b.cum - a.cum;
  const winners = tickers.filter(t=>t.cum>0).sort(sortByCum).slice(0,30);
  const losers  = tickers.filter(t=>t.cum<0).sort((a,b)=>a.cum-b.cum).slice(0,30);
  const hot     = tickers.filter(t=>t.breadth >= Math.ceil(window.length*0.6)); // mentioned in ≥60% of days

  const renderRows = arr => arr.map(t => `
    <tr>
      <td><b>${esc(t.symbol)}</b>${t.breadth >= Math.ceil(window.length*0.6) ? '<span class="tag hot">persistent</span>' : ''}</td>
      <td>${esc(t.name||'')}</td>
      <td>${esc(t.sector||'')}</td>
      <td class="cum ${t.cum>0?'pos':t.cum<0?'neg':'zz'}">${t.cum>0?'+':''}${t.cum}</td>
      <td>${t.avg>0?'+':''}${t.avg}</td>
      <td>${t.days}/${window.length}</td>
      <td class="spark">${sparkFor(t)}</td>
      <td>${esc(t.lastDriver||'')}</td>
    </tr>`).join('');

  const sectorRows = sectors.map(s => `
    <tr>
      <td>${esc(s.sector)}</td>
      <td class="cum ${s.cum>0?'pos':s.cum<0?'neg':'zz'}">${s.cum>0?'+':''}${s.cum}</td>
    </tr>`).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Market Beat Scoreboard · last ${days} days</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}</style></head><body><div class="wrap">

<header class="hero">
  <div>
    <span class="badge">📈 SCOREBOARD</span>
    <span class="badge">last ${window.length} day(s)</span>
    <span class="badge">${window[0]} → ${window[window.length-1]}</span>
  </div>
  <h1>Cumulative Ticker Scoreboard</h1>
  <div class="sub">${tickers.length} tickers · ${sectors.length} sectors · ${hot.length} persistent (mentioned in ≥60% of days)</div>
</header>

<h2 class="section">🟢 Top Cumulative Winners</h2>
<table>
  <thead><tr><th>Ticker</th><th>Name</th><th>Sector</th><th>Cum</th><th>Avg</th><th>Days</th><th>Spark</th><th>Last driver</th></tr></thead>
  <tbody>${renderRows(winners) || '<tr><td colspan="8"><i>none</i></td></tr>'}</tbody>
</table>

<h2 class="section">🔴 Top Cumulative Losers</h2>
<table>
  <thead><tr><th>Ticker</th><th>Name</th><th>Sector</th><th>Cum</th><th>Avg</th><th>Days</th><th>Spark</th><th>Last driver</th></tr></thead>
  <tbody>${renderRows(losers) || '<tr><td colspan="8"><i>none</i></td></tr>'}</tbody>
</table>

<h2 class="section">🌡️ Sector Totals (window)</h2>
<table>
  <thead><tr><th>Sector</th><th>Cumulative score</th></tr></thead>
  <tbody>${sectorRows || '<tr><td colspan="2"><i>none</i></td></tr>'}</tbody>
</table>

<footer>Generated ${new Date().toISOString().slice(0,10)} · Log: scoreboard.jsonl · Not investment advice.</footer>
</div></body></html>`;
}

// ─── top (console only) ─────────────────────────────────────────────────────
function printTop(rows, days){
  const { tickers } = aggregate(rows, days);
  const winners = tickers.filter(t=>t.cum>0).sort((a,b)=>b.cum-a.cum).slice(0,10);
  const losers  = tickers.filter(t=>t.cum<0).sort((a,b)=>a.cum-b.cum).slice(0,10);
  console.log(`\n🟢 TOP 10 winners (last ${days}d):`);
  winners.forEach(t => console.log(`   ${t.symbol.padEnd(6)} ${('+'+t.cum).padStart(4)}  ${t.name}`));
  console.log(`\n🔴 TOP 10 losers  (last ${days}d):`);
  losers.forEach(t => console.log(`   ${t.symbol.padEnd(6)} ${String(t.cum).padStart(4)}  ${t.name}`));
}

// ─── CLI ───────────────────────────────────────────────────────────────────
async function main(){
  const args = process.argv.slice(2);
  const cmd  = args[0] || 'show';
  const daysArg = (args.find(a => a.startsWith('--days=')) || '').split('=')[1];
  const days    = parseInt(daysArg, 10) || 7;

  if (cmd === 'append'){
    appendReport(args[1]);
    return;
  }
  if (cmd === 'top'){
    const rows = readLog();
    if (!rows.length){ console.log('Log is empty. Run: node scoreboard.js append first.'); return; }
    printTop(rows, days);
    return;
  }
  if (cmd === 'show'){
    const rows = readLog();
    if (!rows.length){
      console.log('Log is empty. Run:  node scoreboard.js append news/report.json');
      return;
    }
    const agg = aggregate(rows, days);
    const out = HTML(days);
    fs.writeFileSync(out, renderScoreboardHtml(agg, days));
    console.log(`✅ HTML → ${out}`);
    console.log(`   ${agg.tickers.length} tickers across ${agg.window.length} days`);
    return;
  }
  console.error(`Unknown command: ${cmd}\nUsage:\n  scoreboard.js append [report.json]\n  scoreboard.js show   [--days=7]\n  scoreboard.js top    [--days=7]`);
  process.exit(1);
}

if (require.main === module){
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { appendReport, aggregate, renderScoreboardHtml, readLog };
