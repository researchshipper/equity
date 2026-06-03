#!/usr/bin/env node
/**
 * render.js — Market Beat: pure JSON → HTML converter
 *
 * Reads a report.json (conformant to report.schema.json) and writes a single
 * self-contained HTML file. No network. No LLM. No npm dependencies.
 *
 * Usage:
 *   node render.js                                          # report.json → marketbeat_report_<date>.html
 *   node render.js path/to/report.json                      # custom input
 *   node render.js path/to/report.json -o out.html          # custom output
 *   node render.js --stdin > out.html                       # pipe JSON in
 *
 * Why split this from newsbeat.js?
 *   The LLM/agent step (slow, expensive, creative) writes content into a
 *   structured JSON file. This script (fast, deterministic, ~50ms) renders
 *   pixel-identical HTML every time. Same report in any LLM → same HTML.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── helpers ────────────────────────────────────────────────────────────────
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

const tk = (t) => {
  const sym = t.note ? `${t.note}` : t.symbol;
  const sign = t.score > 0 ? '+' : '';
  return `<span class="tk ${colorClass(t.score)}">${esc(sym)} ${sign}${t.score}</span>`;
};

const confClass = c => ({HIGH:'conf hi',MED:'conf md',LOW:'conf lo'})[c] || 'conf md';

const sentimentDot = s => ({
  bull:    '<span class="sdot bull"  title="bullish">🟢</span>',
  bear:    '<span class="sdot bear"  title="bearish">🔴</span>',
  mixed:   '<span class="sdot mixed" title="mixed">🟡</span>',
  neutral: '<span class="sdot neu"   title="neutral">⚪</span>',
}[s] || '');

const medalFor = rank => rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':`#${rank}`;

// ─── CSS ────────────────────────────────────────────────────────────────────
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
.hero h1{margin:0 0 6px;font-size:26px;letter-spacing:.2px}
.hero .sub{color:var(--muted);font-size:13px}
.badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;
  background:#1f2a55;color:#cfd8ff;margin-right:6px;margin-bottom:4px}
.mood{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:14px}
.mood .cell{background:#0e1430;border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.mood .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
.mood .v{font-size:17px;font-weight:600;margin-top:2px}
.mood .d{font-size:12px;margin-top:1px}
.pos{color:var(--green)}.neg{color:var(--red)}.neu{color:var(--yellow)}
h2.section{margin:26px 0 10px;font-size:18px;border-left:3px solid var(--blue);padding-left:10px}
.grid{display:grid;gap:14px}
.news{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.news .top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:8px}
.news h3{margin:0 0 4px;font-size:16.5px;line-height:1.3}
.news .meta{font-size:11.5px;color:var(--muted)}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;margin-right:4px}
.pill.prio{background:#3b1f3f;color:#f5a8d1}
.pill.cat{background:#1a2c4a;color:#9ec3ff}
.pill.conf.hi{background:#15301f;color:#7ee0a8}
.pill.conf.md{background:#2a2010;color:#f5c97a}
.pill.conf.lo{background:#3a1a1a;color:#f5a8a8}
.tk{display:inline-block;padding:2px 7px;border-radius:6px;font-weight:700;font-size:12px;
  margin:2px 4px 2px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.tk.p3{background:var(--green);color:#03210f}
.tk.p2{background:var(--green2);color:#eafff5}
.tk.p1{background:#3a4a2a;color:#d6f5a6}
.tk.n1{background:#4a3a2a;color:#f5d8a6}
.tk.n2{background:var(--red2);color:#ffeaea}
.tk.n3{background:var(--red);color:#1a0203}
.tk.zz{background:#2a3050;color:#cfd8ff}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px}
.col{background:#0e1430;border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.col h4{margin:0 0 6px;font-size:12.5px;text-transform:uppercase;letter-spacing:.7px}
.col.win h4{color:var(--green)}.col.lose h4{color:var(--red)}
.col ul{margin:4px 0 0;padding-left:18px}.col li{margin:3px 0;font-size:13px}
.levels{margin-top:10px;display:grid;gap:8px}
.level{background:#0e1430;border:1px solid var(--line);border-radius:10px;padding:9px 12px}
.level .lh{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
.level .lc{font-size:13px;margin-top:3px}
.timeline{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.tbox{flex:1;min-width:140px;background:#0e1430;border:1px solid var(--line);
  border-radius:8px;padding:7px 10px;font-size:12px}
.tbox b{display:block;font-size:11px;color:var(--muted);letter-spacing:.5px}
.keypoints{margin-top:8px}
.keypoints ul{margin:4px 0 0;padding-left:18px;font-size:13.3px}
.keypoints li{margin:3px 0}
table.ref{width:100%;border-collapse:collapse;background:var(--panel);
  border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:13px}
table.ref th,table.ref td{padding:8px 10px;border-bottom:1px solid #1c2548;text-align:left}
table.ref th{background:#1a2348;font-size:11.5px;text-transform:uppercase;letter-spacing:.6px;color:#cfd8ff}
table.ref tr:last-child td{border-bottom:none}
.heat{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
.sect{padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:#0e1430}
.sect .nm{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
.sect .sc{font-size:18px;font-weight:700;margin-top:3px}
.sect.pos{background:linear-gradient(180deg,#0f3025,#0e1430)}
.sect.neg{background:linear-gradient(180deg,#301818,#0e1430)}
footer{margin-top:30px;color:var(--muted);font-size:12px;text-align:center}
.legend{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.legend span{font-size:11.5px}
.action{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.sdot{display:inline-block;margin-right:6px;font-size:13px;line-height:1;vertical-align:middle}
.leader{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}
.lbox{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.lbox h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.7px}
.lbox.win h4{color:var(--green)}
.lbox.lose h4{color:var(--red)}
.lbox ol{margin:0;padding-left:20px}
.lbox li{margin:6px 0;font-size:13.3px}
.lbox li b{font-size:14px}
.lbox .medal{font-size:16px;margin-right:4px}
table.mini{width:100%;border-collapse:collapse;background:var(--panel);
  border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:12.8px}
table.mini th,table.mini td{padding:6px 10px;border-bottom:1px solid #1c2548;text-align:left;vertical-align:top}
table.mini th{background:#1a2348;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#cfd8ff}
table.mini tr:last-child td{border-bottom:none}
@media (max-width:760px){.two,.action,.leader{grid-template-columns:1fr}}
/* ── macro / economic calendar ─────────────────────────────────────────── */
.macro{background:linear-gradient(135deg,#15203f,#0b1020 70%);border:1px solid var(--line);
  border-radius:14px;padding:16px 18px;margin-bottom:18px}
.macro .mh{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:4px}
.macro .mh .ttl{font-size:16px;font-weight:700}
.macro .regime{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;
  letter-spacing:.4px;background:#3a1a1a;color:#f5c0c0;border:1px solid #5a2a2a}
.macro .lede{color:var(--muted);font-size:12.5px;margin:2px 0 12px}
.keyev{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:14px}
.kev{background:#0e1430;border:1px solid var(--line);border-radius:10px;padding:10px 12px;position:relative}
.kev .kl{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
.kev .kv{font-size:16px;font-weight:700;margin-top:2px}
.kev .kd{font-size:11.5px;color:#c3cbe8;margin-top:3px;line-height:1.35}
.kev .when{position:absolute;top:9px;right:10px;font-size:9.5px;font-weight:700;letter-spacing:.5px;
  text-transform:uppercase;padding:2px 6px;border-radius:6px}
.when.today{background:#15301f;color:#7ee0a8}
.when.week{background:#2a2342;color:#c9b6ff}
.when.ahead{background:#1a2c4a;color:#9ec3ff}
.kev.neg{border-color:#5a2a2a}.kev.pos{border-color:#1f5a3a}
.macro .cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:760px){.macro .cols{grid-template-columns:1fr}}
.cal{background:#0e1430;border:1px solid var(--line);border-radius:10px;padding:8px 10px}
.cal h4{margin:0 0 6px;font-size:11.5px;text-transform:uppercase;letter-spacing:.7px;color:#9ec3ff}
.cal table{width:100%;border-collapse:collapse;font-size:12.3px}
.cal td{padding:4px 6px;border-bottom:1px solid #1c2548;vertical-align:top}
.cal tr:last-child td{border-bottom:none}
.cal .tm{color:var(--muted);white-space:nowrap;font-family:ui-monospace,Menlo,monospace;font-size:11.5px}
.cal .fp{white-space:nowrap;text-align:right;color:#c3cbe8;font-size:11.5px}
.imp{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:middle}
.imp.high{background:var(--red)}.imp.med{background:var(--yellow)}.imp.low{background:#5b6690}
.wk td .st{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;
  padding:1px 6px;border-radius:5px;margin-left:6px}
.st.done{background:#23314a;color:#8fa6c9}.st.today{background:#15301f;color:#7ee0a8}
.st.ahead{background:#1a2c4a;color:#9ec3ff}
.cal td.evpos{color:#9be8c0}.cal td.evneg{color:#f3b6b6}
`;

// ─── renderers ──────────────────────────────────────────────────────────────
function renderMood(mood = []){
  if (!mood.length) return '';
  return `<div class="mood">${mood.map(m=>`
    <div class="cell">
      <div class="k">${esc(m.label)}</div>
      <div class="v">${esc(m.value)}</div>
      <div class="d ${m.tone||'neu'}">${esc(m.delta||'')}</div>
    </div>`).join('')}</div>`;
}

function renderLegend(){
  return `<div class="legend">
    <span><span class="tk p3">+3</span> strong winner</span>
    <span><span class="tk p2">+2</span> winner</span>
    <span><span class="tk p1">+1</span> mild +</span>
    <span><span class="tk n1">-1</span> mild -</span>
    <span><span class="tk n2">-2</span> loser</span>
    <span><span class="tk n3">-3</span> strong loser</span>
    <span style="margin-left:auto"><b>D</b>=days · <b>W</b>=weeks · <b>M</b>=months · <b>L</b>=long-term</span>
  </div>`;
}

function renderCard(n){
  const levels = n.levels || {};
  const lvlRow = (key, label) => {
    const L = levels[key];
    if (!L) return '';
    const chips = (L.tickers||[]).map(tk).join(' ');
    return `<div class="level">
      <div class="lh">${label}</div>
      <div class="lc">${esc(L.text)}</div>
      ${chips ? `<div style="margin-top:6px">${chips}</div>`:''}
    </div>`;
  };

  return `<article class="news">
    <div class="top">
      <div>
        <h3>${sentimentDot(n.sentiment)}${n.id} · ${esc(n.headline)}</h3>
        <div class="meta">${esc(n.source||'')}${n.url?` · <a href="${esc(n.url)}" target="_blank" rel="noopener">source</a>`:''}</div>
      </div>
      <div>
        ${n.priority!=null?`<span class="pill prio">PRIORITY ${n.priority}</span>`:''}
        ${n.category?`<span class="pill cat">${esc(n.category)}</span>`:''}
        ${n.confidence?`<span class="pill ${confClass(n.confidence)}">Confidence: ${esc(n.confidence)}</span>`:''}
      </div>
    </div>

    ${(n.tickers||[]).length?`<div style="margin-top:8px">${(n.tickers||[]).map(tk).join('')}</div>`:''}

    <div class="levels">
      ${lvlRow('L1','Level 1 · Direct')}
      ${lvlRow('L2','Level 2 · Ecosystem ripple')}
      ${lvlRow('L3','Level 3 · Macro / Structural')}
    </div>

    ${(n.beneficiaries?.length || n.victims?.length) ? `
    <div class="two">
      <div class="col win"><h4>✅ Beneficiaries</h4>
        <ul>${(n.beneficiaries||[]).map(x=>`<li>${esc(x)}</li>`).join('') || '<li><i>none</i></li>'}</ul></div>
      <div class="col lose"><h4>❌ Victims</h4>
        <ul>${(n.victims||[]).map(x=>`<li>${esc(x)}</li>`).join('') || '<li><i>none</i></li>'}</ul></div>
    </div>`:''}

    ${n.timeline ? `<div class="timeline">
      ${n.timeline.D?`<div class="tbox"><b>Days</b>${esc(n.timeline.D)}</div>`:''}
      ${n.timeline.W?`<div class="tbox"><b>Weeks</b>${esc(n.timeline.W)}</div>`:''}
      ${n.timeline.M?`<div class="tbox"><b>Months</b>${esc(n.timeline.M)}</div>`:''}
      ${n.timeline.L?`<div class="tbox"><b>Long-term</b>${esc(n.timeline.L)}</div>`:''}
    </div>`:''}

    ${(n.keyPoints?.length)?`<div class="keypoints"><ul>${n.keyPoints.map(k=>`<li>${esc(k)}</li>`).join('')}</ul></div>`:''}
  </article>`;
}

function renderTickerTable(rows = []){
  if (!rows.length) return '';
  return `<h2 class="section">📊 Ticker Reference Table</h2>
<table class="ref">
<thead><tr><th>Ticker</th><th>Name</th><th>Sector</th><th>Score</th><th>Color</th><th>Primary driver</th></tr></thead>
<tbody>${rows.map(r=>`<tr>
  <td><b>${esc(r.symbol)}</b></td>
  <td>${esc(r.name)}</td>
  <td>${esc(r.sector)}</td>
  <td>${r.score>0?'+':''}${r.score}</td>
  <td><span class="tk ${colorClass(r.score)}">${r.score>0?'+':''}${r.score}</span></td>
  <td>${esc(r.driver||'')}</td>
</tr>`).join('')}</tbody></table>`;
}

function renderHeatmap(rows = []){
  if (!rows.length) return '';
  return `<h2 class="section">🌡️ Sector Heatmap</h2>
<div class="heat">${rows.map(r=>`
  <div class="sect ${r.score>=0?'pos':'neg'}">
    <div class="nm">${esc(r.sector)}</div>
    <div class="sc ${r.score>=0?'pos':'neg'}">${r.score>0?'+':''}${r.score}</div>
  </div>`).join('')}</div>`;
}

function renderLeaderboard(lb){
  if (!lb || (!lb.winners?.length && !lb.losers?.length)) return '';
  const box = (cls, title, rows) => `<div class="lbox ${cls}">
    <h4>${title}</h4>
    <ol>${(rows||[]).map(r => `<li><span class="medal">${medalFor(r.rank)}</span><b>${esc(r.name)}</b> — ${esc(r.why)}</li>`).join('') || '<li><i>none</i></li>'}</ol>
  </div>`;
  return `<h2 class="section">🏆 Bottom Line — Who Wins Today</h2>
<div class="leader">
  ${box('win',  '✅ Top Winners', lb.winners)}
  ${box('lose', '❌ Biggest Losers', lb.losers)}
</div>`;
}

function renderOtherStories(rows = []){
  if (!rows.length) return '';
  return `<h2 class="section">📌 Other Stories</h2>
<table class="mini">
<thead><tr><th>Headline</th><th>Key Point</th><th>Beneficiaries</th></tr></thead>
<tbody>${rows.map(r => `<tr>
  <td><b>${esc(r.headline)}</b></td>
  <td>${esc(r.keyPoint)}</td>
  <td>${esc(r.beneficiaries||'')}</td>
</tr>`).join('')}</tbody></table>`;
}

function renderActions(a){
  if (!a) return '';
  const col = (title, items, cls) => `<div class="col ${cls}"><h4>${title}</h4>
    <ul>${(items||[]).map(x=>`<li>${esc(x)}</li>`).join('') || '<li><i>none</i></li>'}</ul></div>`;
  return `<h2 class="section">🎯 Action Summary</h2>
<div class="action">
  ${col('Top Buy Signals', a.buys, 'win')}
  ${col('Top Sell / Hedge', a.sells, 'lose')}
  ${col('👀 Watchlist', a.watchlist, '')}
</div>`;
}

function renderMacro(m){
  if (!m) return '';
  const has = arr => Array.isArray(arr) && arr.length;

  const keyEvents = has(m.keyEvents) ? `<div class="keyev">${m.keyEvents.map(e=>`
    <div class="kev ${e.tone||''}">
      ${e.when?`<span class="when ${e.when}">${esc(e.when)}</span>`:''}
      <div class="kl">${esc(e.label)}</div>
      <div class="kv">${esc(e.value)}</div>
      ${e.detail?`<div class="kd">${esc(e.detail)}</div>`:''}
    </div>`).join('')}</div>` : '';

  const dayRows = rows => (rows||[]).map(x=>`
    <tr>
      <td class="tm">${esc(x.time||'')}</td>
      <td class="${x.tone==='pos'?'evpos':x.tone==='neg'?'evneg':''}"><span class="imp ${x.importance||'low'}"></span>${esc(x.event)}</td>
      <td class="fp">${x.forecast&&x.forecast!=='—'&&x.forecast!=='n/a'?`f: ${esc(x.forecast)}`:''}${(x.prior&&x.prior!=='—'&&x.prior!=='n/a')?` · p: ${esc(x.prior)}`:''}</td>
    </tr>`).join('');

  const todayCal = has(m.today) ? `<div class="cal"><h4>📅 Today's Data &amp; Fed</h4>
    <table>${dayRows(m.today)}</table></div>` : '';
  const tmrwCal  = has(m.tomorrow) ? `<div class="cal"><h4>⏭️ Tomorrow</h4>
    <table>${dayRows(m.tomorrow)}</table></div>` : '';

  const weekCal = has(m.week) ? `<div class="cal wk"><h4>🗓️ This Week's Macro Calendar</h4>
    <table>${m.week.map(x=>`
      <tr>
        <td class="tm">${esc(x.date||'')}</td>
        <td class="${x.tone==='pos'?'evpos':x.tone==='neg'?'evneg':''}"><span class="imp ${x.importance||'low'}"></span>${esc(x.event)}${x.status?`<span class="st ${x.status}">${esc(x.status)}</span>`:''}</td>
      </tr>`).join('')}</table></div>` : '';

  return `<section class="macro">
  <div class="mh">
    <span class="ttl">🏛️ Macro &amp; Economic Calendar</span>
    ${m.regime?`<span class="regime">${esc((m.regime||'').split('—')[0].trim())}</span>`:''}
  </div>
  ${m.headline?`<div class="lede"><b>${esc(m.headline)}</b>${m.regime&&m.regime.includes('—')?` — ${esc(m.regime.split('—').slice(1).join('—').trim())}`:''}</div>`:''}
  ${keyEvents}
  <div class="cols">${todayCal}${tmrwCal}</div>
  ${weekCal?`<div style="margin-top:12px">${weekCal}</div>`:''}
</section>`;
}

function renderReport(r){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(r.title||'Market Beat')} · ${esc(r.date||'')}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}</style></head><body><div class="wrap">

<header class="hero">
  <div>
    <span class="badge">📰 MARKET BEAT</span>
    ${(r.sources||[]).map(s=>`<span class="badge">${esc(s)}</span>`).join('')}
    ${r.version?`<span class="badge">v${esc(r.version)}</span>`:''}
    ${r.region?`<span class="badge">Region: ${esc(r.region)}</span>`:''}
  </div>
  <h1>${esc(r.title||'Market Beat — News Impact Report')} — ${esc(r.date||'')}</h1>
  <div class="sub">${esc(r.subtitle||'')}</div>
  ${renderMood(r.mood)}
  ${renderLegend()}
</header>

${renderMacro(r.macro)}

<h2 class="section">🗞️ News Cards — sorted by priority</h2>
<div class="grid">${(r.news||[]).map(renderCard).join('')}</div>

${renderLeaderboard(r.leaderboard)}
${renderOtherStories(r.otherStories)}
${renderTickerTable(r.tickerTable)}
${renderHeatmap(r.sectorHeatmap)}
${renderActions(r.actionSummary)}

<footer>Generated ${esc(r.date||'')} · ${esc(r.footer||'Not investment advice.')}</footer>
</div></body></html>`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────
async function readStdin(){
  return new Promise((resolve,reject)=>{
    let data=''; process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => data+=c);
    process.stdin.on('end',  () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main(){
  const args = process.argv.slice(2);
  const useStdin = args.includes('--stdin');
  let outArg = null;
  const oIdx = args.indexOf('-o');
  if (oIdx !== -1) outArg = args[oIdx+1];
  const positional = args.filter(a => a!=='--stdin' && a!=='-o' && a!==outArg);
  const inputPath  = positional[0] || path.join(__dirname,'report.json');

  let raw;
  if (useStdin)  raw = await readStdin();
  else           raw = fs.readFileSync(inputPath,'utf8');

  let report;
  try { report = JSON.parse(raw); }
  catch(e){ console.error('❌ Invalid JSON:', e.message); process.exit(1); }

  // minimal validation
  if (!report.date || !Array.isArray(report.news)){
    console.error('❌ report.json must include "date" and "news" array (see report.schema.json)');
    process.exit(1);
  }

  const html = renderReport(report);
  const outPath = outArg || path.join(
    path.dirname(useStdin ? __dirname : inputPath),
    `marketbeat_report_${report.date}.html`
  );

  if (useStdin && !outArg){
    process.stdout.write(html);
    return;
  }
  fs.writeFileSync(outPath, html);
  console.log(`✅ Rendered ${report.news.length} cards → ${outPath}`);
}

if (require.main === module){
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { renderReport, colorClass };
