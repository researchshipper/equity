#!/usr/bin/env node
/**
 * diff.js — Yesterday-vs-today diff for Market Beat reports
 *
 * Compares two report.json files and emits:
 *   - JSON diff: news/diff.<today>.json (machine-readable)
 *   - HTML diff: news/marketbeat_diff_<today>.html (rendered)
 *
 * Shows:
 *   • NEW tickers (today only)
 *   • DROPPED tickers (yesterday only)
 *   • SCORE CHANGED tickers (Δscore color-coded)
 *   • SENTIMENT FLIPS (bull → bear, etc.)
 *   • NEW headlines that mention previously-tracked tickers
 *   • SECTOR rotation (sector score deltas)
 *
 * Usage:
 *   node diff.js                                            # auto-find latest two
 *   node diff.js report.2026-06-02.json report.json         # explicit pair
 *   node diff.js --json-only                                # write only the JSON diff
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { renderReport } = require('./render.js');

// ─── helpers ────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

const arrow = d => d > 0 ? '↑' : d < 0 ? '↓' : '→';

function indexByTicker(report){
  const idx = {};
  for(const r of (report.tickerTable || [])){
    idx[r.symbol] = r;
  }
  return idx;
}

function indexNewsByHeadlineKey(report){
  const idx = {};
  for(const n of (report.news || [])){
    const k = (n.headline || '').toLowerCase().slice(0,80).replace(/[^\w ]/g,'');
    idx[k] = n;
  }
  return idx;
}

function indexSectors(report){
  const idx = {};
  for(const s of (report.sectorHeatmap || [])){
    idx[s.sector] = s.score;
  }
  return idx;
}

// ─── diff core ──────────────────────────────────────────────────────────────
function diffReports(prev, curr){
  const a = indexByTicker(prev);
  const b = indexByTicker(curr);

  const tickerDelta = [];
  const all = new Set([...Object.keys(a), ...Object.keys(b)]);
  for(const sym of all){
    const before = a[sym]?.score;
    const after  = b[sym]?.score;
    if (before == null && after != null){
      tickerDelta.push({ symbol: sym, kind: 'NEW',      before: null, after, delta: after,
                         name: b[sym].name, sector: b[sym].sector, driver: b[sym].driver });
    } else if (before != null && after == null){
      tickerDelta.push({ symbol: sym, kind: 'DROPPED',  before, after: null, delta: -before,
                         name: a[sym].name, sector: a[sym].sector, driver: a[sym].driver });
    } else if (before !== after){
      tickerDelta.push({ symbol: sym, kind: 'CHANGED',  before, after, delta: after - before,
                         name: b[sym].name, sector: b[sym].sector, driver: b[sym].driver });
    }
  }
  tickerDelta.sort((x,y) => Math.abs(y.delta) - Math.abs(x.delta));

  // sentiment flips on shared headlines
  const aNews = indexNewsByHeadlineKey(prev);
  const bNews = indexNewsByHeadlineKey(curr);
  const sentimentFlips = [];
  for(const [k, nB] of Object.entries(bNews)){
    const nA = aNews[k];
    if (nA && nA.sentiment && nB.sentiment && nA.sentiment !== nB.sentiment){
      sentimentFlips.push({ headline: nB.headline, from: nA.sentiment, to: nB.sentiment });
    }
  }

  // new headlines (today, not yesterday) that mention previously-tracked tickers
  const trackedYesterday = new Set(Object.keys(a));
  const newHeadlines = [];
  for(const [k, n] of Object.entries(bNews)){
    if (aNews[k]) continue; // not new
    const hits = (n.tickers||[]).filter(t => trackedYesterday.has(t.symbol));
    if (hits.length){
      newHeadlines.push({
        headline: n.headline,
        priority: n.priority,
        sentiment: n.sentiment,
        url: n.url,
        affectsTracked: hits.map(h => ({ symbol: h.symbol, score: h.score })),
      });
    }
  }
  newHeadlines.sort((a,b) => (b.priority||0) - (a.priority||0));

  // sector rotation
  const sA = indexSectors(prev);
  const sB = indexSectors(curr);
  const sectorRotation = [];
  const sectAll = new Set([...Object.keys(sA), ...Object.keys(sB)]);
  for(const sec of sectAll){
    const before = sA[sec] ?? 0;
    const after  = sB[sec] ?? 0;
    if (before !== after){
      sectorRotation.push({ sector: sec, before, after, delta: after - before });
    }
  }
  sectorRotation.sort((x,y) => Math.abs(y.delta) - Math.abs(x.delta));

  const gapDays = (prev.date && curr.date)
    ? Math.round((new Date(curr.date) - new Date(prev.date)) / 86400000)
    : null;

  return {
    fromDate: prev.date,
    toDate:   curr.date,
    gapDays,
    counts: {
      newTickers:     tickerDelta.filter(t=>t.kind==='NEW').length,
      droppedTickers: tickerDelta.filter(t=>t.kind==='DROPPED').length,
      changedTickers: tickerDelta.filter(t=>t.kind==='CHANGED').length,
      sentimentFlips: sentimentFlips.length,
      newHeadlines:   newHeadlines.length,
      sectorChanges:  sectorRotation.length,
    },
    tickerDelta,
    sentimentFlips,
    newHeadlines,
    sectorRotation,
  };
}

// ─── HTML renderer (small, self-contained, same style as render.js) ─────────
function deltaColor(d){
  if (d >=  3) return 'p3';
  if (d >=  2) return 'p2';
  if (d >=  1) return 'p1';
  if (d <= -3) return 'n3';
  if (d <= -2) return 'n2';
  if (d <= -1) return 'n1';
  return 'zz';
}

function renderDiffHtml(diff){
  const CSS = `
:root{--bg:#0b1020;--panel:#121935;--ink:#e8ecf8;--muted:#9aa3c7;--line:#243056;
  --green:#16c784;--green2:#0d8c5d;--red:#ea3943;--red2:#a51e26;--yellow:#f5b21a;--blue:#3b82f6}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);
  font:14.5px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif}
a{color:#9ab8ff;text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1240px;margin:0 auto;padding:24px 20px 80px}
header.hero{background:linear-gradient(135deg,#1a2454,#0b1020 60%);border:1px solid var(--line);
  border-radius:14px;padding:22px 24px;margin-bottom:18px}
.hero h1{margin:0 0 6px;font-size:24px}
.hero .sub{color:var(--muted);font-size:13px}
.badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;
  background:#1f2a55;color:#cfd8ff;margin-right:6px;margin-bottom:4px}
.counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:14px}
.counts .c{background:#0e1430;border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.counts .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
.counts .v{font-size:22px;font-weight:700;margin-top:2px}
h2.section{margin:26px 0 10px;font-size:18px;border-left:3px solid var(--blue);padding-left:10px}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);
  border-radius:10px;overflow:hidden;font-size:13px}
th,td{padding:8px 10px;border-bottom:1px solid #1c2548;text-align:left;vertical-align:top}
th{background:#1a2348;font-size:11.5px;text-transform:uppercase;letter-spacing:.6px;color:#cfd8ff}
tr:last-child td{border-bottom:none}
.tk{display:inline-block;padding:2px 7px;border-radius:6px;font-weight:700;font-size:12px;
  margin:2px 4px 2px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.tk.p3{background:var(--green);color:#03210f}
.tk.p2{background:var(--green2);color:#eafff5}
.tk.p1{background:#3a4a2a;color:#d6f5a6}
.tk.n1{background:#4a3a2a;color:#f5d8a6}
.tk.n2{background:var(--red2);color:#ffeaea}
.tk.n3{background:var(--red);color:#1a0203}
.tk.zz{background:#2a3050;color:#cfd8ff}
.kind{font-weight:700;font-size:11px;letter-spacing:.5px;padding:2px 8px;border-radius:999px}
.kind.NEW{background:#15301f;color:#7ee0a8}
.kind.DROPPED{background:#3a1a1a;color:#f5a8a8}
.kind.CHANGED{background:#2a2010;color:#f5c97a}
.flip{display:inline-block;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:600;margin:0 4px}
.flip.bull{background:var(--green);color:#03210f}
.flip.bear{background:var(--red);color:#1a0203}
.flip.mixed{background:#3a4a2a;color:#d6f5a6}
.flip.neutral{background:#2a3050;color:#cfd8ff}
footer{margin-top:30px;color:var(--muted);font-size:12px;text-align:center}
`;
  const sdot = s => ({bull:'🟢',bear:'🔴',mixed:'🟡',neutral:'⚪'}[s]||'');
  const tkChip = (sym, score) => `<span class="tk ${deltaColor(score)}">${esc(sym)} ${score>0?'+':''}${score}</span>`;

  const tickerRows = diff.tickerDelta.slice(0, 60).map(t => `
    <tr>
      <td><b>${esc(t.symbol)}</b></td>
      <td>${esc(t.name||'')}</td>
      <td>${esc(t.sector||'')}</td>
      <td><span class="kind ${t.kind}">${t.kind}</span></td>
      <td>${t.before==null?'—':tkChip(t.symbol,t.before).replace(t.symbol,'')}</td>
      <td>${t.after==null?'—':tkChip(t.symbol,t.after).replace(t.symbol,'')}</td>
      <td><b>${arrow(t.delta)} ${t.delta>0?'+':''}${t.delta}</b></td>
      <td>${esc(t.driver||'')}</td>
    </tr>`).join('');

  const flipRows = diff.sentimentFlips.map(f => `
    <tr>
      <td>${esc(f.headline)}</td>
      <td><span class="flip ${f.from}">${sdot(f.from)} ${f.from}</span> →
          <span class="flip ${f.to}">${sdot(f.to)} ${f.to}</span></td>
    </tr>`).join('');

  const newRows = diff.newHeadlines.slice(0, 30).map(n => `
    <tr>
      <td>${sdot(n.sentiment)} ${esc(n.headline)}${n.url?` · <a href="${esc(n.url)}" target="_blank">link</a>`:''}</td>
      <td>P${n.priority||'-'}</td>
      <td>${(n.affectsTracked||[]).map(h => tkChip(h.symbol, h.score)).join('')}</td>
    </tr>`).join('');

  const sectorRows = diff.sectorRotation.map(s => `
    <tr>
      <td>${esc(s.sector)}</td>
      <td>${s.before>0?'+':''}${s.before}</td>
      <td>${s.after>0?'+':''}${s.after}</td>
      <td><b>${arrow(s.delta)} ${s.delta>0?'+':''}${s.delta}</b></td>
    </tr>`).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Market Beat Diff · ${esc(diff.fromDate)} → ${esc(diff.toDate)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}</style></head><body><div class="wrap">

<header class="hero">
  <div>
    <span class="badge">🔁 MARKET BEAT DIFF</span>
    <span class="badge">${esc(diff.fromDate)} → ${esc(diff.toDate)}</span>
  </div>
  <h1>What Changed: ${esc(diff.fromDate)} → ${esc(diff.toDate)}</h1>
  <div class="sub">Day-over-day rotation, new/dropped tickers, sentiment flips, fresh catalysts.${
    diff.gapDays === 1 ? '' :
    diff.gapDays === 3 ? ' <b>Mon-after-Fri</b> — weekend skipped.' :
    diff.gapDays > 1   ? ` <b>${diff.gapDays}-day gap</b> — weekend/holiday/missed day.` : ''
  }</div>
  <div class="counts">
    <div class="c"><div class="k">New tickers</div><div class="v">${diff.counts.newTickers}</div></div>
    <div class="c"><div class="k">Dropped</div><div class="v">${diff.counts.droppedTickers}</div></div>
    <div class="c"><div class="k">Score changes</div><div class="v">${diff.counts.changedTickers}</div></div>
    <div class="c"><div class="k">Sentiment flips</div><div class="v">${diff.counts.sentimentFlips}</div></div>
    <div class="c"><div class="k">New headlines</div><div class="v">${diff.counts.newHeadlines}</div></div>
    <div class="c"><div class="k">Sector shifts</div><div class="v">${diff.counts.sectorChanges}</div></div>
  </div>
</header>

<h2 class="section">📊 Ticker Movement</h2>
${tickerRows ? `<table>
  <thead><tr><th>Ticker</th><th>Name</th><th>Sector</th><th>Status</th><th>Y'day</th><th>Today</th><th>Δ</th><th>Driver</th></tr></thead>
  <tbody>${tickerRows}</tbody></table>` : '<p><i>No changes.</i></p>'}

<h2 class="section">🔄 Sentiment Flips</h2>
${flipRows ? `<table>
  <thead><tr><th>Headline</th><th>Flip</th></tr></thead>
  <tbody>${flipRows}</tbody></table>` : '<p><i>No sentiment flips on shared headlines.</i></p>'}

<h2 class="section">📰 New Headlines Affecting Tracked Tickers</h2>
${newRows ? `<table>
  <thead><tr><th>Headline</th><th>Prio</th><th>Tracked tickers affected</th></tr></thead>
  <tbody>${newRows}</tbody></table>` : '<p><i>No new headlines hit previously-tracked tickers.</i></p>'}

<h2 class="section">🌡️ Sector Rotation</h2>
${sectorRows ? `<table>
  <thead><tr><th>Sector</th><th>Y'day</th><th>Today</th><th>Δ</th></tr></thead>
  <tbody>${sectorRows}</tbody></table>` : '<p><i>No sector score changes.</i></p>'}

<footer>Generated ${new Date().toISOString().slice(0,10)} · Not investment advice.</footer>
</div></body></html>`;
}

// ─── CLI ───────────────────────────────────────────────────────────────────
// Calendar-aware: finds the latest snapshot STRICTLY BEFORE the current report
// date, regardless of weekends, holidays, or missed days. Always picks the
// most-recent prior `report.YYYY-MM-DD.json` (or falls back to the next-best).
function listSnapshots(dir){
  return fs.readdirSync(dir)
    .filter(f => /^report\.\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => ({
      file: f,
      date: f.replace(/^report\./,'').replace(/\.json$/,''),
      path: path.join(dir, f),
    }))
    .sort((a,b) => a.date.localeCompare(b.date));
}

function findPrevBefore(snapshots, currDate){
  // strictly before currDate; pick the latest
  const before = snapshots.filter(s => s.date < currDate);
  return before.length ? before[before.length - 1].path : null;
}

function readDate(jsonPath){
  try { return JSON.parse(fs.readFileSync(jsonPath,'utf8')).date; }
  catch { return null; }
}

function findCurrentAndPrev(dir, explicitCurr){
  const snaps    = listSnapshots(dir);
  const liveJson = path.join(dir, 'report.json');
  const liveDate = fs.existsSync(liveJson) ? readDate(liveJson) : null;

  // Decide CURRENT: explicit > report.json > newest snapshot
  let currPath = explicitCurr;
  if (!currPath){
    if (liveDate) currPath = liveJson;
    else if (snaps.length) currPath = snaps[snaps.length-1].path;
  }
  if (!currPath) return [null, null, null];

  const currDate = readDate(currPath);
  if (!currDate) return [null, currPath, null];

  // Decide PREV: latest snapshot strictly before currDate
  // If currPath IS a snapshot, exclude it from the candidate set automatically.
  const candidates = snaps.filter(s => s.path !== currPath);
  const prevPath = findPrevBefore(candidates, currDate);
  const prevDate = prevPath ? readDate(prevPath) : null;

  return [prevPath, currPath, { currDate, prevDate }];
}

function daysBetween(a, b){
  const ms = new Date(b) - new Date(a);
  return Math.round(ms / 86400000);
}

async function main(){
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json-only');
  const positional = args.filter(a => !a.startsWith('--'));

  let prevPath, currPath, meta;
  if (positional.length >= 2){
    [prevPath, currPath] = positional.map(p => path.isAbsolute(p) ? p : path.join(__dirname, p));
    meta = { currDate: readDate(currPath), prevDate: readDate(prevPath) };
  } else if (positional.length === 1){
    const explicit = path.isAbsolute(positional[0]) ? positional[0] : path.join(__dirname, positional[0]);
    [prevPath, currPath, meta] = findCurrentAndPrev(__dirname, explicit);
  } else {
    [prevPath, currPath, meta] = findCurrentAndPrev(__dirname);
  }

  if (!currPath || !fs.existsSync(currPath)){
    console.error(`❌ No "today" report found. Pass it as arg, or ensure report.json / report.YYYY-MM-DD.json exists.`);
    process.exit(1);
  }
  if (!prevPath){
    console.warn(`⚠️  No prior snapshot found before ${meta?.currDate || '(unknown)'}.`);
    console.warn(`   This is normal on a first run. Snapshot today's report with:`);
    console.warn(`     cp report.json report.${meta?.currDate || new Date().toISOString().slice(0,10)}.json`);
    console.warn(`   Then re-run \`node diff.js\` tomorrow.`);
    process.exit(0);
  }

  // Calendar gap awareness
  const gap = meta?.prevDate && meta?.currDate ? daysBetween(meta.prevDate, meta.currDate) : null;
  let gapLabel = '';
  if (gap === 1)      gapLabel = '(consecutive days)';
  else if (gap === 3) gapLabel = '(Mon-after-Fri — weekend skipped)';
  else if (gap && gap > 1) gapLabel = `(${gap}-day gap — weekend/holiday/missed)`;

  console.log(`📂 Prior : ${prevPath}  ${meta?.prevDate || ''}`);
  console.log(`📂 Today : ${currPath}  ${meta?.currDate || ''}  ${gapLabel}`);

  const prev = JSON.parse(fs.readFileSync(prevPath,'utf8'));
  const curr = JSON.parse(fs.readFileSync(currPath,'utf8'));

  const diff = diffReports(prev, curr);
  console.log(`\n🔁 Diff summary:`);
  for(const [k,v] of Object.entries(diff.counts)) console.log(`   ${k.padEnd(18)} ${v}`);

  const jsonOut = path.join(__dirname, `diff.${diff.toDate}.json`);
  fs.writeFileSync(jsonOut, JSON.stringify(diff, null, 2));
  console.log(`\n💾 JSON → ${jsonOut}`);

  if (jsonOnly){
    console.log(`⏭  --json-only: skipping HTML.`);
    return;
  }

  const htmlOut = path.join(__dirname, `marketbeat_diff_${diff.toDate}.html`);
  fs.writeFileSync(htmlOut, renderDiffHtml(diff));
  console.log(`✅ HTML → ${htmlOut}`);
}

if (require.main === module){
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { diffReports, renderDiffHtml };
