#!/usr/bin/env node
const { lintReport } = require('../lib/sanity.js');
'use strict';
const yahooFinance = require('yahoo-finance2').default;
const yf = new yahooFinance({ suppressNotices: ['yahooSurvey'] });
const fs = require('fs');
const { getATR, getRSI, getSMA, getMACD, getADX } = require('../lib/indicators.js');

const SECTOR_ETF = { Technology: 'XLK', 'Communication Services': 'XLC', 'Consumer Cyclical': 'XLY', 'Consumer Defensive': 'XLP', Energy: 'XLE', 'Financial Services': 'XLF', Healthcare: 'XLV', Industrials: 'XLI', 'Basic Materials': 'XLB', 'Real Estate': 'XLRE', Utilities: 'XLU' };

function parseTxt(src) {
  const d = {};
  let cur = null;
  const multiLineKeys = ['VAL_MATRIX', 'SUPPLY_SIGNALS', 'CATALYSTS_HIST'];
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    const col = line.indexOf(':');
    if (col > 0 && col < 20 && !/\s/.test(line.slice(0, col))) {
      cur = line.slice(0, col).toUpperCase();
      d[cur] = line.slice(col + 1).trimStart();
    } else if (cur && line.trim()) {
      if (multiLineKeys.includes(cur)) {
         d[cur] += '\n' + line.trim();
      } else {
         d[cur] += '\n' + line;
      }
    }
  }
  return d;
}


const pipes  = str => str ? str.split('|').map(s => s.trim()).filter(Boolean) : [];
const getKV  = (str, k) => { const m = str.match(new RegExp(k + '=([^\\s]+(?:\\s[^A-Z_=]+)*)')); return m ? m[1].trim() : ''; };
const getKVQ = (str, k) => { const m = str.match(new RegExp(k + '=(.+?)(?=\\s+[A-Z_]+=|$)')); return m ? m[1].trim() : ''; };

function getCorrelation(q1, q2) {
    if (!q1 || !q2 || q1.length < 20 || q2.length < 20) return null;
    const m1 = {}, m2 = {};
    q1.forEach(q => { if(q.close) m1[new Date(q.date).toISOString().slice(0,10)] = q.close; });
    q2.forEach(q => { if(q.close) m2[new Date(q.date).toISOString().slice(0,10)] = q.close; });
    const dates = Object.keys(m1).filter(k => m2[k]).sort().slice(-90); 
    if (dates.length < 10) return null;
    const r1 = [], r2 = [];
    for(let i=1; i<dates.length; i++) {
        r1.push(m1[dates[i]] / m1[dates[i-1]] - 1);
        r2.push(m2[dates[i]] / m2[dates[i-1]] - 1);
    }
    const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
    const mean1 = mean(r1), mean2 = mean(r2);
    let num = 0, den1 = 0, den2 = 0;
    for(let i=0; i<r1.length; i++) {
        const d1 = r1[i]-mean1, d2 = r2[i]-mean2;
        num += d1*d2; den1 += d1*d1; den2 += d2*d2;
    }
    return (den1===0 || den2===0) ? 0 : num / Math.sqrt(den1*den2);
}

function tech(quotes) {
  if (!quotes || quotes.length < 30) return {};
  
  const closes = quotes.map(q => q.close);
  const n = closes.length;
  const last = closes[n - 1];
  
  const ma50 = getSMA(closes, 50);
  const ma200 = getSMA(closes, 200);
  const rsi = getRSI(quotes, 14);
  const macd = getMACD(quotes);
  const adx = getADX(quotes, 14);
  
  const vols = quotes.map(q => q.volume);
  const avg30 = getSMA(vols, 30);
  const lastVol = vols[n - 1];
  const volPct = avg30 > 0 ? +((lastVol - avg30) / avg30 * 100).toFixed(2) : null;
  
  const yr = new Date().getFullYear();
  const ytdStart = quotes.find(q => new Date(q.date).getFullYear() === yr)?.close || closes[0];
  const rYtd = +((last / ytdStart - 1)*100).toFixed(2);
  
  return {
    price: +last.toFixed(2),
    ma50: ma50 ? +ma50.toFixed(2) : null,
    ma200: ma200 ? +ma200.toFixed(2) : null,
    vs50: ma50 ? +((last-ma50)/ma50*100).toFixed(2) : null,
    vs200: ma200 ? +((last-ma200)/ma200*100).toFixed(2) : null,
    gc: ma50 != null && ma200 != null ? ma50 > ma200 : null,
    rsi: rsi ? +rsi.toFixed(2) : null,
    macd: macd ? +macd.toFixed(3) : null,
    adx: adx ? +adx.toFixed(2) : null,
    avg30Vol: avg30, lastVol, volPct,
    rYtd,
    r1m: n >= 21 ? +((last / closes[n-21] - 1)*100).toFixed(2) : null
  };
}

function fund(qs) {
  if (!qs) return {};
  const p = qs.price || {};
  const k = qs.defaultKeyStatistics || {};
  const fd = qs.financialData || {};
  const sd = qs.summaryDetail || {};
  const esg = qs.esgScores || {};
  
  const pct = v => v != null ? +(v * 100).toFixed(2) : null;
  const bil = v => v != null ? +(v / 1e9).toFixed(3) : null;
  const r2 = v => v != null ? +(+v).toFixed(2) : null;

  // FIX: Accurate ROIC Calculation (Invested Capital = Book Equity + Total Debt)
  const totalDebt = fd.totalDebt || 0;
  const marketCap = p.marketCap || 0;
  
  let bookEquity = 0;
  if (k.bookValue && k.sharesOutstanding) {
      bookEquity = k.bookValue * k.sharesOutstanding;
  } else if (marketCap > 0 && sd.priceToBook > 0) {
      bookEquity = marketCap / sd.priceToBook;
  }
  const investedCapital = bookEquity + totalDebt;
  const totalCapMkt = totalDebt + marketCap; // For WACC weights
  
  let wacc = null;
  let roic = null;
  const taxRate = 0.21;
  
  if (totalCapMkt > 0 && marketCap > 0) {
      const riskFreeRate = 0.042;
      const equityRiskPremium = 0.055;
      const betaVal = sd.beta ?? k.beta ?? 1.0;
      const costOfEquity = riskFreeRate + (betaVal * equityRiskPremium);
      const weightEquity = marketCap / totalCapMkt;
      const weightDebt = totalDebt / totalCapMkt;
      const costOfDebt = 0.06; 
      
      wacc = (weightEquity * costOfEquity) + (weightDebt * costOfDebt * (1 - taxRate));
  }
  
  if (investedCapital > 0 && fd.operatingMargins != null && fd.totalRevenue != null) {
      const operatingIncome = fd.operatingMargins * fd.totalRevenue;
      roic = (operatingIncome * (1 - taxRate)) / investedCapital;
  }

  const rawData = {
    mktcap: bil(p.marketCap), fwdPE: r2(k.forwardPE), evEbitda: r2(k.enterpriseToEbitda),
    evRev: r2(k.enterpriseToRevenue), ps: r2(k.priceToSalesTrailing12Months ?? sd.priceToSalesTrailing12Months),
    peg: r2(k.pegRatio), revGr: pct(fd.revenueGrowth), grossMgn: pct(fd.grossMargins),
    opMgn: pct(fd.operatingMargins), netMgn: pct(fd.profitMargins),
    de: fd.debtToEquity != null ? +(fd.debtToEquity / 100).toFixed(3) : null,
    fcf: bil(fd.freeCashflow), fcfYield: fd.freeCashflow && marketCap ? pct(fd.freeCashflow / marketCap) : null,
    roe: pct(fd.returnOnEquity), divRate: sd.dividendRate ?? null,
    epsT: r2(k.trailingEps), epsF: r2(fd.earningsPerShare ?? k.forwardEps),
    rev: bil(fd.totalRevenue), sharesB: bil(k.sharesOutstanding),
    instPct: pct(k.heldPercentInstitutions), insPct: pct(k.heldPercentInsiders),
    beta: r2(sd.beta ?? k.beta), tgtMean: r2(fd.targetMeanPrice), tgtHigh: r2(fd.targetHighPrice),
    tgtLow: r2(fd.targetLowPrice),
    name: p.shortName || p.longName || null,
    sector: k.sector || null,
    rec: typeof fd.recommendationKey === 'string' ? fd.recommendationKey.toUpperCase().replace('_', ' ') : null,
    nAnalysts: fd.numberOfAnalystOpinions ?? null,
    envScore: esg.environmentScore, socScore: esg.socialScore, govScore: esg.governanceScore,
    wacc: wacc ? +(wacc * 100).toFixed(2) : null, roic: roic ? +(roic * 100).toFixed(2) : null
  };
  
  return rawData;
}
const f2 = v => v != null && !isNaN(v) ? (+v).toFixed(2) : '—';
const fB = v => v != null && !isNaN(v) ? `$${(+v).toFixed(1)}B` : '—';
const fP = v => v != null && !isNaN(v) ? `${(+v).toFixed(2)}%` : '—';
const ps = v => v != null && !isNaN(v) ? ((+v >= 0 ? '+' : '') + (+v).toFixed(2)) : '—';
const cc = v => v != null && !isNaN(v) && +v >= 0 ? 'pos' : 'neg';

const kpi = (l, v, s = '', c = '') => `<div class="kpi"><div class="lbl">${l}</div><div class="val${c ? ' ' + c : ''}">${v}</div>${s ? `<div class="sub">${s}</div>` : ''}</div>`;
const li = (items, cls) => `<ul class="clean ${cls || ''}">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;

const peerRow = (sym, f, t, isPrimary) => `<tr${isPrimary ? ' style="background:rgba(255,255,255,.05);font-weight:700"' : ''}>
<td><span style="cursor:help; border-bottom:1px dotted var(--text-muted);" onmouseover="showTooltip(event, '${f.name ? f.name.replace(/'/g, "\\'") : sym}')" onmouseout="hideTooltip()">${sym}${isPrimary ? ' ★' : ''}</span></td>
<td>${f.mktcap != null ? `$${(+f.mktcap).toFixed(0)}B` : '—'}</td>
<td>${f.fwdPE != null ? `${f2(f.fwdPE)}x` : '—'}</td>
<td>${f.evEbitda != null ? `${f2(f.evEbitda)}x` : '—'}</td>
<td class="${cc(f.revGr)}">${fP(f.revGr)}</td>
<td class="${cc(f.netMgn)}">${fP(f.netMgn)}</td>
<td class="${cc(f.fcfYield)}">${fP(f.fcfYield)}</td>
<td class="${+t.rsi > 70 ? 'neg' : +t.rsi < 30 ? 'pos' : 'neu'}">${t.rsi?.toFixed(0) || '—'}</td>
<td class="${cc(t.r1m)}">${ps(t.r1m)}%</td>
<td class="${cc(t.rYtd)}">${ps(t.rYtd)}%</td></tr>`;

function quadrantChart(results) {
 const rows = results.map(r => ({ sym: r.sym, fwdPE: r.f?.fwdPE, evRev: r.f?.evRev, revGr: r.f?.revGr, netMgn: r.f?.netMgn, fcfYield: r.f?.fcfYield, price: r.t?.price, r1m: r.t?.r1m, rYtd: r.t?.rYtd, rsi: r.t?.rsi, isPrimary: r.sym === results[0].sym }));
 if (rows.length < 3) return '';

 const fwdPos = rows.filter(d => d.fwdPE != null && d.fwdPE > 0).length;
 const fwdAny = rows.filter(d => d.fwdPE != null).length;
 let useEvRev = (fwdAny === 0) || (fwdPos / Math.max(1, rows.length) < 0.6);
 let xKey = useEvRev ? 'evRev' : 'fwdPE';
 let xLabel = useEvRev ? 'Valuation (EV/Revenue)' : 'Valuation (Forward P/E)';
 let data = rows.filter(d => d[xKey] != null && d.revGr != null);
 
 const primaryRow = rows.find(d => d.isPrimary);
 if (primaryRow && !data.find(d => d.isPrimary)) {
   data.push({ ...primaryRow, _forced: true, [xKey]: primaryRow[xKey] || 0.01, revGr: primaryRow.revGr || 0 });
 }
 if (data.length < 3) return '';

 const xs = data.map(d => d[xKey]), ys = data.map(d => d.revGr);
 const absMinNonZero = arr => { const a=arr.map(v=>Math.abs(v)).filter(v=>v>0.01); return a.length?Math.min(...a):1; };
 const xThresh = Math.max(1, absMinNonZero(xs)), yThresh = Math.max(1, absMinNonZero(ys));
 const symlog = (v, thresh) => Math.sign(v) * Math.log10(1 + Math.abs(v) / thresh) * thresh;
 const xLog = (Math.max(...xs.map(Math.abs)) / xThresh > 15), yLog = (Math.max(...ys.map(Math.abs)) / yThresh > 15);
 
 const tx = v => xLog ? symlog(v, xThresh) : v;
 const ty = v => yLog ? symlog(v, yThresh) : v;
 const txs = xs.map(tx), tys = ys.map(ty);
 const xMinT = Math.min(...txs), xMaxT = Math.max(...txs);
 const yMinT = Math.min(...tys), yMaxT = Math.max(...tys);
 const xPad = Math.max((xMaxT - xMinT) * 0.18, 1);
 const yPad = Math.max((yMaxT - yMinT) * 0.18, 2);
 const x0 = xMinT - xPad, x1 = xMaxT + xPad;
 const y0 = Math.min(yMinT - yPad, ty(-5)), y1 = yMaxT + yPad;
 const w = 820, h = 540, m = { t: 32, r: 28, b: 60, l: 72 };
 const pw = w - m.l - m.r, ph = h - m.t - m.b;
 const sx = v => m.l + (tx(v) - x0) / (x1 - x0) * pw;
 const sy = v => m.t + ph - (ty(v) - y0) / (y1 - y0) * ph;
 
 const medXT = tx([...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)]);
 const medYT = ty([...ys].sort((a,b)=>a-b)[Math.floor(ys.length/2)]);
 const qx = m.l + (medXT - x0) / (x1 - x0) * pw;
 const qy = m.t + ph - (medYT - y0) / (y1 - y0) * ph;

 let svg = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:820px;font-family:inherit;background:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.1)">`;
 const rects = [
   { x: m.l, y: m.t, w: qx - m.l, h: qy - m.t, fill: 'rgba(16,185,129,0.05)', lc: '#34d399', t: 'VALUE PICK' },
   { x: qx, y: m.t, w: m.l + pw - qx, h: qy - m.t, fill: 'rgba(59,130,246,0.05)', lc: '#60a5fa', t: 'PREMIUM GROWTH' },
   { x: m.l, y: qy, w: qx - m.l, h: m.t + ph - qy, fill: 'rgba(245,158,11,0.05)', lc: '#fbbf24', t: 'VALUE TRAP?' },
   { x: qx, y: qy, w: m.l + pw - qx, h: m.t + ph - qy, fill: 'rgba(239,68,68,0.05)', lc: '#f87171', t: 'HIGH RISK' }
 ];
 rects.forEach(q => {
   svg += `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="${q.fill}"/>`;
   svg += `<text x="${q.x+q.w/2}" y="${q.y+16}" text-anchor="middle" fill="${q.lc}" font-size="10" font-weight="700" opacity="0.8">${q.t}</text>`;
 });
 svg += `<line x1="${qx}" y1="${m.t}" x2="${qx}" y2="${m.t+ph}" stroke="rgba(255,255,255,.1)" stroke-dasharray="4,4"/>`;
 svg += `<line x1="${m.l}" y1="${qy}" x2="${m.l+pw}" y2="${qy}" stroke="rgba(255,255,255,.1)" stroke-dasharray="4,4"/>`;
 svg += `<text x="${m.l+pw/2}" y="${h-10}" text-anchor="middle" fill="#94a3b8" font-size="12" font-weight="600">${xLabel}</text>`;
 svg += `<text x="20" y="${m.t+ph/2}" text-anchor="middle" fill="#94a3b8" font-size="12" font-weight="600" transform="rotate(-90,20,${m.t+ph/2})">Revenue Growth (%)</text>`;

 let legendItems = [];
 data.forEach((d) => {
   const cx = sx(d[xKey]), cy = sy(d.revGr);
   const isP = d.isPrimary;
   const fill = isP ? '#3b82f6' : '#94a3b8';
   const r = isP ? 10 : 8;
   const shortName = d.sym.charAt(0);
   const tip = `${d.sym}: ${xLabel} ${f2(d[xKey])}x, Rev Gr ${f2(d.revGr)}%`;
   
   svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" style="cursor:pointer" onmousemove="showTooltip(event, '${tip}')" onmouseout="hideTooltip()"/>`;
   svg += `<text x="${cx}" y="${cy+3}" text-anchor="middle" fill="#fff" font-size="${isP?11:9}" font-weight="bold" pointer-events="none">${shortName}</text>`;
   
   legendItems.push(`<div style="display:flex; align-items:center; gap:6px;"><span style="display:inline-block; width:16px; height:16px; border-radius:50%; background:${fill}; color:#fff; font-size:10px; text-align:center; line-height:16px; font-weight:bold;">${shortName}</span><span style="font-size:13px; color:var(--text-muted);font-weight:${isP?'700':'400'}">${d.sym}${isP?' ★':''}</span></div>`);
 });
 svg += `</svg>`;
 
 const legendHtml = `<div style="display:flex; flex-wrap:wrap; gap:16px; justify-content:center; margin-top:16px; padding:12px; background:rgba(0,0,0,0.1); border-radius:8px;">${legendItems.join('')}</div>`;
 return svg + legendHtml;
}

function buildHeatmap(basePrice) {
  if (!basePrice) return '';
  const rows = [];
  const mults = [0.8, 0.9, 1.0, 1.1, 1.2];
  const grws = [0.8, 0.9, 1.0, 1.1, 1.2];
  
  for(let m of mults) {
    let tr = '<tr>';
    tr += `<td style="background:rgba(255,255,255,0.05);color:#94a3b8;font-size:12px">${(m*100).toFixed(0)}% Multiple</td>`;
    for(let g of grws) {
       const val = basePrice * m * g;
       const diff = (val - basePrice)/basePrice;
       let bg = diff > 0.2 ? '#064e3b' : diff > 0.05 ? '#065f46' : diff > -0.05 ? '#1e293b' : diff > -0.2 ? '#7f1d1d' : '#450a0a';
       let color = diff > 0 ? '#34d399' : diff < 0 ? '#f87171' : '#cbd5e1';
       tr += `<td style="background:${bg};color:${color}">$${val.toFixed(0)}</td>`;
    }
    tr += '</tr>';
    rows.push(tr);
  }
  
  return `
    <div style="overflow-x:auto;">
    <table class="heatmap" style="margin-top:20px;">
      <tr><th colspan="6" style="color:#94a3b8;padding-bottom:10px;">Sensitivity Analysis: Growth vs Valuation Multiples (Base: $${basePrice.toFixed(2)})</th></tr>
      <tr>
        <th></th>
        <th style="font-size:12px;color:#94a3b8">-20% Growth</th>
        <th style="font-size:12px;color:#94a3b8">-10% Growth</th>
        <th style="font-size:12px;color:#94a3b8">Base Growth</th>
        <th style="font-size:12px;color:#94a3b8">+10% Growth</th>
        <th style="font-size:12px;color:#94a3b8">+20% Growth</th>
      </tr>
      ${rows.join('')}
    </table>
    </div>
  `;
}

const CSS = `
:root {
  --bg-main: #0f172a; --bg-panel: #1e293b; --border: rgba(255,255,255,0.1); --shadow: 0 10px 30px -5px rgba(0,0,0,0.4);
  --text-main: #f8fafc; --text-muted: #94a3b8;
  --accent-blue: #3b82f6; --accent-green: #10b981; --accent-red: #ef4444; --accent-amber: #f59e0b;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Inter', -apple-system, system-ui, sans-serif; background: var(--bg-main); color: var(--text-main); line-height: 1.6; }
.w { max-width: 1300px; margin: 0 auto; padding: 32px 20px; }

.hero { background: #1e293b; border: 1px solid var(--border); border-radius: 24px; padding: 40px; margin-bottom: 32px; box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5); position:relative; overflow:hidden;}
.hero::before { content: ""; position: absolute; top: -50%; right: -10%; width: 500px; height: 500px; background: radial-gradient(circle, rgba(59,130,246,0.15), transparent 70%); border-radius: 50%; pointer-events: none; }

.eyebrow { display: flex; gap: 12px; align-items: center; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; flex-wrap: wrap; margin-bottom: 16px; position:relative; z-index:2;}
.badge { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; border: 1px solid; }
.badge-blue { background: rgba(59,130,246,0.15); color: #60a5fa; border-color: rgba(59,130,246,0.3); }
.badge-green { background: rgba(16,185,129,0.15); color: #34d399; border-color: rgba(16,185,129,0.3); }
.badge-red { background: rgba(239,68,68,0.15); color: #f87171; border-color: rgba(239,68,68,0.3); }

h1 { margin: 0 0 12px; font-size: clamp(36px, 5vw, 54px); font-weight: 900; letter-spacing: -0.03em; color: #ffffff; position:relative; z-index:2;}
.desc { color: var(--text-muted); font-size: 16px; margin: 0 0 24px; position:relative; z-index:2;}
.story-text { font-size: 15px; line-height: 1.8; color: #cbd5e1; }
.story-text p { margin-bottom: 16px; }

.grid { display: grid; gap: 24px; }
.g2 { grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); }
.g3 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.g4 { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }

.kpi { background: #0f172a; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: all 0.2s ease; position:relative; z-index:2;}
.kpi:hover { transform: translateY(-3px); border-color: rgba(255,255,255,0.2); box-shadow: 0 8px 16px rgba(0,0,0,0.3); }
.kpi .lbl { font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 6px; }
.kpi .val { font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; }
.kpi .sub { font-size: 12px; color: #64748b; margin-top: 6px; font-weight: 500;}
.pos { color: #34d399 !important; } .neg { color: #f87171 !important; } .neu { color: #fbbf24 !important; }

.tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--border); margin: 32px 0 24px; overflow-x: auto; padding-bottom: 8px; }
.tab { background: transparent; color: var(--text-muted); border: none; padding: 12px 24px; font-size: 15px; font-weight: 600; cursor: pointer; border-radius: 8px; transition: all 0.2s; white-space: nowrap; }
.tab:hover { background: rgba(255,255,255,0.05); color: var(--text-main); }
.tab.active { background: var(--accent-blue); color: white; box-shadow: 0 4px 12px rgba(59,130,246,0.3);}
.tab-content { display: none; animation: fadeIn 0.4s ease-out; }
.tab-content.active { display: block; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.panel { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 20px; padding: 32px; box-shadow: var(--shadow); margin-bottom: 24px; }
.panel h2 { margin: 0 0 24px; font-size: 22px; border-bottom: 1px solid var(--border); padding-bottom: 16px; color: var(--accent-blue); display: flex; align-items: center; gap:10px; }

.box { background: rgba(255,255,255,0.02); border-radius: 16px; padding: 24px; border: 1px solid var(--border); height: 100%; box-shadow: inset 0 2px 4px rgba(255,255,255,0.02); }
.box h3 { margin: 0 0 16px; font-size: 18px; color: var(--text-main); display: flex; align-items: center; gap: 10px;}
.box.bull { border-top: 4px solid var(--accent-green); }
.box.bear { border-top: 4px solid var(--accent-red); }

ul.clean { list-style: none; padding: 0; margin: 0; }
ul.clean li { position: relative; padding-left: 24px; margin-bottom: 14px; font-size: 14.5px; color: #cbd5e1; line-height: 1.6; }
ul.clean li::before { content: "•"; position: absolute; left: 0; color: var(--accent-blue); font-weight: bold; font-size: 18px; line-height: 1;}
ul.clean.bull li::before { color: var(--accent-green); content: "✓"; font-size: 14px; top: 2px;}
ul.clean.bear li::before { color: var(--accent-red); content: "⚠️"; font-size: 12px; top: 2px;}

.table-wrap { overflow-x: auto; background: rgba(0,0,0,0.2); border-radius: 16px; border: 1px solid var(--border); margin-bottom:24px; }
table { width: 100%; border-collapse: collapse; text-align: left; }
th { background: rgba(255,255,255,0.03); padding: 16px; font-size: 12px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; border-bottom: 1px solid var(--border); white-space: nowrap;}
td { padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.02); font-size: 14.5px; color: #e2e8f0; white-space: nowrap;}

.heatmap { width: 100%; border-collapse: separate; border-spacing: 6px; }
.heatmap th { border: none; background: transparent; text-align: center; }
.heatmap td { text-align: center; padding: 18px; border-radius: 12px; font-weight: 700; font-size: 16px; border: none; transition: transform 0.2s;}
.heatmap td:hover { transform: scale(1.05); }

.risk-card { display: flex; gap: 20px; padding: 24px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 16px; align-items: flex-start; transition: background 0.2s;}
.risk-card:hover { background: rgba(255,255,255,0.04); }
.risk-icon { font-size: 28px; width:56px; height:56px; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.3); border-radius: 14px; flex-shrink:0; box-shadow: inset 0 2px 4px rgba(255,255,255,0.05);}
.risk-content h4 { margin: 0 0 8px; font-size: 16px; color: var(--text-main); font-weight: 700;}
.risk-content p { margin: 0; font-size: 14px; color: var(--text-muted); line-height: 1.6;}
.risk-high { border-left: 4px solid var(--accent-red); }
.risk-med { border-left: 4px solid var(--accent-amber); }
.risk-low { border-left: 4px solid var(--accent-green); }

.s-nav { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;}
.s-btn { flex: 1; min-width: 200px; padding: 16px; border-radius: 14px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); color: var(--text-muted); font-weight: 600; cursor: pointer; transition: all 0.2s; text-align:center; font-size: 15px;}
.s-btn:hover { background: rgba(255,255,255,0.05); color: white; }
.s-btn.active { background: rgba(59,130,246,0.15); border-color: var(--accent-blue); color: #60a5fa; box-shadow: 0 4px 12px rgba(59,130,246,0.2);}
.s-content { background: #0f172a; border-radius: 16px; padding: 32px; border: 1px solid var(--border); display: none; }
.s-content.active { display: block; animation: fadeIn 0.3s ease-out;}
.s-price { font-size: 48px; font-weight: 900; background: linear-gradient(135deg, #60a5fa, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1.1; margin-bottom: 8px;}

/* Link styles */
.dataroma-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(59,130,246,0.1);
  color: #60a5fa;
  padding: 8px 16px;
  border-radius: 999px;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid rgba(59,130,246,0.3);
  transition: all 0.2s;
}
.dataroma-link:hover { background: rgba(59,130,246,0.2); color: #fff; transform: translateY(-1px); }

/* Supply Chain Items */
.supply-card {
  padding: 16px;
  background: rgba(255,255,255,0.02);
  border-radius: 0 12px 12px 0;
  margin-bottom: 12px;
  font-size: 14.5px;
  color: #e2e8f0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  line-height: 1.6;
}

/* Arena Grid */
.arena-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-top: 20px; }
.arena-cell { padding: 20px; border-radius: 12px; text-align: center; font-weight: 600; cursor: pointer; transition: all 0.3s; position: relative; overflow: hidden; font-size:15px; }
.arena-cell:hover { transform: scale(1.05); z-index: 10; box-shadow: 0 10px 20px rgba(0,0,0,0.3); }
.arena-strength { background: rgba(16,185,129,0.1); color: #34d399; border: 1px solid rgba(16,185,129,0.3); }
.arena-neutral { background: rgba(245,158,11,0.1); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); }
.arena-weakness { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }

/* Tooltip */
#arena-tooltip {
    position: fixed;
    background: rgba(15,23,42,0.95);
    color: #e2e8f0;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    pointer-events: none;
    z-index: 9999;
    display: none;
    max-width: 250px;
    border: 1px solid var(--border);
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    line-height: 1.5;
}

.esg-bar { background:rgba(255,255,255,0.1); height:8px; border-radius:4px; overflow:hidden; }
`;

const JS = `
function switchTab(id, el) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    el.classList.add('active');
}
function switchScenario(id, el) {
    document.querySelectorAll('.s-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.s-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    el.classList.add('active');
}
function showTooltip(e, text) {
    let t = document.getElementById('arena-tooltip');
    if(!t) {
        t = document.createElement('div');
        t.id = 'arena-tooltip';
        document.body.appendChild(t);
    }
    t.innerHTML = text;
    t.style.display = 'block';
    let x = e.clientX + 15;
    let y = e.clientY + 15;
    if(x + 250 > window.innerWidth) x = e.clientX - 265;
    t.style.left = x + 'px';
    t.style.top = y + 'px';
}
function hideTooltip() {
    let t = document.getElementById('arena-tooltip');
    if(t) t.style.display = 'none';
}
`;

(async () => {
  const t0 = Date.now();
  const srcFile = process.argv[2];
  if (!srcFile || !fs.existsSync(srcFile)) {
    console.error('Usage: node stockmd.js {TICKER}_report.txt');
    process.exit(1);
  }

  const D = parseTxt(fs.readFileSync(srcFile, 'utf8'));
  const TICKER = D.TICKER?.trim().toUpperCase() || 'TICK';
  const PEERS  = (D.PEERS || '').trim().split(/\s+/).filter(Boolean).map(s => s.toUpperCase());
  const NAME   = D.NAME?.trim() || TICKER;

  process.stderr.write(`[stockmd] fetching ${TICKER}+${PEERS.length} peers...\n`);

  const d1 = Math.floor(Date.now() / 1000) - 370 * 24 * 3600;
  const fetchOne = async sym => {
    const [qs, ch] = await Promise.all([
      yf.quoteSummary(sym, { modules: ['price', 'defaultKeyStatistics', 'financialData', 'summaryDetail'] }).catch(() => null),
      yf.chart(sym, { period1: d1, interval: '1d' }).catch(() => null)
    ]);
    return { sym, f: fund(qs), t: tech(ch?.quotes || []), quotes: ch?.quotes || [] };
  };

  const allSyms = [TICKER, ...PEERS];
  const results = await Promise.all(allSyms.map(fetchOne));
  const prim = results[0], peers = results.slice(1), F = prim.f, T = prim.t;
  const currentPrice = T.price || 1;

  process.stderr.write(`[stockmd] fetching macro indicators for correlations...\n`);
  const [vix, tnx, oil] = await Promise.all([
      yf.chart('^VIX', { period1: d1, interval: '1d' }).catch(()=>null),
      yf.chart('^TNX', { period1: d1, interval: '1d' }).catch(()=>null),
      yf.chart('CL=F', { period1: d1, interval: '1d' }).catch(()=>null)
  ]);
  const sector = await yf.chart(SECTOR_ETF[F.sector||""] || 'SPY', { period1: d1, interval: '1d' }).catch(()=>null);
  const spy = await yf.chart('SPY', { period1: d1, interval: '1d' }).catch(()=>null);
  
  const qPrime = prim.quotes;
  const corrs = [
      { label: 'S&P 500 (SPY)', val: getCorrelation(qPrime, spy?.quotes) },
      { label: 'Sector ETF', val: getCorrelation(qPrime, sector?.quotes) },
      { label: 'Volatility (VIX)', val: getCorrelation(qPrime, vix?.quotes) },
      { label: 'US 10Y Rates', val: getCorrelation(qPrime, tnx?.quotes) },
      { label: 'Crude Oil', val: getCorrelation(qPrime, oil?.quotes) }
  ].filter(c => c.val !== null);

  const fetchMs = Date.now() - t0;
  
  const integ = D.DATA_INTEGRITY || '';
  const integFields = {};
  for (const m of integ.matchAll(/([A-Z0-9_]+)=([^|\s][^|]*?)(?=\s+[A-Z0-9_]+=|$)/g)) {
    integFields[m[1].trim()] = m[2].trim();
  }
  const driftWarns = [];
  const trEntry = getKV(D.TRADE||'', 'ENTRY');
  if (trEntry) {
    const drift = Math.abs(+trEntry.replace(/\$/g,'') - T.price) / (T.price||1);
    if (drift > 0.08) driftWarns.push(`ENTRY ${trEntry} vs live ${T.price}`);
  }
  let anchorMatches = 0, anchorTotal = 0;
  const checks = [{ l:'Price', s: T.price, a: integFields.PRICE }, { l:'Fwd P/E', s: F.fwdPE, a: integFields.FWDPE }, { l:'Rev Gr', s: F.revGr, a: integFields.REVGR }, { l:'50D MA', s: T.ma50, a: integFields.MA50 }, { l:'200D MA', s: T.ma200, a: integFields.MA200 }, { l:'Tgt Mean', s: F.tgtMean, a: integFields.TGTMEAN }];
  for (const c of checks) {
    if (c.s != null && c.a != null) {
      anchorTotal++;
      if (Math.abs(+c.a - +c.s) / (+c.s||1) <= 0.02) anchorMatches++;
      else driftWarns.push(`${c.l}: agent ${c.a} vs script ${c.s}`);
    }
  }
  const integStatus = driftWarns.length === 0 ? 'VERIFIED' : 'DRIFT';

  if (driftWarns.length) {
    process.stderr.write('\n[stockmd] ⚠️  NUMBER DRIFT DETECTED:\n');
    driftWarns.forEach(w => process.stderr.write('  '+w+'\n'));
  } else {
    process.stderr.write('[stockmd] ✅ All anchor numbers verified against script data\n');
  }

  // Parse sections
  const eli5 = D.ELI5 || '';
  const vpRaw = D.VARIANT_PERCEPTION || '';
  const vpParts = vpRaw.split('~').map(s=>s.trim());
  const vpConsensus = vpParts[0] ? vpParts[0].replace('Consensus Believes', '').replace('Consensus believes', '').replace(':', '').trim() : 'N/A';
  const vpOurView = vpParts[1] ? vpParts[1].replace('We Believe', '').replace('We believe', '').replace(':', '').trim() : 'N/A';
  const vpCatalyst = vpParts[2] ? vpParts[2].replace('Catalyst:', '').replace('Catalyst', '').trim() : 'N/A';
  
  const altData = pipes(D.ALT_DATA);

  const bullItems = pipes(D.BULL);
  const bearItems = pipes(D.BEAR);
  const aiOpp = pipes(D.AI_OPP);
  const aiThr = pipes(D.AI_THR);
  const upc = pipes(D.UPCOMING);
  const storyParas = (D.STORY || '').split(/\n\n+/).map(p => `<p>${p.trim()}</p>`).join('');
  
  const whatsNew = pipes(D.WHATS_NEW);
  const patRaw = D.PATTERN || '';
  const patParts = patRaw.split('|').map(s=>s.trim());
  const patName = patParts[0] || 'No Technical Pattern Identified';
  const patDesc = patParts.slice(1).join(' | ') || 'Awaiting technical confirmation.';
  
  const compArena = pipes(D.COMPETITIVE_ARENA);
  const arenaHtml = compArena.map(item => {
      let parts = item.split('~').map(s=>s.trim());
      if(parts.length < 3) return '';
      let domain = parts[0];
      let status = parts[1].toLowerCase();
      let desc = parts[2];
      
      let cssClass = 'arena-neutral';
      if(status === 'strong' || status === 'dominant') cssClass = 'arena-strength';
      if(status === 'weak' || status === 'eroding' || status === 'weakness') cssClass = 'arena-weakness';
      
      return `<div class="arena-cell ${cssClass}" onmouseover="showTooltip(event, '${desc.replace(/'/g, "\\'")}')" onmouseout="hideTooltip()">
                  ${domain}
                  <div style="font-size: 0.8em; margin-top: 5px; opacity: 0.8; text-transform: uppercase;">${status}</div>
              </div>`;
  }).join('');
  
  const risks = pipes(D.RISKS);
  const riskHtml = risks.map((r, i) => {
      const parts = r.split('~').map(s=>s.trim());
      const title = parts[0] || 'Risk Factor';
      const impact = (parts[1] || 'Medium Impact').toUpperCase();
      const tag = (parts[2] || 'Operational').toUpperCase();
      const desc = parts[3] || parts[0]; 
      
      let impactClass = 'risk-med';
      let impactColor = 'var(--accent-amber)';
      if(impact.includes('HIGH')) { impactClass = 'risk-high'; impactColor = 'var(--accent-red)'; }
      else if(impact.includes('LOW')) { impactClass = 'risk-low'; impactColor = 'var(--accent-green)'; }
      
      return `<div class="risk-card ${impactClass}">
        <div class="risk-icon">${i%2===0?'🌪️':'🏛️'}</div>
        <div class="risk-content">
          <h4>${title}</h4>
          <p>${desc}</p>
          <div style="margin-top: 12px; display:flex; gap:8px;">
              <span class="badge" style="background:${impactColor}; color:#fff; border:none; padding:4px 10px;">${impact}</span>
              <span class="badge" style="background:rgba(255,255,255,0.1); color:#cbd5e1; border:none; padding:4px 10px;">${tag}</span>
          </div>
        </div>
      </div>`;
  }).join('');
  
  const supplyItems = pipes(D.SUPPLY);
  const supplyHtml = supplyItems.map(item => {
    let border = '#64748b'; 
    if (item.includes('✅') || item.includes('🟢')) border = '#10b981'; 
    else if (item.includes('🔴')) border = '#ef4444'; 
    else if (item.includes('⚠️')) border = '#f59e0b'; 
    return `<div class="supply-card" style="border-left: 4px solid ${border};">${item}</div>`;
  }).join('');
  
  const sectorCommentary = D.SECTOR || '';
  const peer1 = D.PEER1 || '';
  const peer2 = D.PEER2 || '';
  const nextEarnings = D.NEXT_EARNINGS || 'TBD';
  const sources = pipes(D.SOURCES || '');
  const sourceLinks = sources.length
    ? `<div style="display:flex; gap:12px; flex-wrap:wrap;">${sources.map(s => { const parts = s.split(' '); const url = parts.pop(); const name = parts.join(' '); return url && url.startsWith('http') ? `<a href="${url}" target="_blank" class="dataroma-link">${name} ↗</a>` : `<span class="badge badge-blue">${s}</span>`; }).join('')}</div>`
    : '<p class="story-text">Yahoo Finance via Node.js</p>';
    
  const divYield = F.divRate && T.price ? ((F.divRate / T.price) * 100).toFixed(2) : null;
  
  function parseScenario(str, defaultTgt) {
      const parts = pipes(str);
      let tgt = defaultTgt;
      let bullets = [];
      parts.forEach(p => {
          if (p.startsWith('TARGET=')) {
              tgt = p.replace('TARGET=', '').replace(/\$/g, '').trim();
          } else {
              bullets.push(p);
          }
      });
      let priceStr = (tgt != null && !isNaN(tgt)) ? '$' + (+tgt).toFixed(2) : (tgt || 'N/A');
      let upsideNum = (tgt && !isNaN(tgt)) ? (((+tgt - currentPrice) / currentPrice) * 100).toFixed(1) : null;
      let upsideStr = upsideNum ? (upsideNum >= 0 ? '+' + upsideNum + '%' : upsideNum + '%') : '';
      return { priceStr, upsideStr, bullets: bullets.length ? bullets : ['No specific assumptions provided.'] };
  }

  
  const valMethod = D.VAL_METHOD || '';
  const valMatrixRaw = D.VAL_MATRIX || '';
  const valMatrixHtml = valMatrixRaw.split('\n').filter(l=>l.includes('|')).map(l => {
      const parts = l.split('|').map(s=>s.trim());
      if(parts.length < 7) return '';
      return `<tr><td><strong>${parts[0]}</strong></td><td>${parts[1]}</td><td>${parts[2]}</td><td>${parts[3]}</td><td>${parts[4]}</td><td><strong>${parts[5]}</strong></td><td class="${parts[6].includes('-')?'neg':'pos'}">${parts[6]}</td><td>${parts[7]||''}</td></tr>`;
  }).join('');

  const scBase = parseScenario(D.VAL_BASE || '', F.tgtMean);
  const scBull = parseScenario(D.VAL_BULL || '', F.tgtHigh);
  const scBear = parseScenario(D.VAL_BEAR || '', F.tgtLow);

  const trStop = getKV(D.TRADE||'', 'STOP');
  const trT1 = getKV(D.TRADE||'', 'T1');
  const trT2 = getKV(D.TRADE||'', 'T2');
  const trSize = getKVQ(D.TRADE||'', 'SIZE');
  
  const vRat = getKVQ(D.VERDICT||'', 'RATING');
  const vBot = (D.VERDICT||'').match(/BOTTOM=(.*)/) ? (D.VERDICT||'').match(/BOTTOM=(.*)/)[1].trim() : '';
  const vStars = getKV(D.VERDICT||'', 'STARS') || '3';
  const starStr = '★'.repeat(+vStars) + '☆'.repeat(5 - +vStars);

  const ins = D.INSIDER || '';
  const insScore = getKV(ins, 'SCORE');
  const insSignal = (ins.match(/SIGNAL=(.+)$/) ? ins.match(/SIGNAL=(.+)$/)[1].trim() : ins.replace(/\w+=\S+\s*/g, '').trim());

  
  const catHistRaw = D.CATALYSTS_HIST || '';
  const catHistHtml = catHistRaw.split('\n').filter(l=>l.includes('|')).map(l => {
      const parts = l.split('|').map(s=>s.trim());
      if(parts.length < 5) return '';
      const impact = parts[3].toLowerCase();
      let badge = 'badge-blue';
      if(impact.includes('pos')) badge = 'badge-green';
      if(impact.includes('neg')) badge = 'badge-red';
      return `<tr><td style="white-space:nowrap;color:var(--text-muted)">${parts[0]}</td><td><strong>${parts[1]}</strong></td><td>${parts[2]}</td><td><span class="badge ${badge}">${parts[3]}</span></td><td>${parts[4]}</td></tr>`;
  }).join('');
  
  const supplyUp = pipes(D.SUPPLY_UP);
  const supplyDown = pipes(D.SUPPLY_DOWN);
  
  const supplyRiskRaw = D.SUPPLY_RISK || '';
  const srParts = supplyRiskRaw.split('|').map(s=>s.trim());
  const srLevel = srParts[0] || 'Unknown';
  const srDesc = srParts.slice(1).join(' | ') || '';
  
  let srColor = 'var(--text-muted)';
  let srBg = 'rgba(255,255,255,0.03)';
  if (srLevel.toUpperCase().includes('HIGH')) { srColor = 'var(--accent-red)'; srBg = 'rgba(239,68,68,0.05)'; }
  else if (srLevel.toUpperCase().includes('MEDIUM') || srLevel.toUpperCase().includes('MED')) { srColor = 'var(--accent-amber)'; srBg = 'rgba(245,158,11,0.05)'; }
  else if (srLevel.toUpperCase().includes('LOW')) { srColor = 'var(--accent-green)'; srBg = 'rgba(16,185,129,0.05)'; }

  const supplySignalsRaw = D.SUPPLY_SIGNALS || '';
  const supplySignalsHtml = supplySignalsRaw.split('\n').filter(l=>l.includes('|')).map(l => {
      const parts = l.split('|').map(s=>s.trim());
      if(parts.length < 4) return '';
      return `<tr><td><strong>${parts[0]}</strong></td><td>${parts[1]}</td><td class="${parts[2].toLowerCase().includes('beat') || parts[2].toLowerCase().includes('raised')?'pos':'neg'}">${parts[2]}</td><td>${parts[3]}</td></tr>`;
  }).join('');

  
  const errors = lintReport(vBot + ' ' + vRat, F.roic, F.wacc, T.rsi);
  let linterHtml = '';
  if (errors.length > 0) {
      linterHtml = `<div class="panel" style="border-left: 4px solid var(--accent-red); background: rgba(239,68,68,0.05); margin-bottom: 24px;">
          <h3 style="color: var(--accent-red); margin-top:0; font-size:16px; display:flex; align-items:center; gap:8px;">🛑 Algorithmic Coherence Linter</h3>
          <ul style="color:#f87171; font-size:14.5px; margin:0; padding-left:20px;">${errors.map(e => `<li style="margin-bottom:8px;">${e}</li>`).join('')}</ul>
      </div>`;
  }

  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${TICKER} Research | Arena</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>${CSS}</style></head><body><div class="w">

<div class="hero">
<div class="eyebrow">
  <span style="color:var(--text-muted)">📊 Arena Research</span><span style="color:var(--border)">•</span><span style="color:var(--text-muted)">${new Date().toISOString().slice(0, 10)}</span>
  <span class="badge badge-blue">${D.DESC || 'Tech'}</span>
  ${integStatus === 'VERIFIED' ? '<span class="badge badge-green">✅ Data Verified</span>' : '<span class="badge badge-red">❌ Data Drift</span>'}
</div>
<h1>${NAME}</h1>
<div class="grid g4" style="margin-top:32px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
  ${kpi('Price', `\$${f2(T.price)}`, '', 'big')}
  ${kpi('Market Cap', fB(F.mktcap))}
  ${kpi('Fwd P/E', F.fwdPE ? `${f2(F.fwdPE)}x` : '—')}
  ${kpi('YTD Return', `${ps(T.rYtd)}%`, '', cc(T.rYtd))}
  ${kpi('Next Earnings', nextEarnings, '', 'neu')}
</div>
</div>

<div class="tabs">
  <button class="tab active" onclick="switchTab('overview', this)">Executive Overview</button>
  <button class="tab" onclick="switchTab('scenarios', this)">Scenarios & Valuation</button>
  <button class="tab" onclick="switchTab('risks', this)">Risks & Catalysts</button>
  <button class="tab" onclick="switchTab('tech', this)">Technicals</button>
</div>

<!-- OVERVIEW TAB -->
<div id="overview" class="tab-content active">
  ${linterHtml}
  ${whatsNew.length ? `
  <div class="panel" style="border-left: 4px solid var(--accent-amber); background: linear-gradient(135deg, rgba(245,158,11,0.05) 0%, rgba(15,23,42,0.8) 100%);">
    <h2 style="color:var(--accent-amber); border-bottom:none; padding-bottom:0; margin-bottom:16px;">📰 What's New & Strategic Pivots</h2>
    ${li(whatsNew, 'neu')}
  </div>` : ''}

  ${eli5 ? `
  <div class="panel" style="background: linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(15,23,42,0.8) 100%); border-left: 4px solid var(--accent-blue);">
    <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #60a5fa; display: flex; align-items: center; gap: 8px;">🧠 Explain Like I'm 5</h3>
    <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #f8fafc;">${eli5.replace(/\n/g, '<br>')}</p>
  </div>` : ''}

  ${vpRaw ? `
  <div class="panel" style="border:1px solid rgba(59,130,246,0.3); background:rgba(0,0,0,0.2);">
    <h2 style="border:none; margin-bottom:16px;">🧠 Variant Perception</h2>
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:16px;">
        <div style="padding:16px; background:rgba(255,255,255,0.03); border-radius:12px; border-left:4px solid var(--text-muted);">
            <h4 style="color:var(--text-muted); margin:0 0 8px;">Consensus View</h4>
            <p class="story-text" style="margin:0; font-size:14px;">${vpConsensus}</p>
        </div>
        <div style="padding:16px; background:rgba(16,185,129,0.05); border-radius:12px; border-left:4px solid var(--accent-green);">
            <h4 style="color:var(--accent-green); margin:0 0 8px;">Our Variant View</h4>
            <p class="story-text" style="margin:0; font-size:14px;">${vpOurView}</p>
        </div>
        <div style="padding:16px; background:rgba(59,130,246,0.05); border-radius:12px; border-left:4px solid var(--accent-blue);">
            <h4 style="color:var(--accent-blue); margin:0 0 8px;">Re-Rating Catalyst</h4>
            <p class="story-text" style="margin:0; font-size:14px;">${vpCatalyst}</p>
        </div>
    </div>
  </div>` : ''}

  ${altData.length ? `
  <div class="panel">
    <h2>📡 Alternative Data Signals <span style="font-size:12px; color:var(--text-muted); font-weight:normal; text-transform:none;">(illustrative unless sourced)</span></h2>
    <div class="grid g3">
        ${altData.map(a => {
            if(a.startsWith('HYP:')) {
                return `<div style="padding:16px; background:rgba(255,255,255,0.01); border-radius:12px; border:1px dashed var(--border);"><p class="story-text" style="margin:0; font-size:13px; font-style:italic; color:var(--text-muted);">${a}</p></div>`;
            } else {
                return `<div style="padding:16px; background:rgba(255,255,255,0.03); border-radius:12px; border:1px solid var(--border); border-left: 4px solid var(--accent-blue);"><span style="font-size:20px; display:block; margin-bottom:8px;">🛰️</span><p class="story-text" style="margin:0; font-size:14px;">${a}</p></div>`;
            }
        }).join('')}
    </div>
  </div>` : ''}

  <div class="panel">
    <h2>📖 Investment Thesis</h2>
    <div class="grid g2">
      <div class="story-text">${storyParas}
        <div style="margin-top:24px;padding:20px;background:rgba(59,130,246,0.08);border-left:4px solid var(--accent-blue);border-radius:12px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.1);">
          <strong style="color:#60a5fa;display:block;margin-bottom:8px;">Current Setup:</strong> ${D.SETUP || ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="box bull"><h3>🐂 Bull Case</h3>${li(bullItems, 'bull')}</div>
        <div class="box bear"><h3>🐻 Bear Case</h3>${li(bearItems, 'bear')}</div>
      </div>
    </div>
  </div>

  ${arenaHtml ? `
  <div class="panel">
    <h2>⚔️ Competitive Moat Risk Matrix</h2>
    <p class="story-text" style="font-size:13px; margin-bottom: 16px;">Hover over each domain for specific strategic assessments against primary rivals.</p>
    <div class="arena-grid">
        ${arenaHtml}
    </div>
  </div>` : ''}

  <div class="panel">
    <h2>🔬 Peer Comparison & Sector Rotation</h2>
    ${sectorCommentary ? `<p class="story-text" style="margin-bottom:24px; padding:16px; background:rgba(255,255,255,0.02); border-left:4px solid var(--accent-amber); border-radius:8px;"><strong>Sector Context:</strong> ${sectorCommentary}</p>` : ''}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Ticker</th><th>MktCap</th><th>Fwd P/E</th><th>EV/EBITDA</th><th>Rev Gr</th><th>Net Mgn</th><th>FCF Yld</th><th>RSI</th><th>1M</th><th>YTD</th></tr></thead>
        <tbody>
          ${peerRow(TICKER, F, T, true)}
          ${peers.map(p => peerRow(p.sym, p.f, p.t, false)).join('\n')}
        </tbody>
      </table>
    </div>
    ${quadrantChart(results)}
    ${(peer1 || peer2) ? `
    <div class="grid g2" style="margin-top:24px;">
      ${peer1 ? `<div style="padding:16px;background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.2);border-radius:12px;color:#cbd5e1;font-size:14.5px;"><strong>💡 Peer Insight:</strong> ${peer1}</div>` : ''}
      ${peer2 ? `<div style="padding:16px;background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.2);border-radius:12px;color:#cbd5e1;font-size:14.5px;"><strong>💡 Peer Insight:</strong> ${peer2}</div>` : ''}
    </div>` : ''}
  </div>
</div>

<!-- SCENARIOS TAB -->
<div id="scenarios" class="tab-content">
  <div class="panel">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; border-bottom: 1px solid var(--border); padding-bottom: 16px;">
        <h2 style="margin:0; border:none; padding:0;">📊 Sector-Adaptive Valuation & Economic Narrative</h2>
        ${(F.roic != null && F.wacc != null) ? `
        <div style="display:flex; gap:16px; background:rgba(0,0,0,0.3); padding:12px 20px; border-radius:12px; border:1px solid rgba(255,255,255,0.1);">
            <div style="cursor:help;" onmouseover="showTooltip(event, 'Return on Invested Capital. Measures capital efficiency. Calculated as: Net Operating Profit After Tax / (Book Equity + Total Debt).')" onmouseout="hideTooltip()">
                <div style="font-size:11px; color:var(--text-muted); font-weight:700;">ROIC ⓘ</div>
                <div style="font-size:20px; font-weight:800; color:var(--accent-blue);">${F.roic}%</div>
            </div>
            <div style="width:1px; background:rgba(255,255,255,0.1);"></div>
            <div style="cursor:help;" onmouseover="showTooltip(event, 'Weighted Average Cost of Capital. The blended cost of equity (Risk-Free Rate + Beta * Risk Premium) and debt financing.')" onmouseout="hideTooltip()">
                <div style="font-size:11px; color:var(--text-muted); font-weight:700;">WACC ⓘ</div>
                <div style="font-size:20px; font-weight:800; color:var(--text-main);">${F.wacc}%</div>
            </div>
            <div style="width:1px; background:rgba(255,255,255,0.1);"></div>
            <div style="cursor:help;" onmouseover="showTooltip(event, 'Value Spread (ROIC - WACC). A positive spread means the company is creating true economic value above its cost of capital.')" onmouseout="hideTooltip()">
                <div style="font-size:11px; color:var(--text-muted); font-weight:700;">VALUE SPREAD ⓘ</div>
                <div style="font-size:20px; font-weight:800; color:${(F.roic - F.wacc) > 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">${(F.roic - F.wacc) > 0 ? '+' : ''}${(F.roic - F.wacc).toFixed(2)}%</div>
            </div>
        </div>` : ''}
    </div>
    <p class="story-text">${valMethod}</p>
    ${valMatrixHtml ? `
    <h3 style="margin:24px 0 16px; color:var(--text-main); font-size:16px;">Combined Valuation Thesis & Target Price Matrix</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Ticker</th><th>Current Price</th><th>Target Mult Val</th><th>DCF Val</th><th>Analyst Tgt</th><th>Blended Fair Value</th><th>Upside/Downside</th><th>Verdict</th></tr></thead>
        <tbody>${valMatrixHtml}</tbody>
      </table>
    </div>` : ''}
  </div>

  <div class="panel">
    <h2>🎯 Scenario Analysis</h2>
    <div class="s-nav">
      <button class="s-btn active" onclick="switchScenario('s-base', this)">Base Case (Consensus)</button>
      <button class="s-btn" onclick="switchScenario('s-bull', this)">Bull Case (Upside)</button>
      <button class="s-btn" onclick="switchScenario('s-bear', this)">Bear Case (Downside)</button>
    </div>
    
    <div id="s-base" class="s-content active">
      <div class="grid g3">
        <div>
          <div class="s-price">${scBase.priceStr}</div>
          <div style="font-weight:700;font-size:18px;margin-bottom:4px;color:${scBase.upsideStr.includes('+')?'#34d399':'#f87171'}">${scBase.upsideStr}</div>
          <div style="color:var(--text-muted);font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Base Target</div>
        </div>
        <div style="grid-column: span 2">
          <h4 style="margin:0 0 12px;color:var(--text-main);font-size:16px;">Key Assumptions</h4>
          ${li(scBase.bullets)}
        </div>
      </div>
    </div>
    
    <div id="s-bull" class="s-content">
      <div class="grid g3">
        <div>
          <div class="s-price pos">${scBull.priceStr}</div>
          <div style="font-weight:700;font-size:18px;margin-bottom:4px;color:${scBull.upsideStr.includes('+')?'#34d399':'#f87171'}">${scBull.upsideStr}</div>
          <div style="color:var(--text-muted);font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Bull Target</div>
        </div>
        <div style="grid-column: span 2">
          <h4 style="margin:0 0 12px;color:var(--text-main);font-size:16px;">Bull Case Drivers</h4>
          ${li(scBull.bullets)}
        </div>
      </div>
    </div>

    <div id="s-bear" class="s-content">
      <div class="grid g3">
        <div>
          <div class="s-price neg">${scBear.priceStr}</div>
          <div style="font-weight:700;font-size:18px;margin-bottom:4px;color:${scBear.upsideStr.includes('+')?'#34d399':'#f87171'}">${scBear.upsideStr}</div>
          <div style="color:var(--text-muted);font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Bear Floor</div>
        </div>
        <div style="grid-column: span 2">
          <h4 style="margin:0 0 12px;color:var(--text-main);font-size:16px;">Downside Risks</h4>
          ${li(scBear.bullets)}
        </div>
      </div>
    </div>
    
    ${buildHeatmap(F.tgtMean || T.price)}
  </div>
  
  <div class="panel">
    <h2>⚖️ Final Verdict & Trade Plan</h2>
    <div class="grid g2">
      <div class="box" style="border-top:4px solid var(--accent-blue)">
        <h3>Rating: ${vRat} <span style="color:var(--accent-amber);margin-left:8px;font-size:18px;">${starStr}</span></h3>
        <p class="story-text" style="font-size:15px;">${vBot}</p>
      </div>
      <div class="grid g2">
        ${kpi('Ideal Entry', trEntry)}
        ${kpi('Stop Loss', trStop, '', 'neg')}
        ${kpi('Targets', `${trT1} → ${trT2}`, '', 'pos')}
        ${kpi('Position Size', trSize)}
        ${divYield ? kpi('Div Yield', divYield + '%', `\$${f2(F.divRate)}/yr`, 'neu') : ''}
      </div>
    </div>
  </div>
</div>

<!-- RISKS & CATALYSTS TAB -->
<div id="risks" class="tab-content">
  <div class="panel">
    <h2>⚠️ Comprehensive Risk Matrix</h2>
    <div class="grid g2" style="margin-bottom: 24px;">
      ${riskHtml}
    </div>
  </div>
  
  <div class="grid g2">
    ${F.envScore != null ? `
    <div class="panel">
      <h2>🌍 ESG Considerations</h2>
      <div style="margin-bottom: 16px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px; font-weight:600;"><span>Environmental</span><span style="color:var(--text-muted)">${F.envScore}</span></div>
          <div class="esg-bar"><div style="background:var(--accent-green); height:100%; width:${Math.min(100, F.envScore*2)}%"></div></div>
      </div>
      <div style="margin-bottom: 16px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px; font-weight:600;"><span>Social</span><span style="color:var(--text-muted)">${F.socScore}</span></div>
          <div class="esg-bar"><div style="background:var(--accent-blue); height:100%; width:${Math.min(100, F.socScore*2)}%"></div></div>
      </div>
      <div style="margin-bottom: 16px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px; font-weight:600;"><span>Governance</span><span style="color:var(--text-muted)">${F.govScore}</span></div>
          <div class="esg-bar"><div style="background:var(--accent-amber); height:100%; width:${Math.min(100, F.govScore*2)}%"></div></div>
      </div>
    </div>` : ''}
    
    <div class="panel">
      <h2>📈 Macro Correlation</h2>
      <div style="position: relative; height: 300px; width: 100%; display: flex; justify-content: center;">
        <canvas id="macroRadar"></canvas>
      </div>
    </div>
  </div>

  <div class="panel">
    <h2>⛓️ Comprehensive Supply Chain & Dependencies</h2>
      
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom: 28px;">
        ${supplyHtml || '<p class="story-text">No general supply chain data provided.</p>'}
      </div>

      <div class="grid g2" style="margin-bottom:24px;">
          <div>
            <h4 style="color:var(--accent-blue); margin-bottom:12px;">⬆️ Upstream (Key Suppliers)</h4>
            ${li(supplyUp, 'neu')}
          </div>
          <div>
            <h4 style="color:var(--accent-green); margin-bottom:12px;">⬇️ Downstream (Key Customers)</h4>
            ${li(supplyDown, 'neu')}
          </div>
      </div>
      
      ${supplySignalsHtml ? `
      <h4 style="margin-bottom:12px;">📡 Recent Earnings Signals from Supply Chain</h4>
      <div class="table-wrap" style="margin-bottom:24px;">
        <table>
          <thead><tr><th>Company</th><th>Relationship</th><th>Earnings Result</th><th>Implication for ${TICKER}</th></tr></thead>
          <tbody>${supplySignalsHtml}</tbody>
        </table>
      </div>` : ''}
      
      <div style="margin-top:20px; padding:24px; background:${srBg}; border-radius:12px; border:1px solid ${srColor}; border-left:4px solid ${srColor}; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
              <h4 style="margin:0; font-size:16px; color:var(--text-main); font-weight:700;">🌍 Supply Chain Chokepoints & Geopolitical Risk</h4>
              <span class="badge" style="background:rgba(0,0,0,0.3); color:${srColor}; border-color:${srColor}; font-size:11px; font-weight:800;">${srLevel.toUpperCase()} RISK</span>
          </div>
          <p class="story-text" style="margin:0; font-size:14.5px; line-height:1.7;">${srDesc}</p>
      </div>
  </div>
  
  <div class="panel">
    <h2>🤖 AI Dynamics</h2>
    <div class="grid g2">
      <div class="box bull"><h3>Opportunity</h3>${li(aiOpp)}</div>
      <div class="box bear"><h3>Threat</h3>${li(aiThr)}</div>
    </div>
    <div style="margin-top:24px;padding:20px;background:rgba(255,255,255,0.03);border-radius:12px;font-size:15px;color:#cbd5e1;border:1px solid var(--border);">
      <strong style="color:var(--text-main);">Net Assessment:</strong> ${D.AI_NET || ''}
    </div>
  </div>
  
  <div class="panel">
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 24px;">
      <h2 style="margin:0; border:none; padding:0;">🕵️ Insider Signal</h2>
      <a href="https://www.dataroma.com/m/stock.php?sym=${TICKER}" target="_blank" class="dataroma-link">
        View Dataroma Profile <span style="font-size:16px;line-height:1;">↗</span>
      </a>
    </div>
    <div class="grid g3">
      ${kpi('Conviction Score', `${insScore}/10`, '1 = Sell · 10 = Cluster Buy', +insScore>6?'pos':+insScore<4?'neg':'neu')}
      <div style="grid-column: span 2" class="story-text">
        <p style="margin:0;font-size:15px;">${insSignal}</p>
      </div>
    </div>
  </div>
</div>

<!-- TECHNICALS TAB -->
<div id="tech" class="tab-content">
  ${patRaw ? `
  <div class="panel">
    <h2>📐 Chart Pattern</h2>
    <div class="box" style="border-top:4px solid var(--accent-blue);">
      <h3 style="color:#60a5fa; font-size: 20px; margin-bottom: 8px;">${patName}</h3>
      <p class="story-text" style="margin:0;">${patDesc}</p>
    </div>
  </div>` : ''}

  <div class="panel">
    <h2>📊 Technical Structure</h2>
    <div class="grid g4">
      ${kpi('Price', `\$${f2(T.price)}`)}
      ${kpi('50D MA', `\$${f2(T.ma50)}`, `${ps(T.vs50)}% vs price`, cc(T.vs50))}
      ${kpi('200D MA', `\$${f2(T.ma200)}`, `${ps(T.vs200)}% vs price`, cc(T.vs200))}
      ${kpi('Golden Cross', T.gc ? 'YES ✅' : 'NO ⚠️')}
      ${kpi('RSI-14', f2(T.rsi), +T.rsi > 70 ? 'Overbought' : +T.rsi < 30 ? 'Oversold' : 'Neutral', +T.rsi > 70 ? 'neg' : +T.rsi < 30 ? 'pos' : 'neu')}
      ${kpi('MACD', +T.macd > 0 ? 'Bullish' : 'Bearish', `Line: ${f2(T.macd)}`, +T.macd > 0 ? 'pos' : 'neg')}
      ${kpi('ADX-14', f2(T.adx), +T.adx > 25 ? 'Trending' : 'Weak')}
      ${kpi('Vol vs 30D Avg', `${ps(T.volPct)}%`, '', cc(T.volPct))}
    </div>
  </div>
  <div class="panel">
    <h2>📅 Catalysts & News Timeline</h2>
    ${catHistHtml ? `
    <h3 style="margin: 0 0 16px; font-size:16px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Historical Catalysts (Last 6 Months)</h3>
    <div class="table-wrap" style="margin-bottom: 24px;">
      <table>
        <thead><tr><th>Date</th><th>Catalyst</th><th>Type</th><th>Impact</th><th>Source/Notes</th></tr></thead>
        <tbody>${catHistHtml}</tbody>
      </table>
    </div>` : ''}
    
    <h3 style="margin: 0 0 16px; font-size:16px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Upcoming Known Catalysts (Next 90 Days)</h3>
    ${li(upc)}
  </div>
</div>

</div>

<script>
${JS}
const corrs = ${JSON.stringify(corrs)};
if(corrs && corrs.length > 0) {
    const ctx = document.getElementById('macroRadar');
    if(ctx) {
        new Chart(ctx, {
            type: 'radar',
            data: {
                labels: corrs.map(c => c.label),
                datasets: [{
                    label: 'Correlation with ${TICKER}',
                    data: corrs.map(c => c.val),
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    pointBackgroundColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: -1, max: 1,
                        ticks: { backdropColor: 'transparent', color: '#94a3b8' },
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        angleLines: { color: 'rgba(255,255,255,0.1)' },
                        pointLabels: { color: '#e2e8f0', font: { size: 12, family: 'Inter' } }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}
</script>
</body></html>`;

  const out = `${TICKER.toLowerCase()}_rich_report.html`;
  fs.writeFileSync(out, html);
  process.stderr.write(`[stockmd] ✓ ${out} — total ${Date.now() - t0}ms\n`);
})();
