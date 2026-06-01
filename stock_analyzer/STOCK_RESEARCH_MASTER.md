# 📈 STOCK RESEARCH MASTER PLAYBOOK
> **One-file system.** Upload this single `.md` in any new agent-mode chat and say: `Analyze ticker {TICKER}`.
> Everything needed — fetch scripts, workflow, text format, HTML converter — is embedded here.

---

## ⚡ QUICK START (copy-paste into a new chat after uploading this file)

```
Analyze ticker {TICKER} using the embedded STOCK_RESEARCH_MASTER workflow.
Extract and run stockfetch.js first to download live Yahoo Finance data.
Anchor ALL numbers on the downloaded JSON before doing any research.
Then write the plain-text report. CRITICAL: run `node stockmd.js {TICKER}_report.txt` to produce the HTML. NEVER generate HTML/JS/CSS manually — stockmd.js does it all from scratch with live data refresh, interactive tooltips, and the correct dark theme.
```

---

## 🗑️ Before starting a NEW ticker analysis, DELETE old files:

```
rm -f {PREVIOUS_TICKER}_data.json {PREVIOUS_TICKER}_report.txt {prev_ticker}_rich_report.html
```

This removes the **previous report's LLM-generated files** — only 3 files get deleted.

**NEVER delete these files (they are user-uploaded permanents):**
- STOCK_RESEARCH_MASTER.md
- stockfetch.js
- stockmd.js
- README.md

**At any given time, the workspace should contain:**
```
PERMANENT (5): STOCK_RESEARCH_MASTER.md, stockfetch.js, stockmd.js, insiderfetch.js, README.md
CURRENT  (3): {TICKER}_data.json, {TICKER}_report.txt, {ticker}_rich_report.html
```

---

## ⚡ FASTER SETUP (download JS once, reuse forever)

```bash
curl -sLO https://raw.githubusercontent.com/researchshipper/arena2/main/stock_analyzer/stockfetch.js
curl -sLO https://raw.githubusercontent.com/researchshipper/arena2/main/stock_analyzer/stockmd.js
curl -sLO https://raw.githubusercontent.com/researchshipper/arena2/main/stock_analyzer/insiderfetch.js
mkdir -p ../lib
curl -sL https://raw.githubusercontent.com/researchshipper/arena2/main/lib/indicators.js -o ../lib/indicators.js
curl -sL https://raw.githubusercontent.com/researchshipper/arena2/main/lib/sanity.js -o ../lib/sanity.js
curl -sL https://raw.githubusercontent.com/researchshipper/arena2/main/lib/valuation.js -o ../lib/valuation.js
curl -sL https://raw.githubusercontent.com/researchshipper/arena2/main/lib/quality.js -o ../lib/quality.js
npm install yahoo-finance2 --silent
```

**Do NOT `cat` the embedded JS.** curl is 3x faster and eliminates copy-paste bugs.

---


## 🧠 DOUBLE VERIFICATION DIRECTIVE
Act as an elite institutional equity analyst. You must **double-verify** all qualitative inputs (supply chain dependencies, historical catalysts, competitor positioning) using multiple trustworthy sources. Ensure all valuation math (WACC, DCF targets, Blended Averages) is logically sound and accurately reflects the current macro environment.

**ALT_DATA RULE:** Each `ALT_DATA` item must EITHER cite a real source you found via `web_search` (e.g. "Per LinkedIn data, AI engineer postings +40% QoQ"), OR be explicitly prefixed with `HYP:` to mark it as an unverified hypothesis. Never present an unsourced figure as measured fact.

## 🚨 PATCH OVERRIDE — AUTHORITATIVE DECISION FRAMEWORK

If this playbook's embedded code differs from the local repo files, the local repo files are authoritative. In particular:
- `stockfetch.js` must use the same valuation engine as `stockmd.js` / `../lib/valuation.js`
- the LLM should anchor on the **headline ROIC**, **WACC**, and **value spread** written into `{TICKER}_data.json`
- if `stockfetch.js` exposes `roicNaive`, `roicAdjusted`, `valueSpread`, or `valuationBasis`, use those fields directly rather than recomputing from memory

## 🏅 DETERMINISTIC QUALITY ENGINE (`../lib/quality.js`)

`stockfetch.js` now pulls Yahoo **annual financial statements** via `fundamentalsTimeSeries`
(the legacy `*History` modules return almost nothing since Nov-2024) and computes a full
quality block in code — never by LLM recall. The primary ticker's `{TICKER}_data.json`
gains a `quality` object and a `composite` object:

- **Piotroski F-Score (0–9)** — 9 binary criteria on the two latest fiscal years. Criteria
  whose Yahoo fields are missing are marked `⚠️ n/a` (scored 0, never estimated) and the
  `evaluated` count is shown. Verdict: 8–9 strong · 5–7 average · 0–4 weak.
- **Earnings Quality** — accruals ratio `(NI − CFO)/avg assets` (negative = cash-backed) and
  cash-conversion `CFO/NI` (≥1.0x healthy, <0.7x suspect).
- **Economic Value Added (EVA)** — `(ROIC − WACC) × invested capital`, consistent with the
  headline value spread from `valuation.js`.
- **Margin of Safety** — discount of price to the Yahoo analyst-mean target, banded
  (>30% compelling · 10–30% attractive · 0–10% fair · <0 premium).
- **Composite Score (0–10)** — deterministic weighted blend of fundamentals, quality
  (F-Score + EVA + cash conversion), valuation (margin of safety), technicals, and insider
  score. `stockfetch.js` writes a baseline (ex-insider); `stockmd.js` recomputes it with the
  SEC insider score folded in and renders the 🏅 Quality & Scoring panel + Exact Fundamentals
  annual-statement table.

**RULE:** The F-Score, EVA, cash-conversion, margin-of-safety and composite shown in the
report MUST be the values printed by `stockfetch.js` / stored in `{TICKER}_data.json`. Never
hand-write these — they are measured, and the LLM frequently guesses them wrong (e.g. it will
assume a fast-grower has F-Score 7/9 when balance-sheet growth outpacing profit makes it 4/9).
Copy `FSCORE`, `EVA_SPREAD`, `CASH_CONV`, `MOS`, `COMPOSITE` from the stdout `DATA_INTEGRITY`
line into the report's `DATA_INTEGRITY` line so they are double-verified.

### Verdict rules
The final call must synthesize **valuation, supply chain, insider signal, technical setup, and ROIC/WACC value spread**.
- Positive value spread strengthens conviction
- Negative value spread must be discussed explicitly, not ignored
- If technicals are weak but the fundamental call is bullish, explain why timing risk is acceptable
- If technicals are strong but value spread / fundamentals are weak, avoid issuing a lazy momentum-only BUY

### Required decision transparency
The report should explicitly state what is carrying the call and how much weight each factor has.
Add these keys when possible:
- `THESIS_WEIGHTS:` e.g. `Valuation=30% | Technicals=20% | Value_Spread=20% | Supply_Chain=15% | Catalysts=10% | Insider=5%`
- `TECH_SETUP:` one short paragraph on how the technical structure affects conviction and timing
- `FOLLOW_THE_CASH:` pipe-separated bullets on cash generation, capex intensity, working capital, buybacks/dividends, or finance-arm considerations
- `PRE_MORTEM:` pipe-separated bullets describing the most likely reasons the thesis could fail over the next 6–18 months

### Value spread interpretation guardrails
- `Value Spread > +5%` → supports BUY / STRONG BUY if the rest of the thesis is coherent
- `+1% to +5%` → mildly supportive; do not overstate it
- `0% to -3%` → caution; conviction must be tempered or justified with a specific catalyst
- `< -3%` → treat as a real warning sign unless a documented capital-structure artifact explains it

## 🔄 EXECUTION ORDER

**The golden rule: DATA FIRST, RESEARCH SECOND, TEXT THIRD, HTML LAST.**

```
STEP 0 ── DELETE old report files from previous analysis
 rm -f {PREVIOUS_TICKER}_data.json {PREVIOUS_TICKER}_report.txt {prev_ticker}_rich_report.html
STEP 1 ── Agent identifies 4-5 peers (AI reasoning only, no data needed)
STEP 2 ── Run stockfetch.js → writes {TICKER}_data.json ← ANCHOR POINT
STEP 2b ─ Run insiderfetch.js → reads definitive SEC insider trades
STEP 3 ── Agent reads {TICKER}_data.json → does web research
 ALL numbers in the report MUST come from the JSON.
STEP 4 ── Agent writes {TICKER}_report.txt in PLAIN TEXT FORMAT
STEP 5 ── ⚠️ MANDATORY: Run `node stockmd.js {TICKER}_report.txt` → writes {ticker}_rich_report.html. NEVER write the HTML yourself. If stockmd.js errors, FIX the error — do NOT fall back to manual HTML.
```

---

## STEP 1 — PEER IDENTIFICATION RULES

Pick 4–5 peers. Rules:
- Same sector is not enough — must overlap in business model, customer wallet, or platform economics
- Include ≥3 direct peers and ≥1 aspirational/valuation comp
- Output peer list before proceeding: `PEERS: SYM1 SYM2 SYM3 SYM4 SYM5`

Examples:
- GEHC → SYK BSX MDT ISRG EW
- GOOG → MSFT META AMZN AAPL NFLX
- AMZN → MSFT GOOG WMT BABA MELI
- ZS → PANW CRWD NET OKTA FTNT
- HUBS → CRM NOW WDAY NET ZM

---

## STEP 2 — EMBEDDED DATA FETCHER: `stockfetch.js`

**Extract this code block, save as `stockfetch.js`, run it BEFORE writing any research.**

```bash
# Install dependency if needed:
npm install yahoo-finance2

# Run:
node stockfetch.js {TICKER} {PEER1} {PEER2} {PEER3} {PEER4} {PEER5}
# Writes: {TICKER}_data.json
```

```javascript
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
const fB = v => v != null && !isNaN(v) ? `${(+v).toFixed(1)}B` : '—';
const fP = v => v != null && !isNaN(v) ? `${(+v).toFixed(2)}%` : '—';
const ps = v => v != null && !isNaN(v) ? ((+v >= 0 ? '+' : '') + (+v).toFixed(2)) : '—';
const cc = v => v != null && !isNaN(v) && +v >= 0 ? 'pos' : 'neg';

const kpi = (l, v, s = '', c = '') => `<div class="kpi"><div class="lbl">${l}</div><div class="val${c ? ' ' + c : ''}">${v}</div>${s ? `<div class="sub">${s}</div>` : ''}</div>`;
const li = (items, cls) => `<ul class="clean ${cls || ''}">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;

const peerRow = (sym, f, t, isPrimary) => `<tr${isPrimary ? ' style="background:rgba(255,255,255,.05);font-weight:700"' : ''}>
<td><span style="cursor:help; border-bottom:1px dotted var(--text-muted);" onmouseover="showTooltip(event, '${f.name ? f.name.replace(/'/g, "\\'") : sym}')" onmouseout="hideTooltip()">${sym}${isPrimary ? ' ★' : ''}</span></td>
<td>${f.mktcap != null ? `${(+f.mktcap).toFixed(0)}B` : '—'}</td>
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
       tr += `<td style="background:${bg};color:${color}">${val.toFixed(0)}</td>`;
    }
    tr += '</tr>';
    rows.push(tr);
  }
  
  return `
    <div style="overflow-x:auto;">
    <table class="heatmap" style="margin-top:20px;">
      <tr><th colspan="6" style="color:#94a3b8;padding-bottom:10px;">Sensitivity Analysis: Growth vs Valuation Multiples (Base: ${basePrice.toFixed(2)})</th></tr>
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
      let priceStr = (tgt != null && !isNaN(tgt)) ? '

---

## STEP 2b — EMBEDDED INSIDER FETCHER: `insiderfetch.js`

**Extract this code block, save as `insiderfetch.js`, and run it.**

```bash
node insiderfetch.js {TICKER}
```

```javascript
#!/usr/bin/env node
'use strict';
const https = require('https');

const TICKER = process.argv[2]?.toUpperCase();
if(!TICKER) process.exit(1);

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ArenaAgent agent@arena.ai' } }, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
    const tickersRaw = await fetchUrl('https://www.sec.gov/files/company_tickers.json');
    const tickers = JSON.parse(tickersRaw);
    let cik = null;
    for (let k in tickers) {
      if (tickers[k].ticker === TICKER) { cik = tickers[k].cik_str.toString().padStart(10, '0'); break; }
    }
    const subsRaw = await fetchUrl(`https://data.sec.gov/submissions/CIK${cik}.json`);
    const subs = JSON.parse(subsRaw);
    const recent = subs.filings.recent;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    let buys = 0, sells = 0;
    let buyVolUSD = 0, sellVolUSD_Disc = 0, sellVolUSD_10b51 = 0;
    let form4Count = 0;
    
    for (let i = 0; i < recent.form.length; i++) {
      if (recent.form[i] === '4') {
        const filingDate = new Date(recent.filingDate[i]);
        if (filingDate >= sixMonthsAgo) {
          form4Count++;
          if(form4Count > 35) continue;
          
          const accNo = recent.accessionNumber[i].replace(/-/g, '');
          let primaryDoc = recent.primaryDocument[i];
          if (primaryDoc.includes('/')) {
             primaryDoc = primaryDoc.split('/')[1];
          }
          const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accNo}/${primaryDoc}`;
          const rawXml = await fetchUrl(xmlUrl);
          
          let xml = rawXml.replace(/\s+/g, '');
          xml = xml.replace(/<[a-zA-Z0-9_]+:/g, '<').replace(/<\/[a-zA-Z0-9_]+:/g, '</');
          
          const is10b51 = xml.includes('<rule10b51Boolean>true</rule10b51Boolean>') || xml.includes('<rule10b51Boolean>1</rule10b51Boolean>');
          
          const transBlocks = xml.split(/<transactionCoding>/i);
          for (let b = 1; b < transBlocks.length; b++) {
              const block = transBlocks[b];
              const isP = block.includes('<transactionCode>P</transactionCode>');
              const isS = block.includes('<transactionCode>S</transactionCode>');
              
              let shares = 0, price = 0;
              const shMatch = block.match(/<transactionShares><value>([\d\.]+)<\/value>/i);
              if (shMatch) shares = parseFloat(shMatch[1]);
              
              const prMatch = block.match(/<transactionPricePerShare><value>([\d\.]+)<\/value>/i);
              if (prMatch) price = parseFloat(prMatch[1]);
              
              let val = shares * price;
              if (isP && shares > 0) {
                  buys++;
                  buyVolUSD += val;
              } else if (isS && shares > 0) {
                  sells++;
                  if (is10b51) sellVolUSD_10b51 += val;
                  else sellVolUSD_Disc += val;
              }
          }
          await new Promise(r => setTimeout(r, 100));
        }
      }
    }
    
    // FIX H3: Dollar-weighted, 10b5-1 discounted conviction scoring
    let score = 5.0; 
    
    // Reward buying aggressively (+1 point per $100k, max +5)
    score += Math.min(5.0, buyVolUSD / 100000);
    
    // Penalize discretionary selling heavily (-1 point per $1M, max -4)
    score -= Math.min(4.0, sellVolUSD_Disc / 1000000);
    
    // Penalize 10b5-1 selling lightly (-1 point per $5M, max -2)
    score -= Math.min(2.0, sellVolUSD_10b51 / 5000000);
    
    // Fallback if pricing was 0 (e.g., poorly formatted XML missing price tag)
    if (buyVolUSD === 0 && buys > 0) score += Math.min(4, buys * 0.5);
    if (sellVolUSD_Disc === 0 && sellVolUSD_10b51 === 0 && sells > 0) score -= Math.min(3, sells * 0.2);

    score = Math.max(1, Math.min(10, Math.round(score)));
    
    let sentiment = "Neutral";
    if (score >= 7) sentiment = "Bullish";
    if (score <= 3) sentiment = "Bearish";
    
    console.log(`\n===== ${TICKER} SEC FORM 4 INSIDER ACTIVITY (LAST 6 MONTHS) =====`);
    console.log(`INSIDER_SCORE: ${score}`);
    console.log(`INSIDER_SENTIMENT: ${sentiment}`);
    console.log(`Total Buys: ${buys} (${(buyVolUSD/1000000).toFixed(2)}M) | Total Sells: ${sells} (${((sellVolUSD_Disc+sellVolUSD_10b51)/1000000).toFixed(2)}M)`);
    if (sellVolUSD_10b51 > 0) { console.log(`Note: ${(sellVolUSD_10b51/1000000).toFixed(2)}M of sales were under pre-planned 10b5-1 programs.`); }
    if (sellVolUSD_Disc > 0) { console.log(`Note: ${(sellVolUSD_Disc/1000000).toFixed(2)}M of sales were Discretionary.`); }
    console.log(`=================================================================\n`);
})();
```

---

## STEP 3 — RESEARCH INSTRUCTIONS (after reading the JSON)

**Read `{TICKER}_data.json` completely before starting research.**
Every price, ratio, and return figure must match the JSON. Do not invent or estimate numbers.

### 3a — Web Research Required Sections

Run web searches for each. Use the live data numbers as anchors when writing commentary.

1. **Latest Earnings & Guidance** — `{TICKER} Q1 2026 earnings results guidance EPS revenue`
2. **Catalysts & News** — `{TICKER} 2026 catalysts analyst upgrade downgrade`
3. **Insider Activity** — Use the output from `node insiderfetch.js {TICKER}`. This script directly queries the SEC EDGAR API to give you the exact Form 4 Buys and Sells over the last 6 months.

4. **Competition / Moat** — `{TICKER} competitive moat 2026`
5. **AI Opportunity/Threat** — `{TICKER} artificial intelligence opportunity risk 2026`
6. **Supply Chain / Dependencies** — sector-appropriate dependencies
7. **Next Earnings Date** — `{TICKER} next earnings date 2026`

### 3b — Insider Signal Classification

Always classify insider transactions:

| Type | Signal |
|------|--------|
| Open-market purchase by CEO/CFO/director post-drawdown | ⭐ Strong bullish |
| Small open-market buy, single executive | Moderate bullish |
| RSU award / option grant / equity compensation | Noise — neutral |
| 10b5-1 planned sale / tax-withholding sell-to-cover | Noise — mild bearish |
| Large discretionary open-market sale, cluster selling | Strong bearish |

Insider conviction score: 1 (heavy sell) → 10 (cluster open-market buy)

### 3c — Assumptions & Defaults

Unless user says otherwise:
- Investor style: Momentum trader
- Risk: Medium
- Position: Half position (¼ starter, add ¼ on confirmation)
- Horizon: 3–6 months

---

## STEP 4 — PLAIN TEXT REPORT FORMAT

**Write `{TICKER}_report.txt` in exactly this format. No HTML. No JSON. No markdown.**
**DO NOT start writing the report without reading every rule in this section.**
One key per line. Use the JSON numbers exactly as fetched.

```
TICKER: ANET
NAME: Arista Networks, Inc.
PEERS: CSCO JNPR NTAP SMCI NVDA
DESC: Cloud Networking · AI Infrastructure · Data Center Switches
NEXT_EARNINGS: August 5, 2026
ELI5: Arista builds the super-fast switches...
SETUP: ANET is consolidating after a slight post-earnings dip...
STORY: Three paragraphs...

BULL: Point one | Point two
BEAR: Risk one | Risk two
VARIANT_PERCEPTION: Consensus Believes capex will destroy margins ~ We Believe proprietary silicon halves internal inference costs ~ Catalyst: Gross margins expand sequentially in Q3
ALT_DATA: Per SensorTower data, App store downloads up 15% YoY | HYP: Open job postings for AI engineers likely increased QoQ | HYP: Channel checks may show limited discounting on enterprise tiers
COMPETITIVE_ARENA: High-Speed Switching (800G) ~ Dominant ~ Over 40% market share in 400G+ ports | Enterprise Campus ~ Neutral ~ Expanding but still trails Cisco | AI Back-end Fabrics ~ Strong ~ Winning key designs in Meta/Microsoft clusters
SUPPLY: 🟢 Expanding 800G switch capacity | ✅ Securing CoWoS allocation from TSMC | 🔴 Vulnerable to China-Taiwan trade wars | ⚠️ High reliance on Broadcom ASIC roadmap
WHATS_NEW: Massive Q1 Beat | Broadcom supply constraints easing
PATTERN: [Pattern Name] | [Narrative Description]
RULE: If no textbook chart pattern (e.g., Bull Flag, Head & Shoulders) is present, you MUST synthesize a "Price Action Signal."
SYNTHESIS GUIDE:
- If Price ≈ 52w Low → "Bottom Fishing / Testing Support at 52w Lows"
- If Price ≈ 52w High → "Breakout Attempt / Testing 52w Highs"
- If Price is far below MA50/MA200 → "Strong Bearish Regime / Searching for Floor"
- If Price is between MA50 and MA200 → "Mean Reversion / Range Bound"
- If MA50 just crossed MA200 → "Golden/Death Cross Transition"
NEVER omit this key. Always provide a signal based on the data.
VAL_METHOD: High-growth networking requires PEG and EV/EBITDA normalization. WACC assumed at 8.5%, Terminal Growth at 4.0%. Blended Fair Value = (0.4 * Multiple) + (0.3 * DCF) + (0.3 * Analyst Target).
VAL_MATRIX:
ANET | 154.03 | 186.90 | 182.50 | 188.20 | 185.97 | +20.74% | Undervalued
CSCO | 120.41 | 124.02 | 122.50 | 124.45 | 123.70 | +2.73% | Fair Value
VAL_BASE: TARGET=185.97 | AI networking TAM expands | Margins hold
VAL_BULL: TARGET=220.00 | InfiniBand replacement accelerates | 800G upgrade cycle pulls forward
VAL_BEAR: TARGET=130.00 | Hyperscaler capex drops | Broadcom supply constraints choke shipments
SECTOR: Networking is bifurcating between legacy enterprise (weak) and AI cloud (hyper-growth).
PEER1: ANET dwarfs CSCO in net margins (38% vs 19%) due to software-first EOS.
PEER2: ANET is taking share from JNPR in routing.
SUPPLY: 🟢 Expanding 800G switch capacity | ✅ Securing CoWoS allocation from TSMC | 🔴 Vulnerable to China-Taiwan trade wars | ⚠️ High reliance on Broadcom ASIC roadmap
SUPPLY_UP: Broadcom (AVGO) - Merchant Silicon ASICs | TSMC (TSM) - Advanced Packaging
SUPPLY_DOWN: Microsoft (MSFT) - 26% of revenue | Meta (META) - 16% of revenue
SUPPLY_SIGNALS:
Broadcom | Supplier | Beat/Raised | Bullish demand for Tomahawk 5 silicon
Microsoft | Customer | Beat/Raised | Accelerating AI capex directly benefits ANET
SUPPLY_RISK: High | Systemic: Deep reliance on TSMC (Taiwan) for advanced node manufacturing exposes the company to severe geopolitical tailrisk. Idiosyncratic: Extreme reliance on Broadcom for merchant switching silicon. Margin Impact: Chokepoints in CoWoS packaging could artificially constrain supply and compress gross margins by 150-200 bps if alternative sourcing is required.
INSIDER: SCORE=7 SENTIMENT=Bullish BUYS=... SELLS=... SIGNAL=Signal analysis text
AI_OPP: Ethernet replacing InfiniBand in AI clusters | ...
AI_THR: Nvidia Spectrum-X end-to-end bundling | ...
AI_NET: Arista is the primary beneficiary of the open Ethernet AI standard.
CATALYSTS_HIST:
2026-05-05 | Q1 Earnings | Earnings | Negative | Beat EPS but fell 13% on supply worries
2026-05-19 | JP Morgan Conf | Event | Positive | Shipment growth 54% YoY
RISKS: Supply Chain ~ High Impact ~ Operational ~ CoWoS packaging bottlenecks | Concentration ~ Medium Impact ~ Revenue ~ MSFT and META account for >40% of sales
UPCOMING: Q2 Earnings | 800G shipments scale
TRADE: ENTRY=$150 STOP=$135 T1=$185 T2=$220 SIZE=Half_Position (¼ starter, add ¼ on confirmation) CONFIRM=Daily close back above the post-earnings gap ($165) on above-average volume, OR a successful retest that holds the 50-day MA AVOID=Chasing pre-earnings
VERDICT: RATING=STRONG BUY STARS=5 CONVICTION=High BOTTOM=ANET is a definitive buy at these levels. Despite the systemic geopolitical supply chain risks regarding TSMC dependency, the aggressive AI capex cycle is fundamentally extending its networking monopoly. We reject the generic fear of margin compression; the underlying EOS software integration has structurally raised the margin floor. The valuation at 42x forward earnings offers a rare margin of safety for a hyper-scaler entering an AI production supercycle.
SOURCES: Source1 URL1 | Source2 URL2
DATA_INTEGRITY: PRICE=201.97 FWDPE=12.94 TGTMEAN=280.16 REVGR=23.4 MA50=226.35 MA200=349.23 W52H=632.39 W52L=173.25 SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=2026-05-25
```

**HOW TO FILL DATA_INTEGRITY (copy from stockfetch.js stdout):**

After running `node stockfetch.js {TICKER} ...`, the stdout prints a data summary block.
Copy these exact values into the DATA_INTEGRITY line:

```
DATA_INTEGRITY: PRICE=201.97 FWDPE=12.94 TGTMEAN=280.16 REVGR=23.4 MA50=226.35 MA200=349.23 W52H=632.39 W52L=173.25 SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=2026-05-25
```

`stockmd.js` will cross-check these against its own live fetch and render a **VERIFIED / PARTIAL / DRIFT** badge in the HTML report.

**CRITICAL RULES for the text file:**

- TICKER, PEERS, DESC, NEXT_EARNINGS — one line each
- **ELI5** — Plain-English explanation of what the BUSINESS DOES. Follow the ANET pattern below. Every ELI5 must answer:
  1. **What they do** — Plain-English analogy, no jargon
  2. **Who pays them** — Customer type + how they charge
  3. **The moat / superpower** — What keeps competitors from eating their lunch
  4. **Real-world analogy** — "Think of it like ___"
  
  **Forbidden in ELI5:** stock price, valuation, P/E, bull/bear points, analyst targets, technicals.
  
  **ANET example (adapt this pattern to any ticker):**
  ```
  ELI5: Arista Networks builds the super-fast switches and routers that connect all the computers inside giant data centers — think of them as the highway system for the internet's brain. Without Arista's equipment, the GPUs that power ChatGPT and other AI models would sit idle, unable to talk to each other.

  Their biggest customers are Microsoft, Meta, and other cloud giants who pay millions for Arista's hardware. Their moat is EOS — a single software brain that runs on every Arista device. Once a company like Microsoft builds their entire data center around EOS, switching to Cisco is like trying to change the engine of a plane mid-flight.

  Think of it like the traffic control system for AI — NVIDIA makes the race cars (GPUs), Arista builds the racetrack.
  ```

- STORY — use double blank lines between paragraphs
- BULL, BEAR, SUPPLY, CATALYSTS, RISKS, UPCOMING, AI_OPP, AI_THR — pipe `|` separated items
- INSIDER — `SCORE=N SENTIMENT=X BUYS=... SELLS=... SIGNAL=...`
- VALUATION — `FAIR=$X BEAR=$Y UPSIDE=Z%` then `METHOD=` then description
- TRADE — `ENTRY=$X STOP=$Y T1=$A T2=$B SIZE=... CONFIRM=... AVOID=...`
  - **CONFIRM** is MANDATORY whenever SIZE is a scaled/partial position (e.g. "add ¼ on confirmation"). It must state the exact, observable trigger (a price level, MA reclaim, volume condition, or post-earnings event) that justifies adding the second tranche. Never leave "on confirmation" undefined.
- VERDICT — `RATING=... STARS=N CONVICTION=...` then `BOTTOM=` then paragraph
- DATA_INTEGRITY — copy exact values from `stockfetch.js` stdout output. Format: `PRICE=X.XX FWDPE=X.XX TGTMEAN=X.XX REVGR=X.X MA50=X.XX MA200=X.XX W52H=X.XX W52L=X.XX ROIC=X WACC=X VALUE_SPREAD=X FSCORE=N/9 EVA_SPREAD=X CASH_CONV=X MOS=X COMPOSITE=X SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=YYYY-MM-DD` (copy ALL fields verbatim from stockfetch.js stdout)
- Use real numbers from `{TICKER}_data.json` — never placeholders

---


---

## STEP 5 — ⚠️ MANDATORY HTML CONVERTER: `stockmd.js`

**🚨 CRITICAL: You MUST run this script. NEVER generate HTML/JS/CSS yourself.**
**The HTML, CSS, quadrant chart, tooltips, data tables, and theme are all generated by stockmd.js.**

Extract this code, save as `stockmd.js`, run after the text file is written:

```bash
node stockmd.js {TICKER}_report.txt
# Reads: {TICKER}_report.txt + {TICKER}_data.json (for live price refresh)
# Writes: {ticker}_rich_report.html
# Includes: interactive peer quadrant plot (hover/touch for live metrics)
```

### 📊 INTERACTIVE PEER QUADRANT PLOT

`stockmd.js` auto-generates an **inline SVG scatter plot** with hover/touch tooltips:

- **X-axis:** Forward P/E (valuation) — auto-falls back to EV/Revenue if most peers are loss-making
- **Y-axis:** Revenue Growth %
- **Four quadrants** (split on peer median):
  - 🟢 **VALUE PICK** — high growth, cheap multiple
  - 🟣 **PREMIUM GROWTH** — high growth, expensive multiple
  - 🟡 **VALUE TRAP?** — low growth, cheap multiple
  - 🔴 **HIGH RISK** — low growth, expensive multiple
- **Hover/touch any dot → floating tooltip** with 8 live metrics per company:
  - Fwd P/E · Rev Growth · Net Margin · FCF Yield
  - Price · 1M Return · YTD Return · RSI-14
- **Primary ticker** glows gold with a ★; peers shown in silver
- Uses symmetric-log scaling when peer dispersion is extreme (so a $155B giant and a $380M micro-cap both fit cleanly)
- Pure inline SVG + vanilla JS — zero external dependencies, works in sandboxed iframe previews

---


⛔ **FORBIDDEN: Writing HTML/JS/CSS manually. You MUST extract and run the code below.**
⛔ **FORBIDDEN: Using document.createElement, innerHTML, or any DOM API to build the report.**
✅ **REQUIRED: Extract this code block → save as stockmd.js → run `node stockmd.js {TICKER}_report.txt`**



```javascript
#!/usr/bin/env node
/**
 * stockmd.js — The complete stock report system.
 *
 * Agent writes ONE plain-text file (zero HTML, zero JSON, zero formatting).
 * This script fetches live data + converts the plain text → full rich HTML.
 *
 * PLAIN TEXT FORMAT (agent writes this — no tags, no JSON, no brackets):
 * ─────────────────────────────────────────────────────────────────────
 * TICKER: GEHC
 * NAME: GE HealthCare Technologies
 * PEERS: SYK BSX MDT ISRG EW
 * DESC: Medical Imaging · AI Diagnostics · Pharma Diagnostics
 * NEXT_EARNINGS: Late July 2026
 * ELI5: Plain-English explanation of what the BUSINESS DOES. Aim 3-5 short sentences a
 *       12-year-old could understand. NO stock-price talk, NO valuation, NO bull/bear
 *       points. Cover: (1) what they sell, (2) who pays for it, (3) how they make money,
 *       (4) a simple analogy. Use double newline for paragraph breaks.
 * SETUP: One sentence framing the current setup.
 * STORY: Investment story paragraphs. Use double newline for new paragraph.
 * BULL: Point one | Point two | Point three
 * BEAR: Risk one | Risk two | Risk three
 * SECTOR: Commentary on sector rotation.
 * PEER1: TICKER vs PEER comparison sentence.
 * PEER2: TICKER vs PEER2 comparison sentence.
 * SUPPLY: Item one description | Item two description | Item three description
 * INSIDER: SCORE=7 SENTIMENT=Bullish BUYS=Description SELLS=Description SIGNAL=Analysis text
 * AI_OPP: Opportunity one | Opportunity two | Opportunity three
 * AI_THR: Threat one | Threat two
 * AI_NET: Net assessment sentence.
 * VALUATION: FAIR=$X-Y BEAR=$Z METHOD=Description of methods and targets. UPSIDE=X%
 * CATALYSTS: Catalyst one | Catalyst two | Catalyst three
 * RISKS: Risk one | Risk two | Risk three
 * UPCOMING: Event one | Event two
 * TRADE: ENTRY=$X STOP=$Y T1=$A T2=$B SIZE=Description CONFIRM=Exact trigger to add the second tranche AVOID=What not to do
 * VERDICT: RATING=STRONG BUY STARS=5 CONVICTION=High BOTTOM=One paragraph conclusion.
 * SOURCES: Source1 URL1 | Source2 URL2 | Source3 URL3
 * ─────────────────────────────────────────────────────────────────────
 * Usage:  node stockmd.js {TICKER}_report.txt
 *         → writes {ticker}_rich_report.html in ~500ms total
 */'use strict';
const yahooFinance = require('yahoo-finance2').default;
const yf = new yahooFinance({ suppressNotices: ['yahooSurvey'] });
const fs = require('fs');

// ── Parse plain text file ─────────────────────────────────────────────────────
function parseTxt(src) {
  const d = {};
  let cur = null;
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    const col = line.indexOf(':');
    // Key line if colon exists and key has no spaces and is uppercase-ish
    if (col > 0 && col < 20 && !/\s/.test(line.slice(0, col))) {
      cur = line.slice(0, col).toUpperCase();
      d[cur] = line.slice(col + 1).trimStart();
    } else if (cur && line.trim()) {
      d[cur] += '\n' + line;
    }
  }
  return d;
}

// ── Mini-parsers for structured fields ───────────────────────────────────────
const pipes  = str => str ? str.split('|').map(s => s.trim()).filter(Boolean) : [];
const getKV  = (str, k) => { const m = str.match(new RegExp(k + '=([^\\s]+(?:\\s[^A-Z_=]+)*)')); return m ? m[1].trim() : ''; };
const getKVQ = (str, k) => { const m = str.match(new RegExp(k + '=(.+?)(?=\\s+[A-Z_]+=|$)')); return m ? m[1].trim() : ''; };

// ── Data fetch ────────────────────────────────────────────────────────────────
function tech(quotes) {
  if (!quotes || quotes.length < 30) return {};
  const C = quotes.map(q => q.close).filter(Boolean);
  const H = quotes.map(q => q.high).filter(Boolean);
  const L = quotes.map(q => q.low).filter(Boolean);
  const V = quotes.map(q => q.volume).filter(Boolean);
  const n = C.length; if (n < 21) return {};
  const last = C[n - 1];
  const ma = (a, p) => a.slice(-p).reduce((x, y) => x + y, 0) / p;
  const ma50 = n >= 50 ? ma(C, 50) : null;
  const ma200 = n >= 200 ? ma(C, 200) : null;
  let g = 0, l = 0;
  for (let i = n - 14; i < n; i++) { const d = C[i] - C[i - 1]; d > 0 ? g += d : l -= d; }
  const rsi = g + l === 0 ? 50 : 100 - 100 / (1 + g / (l || 1e-9));
  const ema = (a, s) => { const k = 2 / (s + 1); let e = a[0]; for (let i = 1; i < a.length; i++) e = a[i] * k + e * (1 - k); return e; };
  const macdLine = ema(C.slice(-40), 12) - ema(C.slice(-60), 26);
  let tr = 0, pdm = 0, mdm = 0;
  for (let i = n - 14; i < n; i++) {
    tr += Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1]));
    const up = H[i] - H[i - 1], dn = L[i - 1] - L[i];
    if (up > dn && up > 0) pdm += up; if (dn > up && dn > 0) mdm += dn;
  }
  const adx = tr > 0 ? 100 * Math.abs(pdm - mdm) / (pdm + mdm + 1e-9) : 0;
  const avg30 = Math.round(V.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, V.length));
  const ret = d => n >= d ? +((last / C[n - d] - 1) * 100).toFixed(2) : null;
  const ytdStart = quotes.find(q => new Date(q.date).getFullYear() === new Date().getFullYear())?.close || C[0];
  const adSlope = quotes.slice(-20).map(q => { const r = (q.high || 0) - (q.low || 0); return r > 0 ? ((q.close - q.low) - (q.high - q.close)) / r * (q.volume || 0) : 0; }).reduce((a, b) => a + b, 0);
  return {
    price: +last.toFixed(2), ma50: ma50 ? +ma50.toFixed(2) : null, ma200: ma200 ? +ma200.toFixed(2) : null,
    vs50: ma50 ? +((last - ma50) / ma50 * 100).toFixed(2) : null, vs200: ma200 ? +((last - ma200) / ma200 * 100).toFixed(2) : null,
    gc: ma50 != null && ma200 != null ? ma50 > ma200 : null, w52h: +Math.max(...H.slice(-252)).toFixed(2), w52l: +Math.min(...L.slice(-252)).toFixed(2),
    rsi: +rsi.toFixed(2), macd: +macdLine.toFixed(3), adx: +adx.toFixed(2),
    avg30, lastVol: V[V.length - 1], volPct: avg30 > 0 ? +((V[V.length - 1] - avg30) / avg30 * 100).toFixed(2) : null,
    r1m: ret(21), r3m: ret(63), rYtd: +((last / ytdStart - 1) * 100).toFixed(2),
    adTrend: adSlope * (last - C[n - 20]) > 0 ? 'confirming' : 'diverging',
    hi20: +Math.max(...H.slice(-20)).toFixed(2), lo20: +Math.min(...L.slice(-20)).toFixed(2),
    hi10: +Math.max(...H.slice(-10)).toFixed(2), lo10: +Math.min(...L.slice(-10)).toFixed(2),
  };
}

function fund(qs) {
  if (!qs) return {};
  const p = qs.price || {}, k = qs.defaultKeyStatistics || {}, fd = qs.financialData || {}, sd = qs.summaryDetail || {};
  const pct = v => v != null ? +(v * 100).toFixed(2) : null;
  const bil = v => v != null ? +(v / 1e9).toFixed(3) : null;
  const r2 = v => v != null ? +(+v).toFixed(2) : null;
  return {
    mktcap: bil(p.marketCap), fwdPE: r2(k.forwardPE), evEbitda: r2(k.enterpriseToEbitda),
    evRev: r2(k.enterpriseToRevenue), ps: r2(k.priceToSalesTrailing12Months ?? sd.priceToSalesTrailing12Months),
    peg: r2(k.pegRatio), revGr: pct(fd.revenueGrowth), grossMgn: pct(fd.grossMargins),
    opMgn: pct(fd.operatingMargins), netMgn: pct(fd.profitMargins),
    de: fd.debtToEquity != null ? +(fd.debtToEquity / 100).toFixed(3) : null,
    fcf: bil(fd.freeCashflow), fcfYield: fd.freeCashflow && p.marketCap ? pct(fd.freeCashflow / p.marketCap) : null,
    roe: pct(fd.returnOnEquity), divRate: sd.dividendRate ?? null,
    epsT: r2(k.trailingEps), epsF: r2(fd.earningsPerShare ?? k.forwardEps),
    rev: bil(fd.totalRevenue), sharesB: bil(k.sharesOutstanding),
    instPct: pct(k.heldPercentInstitutions), insPct: pct(k.heldPercentInsiders),
    beta: r2(sd.beta ?? k.beta), tgtMean: r2(fd.targetMeanPrice), tgtHigh: r2(fd.targetHighPrice),
    tgtLow: r2(fd.targetLowPrice),
    rec: typeof fd.recommendationKey === 'string' ? fd.recommendationKey.toUpperCase().replace('_', ' ') : null,
    nAnalysts: fd.numberOfAnalystOpinions ?? null,
  };
}

const SETF = { Technology: 'XLK', 'Communication Services': 'XLC', 'Consumer Cyclical': 'XLY', 'Consumer Defensive': 'XLP', Energy: 'XLE', 'Financial Services': 'XLF', Healthcare: 'XLV', Industrials: 'XLI', 'Basic Materials': 'XLB', 'Real Estate': 'XLRE', Utilities: 'XLU' };

// ── HTML builders (all formatting lives here, agent writes zero HTML) ─────────
const f2 = v => v != null ? (+v).toFixed(2) : '—';
const fB = v => v != null ? `$${(+v).toFixed(1)}B` : '—';
const fP = v => v != null ? `${(+v).toFixed(2)}%` : '—';
const ps = v => v != null ? ((+v >= 0 ? '+' : '') + (+v).toFixed(2)) : '—';
const cc = v => v != null && +v >= 0 ? 'pos' : 'neg';
const kpi = (l, v, s = '', c = '') => `<div class="kpi"><div class="label">${l}</div><div class="value${c ? ' ' + c : ''}">${v}</div>${s ? `<div class="small">${s}</div>` : ''}</div>`;
const li = items => `<ul class='list'>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
const bullets = items => items.map(i => `<div class='bullet'><div class='dot'></div><div>${i}</div></div>`).join('');

const peerRow = (sym, f, t, isPrimary) => `<tr${isPrimary ? ' style="background:rgba(178,103,255,.08)"' : ''}>
<td><strong>${sym}</strong>${isPrimary ? ' ★' : ''}</td>
<td>${f.mktcap != null ? `$${(+f.mktcap).toFixed(0)}B` : '—'}</td>
<td>${f.fwdPE != null ? `${f2(f.fwdPE)}x` : '—'}</td>
<td>${f.evEbitda != null ? `${f2(f.evEbitda)}x` : '—'}</td>
<td class="${cc(f.revGr)}">${fP(f.revGr)}</td>
<td>${fP(f.grossMgn)}</td>
<td class="${cc(f.netMgn)}">${fP(f.netMgn)}</td>
<td class="${cc(f.fcfYield)}">${fP(f.fcfYield)}</td>
<td class="${+t.rsi > 70 ? 'neg' : +t.rsi < 30 ? 'pos' : 'neu'}">${t.rsi?.toFixed(0) || '—'}</td>
<td class="${cc(t.r1m)}">${ps(t.r1m)}%</td>
<td class="${cc(t.rYtd)}">${ps(t.rYtd)}%</td></tr>`;

// ── Interactive Quadrant Plot (inline SVG + JS, zero external deps) ──────────
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
//  quadrantChart — Interactive with force-plotted primary, colored peers,
//                   first-letter labels, sector average, legend, hover tooltips
// ═══════════════════════════════════════════════════════════════════════════════
function quadrantChart(results) {
 const rows = results.map(r => ({
   sym: r.sym, fwdPE: r.f?.fwdPE, evRev: r.f?.evRev, revGr: r.f?.revGr,
   netMgn: r.f?.netMgn, fcfYield: r.f?.fcfYield, price: r.t?.price,
   r1m: r.t?.r1m, rYtd: r.t?.rYtd, rsi: r.t?.rsi,
   isPrimary: r.sym === results[0].sym
 }));
 if (rows.length < 3) return '';

 const fwdPos = rows.filter(d => d.fwdPE != null && d.fwdPE > 0).length;
 const fwdAny = rows.filter(d => d.fwdPE != null).length;
 let useEvRev = (fwdAny === 0) || (fwdPos / Math.max(1, rows.length) < 0.6);
 let xKey = useEvRev ? 'evRev' : 'fwdPE';
 let xLabel = useEvRev ? 'Valuation Multiple (EV / Revenue)' : 'Valuation Multiple (Forward P/E)';
 const xUnit = 'x';
 let data = rows.filter(d => d[xKey] != null && d.revGr != null);
 // Fallback axis
 if (data.length < 3 && useEvRev) {
   xKey = 'fwdPE'; useEvRev = false;
   xLabel = 'Valuation Multiple (Forward P/E)';
   data = rows.filter(d => d[xKey] != null && d.revGr != null);
 } else if (data.length < 3 && !useEvRev) {
   xKey = 'evRev'; useEvRev = true;
   xLabel = 'Valuation Multiple (EV / Revenue)';
   data = rows.filter(d => d[xKey] != null && d.revGr != null);
 }
 // ═══ Force-include primary ticker even if data is null ═══
 const primaryRow = rows.find(d => d.isPrimary);
 let primaryWasNull = false;
 if (primaryRow && !data.find(d => d.isPrimary)) {
   primaryWasNull = true;
   data.push({ ...primaryRow, _forced: true });
   if (!primaryRow[xKey]) primaryRow[xKey] = 0.01;
   if (!primaryRow.revGr) primaryRow.revGr = 0;
 }
 if (data.length < 3) return '';

 const xs = data.map(d => d[xKey]), ys = data.map(d => d.revGr);
 const absMax = arr => Math.max(...arr.map(Math.abs));
 const absMinNonZero = arr => { const a=arr.map(v=>Math.abs(v)).filter(v=>v>0.01); return a.length?Math.min(...a):1; };
 const needsLog = (arr, threshMax) => { const hi = absMax(arr), lo = absMinNonZero(arr); return (hi / lo > 15) && (hi >= threshMax); };
 const xLog = needsLog(xs, 20), yLog = needsLog(ys, 50);
 const symlog = (v, thresh) => Math.sign(v) * Math.log10(1 + Math.abs(v) / thresh) * thresh;
 const xThresh = Math.max(1, absMinNonZero(xs)), yThresh = Math.max(1, absMinNonZero(ys));

 // ── Sector average (exclude primary and forced) ────────────────────────
 const sectorPeers = data.filter(d => !d.isPrimary && !d._forced);
 let sectorAvgPoint = null;
 if (sectorPeers.length >= 2) {
   const avgX = sectorPeers.reduce((s,d) => s + (d[xKey] || 0), 0) / sectorPeers.length;
   const avgY = sectorPeers.reduce((s,d) => s + (d.revGr || 0), 0) / sectorPeers.length;
   sectorAvgPoint = { sym: 'SEC', [xKey]: avgX, revGr: avgY, isSector: true, fwdPE: avgX, netMgn: 0, fcfYield: 0, price: 0, r1m: 0, rYtd: 0, rsi: 0 };
   data.push(sectorAvgPoint);
   xs.push(avgX); ys.push(avgY);
 }
 // ═══ Peer color palette ════════════════════════════════════════════════
 const PEER_COLORS = ['#5dade2','#f7dc6f','#bb8fce','#58d68d','#f0b27a','#85c1e9','#f1948a','#82e0aa'];
 let peerColorIdx = 0;
 data.forEach(d => {
   if (!d.isPrimary && !d._forced && !d.isSector) {
     d._color = PEER_COLORS[peerColorIdx % PEER_COLORS.length];
     peerColorIdx++;
   }
 });

 const tx = v => xLog ? symlog(v, xThresh) : v;
 const ty = v => yLog ? symlog(v, yThresh) : v;
 const txs = xs.map(tx), tys = ys.map(ty);
 const xMinT = Math.min(...txs), xMaxT = Math.max(...txs);
 const yMinT = Math.min(...tys), yMaxT = Math.max(...tys);
 const xPad = Math.max((xMaxT - xMinT) * 0.18, Math.abs(xMaxT) * 0.1 || 1);
 const yPad = Math.max((yMaxT - yMinT) * 0.18, Math.abs(yMaxT) * 0.1 || 2);
 const x0 = xMinT - xPad, x1 = xMaxT + xPad;
 const y0 = Math.min(yMinT - yPad, ty(-5)), y1 = yMaxT + yPad;
 const med = arr => { const a=[...arr].sort((p,q)=>p-q); return a[Math.floor(a.length/2)]; };
 const medX = med(xs), medY = med(ys);
 const medXT = tx(medX), medYT = ty(medY);
 const w = 820, h = 540, m = { t: 32, r: 28, b: 60, l: 72 };
 const pw = w - m.l - m.r, ph = h - m.t - m.b;
 const sx = v => m.l + (tx(v) - x0) / (x1 - x0) * pw;
 const sy = v => m.t + ph - (ty(v) - y0) / (y1 - y0) * ph;
 const inv = (vt, thresh) => Math.sign(vt) * (Math.pow(10, Math.abs(vt)/thresh) - 1) * thresh;
 const xTickVal = i => xLog ? inv(x0 + (x1-x0)*i/4, xThresh) : (x0 + (x1-x0)*i/4);
 const yTickVal = i => yLog ? inv(y0 + (y1-y0)*(4-i)/4, yThresh) : (y0 + (y1-y0)*(4-i)/4);
 const chartId = 'qc_' + Math.random().toString(36).slice(2, 8);

 let svg = `<svg id="${chartId}" viewBox="0 0 ${w} ${h}" style="width:100%;max-width:820px;font-family:system-ui,sans-serif;background:rgba(255,255,255,.01);border-radius:24px">`;
 svg += `<defs><filter id="qpglow_${chartId}"><feGaussianBlur stdDeviation="3"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;

 const qx = m.l + (medXT - x0) / (x1 - x0) * pw;
 const qy = m.t + ph - (medYT - y0) / (y1 - y0) * ph;
 const rects = [
   { x: m.l, y: m.t, w: qx - m.l, h: qy - m.t, fill: 'rgba(46,224,160,0.05)', label: 'VALUE PICK', lc: '#2ee0a0' },
   { x: qx, y: m.t, w: m.l + pw - qx, h: qy - m.t, fill: 'rgba(178,103,255,0.05)', label: 'PREMIUM GROWTH', lc: '#b267ff' },
   { x: m.l, y: qy, w: qx - m.l, h: m.t + ph - qy, fill: 'rgba(255,213,110,0.05)', label: 'VALUE TRAP?', lc: '#ffd56e' },
   { x: qx, y: qy, w: m.l + pw - qx, h: m.t + ph - qy, fill: 'rgba(255,111,125,0.05)', label: 'HIGH RISK', lc: '#ff6f7d' }
 ];
 rects.forEach(q => {
   svg += `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="${q.fill}" rx="6"/>`;
   svg += `<text x="${q.x+q.w/2}" y="${q.y+16}" text-anchor="middle" fill="${q.lc}" font-size="10" font-weight="700" opacity="0.6">${q.label}</text>`;
 });

 const fmtX = v => (xLog && Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) + xUnit;
 const fmtY = v => (yLog && Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) + '%';
 for (let i = 0; i <= 4; i++) {
   const xv = m.l + pw * i / 4;
   svg += `<line x1="${xv}" y1="${m.t}" x2="${xv}" y2="${m.t+ph}" stroke="rgba(255,255,255,.06)" stroke-dasharray="4,4"/>`;
   svg += `<text x="${xv}" y="${m.t+ph+18}" text-anchor="middle" fill="#b9add0" font-size="11">${fmtX(xTickVal(i))}</text>`;
 }
 for (let i = 0; i <= 4; i++) {
   const yv = m.t + ph * i / 4;
   svg += `<line x1="${m.l}" y1="${yv}" x2="${m.l+pw}" y2="${yv}" stroke="rgba(255,255,255,.06)" stroke-dasharray="4,4"/>`;
   svg += `<text x="${m.l-8}" y="${yv+4}" text-anchor="end" fill="#b9add0" font-size="11">${fmtY(yTickVal(i))}</text>`;
 }
 svg += `<line x1="${qx}" y1="${m.t}" x2="${qx}" y2="${m.t+ph}" stroke="rgba(255,255,255,.12)" stroke-dasharray="6,3"/>`;
 svg += `<line x1="${m.l}" y1="${qy}" x2="${m.l+pw}" y2="${qy}" stroke="rgba(255,255,255,.12)" stroke-dasharray="6,3"/>`;
 if (x0 < 0 && x1 > 0) svg += `<line x1="${sx(0)}" y1="${m.t}" x2="${sx(0)}" y2="${m.t+ph}" stroke="rgba(255,255,255,.18)"/>`;
 if (y0 < 0 && y1 > 0) svg += `<line x1="${m.l}" y1="${sy(0)}" x2="${m.l+pw}" y2="${sy(0)}" stroke="rgba(255,255,255,.18)"/>`;
 svg += `<text x="${m.l+pw/2}" y="${h-6}" text-anchor="middle" fill="#b9add0" font-size="13" font-weight="600">${xLabel}${xLog?' · symlog scale':''}</text>`;
 svg += `<text x="${14}" y="${m.t+ph/2}" text-anchor="middle" fill="#b9add0" font-size="13" font-weight="600" transform="rotate(-90,14,${m.t+ph/2})">Revenue Growth (%)${yLog?' · symlog scale':''}</text>`;

 // ── Draw dots ───────────────────────────────────────────────────────────
 const dotData = {};
 const placed = [];
 data.forEach((d, idx) => {
   const cx = sx(d[xKey]), cy = sy(d.revGr);
   const isP = d.isPrimary, isS = d.isSector;
   let fill, r, label;
   if (isP)    { fill = '#f4c64a'; r = 9; label = d.sym.charAt(0) + ' ★'; }
   else if (isS) { fill = '#ffffff'; r = 7; label = 'Avg'; }
   else         { fill = d._color || '#b9add0'; r = 6; label = d.sym.charAt(0); }
   let strokeColor = isP ? '#fff' : (isS ? '#b9add0' : 'none');
   let strokeWidth = isP ? 2 : (isS ? 1 : 0);
   if (d._forced) { strokeColor = '#ff6f7d'; strokeWidth = 2; label += ' ⚠'; }
   const glow = isP ? `filter="url(#qpglow_${chartId})"` : '';
   let dy = -14;
   while (placed.some(p => Math.abs(p.cx - cx) < 38 && Math.abs((p.cy + p.dy) - (cy + dy)) < 14)) {
     dy = dy < 0 ? Math.abs(dy) + 6 : -(dy + 6);
     if (Math.abs(dy) > 40) break;
   }
   placed.push({ cx, cy, dy });
   const dotId = `dot_${chartId}_${idx}`;
   dotData[dotId] = {
     sym: d.isSector ? 'Sector Avg' : d.sym,
     isPrimary: d.isPrimary,
     fwdPE: d.fwdPE, evRev: d.evRev, revGr: d.revGr,
     netMgn: d.netMgn, fcfYield: d.fcfYield,
     price: d.price, r1m: d.r1m, rYtd: d.rYtd, rsi: d.rsi,
   };
   svg += `<circle cx="${cx}" cy="${cy}" r="${r+8}" fill="transparent" class="qdothit" data-dot-id="${dotId}" style="cursor:pointer"/>`;
   svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${glow} stroke="${strokeColor}" stroke-width="${strokeWidth}" class="qdotvis" data-dot-id="${dotId}" style="pointer-events:none"/>`;
   svg += `<text x="${cx}" y="${cy+dy}" text-anchor="middle" fill="${fill}" font-size="${isP?13:11}" font-weight="${isP?800:600}" class="qdotlbl" data-dot-id="${dotId}" style="cursor:pointer;pointer-events:auto">${label}</text>`;
 });
 svg += `</svg>`;

 // ── Legend ──────────────────────────────────────────────────────────────
 const legendItems = [];
 data.forEach(d => {
   if (d.isPrimary) legendItems.push({ color: '#f4c64a', shape: '★', label: d.sym + ' (target)' });
   else if (d.isSector) legendItems.push({ color: '#ffffff', shape: '●', label: 'Sector Avg' });
   else legendItems.push({ color: d._color || '#b9add0', shape: '●', label: d.sym });
 });
 const legend = `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:11px;color:#b9add0">${legendItems.map(li => `<span style="display:flex;align-items:center;gap:4px"><span style="color:${li.color};font-weight:800">${li.shape}</span> ${li.label}</span>`).join('')}</div>`;

 // ── Tooltip HTML ────────────────────────────────────────────────────────
 const tooltipHTML = `<div id="qtip_${chartId}" class="qtip" style="display:none;position:absolute;pointer-events:none;z-index:9999;background:linear-gradient(180deg,rgba(24,11,38,.98),rgba(10,6,18,.98));border:1px solid rgba(178,103,255,.4);border-radius:16px;padding:14px 18px;font-size:12px;line-height:1.6;color:#f6f1ff;box-shadow:0 16px 48px rgba(0,0,0,.6);max-width:240px"><div class="qtip-sym" style="font-weight:900;font-size:15px;margin-bottom:8px;color:#f4c64a"></div><div class="qtip-rows"></div><div class="qtip-arrow" style="position:absolute;bottom:-6px;left:50%;margin-left:-6px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid rgba(178,103,255,.4)"></div></div>`;

 // ── Tooltip JS ──────────────────────────────────────────────────────────
 const dotDataJSON = JSON.stringify(dotData);
 const tooltipJS = `<script>(function(){
var tip=document.getElementById('qtip_${chartId}');
var chart=document.getElementById('${chartId}');
var dotData=${dotDataJSON};
var activeDot=null;
var fmt=function(v,d){return v!=null?(typeof v==='number'?(v>=0?'+':'')+v.toFixed(d||2):'—'):'—';};
var fmtPct=function(v){return fmt(v,2)+'%';};
var show=function(id,ev){
  var d=dotData[id]; if(!d)return;
  var sym=d.sym+(d.isPrimary?' \u2605':'');
  tip.querySelector('.qtip-sym').textContent=sym;
  var rows=[];
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">Fwd P/E</span><span>'+fmt(d.fwdPE,1)+'x</span></div>');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">Rev Growth</span><span style="color:'+(d.revGr>=0?'#2ee0a0':'#ff6f7d')+'">'+fmtPct(d.revGr)+'</span></div>');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">Net Margin</span><span style="color:'+(d.netMgn>=0?'#2ee0a0':'#ff6f7d')+'">'+fmtPct(d.netMgn)+'</span></div>');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">FCF Yield</span><span>'+fmtPct(d.fcfYield)+'</span></div>');
  rows.push('<hr style="border-color:rgba(255,255,255,.08);margin:4px 0">');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">Price</span><span>$'+fmt(d.price,2)+'</span></div>');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">1M Return</span><span style="color:'+(d.r1m>=0?'#2ee0a0':'#ff6f7d')+'">'+fmtPct(d.r1m)+'</span></div>');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">YTD Return</span><span style="color:'+(d.rYtd>=0?'#2ee0a0':'#ff6f7d')+'">'+fmtPct(d.rYtd)+'</span></div>');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">RSI-14</span><span>'+fmt(d.rsi,0)+'</span></div>');
  tip.querySelector('.qtip-rows').innerHTML=rows.join('');
  tip.style.display='block';
  activeDot=id;
  position(ev);
};
var hide=function(){tip.style.display='none';activeDot=null;};
var position=function(ev){
  var rect=chart.getBoundingClientRect();
  var tx=ev.clientX-rect.left+14,ty=ev.clientY-rect.top-10;
  var tw=tip.offsetWidth,th=tip.offsetHeight;
  if(tx+tw+10>rect.width)tx=tx-tw-28;
  if(tx<0)tx=8;
  if(ty-th-10<0){
    ty=ty+24;
    tip.querySelector('.qtip-arrow').style.cssText='top:-6px;bottom:auto;border-top:none;border-bottom:6px solid rgba(178,103,255,.4)';
  }else{
    tip.querySelector('.qtip-arrow').style.cssText='bottom:-6px;top:auto;border-bottom:none;border-top:6px solid rgba(178,103,255,.4)';
  }
  tip.style.left=tx+'px';tip.style.top=ty+'px';
};
chart.parentNode.style.position='relative';
chart.parentNode.insertBefore(tip,chart.nextSibling);
var els=chart.querySelectorAll('.qdothit,.qdotlbl');
els.forEach(function(el){
  el.addEventListener('mouseenter',function(e){show(el.getAttribute('data-dot-id'),e);});
  el.addEventListener('mouseleave',function(){hide();});
  el.addEventListener('mousemove',function(e){if(activeDot)position(e);});
});
chart.addEventListener('touchstart',function(e){
  var t=e.touches[0];var target=document.elementFromPoint(t.clientX,t.clientY);
  var dotId=target?.getAttribute?.('data-dot-id');
  if(dotId){show(dotId,{clientX:t.clientX,clientY:t.clientY});e.preventDefault();}
  else hide();
},{passive:false});
chart.addEventListener('touchmove',function(e){
  if(activeDot){var t=e.touches[0];position({clientX:t.clientX,clientY:t.clientY});}
});
chart.addEventListener('touchend',function(){hide();});
})();<\/script>`;

 const notes = [];
 notes.push(`X: ${useEvRev ? 'EV/Revenue' : 'Forward P/E'}${useEvRev ? ' (auto-selected)' : ''}${primaryWasNull ? ' · ⚠ Primary plotted at estimate' : ''}`);
 if (xLog) notes.push('X uses symlog (high dispersion)');
 if (yLog) notes.push('Y uses symlog (high dispersion)');
 notes.push('🖱️ Hover/touch any dot for live metrics');
 const caption = `<div style="margin-top:6px;font-size:11px;color:#b9add0;text-align:center">${notes.join(' · ')}</div>`;

 return `<div style="margin:20px 0"><h3 style="color:#f4c64a;margin:0 0 8px">📊 Peer Quadrant — Growth vs Valuation</h3>${svg}${legend}${tooltipHTML}${tooltipJS}${caption}</div>`;
}


// ── CSS (embedded, zero external deps) ───────────────────────────────────────
const CSS = `:root{--ink:#f6f1ff;--muted:#b9add0;--gold:#f4c64a;--gold2:#ffe08b;--line:rgba(178,103,255,.24);--green:#2ee0a0;--red:#ff6f7d;--amber:#ffd56e;--greenbg:rgba(46,224,160,.14);--redbg:rgba(255,111,125,.14);--amberbg:rgba(255,213,110,.12);--panel:linear-gradient(180deg,rgba(24,11,38,.96),rgba(10,6,18,.98));--shadow:0 24px 80px rgba(0,0,0,.45)}
*{box-sizing:border-box}body{margin:0;color:var(--ink);font:16px/1.56 system-ui,-apple-system,sans-serif;background:radial-gradient(1200px 700px at 10% -5%,rgba(130,47,255,.20),transparent 50%),radial-gradient(800px 600px at 100% 8%,rgba(244,198,74,.10),transparent 40%),linear-gradient(180deg,#090510 0%,#05030a 60%,#040208 100%)}
.w{max-width:1220px;margin:28px auto 70px;padding:0 18px}
.hero,.panel,details{background:var(--panel);border:1px solid var(--line);border-radius:30px;box-shadow:var(--shadow)}
.hero{padding:28px;position:relative;overflow:hidden}.hero:after{content:"";position:absolute;right:-120px;bottom:-120px;width:440px;height:440px;background:radial-gradient(circle,rgba(178,103,255,.18),transparent 60%)}
.ey{display:flex;gap:10px;align-items:center;color:var(--gold2);text-transform:uppercase;font-size:12px;font-weight:800;letter-spacing:.05em;flex-wrap:wrap}
h1{margin:12px 0 10px;font-size:clamp(30px,4vw,52px);line-height:1.03;letter-spacing:-.03em}.sub{color:var(--muted)}
.mg{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:12px;margin-top:18px}
.kpi{background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.015));border:1px solid rgba(255,255,255,.075);border-radius:18px;padding:14px}
.gold{color:var(--gold)}.pos{color:var(--green)}.neg{color:var(--red)}.neu{color:var(--amber)}
.dir{margin-top:18px;padding:16px 18px;border-left:4px solid var(--gold);background:rgba(255,255,255,.03);border-radius:16px}
.s{margin-top:28px}.s h2{margin:0 0 14px;color:var(--gold);font-weight:900;font-size:clamp(20px,2.6vw,32px)}
.panel{padding:22px;border-radius:24px}.g{display:grid;gap:16px}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.two{display:grid;grid-template-columns:1.15fr .85fr;gap:16px}@media(max-width:900px){.two,.g2,.g3,.g4{grid-template-columns:1fr}}
.label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:800}.value{font-size:18px;font-weight:800;margin-top:5px}.big{font-size:28px;font-weight:900}.small{font-size:13px;color:var(--muted)}
details{overflow:hidden}summary{list-style:none;cursor:pointer;padding:22px 24px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.05)}summary::-webkit-details-marker{display:none}
.eli{padding:18px 22px 22px}.bullet{display:grid;grid-template-columns:18px 1fr;gap:12px;margin:10px 0}.dot{width:9px;height:9px;border-radius:50%;background:var(--gold);margin-top:10px;box-shadow:0 0 12px rgba(244,198,74,.7)}
.box{border-radius:20px;padding:16px 18px;border:1px solid rgba(255,255,255,.06)}.bull{background:var(--greenbg);border-left:5px solid var(--green)}.bear{background:var(--redbg);border-left:5px solid var(--red)}.neutral{background:var(--amberbg);border-left:5px solid var(--amber)}
.list{padding-left:20px;margin:10px 0}.list li{margin:6px 0}
table{width:100%;border-collapse:collapse}thead th{padding:11px 12px;background:rgba(255,255,255,.04);text-align:left;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid rgba(255,255,255,.07)}
tbody td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px}tbody tr:nth-child(odd){background:rgba(255,255,255,.015)}tbody tr:last-child td{border-bottom:none}
.tw{overflow:auto;border-radius:18px;border:1px solid rgba(255,255,255,.06)}
.badge{display:inline-block;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:800}.bg{background:rgba(46,224,160,.18);color:#8effd4}.br{background:rgba(255,111,125,.18);color:#ffb2b9}.ba{background:rgba(255,213,110,.15);color:#ffe59b}.bv{background:rgba(178,103,255,.16);color:#e2c7ff}
a{color:var(--gold2)}.call{padding:14px 16px;border-radius:18px;background:rgba(178,103,255,.10);border:1px solid rgba(178,103,255,.22)}
.vbox{border-radius:24px;padding:28px;background:linear-gradient(135deg,rgba(46,224,160,.10),rgba(178,103,255,.10));border:2px solid rgba(178,103,255,.4);margin-top:20px}
.vr{font-size:38px;font-weight:900;color:var(--green)}hr{border:none;border-top:1px solid var(--line);margin:16px 0}`;

// ── MAIN ──────────────────────────────────────────────────────────────────────
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
    return { sym, f: fund(qs), t: tech(ch?.quotes || []) };
  };

  const allSyms = [TICKER, ...PEERS];
  const results = await Promise.all(allSyms.map(fetchOne));
  const prim = results[0], peers = results.slice(1), F = prim.f, T = prim.t;

  const sector = await fetchOne(TICKER).then(d => SETF[d?.f?.sector || ''] || 'XLK').catch(() => 'XLK');
  const [etfQ, spyQ] = await Promise.all([
    yf.chart(sector, { period1: d1, interval: '1d' }).catch(() => null),
    yf.chart('SPY',   { period1: d1, interval: '1d' }).catch(() => null)
  ]);
  const etfR = q => { const arr = q?.quotes; if (!arr || arr.length < 22) return null; return +((arr.at(-1).close / arr[arr.length - 22].close - 1) * 100).toFixed(2); };
  const etfY = q => { const arr = q?.quotes; if (!arr) return null; const yr = new Date().getFullYear(); const s = arr.find(x => new Date(x.date).getFullYear() === yr)?.close; return s ? +((arr.at(-1).close / s - 1) * 100).toFixed(2) : null; };
  const etfP = q => q?.quotes?.at(-1)?.close?.toFixed(2) || '—';
  const etf  = { p: etfP(etfQ), r1: etfR(etfQ), ytd: etfY(etfQ) };
  const spy  = { p: etfP(spyQ), r1: etfR(spyQ), ytd: etfY(spyQ) };

  const fetchMs = Date.now() - t0;

  // ── Number cross-check: prose vs script ────────────────────────────────────
  const integ = D.DATA_INTEGRITY || '';
  const integFields = {};
  for (const m of integ.matchAll(/([A-Z0-9_]+)=([^|\s][^|]*?)(?=\s+[A-Z0-9_]+=|$)/g)) {
    integFields[m[1].trim()] = m[2].trim();
  }
  const driftWarns = [];
  const agentEntryRaw = (D.TRADE||'').match(/ENTRY=\$?([\d.]+)/)?.[1];
  const agentPERaw    = (D.VALUATION||'').match(/FAIR=\$?[\d.]+-?\$?[\d.]*/)?.[0];
  const agentTgtRaw   = (D.VALUATION||'').match(/\$([5-9]\d{2}|[1-9]\d{3})/)?.[1];

  if (agentEntryRaw) {
    const drift = Math.abs(+agentEntryRaw - T.price) / (T.price||1);
    if (drift > 0.08) driftWarns.push(`ENTRY ${agentEntryRaw} vs live ${T.price} (${(drift*100).toFixed(0)}% off)`);
  }
  if (agentTgtRaw && F.tgtMean) {
    const drift = Math.abs(+agentTgtRaw - F.tgtMean) / F.tgtMean;
    if (drift > 0.12) driftWarns.push(`Analyst target ${agentTgtRaw} vs script ${F.tgtMean} (${(drift*100).toFixed(0)}% off)`);
  }

  const anchorChecks = [
    { label:'Price',    script: T.price,   agent: integFields.PRICE   },
    { label:'Fwd P/E',  script: F.fwdPE,   agent: integFields.FWDPE   },
    { label:'Rev Gr%',  script: F.revGr,   agent: integFields.REVGR   },
    { label:'Tgt Mean', script: F.tgtMean, agent: integFields.TGTMEAN },
    { label:'50D MA',   script: T.ma50,    agent: integFields.MA50    },
    { label:'200D MA',  script: T.ma200,   agent: integFields.MA200   },
  ];
  let anchorMatches = 0, anchorTotal = 0;
  for (const c of anchorChecks) {
    if (c.script != null && c.agent != null) {
      anchorTotal++;
      const drift = Math.abs(+c.agent - +c.script) / (+c.script||1);
      if (drift <= 0.02) anchorMatches++;
      else driftWarns.push(`${c.label}: agent ${c.agent} vs script ${c.script} (${(drift*100).toFixed(0)}% drift)`);
    }
  }
  const anchorScore = anchorTotal > 0 ? anchorMatches : -1;
  const anchorPct   = anchorTotal > 0 ? Math.round(anchorMatches/anchorTotal*100) : 0;
  const integStatus = driftWarns.length === 0 ? 'VERIFIED' : driftWarns.length <= 2 ? 'PARTIAL' : 'DRIFT';
  const integColor  = integStatus==='VERIFIED'?'var(--green)':integStatus==='PARTIAL'?'var(--amber)':'var(--red)';
  const integIcon   = integStatus==='VERIFIED'?'✅':'PARTIAL'===integStatus?'⚠️':'❌';

  if (driftWarns.length) {
    process.stderr.write('\n[stockmd] ⚠️  NUMBER DRIFT DETECTED:\n');
    driftWarns.forEach(w => process.stderr.write('  '+w+'\n'));
    process.stderr.write('  → Re-read stockfetch.js output and correct '+srcFile+'\n\n');
  } else {
    process.stderr.write('[stockmd] ✅ All anchor numbers verified against script data\n');
  }

  const divYield = F.divRate && T.price ? ((F.divRate / T.price) * 100).toFixed(2) : null;
  const upside   = F.tgtMean && T.price ? (((+F.tgtMean - +T.price) / +T.price) * 100).toFixed(1) : null;
  const dateStr  = new Date().toISOString().slice(0, 10);
  // Integrity badge HTML
  const integBadge = `
<div class="s"><div class="panel" style="border:2px solid ${integColor}33;background:linear-gradient(135deg,${integColor}0d,rgba(10,6,18,.98))">
<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
  <div style="font-size:28px">${integIcon}</div>
  <div>
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:800">Data Integrity</div>
    <div style="font-size:20px;font-weight:900;color:${integColor}">${integStatus} — Yahoo Finance Anchored</div>
    <div style="font-size:13px;color:var(--muted);margin-top:4px">
      Source: Yahoo Finance via Node.js yahoo-finance2 &nbsp;·&nbsp;
      Fetched: ${dateStr} in ${fetchMs}ms &nbsp;·&nbsp;
      Anchor checks: ${anchorMatches}/${anchorTotal} matched &nbsp;·&nbsp;
      KPI tables, technicals, peer table, returns: 100% script-generated
    </div>
  </div>
  <div style="margin-left:auto;text-align:right">
    ${anchorTotal>0?`<div style="font-size:32px;font-weight:900;color:${integColor}">${anchorPct}%</div><div style="font-size:11px;color:var(--muted)">prose anchor</div>`:''}
  </div>
</div>
${driftWarns.length?`<div style="margin-top:12px;padding:10px 14px;border-radius:12px;background:rgba(255,111,125,.12);font-size:13px;color:var(--red)">
  <strong>Drift warnings:</strong> ${driftWarns.join(' &nbsp;·&nbsp; ')}
</div>`:''}
<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
  <div style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;background:${integColor}22;color:${integColor}">
    ${integIcon} Price: ${T.price} (script)
  </div>
  <div style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;background:rgba(255,255,255,.05);color:var(--muted)">
    Fwd P/E: ${F.fwdPE}x · Rev Growth: +${F.revGr}% · Net Margin: ${F.netMgn}%
  </div>
  <div style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;background:rgba(255,255,255,.05);color:var(--muted)">
    50D MA: ${T.ma50} · 200D MA: ${T.ma200} · RSI: ${T.rsi}
  </div>
  <div style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;background:rgba(255,255,255,.05);color:var(--muted)">
    Analyst Mean: ${F.tgtMean} (${F.nAnalysts} analysts) · ${F.rec}
  </div>
</div>
</div></div>`;

  // ── Parse agent's plain text fields ─────────────────────────────────────────
  const bullItems    = pipes(D.BULL);
  const bearItems    = pipes(D.BEAR);
  const catalysts    = pipes(D.CATALYSTS);
  const risks        = pipes(D.RISKS);
  const upcoming     = pipes(D.UPCOMING);
  const aiOpp        = pipes(D.AI_OPP);
  const aiThr        = pipes(D.AI_THR);
  const supplyItems  = pipes(D.SUPPLY);
  const sources      = pipes(D.SOURCES || '');

  const ins = D.INSIDER || '';
  const insScore  = getKV(ins, 'SCORE');
  const insSent   = getKVQ(ins, 'SENTIMENT');
  const insBuys   = getKVQ(ins, 'BUYS');
  const insSells  = getKVQ(ins, 'SELLS');
  const insSignal = ins.replace(/\w+=\S+\s*/g, '').trim();

  const val = D.VALUATION || '';
  const fairVal = getKV(val, 'FAIR');
  const bearFloor = getKV(val, 'BEAR');
  const valUpside = getKV(val, 'UPSIDE');
  const valMethod = val.replace(/\w+=\S+\s*/g, '').trim();

  const trade = D.TRADE || '';
  const trEntry = getKV(trade, 'ENTRY');
  const trStop  = getKV(trade, 'STOP');
  const trT1    = getKV(trade, 'T1');
  const trT2    = getKV(trade, 'T2');
  const trSize  = getKVQ(trade, 'SIZE');
  const trAvoid = getKVQ(trade, 'AVOID');

  const vrd = D.VERDICT || '';
  const vRating  = getKVQ(vrd, 'RATING');
  const vStars   = getKV(vrd, 'STARS') || '3';
  const vConv    = getKVQ(vrd, 'CONVICTION');
  const vBottom  = vrd.replace(/\w+=(?:"[^"]*"|\S+)\s*/g, '').trim();

  const storyParas = (D.STORY || '').split(/\n\n+/).map(p => `<p>${p.trim()}</p>`).join('');

  // ── Interactive quadrant chart ───────────────────────────────────────────────
  const quadHTML = quadrantChart(results);

  const starStr    = '★'.repeat(+vStars) + '☆'.repeat(Math.max(0, 5 - +vStars));

  // ── Render supply chain boxes (auto-color by leading emoji) ─────────────────
  const supplyBoxes = supplyItems.map(item => {
    const cls = item.startsWith('✅') || item.startsWith('🟢') ? 'bull' : item.startsWith('⚠️') || item.startsWith('🔴') ? 'bear' : 'neutral';
    return `<div class="box ${cls}"><p style="font-size:14px;margin:0">${item}</p></div>`;
  }).join('');

  // ── Source links ─────────────────────────────────────────────────────────────
  const sourceLinks = sources.length
    ? `<ul class='list'>${sources.map(s => { const [name, url] = s.split(' '); return `<li>${url ? `<a href="${url}" target="_blank">${name}</a>` : name}</li>`; }).join('')}</ul>`
    : '<p style="color:var(--muted)">Yahoo Finance via Node.js yahoo-finance2</p>';

  // ── Build HTML ────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${TICKER} — ${NAME} Research | ${dateStr}</title>
<style>${CSS}</style></head><body><div class="w">

<div class="hero">
<div class="ey"><span>📊 Research</span><span>•</span><span>${TICKER}</span><span>•</span><span>${dateStr}</span><span>•</span>
<span class="badge bv">Momentum · Med Risk · ½ Pos · 3–6Mo</span>
<span class="badge ba">⚡ ${fetchMs}ms fetch</span></div>
<h1>${NAME} <span class="gold">Inc.</span></h1>
<p class="sub">${D.DESC || ''}</p>
<div class="mg">
${kpi('Price', `$${f2(T.price)}`, dateStr, 'big')}
${kpi('Market Cap', fB(F.mktcap), `${f2(F.sharesB)}B shares`)}
${kpi('YTD Return', `${ps(T.rYtd)}%`, `vs SPY ${ps(spy.ytd)}%`, cc(T.rYtd))}
${kpi('1-Month', `${ps(T.r1m)}%`, '30-day', cc(T.r1m))}
${kpi('52-Wk Range', `$${f2(T.w52l)}–$${f2(T.w52h)}`, 'High/Low')}
${kpi('Next Earnings', D.NEXT_EARNINGS || '—')}
${kpi('Analyst Rating', F.rec || '—', `${F.nAnalysts || '?'} analysts · Mean $${f2(F.tgtMean)}`, 'pos')}
${kpi('Revenue TTM', fB(F.rev), `+${fP(F.revGr)} YoY`)}
</div>
<div class="dir">${D.SETUP || ''}</div></div>

${integBadge}

<div class="s"><details>
<summary><div><strong style="font-size:21px">🧒 ELI5 — What is ${TICKER}?</strong><div style="color:var(--muted);font-size:14px">Click to expand</div></div><span style="font-size:12px;border:1px solid rgba(255,255,255,.1);padding:5px 10px;border-radius:999px">▼</span></summary>
<div class="eli">${(() => {  const raw = (D.ELI5 || '').trim();  if (raw) {    const paras = raw.split('\n').map(p => p.trim()).filter(Boolean);    return paras.map(p => `<p style=\"margin:0 0 12px;line-height:1.6\">${p.replace(/\n/g,' ')}</p>`).join('');  }  return `<p style=\"margin:0 0 8px;color:var(--muted);font-style:italic\">⚠️ No ELI5: provided in report. Add an ELI5: field to ${TICKER}_report.txt explaining the business in plain English (what they sell, who pays, how they make money).</p>` + bullets(bullItems.slice(0, 3));})()}</div></details></div>

<div class="s"><h2>📖 Investment Story</h2><div class="panel"><div class="two">
<div>${storyParas}</div>
<div>
<div class="box bull" style="margin-bottom:14px"><div class="label">🐂 Bull Case</div>${li(bullItems)}</div>
<div class="box bear"><div class="label">🐻 Bear Case</div>${li(bearItems)}</div>
</div></div></div></div>

<div class="s"><h2>🌐 Sector Rotation</h2><div class="panel">
<div class="tw"><table><thead><tr><th>Name</th><th>Price</th><th>1M</th><th>YTD</th><th>${TICKER} vs YTD</th></tr></thead><tbody>
<tr style="background:rgba(178,103,255,.08)"><td><strong>${TICKER} ★</strong></td><td>$${f2(T.price)}</td><td class="${cc(T.r1m)}">${ps(T.r1m)}%</td><td class="${cc(T.rYtd)}">${ps(T.rYtd)}%</td><td>—</td></tr>
<tr><td>${sector}</td><td>$${etf.p}</td><td class="${cc(etf.r1)}">${ps(etf.r1)}%</td><td class="${cc(etf.ytd)}">${ps(etf.ytd)}%</td><td class="${cc(T.rYtd - (etf.ytd || 0))}">${T.rYtd && etf.ytd ? ps((T.rYtd - etf.ytd).toFixed(1)) + 'pp' : '—'}</td></tr>
<tr><td>SPY</td><td>$${spy.p}</td><td class="${cc(spy.r1)}">${ps(spy.r1)}%</td><td class="${cc(spy.ytd)}">${ps(spy.ytd)}%</td><td class="${cc(T.rYtd - (spy.ytd || 0))}">${T.rYtd && spy.ytd ? ps((T.rYtd - spy.ytd).toFixed(1)) + 'pp' : '—'}</td></tr>
</tbody></table></div>
<p style="margin-top:14px;color:var(--muted)">${D.SECTOR || ''}</p></div></div>

<div class="s"><h2>🔬 Peer Comparison</h2><div class="panel">
<div class="tw"><table><thead><tr><th>Ticker</th><th>MktCap</th><th>Fwd P/E</th><th>EV/EBITDA</th><th>Rev Gr</th><th>Gross Mgn</th><th>Net Mgn</th><th>FCF Yield</th><th>RSI</th><th>1M</th><th>YTD</th></tr></thead><tbody>
${peerRow(TICKER, F, T, true)}
${peers.map(p => peerRow(p.sym, p.f, p.t, false)).join('\n')}
</tbody></table></div>
${quadHTML}
<div class="g g2" style="margin-top:14px">
<div class="call">${D.PEER1 || ''}</div>
<div class="call">${D.PEER2 || ''}</div>
</div></div></div>

<div class="s"><h2>🏗️ Supply Chain / Dependencies</h2><div class="panel">
<div class="g g3">${supplyBoxes}</div></div></div>

<div class="s"><h2>🕵️ Insider Activity</h2><div class="panel">
<div class="g g2" style="margin-bottom:14px">
<div><p>📎 <a href="https://www.dataroma.com/m/stock.php?sym=${TICKER}" target="_blank">Dataroma — ${TICKER}</a></p>
<p>📎 <a href="https://www.dataroma.com/m/ins/ins.php?t=y&sym=${TICKER}&o=fd&d=d" target="_blank">Dataroma Insiders</a></p></div>
<div class="box ${+insScore >= 7 ? 'bull' : +insScore <= 3 ? 'bear' : 'neutral'}">
<div class="label">YTD Insider Summary</div>
<div class="value">Buys: <span class="pos">${insBuys}</span></div>
<div class="small">Sells: ${insSells}</div></div></div>
<div class="box neutral"><div class="label">Signal Quality Analysis</div>
<p style="font-size:14px;margin-top:8px">${insSignal}</p></div>
<div class="g g2" style="margin-top:12px">
${kpi('Sentiment', insSent || '—')}
${kpi('Conviction Score', `${insScore} / 10`, '1 = heavy sell · 10 = cluster buy', +insScore >= 7 ? 'pos' : +insScore <= 3 ? 'neg' : 'neu')}
</div></div></div>

<div class="s"><h2>⚡ Catalysts & News</h2><div class="panel"><div class="g g2">
<div class="box bull"><div class="label">🐂 Bullish Catalysts</div>${li(catalysts)}</div>
<div><div class="box bear" style="margin-bottom:14px"><div class="label">🐻 Bearish / Risks</div>${li(risks)}</div>
<div class="box neutral"><div class="label">📅 Upcoming Events</div>${li(upcoming)}</div></div>
</div></div></div>

<div class="s"><h2>🤖 AI Threat & Opportunity</h2><div class="panel">
<div class="g g2">
<div class="box bull"><div class="label">✅ AI Opportunity</div>${li(aiOpp)}</div>
<div class="box bear"><div class="label">⚠️ AI Threat</div>${li(aiThr)}</div></div>
<div class="call" style="margin-top:14px"><strong class="gold">Net AI Assessment:</strong> ${D.AI_NET || ''}</div>
</div></div>

<div class="s"><h2>💰 Valuation</h2><div class="panel">
<div class="g4 g" style="margin-bottom:16px">
${kpi('Price', `$${f2(T.price)}`, dateStr, 'big')}
${kpi('Market Cap', fB(F.mktcap))}
${kpi('Fwd P/E', F.fwdPE ? `${f2(F.fwdPE)}x` : '—', `$${f2(F.epsF)} fwd EPS`)}
${kpi('EV/EBITDA', F.evEbitda ? `${f2(F.evEbitda)}x` : '—')}
${kpi('P/Sales', F.ps ? `${f2(F.ps)}x` : '—')}
${kpi('FCF Yield', fP(F.fcfYield), fB(F.fcf) + ' FCF TTM', cc(F.fcfYield))}
${kpi('PEG', f2(F.peg), +F.peg < 1 ? '< 1.0 — growth discount' : 'Premium')}
${kpi('Analyst Target', `$${f2(F.tgtMean)}`, `${F.nAnalysts || '?'} analysts · ${upside ? upside + '% upside' : ''}`, upside && +upside > 0 ? 'pos' : 'neg')}
</div>
<p style="font-size:14px;margin-top:0">${valMethod}</p>
<div class="box bull" style="margin-top:14px">
<div class="label">📊 Blended Fair Value</div>
<div style="font-size:24px;font-weight:900;color:var(--green);margin-top:8px">${fairVal}</div>
<p style="font-size:14px;margin-top:8px">Upside: <strong class="pos">${valUpside}</strong> · Bear floor: ${bearFloor}</p>
</div></div></div>

<div class="s"><h2>📉 Technical Setup</h2><div class="panel">
<div class="g4 g" style="margin-bottom:14px">
${kpi('Price', `$${f2(T.price)}`, '', 'big')}
${kpi('50D MA', `$${f2(T.ma50)}`, `${ps(T.vs50)}% vs price`, cc(T.vs50))}
${kpi('200D MA', `$${f2(T.ma200)}`, `${ps(T.vs200)}% vs price`, cc(T.vs200))}
${kpi('Golden Cross', T.gc ? '<span class="pos">YES ✅</span>' : '<span class="neg">NO ⚠️</span>', '50D vs 200D')}
${kpi('RSI-14', f2(T.rsi), +T.rsi > 70 ? 'Overbought' : +T.rsi < 30 ? 'Oversold' : 'Neutral', +T.rsi > 70 ? 'neg' : +T.rsi < 30 ? 'pos' : 'neu')}
${kpi('MACD', +T.macd > 0 ? '<span class="pos">Bullish</span>' : '<span class="neg">Bearish</span>', `Line: ${f2(T.macd)}`)}
${kpi('ADX-14', f2(T.adx), +T.adx > 25 ? 'Trending' : +T.adx > 20 ? 'Developing' : 'Weak', +T.adx > 25 ? 'pos' : 'neu')}
${kpi('A/D Line', T.adTrend === 'confirming' ? '<span class="pos">Confirming ✅</span>' : '<span class="neg">Diverging ⚠️</span>', '20-day')}
</div>
<div class="g g2" style="margin-bottom:14px">
${kpi('52-Wk High', `$${f2(T.w52h)}`)} ${kpi('52-Wk Low', `$${f2(T.w52l)}`)}
${kpi('20D High/Low', `$${f2(T.hi20)} / $${f2(T.lo20)}`, 'Recent range')}
${kpi('10D High/Low', `$${f2(T.hi10)} / $${f2(T.lo10)}`, 'Near-term')}
${kpi('Vol vs 30D Avg', `${ps(T.volPct)}%`, `Last: ${T.lastVol?.toLocaleString() || '—'}`, cc(T.volPct))}
${kpi('YTD/3M/1M', `<span class="${cc(T.rYtd)}">${ps(T.rYtd)}%</span> / <span class="${cc(T.r3m)}">${ps(T.r3m)}%</span> / <span class="${cc(T.r1m)}">${ps(T.r1m)}%</span>`, '')}
</div></div></div>

<div class="s"><h2>🎯 Trade Plan</h2><div class="panel">
<div class="tw"><table><thead><tr><th>Entry</th><th>Stop</th><th>Target 1</th><th>Target 2</th><th>Size</th><th>Avoid</th></tr></thead>
<tbody><tr>
<td class="pos"><strong>${trEntry}</strong></td>
<td class="neg">${trStop}</td>
<td class="pos">${trT1}</td>
<td class="pos">${trT2}</td>
<td>${trSize}</td>
<td>${trAvoid}</td>
</tr></tbody></table></div>
<div class="g g3" style="margin-top:14px">
<div class="box neutral"><div class="label">Entry</div><p style="font-size:14px;margin:6px 0 0">${trEntry}</p></div>
<div class="box bull"><div class="label">Targets</div><p style="font-size:14px;margin:6px 0 0">T1: ${trT1} &nbsp;|&nbsp; T2: ${trT2}</p></div>
<div class="box bear"><div class="label">Stop / Avoid</div><p style="font-size:14px;margin:6px 0 0">Stop: ${trStop}<br>${trAvoid}</p></div>
</div></div></div>

<div class="s"><h2>🏆 Final Verdict</h2><div class="vbox"><div class="two">
<div><div class="label">Rating</div>
<div class="vr">${vRating}</div>
<div style="font-size:20px;color:var(--muted);margin-top:4px">${starStr}</div>
<p style="font-size:14px;margin-top:16px">${vBottom}</p></div>
<div class="g g2" style="gap:12px">
${kpi('Price', `$${f2(T.price)}`)}
${kpi('Fair Value', fairVal, '', 'pos')}
${kpi('Upside', valUpside || (upside ? '+' + upside + '%' : '—'), 'to fair value', 'pos')}
${kpi('Bear Floor', bearFloor)}
${kpi('Ideal Entry', trEntry, '', 'pos')}
${kpi('Stop Loss', trStop, '', 'neg')}
${kpi('Targets', `${trT1} → ${trT2}`)}
${kpi('Max Position', '½ Position', '¼ starter first', 'neu')}
${kpi('Conviction', vConv || '—')}
${kpi('Insider Score', `${insScore} / 10`, '', +insScore >= 7 ? 'pos' : +insScore <= 3 ? 'neg' : 'neu')}
${divYield ? kpi('Div Yield', divYield + '%', `$${f2(F.divRate)}/yr`) : kpi('Dividend', 'None', 'Price only')}
${kpi('Horizon', '3–6 Months')}
</div></div></div></div>

<div class="s"><div class="panel" style="color:var(--muted);font-size:13px">
<h2 style="color:var(--gold)">📎 Sources</h2>${sourceLinks}
<hr><p style="font-size:12px">Not financial advice. Data: ${dateStr} in ${fetchMs}ms via Node.js yahoo-finance2. Arena.ai Agent Mode.</p>
</div></div>

</div></body></html>`;

  const out = `${TICKER.toLowerCase()}_rich_report.html`;
  fs.writeFileSync(out, html);
  const total = Date.now() - t0;
  process.stderr.write(`[stockmd] ✓ ${out} — ${(html.length / 1024).toFixed(0)}KB — total ${total}ms\n`);
  console.log(out);
})();
// ── APPENDED: Number cross-check guard ──
// Runs after HTML write. Warns if agent's prose values deviate from script.
```

---

## COMPLETE EXECUTION CHECKLIST

Copy this into chat when running a new ticker. Check off each step.

```
[ ] 0. DELETE old report files: rm -f {PREV_TICKER}_data.json {PREV_TICKER}_report.txt {prev_ticker}_rich_report.html
[ ] 1. Identify peers → output: PEERS line
[ ] 2. Confirm stockfetch.js exists (extract from this .md if needed)
[ ] 3. Run: node stockfetch.js {TICKER} {PEER1} {PEER2} {PEER3} {PEER4} {PEER5}
[ ] 3b. Run: node insiderfetch.js {TICKER} to get definitive 6-month insider activity
[ ] 4. Confirm {TICKER}_data.json exists and price/ratios look reasonable
[ ] 5. Read the JSON summary output completely
[ ] 6. Web research: earnings + guidance (search)
[ ] 7. Read output from `node insiderfetch.js` for definitive SEC insider activity
[ ] 8. Web research: catalysts, moat, AI, supply chain
[ ] 9. Write {TICKER}_report.txt using ONLY numbers from the JSON
[ ]    — verify: every price/ratio/return in txt matches _data.json
[ ] 10. Confirm stockmd.js exists (extract from this .md if needed)
[ ] 11. Run: node stockmd.js {TICKER}_report.txt
[ ] 12. Open {ticker}_rich_report.html and verify numbers match JSON
[ ] 13. Check the DATA INTEGRITY badge — must show ✅ VERIFIED (green)
        If ⚠️ PARTIAL or ❌ DRIFT: fix DATA_INTEGRITY line in report.txt and re-run
[ ] 14. Hover over quadrant plot dots to verify peer tooltip metrics appear
[ ] 15. Workspace is clean: only the 4 uploaded files + 3 new report files
```

---

## DATA INTEGRITY RULES

**These are non-negotiable:**

1. **Price in report.txt = price in _data.json.** If they differ, the txt is wrong.
2. **Fwd P/E, EV/EBITDA, margins, returns** — all from JSON, never estimated.
3. **Analyst mean target** — from JSON `fund.tgtMean`. Upside% calculated as `(tgtMean - price) / price * 100`.
4. **Peer table numbers** — from JSON `peerTable` array. No estimates.
5. **Trade plan levels (ENTRY, STOP, T1, T2)** — agent's judgment, not from Yahoo. These are the only numbers the agent may set independently.
6. **DATA_INTEGRITY field** — must be filled by copying stockfetch.js stdout values verbatim. `stockmd.js` cross-checks these on every run and shows:
   - ✅ `VERIFIED` badge (green) — all anchor numbers match within 2% tolerance
   - ⚠️ `PARTIAL` badge (amber) — 1-2 numbers drifted, possible news vs Yahoo lag
   - ❌ `DRIFT` badge (red) — 3+ numbers wrong; agent must re-read data and fix report

**If stockfetch.js fails for a symbol**, note `[DATA UNAVAILABLE]` for that ticker's peer row. Never fill in numbers from memory.

---

## QUICK REFERENCE: PLAIN TEXT KEY GLOSSARY

| Key | What to write |
|-----|--------------|
| TICKER | Symbol only, e.g. `GEHC` |
| NAME | Full company name |
| PEERS | Space-separated symbols |
| DESC | 3–5 segment descriptors separated by ` · ` |
| NEXT_EARNINGS | Human-readable date, e.g. `Late July 2026` |
| SETUP | One sentence — price context + key signal |
| STORY | 3 paragraphs separated by blank lines |
| BULL | Pipe-separated items (6–8 items) |
| BEAR | Pipe-separated items (5–7 items) |
| SECTOR | One paragraph prose |
| PEER1 / PEER2 | One sentence each |
| SUPPLY | Pipe-separated, start items with ✅🟢⚠️🔴 |
| INSIDER | `SCORE=N SENTIMENT=X BUYS=... SELLS=...` then signal analysis |
| AI_OPP | Pipe-separated (4–5 items) |
| AI_THR | Pipe-separated (2–4 items) |
| AI_NET | One sentence |
| VAL_BASE/BULL/BEAR | `TARGET=$X \| Assumption 1` |
| VAL_METHOD | Detailed prose explaining Sector-Specific Valuation Lens, Target Multiple Assumptions, WACC, and DCF formula |
| VAL_MATRIX | Multiline pipe-separated table: `TICKER \| Price \| Multiple Val \| DCF Val \| Analyst Tgt \| Blended Val \| Upside% \| Verdict` |
| SUPPLY_UP | Pipe-separated list of Upstream Suppliers (e.g. `Broadcom (AVGO) - ASICs`) |
| SUPPLY_DOWN | Pipe-separated list of Downstream Customers (e.g. `Microsoft (MSFT) - 26% Rev`) |
| SUPPLY_SIGNALS | Multiline pipe-separated table of recent earnings signals: `Company \| Relationship (Supplier/Customer) \| Result (Beat/Miss) \| Implication` |
| SUPPLY_RISK | `Risk Level (High/Med/Low) \| Detailed analysis of systemic/idiosyncratic risks, geo-political chokepoints, and exact impact on margins` | Description of dependency risks` |
| CATALYSTS_HIST | Multiline pipe-separated table: `Date \| Catalyst Name \| Type (Earnings/Event/Product) \| Impact (Positive/Negative) \| Detail/Source` | `TARGET=$X \| Assumption 1 \| Assumption 2` (Base must = TGTMEAN. Bull > Base. Bear < Base) |
| CATALYSTS | Pipe-separated (5–6 items) |
| RISKS | Pipe-separated list of `Title ~ Impact(High/Medium/Low) ~ Category ~ Description` |
| UPCOMING | Pipe-separated (3–4 items) |
| TRADE | `ENTRY=$X STOP=$Y T1=$A T2=$B SIZE=... CONFIRM=... AVOID=...` — if SIZE is scaled (¼ starter / add ¼), CONFIRM MUST define the exact observable trigger (price level, MA reclaim, volume, or event) for the add. |
| VERDICT | `RATING=... STARS=N CONVICTION=...` then `BOTTOM=Prescriptive, definitive stance. No generic filler. Synthesize supply chain, risks, and valuation to make a firm call. Use the actual COMPANY NAME (not just the ticker). Do not give conflicting statements; weigh the risks but take a definitive stand.` |
| SOURCES | `Name URL` pairs separated by pipes |
| DATA_INTEGRITY | Copy exact values from `stockfetch.js` stdout. `PRICE=X FWDPE=X TGTMEAN=X REVGR=X MA50=X MA200=X W52H=X W52L=X ROIC=X WACC=X VALUE_SPREAD=X FSCORE=N/9 EVA_SPREAD=X CASH_CONV=X MOS=X COMPOSITE=X SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=YYYY-MM-DD` |

---

*Not financial advice. This playbook is for research and educational purposes only.*
 + (+tgt).toFixed(2) : (tgt || 'N/A');
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
  ${kpi('Price', `\${f2(T.price)}`, '', 'big')}
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
        ${divYield ? kpi('Div Yield', divYield + '%', `\${f2(F.divRate)}/yr`, 'neu') : ''}
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
      ${kpi('Price', `\${f2(T.price)}`)}
      ${kpi('50D MA', `\${f2(T.ma50)}`, `${ps(T.vs50)}% vs price`, cc(T.vs50))}
      ${kpi('200D MA', `\${f2(T.ma200)}`, `${ps(T.vs200)}% vs price`, cc(T.vs200))}
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
```

---

## STEP 2b — EMBEDDED INSIDER FETCHER: `insiderfetch.js`

**Extract this code block, save as `insiderfetch.js`, and run it.**

```bash
node insiderfetch.js {TICKER}
```

```javascript
#!/usr/bin/env node
'use strict';
const https = require('https');

const TICKER = process.argv[2]?.toUpperCase();
if(!TICKER) process.exit(1);

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ArenaAgent agent@arena.ai' } }, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
    const tickersRaw = await fetchUrl('https://www.sec.gov/files/company_tickers.json');
    const tickers = JSON.parse(tickersRaw);
    let cik = null;
    for (let k in tickers) {
      if (tickers[k].ticker === TICKER) { cik = tickers[k].cik_str.toString().padStart(10, '0'); break; }
    }
    const subsRaw = await fetchUrl(`https://data.sec.gov/submissions/CIK${cik}.json`);
    const subs = JSON.parse(subsRaw);
    const recent = subs.filings.recent;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    let buys = 0, sells = 0;
    let buyVolUSD = 0, sellVolUSD_Disc = 0, sellVolUSD_10b51 = 0;
    let form4Count = 0;
    
    for (let i = 0; i < recent.form.length; i++) {
      if (recent.form[i] === '4') {
        const filingDate = new Date(recent.filingDate[i]);
        if (filingDate >= sixMonthsAgo) {
          form4Count++;
          if(form4Count > 35) continue;
          
          const accNo = recent.accessionNumber[i].replace(/-/g, '');
          let primaryDoc = recent.primaryDocument[i];
          if (primaryDoc.includes('/')) {
             primaryDoc = primaryDoc.split('/')[1];
          }
          const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accNo}/${primaryDoc}`;
          const rawXml = await fetchUrl(xmlUrl);
          
          let xml = rawXml.replace(/\s+/g, '');
          xml = xml.replace(/<[a-zA-Z0-9_]+:/g, '<').replace(/<\/[a-zA-Z0-9_]+:/g, '</');
          
          const is10b51 = xml.includes('<rule10b51Boolean>true</rule10b51Boolean>') || xml.includes('<rule10b51Boolean>1</rule10b51Boolean>');
          
          const transBlocks = xml.split(/<transactionCoding>/i);
          for (let b = 1; b < transBlocks.length; b++) {
              const block = transBlocks[b];
              const isP = block.includes('<transactionCode>P</transactionCode>');
              const isS = block.includes('<transactionCode>S</transactionCode>');
              
              let shares = 0, price = 0;
              const shMatch = block.match(/<transactionShares><value>([\d\.]+)<\/value>/i);
              if (shMatch) shares = parseFloat(shMatch[1]);
              
              const prMatch = block.match(/<transactionPricePerShare><value>([\d\.]+)<\/value>/i);
              if (prMatch) price = parseFloat(prMatch[1]);
              
              let val = shares * price;
              if (isP && shares > 0) {
                  buys++;
                  buyVolUSD += val;
              } else if (isS && shares > 0) {
                  sells++;
                  if (is10b51) sellVolUSD_10b51 += val;
                  else sellVolUSD_Disc += val;
              }
          }
          await new Promise(r => setTimeout(r, 100));
        }
      }
    }
    
    // FIX H3: Dollar-weighted, 10b5-1 discounted conviction scoring
    let score = 5.0; 
    
    // Reward buying aggressively (+1 point per $100k, max +5)
    score += Math.min(5.0, buyVolUSD / 100000);
    
    // Penalize discretionary selling heavily (-1 point per $1M, max -4)
    score -= Math.min(4.0, sellVolUSD_Disc / 1000000);
    
    // Penalize 10b5-1 selling lightly (-1 point per $5M, max -2)
    score -= Math.min(2.0, sellVolUSD_10b51 / 5000000);
    
    // Fallback if pricing was 0 (e.g., poorly formatted XML missing price tag)
    if (buyVolUSD === 0 && buys > 0) score += Math.min(4, buys * 0.5);
    if (sellVolUSD_Disc === 0 && sellVolUSD_10b51 === 0 && sells > 0) score -= Math.min(3, sells * 0.2);

    score = Math.max(1, Math.min(10, Math.round(score)));
    
    let sentiment = "Neutral";
    if (score >= 7) sentiment = "Bullish";
    if (score <= 3) sentiment = "Bearish";
    
    console.log(`\n===== ${TICKER} SEC FORM 4 INSIDER ACTIVITY (LAST 6 MONTHS) =====`);
    console.log(`INSIDER_SCORE: ${score}`);
    console.log(`INSIDER_SENTIMENT: ${sentiment}`);
    console.log(`Total Buys: ${buys} (${(buyVolUSD/1000000).toFixed(2)}M) | Total Sells: ${sells} (${((sellVolUSD_Disc+sellVolUSD_10b51)/1000000).toFixed(2)}M)`);
    if (sellVolUSD_10b51 > 0) { console.log(`Note: ${(sellVolUSD_10b51/1000000).toFixed(2)}M of sales were under pre-planned 10b5-1 programs.`); }
    if (sellVolUSD_Disc > 0) { console.log(`Note: ${(sellVolUSD_Disc/1000000).toFixed(2)}M of sales were Discretionary.`); }
    console.log(`=================================================================\n`);
})();
```

---

## STEP 3 — RESEARCH INSTRUCTIONS (after reading the JSON)

**Read `{TICKER}_data.json` completely before starting research.**
Every price, ratio, and return figure must match the JSON. Do not invent or estimate numbers.

### 3a — Web Research Required Sections

Run web searches for each. Use the live data numbers as anchors when writing commentary.

1. **Latest Earnings & Guidance** — `{TICKER} Q1 2026 earnings results guidance EPS revenue`
2. **Catalysts & News** — `{TICKER} 2026 catalysts analyst upgrade downgrade`
3. **Insider Activity** — Use the output from `node insiderfetch.js {TICKER}`. This script directly queries the SEC EDGAR API to give you the exact Form 4 Buys and Sells over the last 6 months.

4. **Competition / Moat** — `{TICKER} competitive moat 2026`
5. **AI Opportunity/Threat** — `{TICKER} artificial intelligence opportunity risk 2026`
6. **Supply Chain / Dependencies** — sector-appropriate dependencies
7. **Next Earnings Date** — `{TICKER} next earnings date 2026`

### 3b — Insider Signal Classification

Always classify insider transactions:

| Type | Signal |
|------|--------|
| Open-market purchase by CEO/CFO/director post-drawdown | ⭐ Strong bullish |
| Small open-market buy, single executive | Moderate bullish |
| RSU award / option grant / equity compensation | Noise — neutral |
| 10b5-1 planned sale / tax-withholding sell-to-cover | Noise — mild bearish |
| Large discretionary open-market sale, cluster selling | Strong bearish |

Insider conviction score: 1 (heavy sell) → 10 (cluster open-market buy)

### 3c — Assumptions & Defaults

Unless user says otherwise:
- Investor style: Momentum trader
- Risk: Medium
- Position: Half position (¼ starter, add ¼ on confirmation)
- Horizon: 3–6 months

---

## STEP 4 — PLAIN TEXT REPORT FORMAT

**Write `{TICKER}_report.txt` in exactly this format. No HTML. No JSON. No markdown.**
**DO NOT start writing the report without reading every rule in this section.**
One key per line. Use the JSON numbers exactly as fetched.

```
TICKER: ANET
NAME: Arista Networks, Inc.
PEERS: CSCO JNPR NTAP SMCI NVDA
DESC: Cloud Networking · AI Infrastructure · Data Center Switches
NEXT_EARNINGS: August 5, 2026
ELI5: Arista builds the super-fast switches...
SETUP: ANET is consolidating after a slight post-earnings dip...
STORY: Three paragraphs...

BULL: Point one | Point two
BEAR: Risk one | Risk two
VARIANT_PERCEPTION: Consensus Believes capex will destroy margins ~ We Believe proprietary silicon halves internal inference costs ~ Catalyst: Gross margins expand sequentially in Q3
ALT_DATA: Per SensorTower data, App store downloads up 15% YoY | HYP: Open job postings for AI engineers likely increased QoQ | HYP: Channel checks may show limited discounting on enterprise tiers
COMPETITIVE_ARENA: High-Speed Switching (800G) ~ Dominant ~ Over 40% market share in 400G+ ports | Enterprise Campus ~ Neutral ~ Expanding but still trails Cisco | AI Back-end Fabrics ~ Strong ~ Winning key designs in Meta/Microsoft clusters
SUPPLY: 🟢 Expanding 800G switch capacity | ✅ Securing CoWoS allocation from TSMC | 🔴 Vulnerable to China-Taiwan trade wars | ⚠️ High reliance on Broadcom ASIC roadmap
WHATS_NEW: Massive Q1 Beat | Broadcom supply constraints easing
PATTERN: [Pattern Name] | [Narrative Description]
RULE: If no textbook chart pattern (e.g., Bull Flag, Head & Shoulders) is present, you MUST synthesize a "Price Action Signal."
SYNTHESIS GUIDE:
- If Price ≈ 52w Low → "Bottom Fishing / Testing Support at 52w Lows"
- If Price ≈ 52w High → "Breakout Attempt / Testing 52w Highs"
- If Price is far below MA50/MA200 → "Strong Bearish Regime / Searching for Floor"
- If Price is between MA50 and MA200 → "Mean Reversion / Range Bound"
- If MA50 just crossed MA200 → "Golden/Death Cross Transition"
NEVER omit this key. Always provide a signal based on the data.
VAL_METHOD: High-growth networking requires PEG and EV/EBITDA normalization. WACC assumed at 8.5%, Terminal Growth at 4.0%. Blended Fair Value = (0.4 * Multiple) + (0.3 * DCF) + (0.3 * Analyst Target).
VAL_MATRIX:
ANET | 154.03 | 186.90 | 182.50 | 188.20 | 185.97 | +20.74% | Undervalued
CSCO | 120.41 | 124.02 | 122.50 | 124.45 | 123.70 | +2.73% | Fair Value
VAL_BASE: TARGET=185.97 | AI networking TAM expands | Margins hold
VAL_BULL: TARGET=220.00 | InfiniBand replacement accelerates | 800G upgrade cycle pulls forward
VAL_BEAR: TARGET=130.00 | Hyperscaler capex drops | Broadcom supply constraints choke shipments
SECTOR: Networking is bifurcating between legacy enterprise (weak) and AI cloud (hyper-growth).
PEER1: ANET dwarfs CSCO in net margins (38% vs 19%) due to software-first EOS.
PEER2: ANET is taking share from JNPR in routing.
SUPPLY: 🟢 Expanding 800G switch capacity | ✅ Securing CoWoS allocation from TSMC | 🔴 Vulnerable to China-Taiwan trade wars | ⚠️ High reliance on Broadcom ASIC roadmap
SUPPLY_UP: Broadcom (AVGO) - Merchant Silicon ASICs | TSMC (TSM) - Advanced Packaging
SUPPLY_DOWN: Microsoft (MSFT) - 26% of revenue | Meta (META) - 16% of revenue
SUPPLY_SIGNALS:
Broadcom | Supplier | Beat/Raised | Bullish demand for Tomahawk 5 silicon
Microsoft | Customer | Beat/Raised | Accelerating AI capex directly benefits ANET
SUPPLY_RISK: High | Systemic: Deep reliance on TSMC (Taiwan) for advanced node manufacturing exposes the company to severe geopolitical tailrisk. Idiosyncratic: Extreme reliance on Broadcom for merchant switching silicon. Margin Impact: Chokepoints in CoWoS packaging could artificially constrain supply and compress gross margins by 150-200 bps if alternative sourcing is required.
INSIDER: SCORE=7 SENTIMENT=Bullish BUYS=... SELLS=... SIGNAL=Signal analysis text
AI_OPP: Ethernet replacing InfiniBand in AI clusters | ...
AI_THR: Nvidia Spectrum-X end-to-end bundling | ...
AI_NET: Arista is the primary beneficiary of the open Ethernet AI standard.
CATALYSTS_HIST:
2026-05-05 | Q1 Earnings | Earnings | Negative | Beat EPS but fell 13% on supply worries
2026-05-19 | JP Morgan Conf | Event | Positive | Shipment growth 54% YoY
RISKS: Supply Chain ~ High Impact ~ Operational ~ CoWoS packaging bottlenecks | Concentration ~ Medium Impact ~ Revenue ~ MSFT and META account for >40% of sales
UPCOMING: Q2 Earnings | 800G shipments scale
TRADE: ENTRY=$150 STOP=$135 T1=$185 T2=$220 SIZE=Half_Position (¼ starter, add ¼ on confirmation) CONFIRM=Daily close back above the post-earnings gap ($165) on above-average volume, OR a successful retest that holds the 50-day MA AVOID=Chasing pre-earnings
VERDICT: RATING=STRONG BUY STARS=5 CONVICTION=High BOTTOM=ANET is a definitive buy at these levels. Despite the systemic geopolitical supply chain risks regarding TSMC dependency, the aggressive AI capex cycle is fundamentally extending its networking monopoly. We reject the generic fear of margin compression; the underlying EOS software integration has structurally raised the margin floor. The valuation at 42x forward earnings offers a rare margin of safety for a hyper-scaler entering an AI production supercycle.
SOURCES: Source1 URL1 | Source2 URL2
DATA_INTEGRITY: PRICE=201.97 FWDPE=12.94 TGTMEAN=280.16 REVGR=23.4 MA50=226.35 MA200=349.23 W52H=632.39 W52L=173.25 SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=2026-05-25
```

**HOW TO FILL DATA_INTEGRITY (copy from stockfetch.js stdout):**

After running `node stockfetch.js {TICKER} ...`, the stdout prints a data summary block.
Copy these exact values into the DATA_INTEGRITY line:

```
DATA_INTEGRITY: PRICE=201.97 FWDPE=12.94 TGTMEAN=280.16 REVGR=23.4 MA50=226.35 MA200=349.23 W52H=632.39 W52L=173.25 SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=2026-05-25
```

`stockmd.js` will cross-check these against its own live fetch and render a **VERIFIED / PARTIAL / DRIFT** badge in the HTML report.

**CRITICAL RULES for the text file:**

- TICKER, PEERS, DESC, NEXT_EARNINGS — one line each
- **ELI5** — Plain-English explanation of what the BUSINESS DOES. Follow the ANET pattern below. Every ELI5 must answer:
  1. **What they do** — Plain-English analogy, no jargon
  2. **Who pays them** — Customer type + how they charge
  3. **The moat / superpower** — What keeps competitors from eating their lunch
  4. **Real-world analogy** — "Think of it like ___"
  
  **Forbidden in ELI5:** stock price, valuation, P/E, bull/bear points, analyst targets, technicals.
  
  **ANET example (adapt this pattern to any ticker):**
  ```
  ELI5: Arista Networks builds the super-fast switches and routers that connect all the computers inside giant data centers — think of them as the highway system for the internet's brain. Without Arista's equipment, the GPUs that power ChatGPT and other AI models would sit idle, unable to talk to each other.

  Their biggest customers are Microsoft, Meta, and other cloud giants who pay millions for Arista's hardware. Their moat is EOS — a single software brain that runs on every Arista device. Once a company like Microsoft builds their entire data center around EOS, switching to Cisco is like trying to change the engine of a plane mid-flight.

  Think of it like the traffic control system for AI — NVIDIA makes the race cars (GPUs), Arista builds the racetrack.
  ```

- STORY — use double blank lines between paragraphs
- BULL, BEAR, SUPPLY, CATALYSTS, RISKS, UPCOMING, AI_OPP, AI_THR — pipe `|` separated items
- INSIDER — `SCORE=N SENTIMENT=X BUYS=... SELLS=... SIGNAL=...`
- VALUATION — `FAIR=$X BEAR=$Y UPSIDE=Z%` then `METHOD=` then description
- TRADE — `ENTRY=$X STOP=$Y T1=$A T2=$B SIZE=... CONFIRM=... AVOID=...`
  - **CONFIRM** is MANDATORY whenever SIZE is a scaled/partial position (e.g. "add ¼ on confirmation"). It must state the exact, observable trigger (a price level, MA reclaim, volume condition, or post-earnings event) that justifies adding the second tranche. Never leave "on confirmation" undefined.
- VERDICT — `RATING=... STARS=N CONVICTION=...` then `BOTTOM=` then paragraph
- DATA_INTEGRITY — copy exact values from `stockfetch.js` stdout output. Format: `PRICE=X.XX FWDPE=X.XX TGTMEAN=X.XX REVGR=X.X MA50=X.XX MA200=X.XX W52H=X.XX W52L=X.XX ROIC=X WACC=X VALUE_SPREAD=X FSCORE=N/9 EVA_SPREAD=X CASH_CONV=X MOS=X COMPOSITE=X SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=YYYY-MM-DD` (copy ALL fields verbatim from stockfetch.js stdout)
- Use real numbers from `{TICKER}_data.json` — never placeholders

---


---

## STEP 5 — ⚠️ MANDATORY HTML CONVERTER: `stockmd.js`

**🚨 CRITICAL: You MUST run this script. NEVER generate HTML/JS/CSS yourself.**
**The HTML, CSS, quadrant chart, tooltips, data tables, and theme are all generated by stockmd.js.**

Extract this code, save as `stockmd.js`, run after the text file is written:

```bash
node stockmd.js {TICKER}_report.txt
# Reads: {TICKER}_report.txt + {TICKER}_data.json (for live price refresh)
# Writes: {ticker}_rich_report.html
# Includes: interactive peer quadrant plot (hover/touch for live metrics)
```

### 📊 INTERACTIVE PEER QUADRANT PLOT

`stockmd.js` auto-generates an **inline SVG scatter plot** with hover/touch tooltips:

- **X-axis:** Forward P/E (valuation) — auto-falls back to EV/Revenue if most peers are loss-making
- **Y-axis:** Revenue Growth %
- **Four quadrants** (split on peer median):
  - 🟢 **VALUE PICK** — high growth, cheap multiple
  - 🟣 **PREMIUM GROWTH** — high growth, expensive multiple
  - 🟡 **VALUE TRAP?** — low growth, cheap multiple
  - 🔴 **HIGH RISK** — low growth, expensive multiple
- **Hover/touch any dot → floating tooltip** with 8 live metrics per company:
  - Fwd P/E · Rev Growth · Net Margin · FCF Yield
  - Price · 1M Return · YTD Return · RSI-14
- **Primary ticker** glows gold with a ★; peers shown in silver
- Uses symmetric-log scaling when peer dispersion is extreme (so a $155B giant and a $380M micro-cap both fit cleanly)
- Pure inline SVG + vanilla JS — zero external dependencies, works in sandboxed iframe previews

---


⛔ **FORBIDDEN: Writing HTML/JS/CSS manually. You MUST extract and run the code below.**
⛔ **FORBIDDEN: Using document.createElement, innerHTML, or any DOM API to build the report.**
✅ **REQUIRED: Extract this code block → save as stockmd.js → run `node stockmd.js {TICKER}_report.txt`**



```javascript
#!/usr/bin/env node
/**
 * stockmd.js — The complete stock report system.
 *
 * Agent writes ONE plain-text file (zero HTML, zero JSON, zero formatting).
 * This script fetches live data + converts the plain text → full rich HTML.
 *
 * PLAIN TEXT FORMAT (agent writes this — no tags, no JSON, no brackets):
 * ─────────────────────────────────────────────────────────────────────
 * TICKER: GEHC
 * NAME: GE HealthCare Technologies
 * PEERS: SYK BSX MDT ISRG EW
 * DESC: Medical Imaging · AI Diagnostics · Pharma Diagnostics
 * NEXT_EARNINGS: Late July 2026
 * ELI5: Plain-English explanation of what the BUSINESS DOES. Aim 3-5 short sentences a
 *       12-year-old could understand. NO stock-price talk, NO valuation, NO bull/bear
 *       points. Cover: (1) what they sell, (2) who pays for it, (3) how they make money,
 *       (4) a simple analogy. Use double newline for paragraph breaks.
 * SETUP: One sentence framing the current setup.
 * STORY: Investment story paragraphs. Use double newline for new paragraph.
 * BULL: Point one | Point two | Point three
 * BEAR: Risk one | Risk two | Risk three
 * SECTOR: Commentary on sector rotation.
 * PEER1: TICKER vs PEER comparison sentence.
 * PEER2: TICKER vs PEER2 comparison sentence.
 * SUPPLY: Item one description | Item two description | Item three description
 * INSIDER: SCORE=7 SENTIMENT=Bullish BUYS=Description SELLS=Description SIGNAL=Analysis text
 * AI_OPP: Opportunity one | Opportunity two | Opportunity three
 * AI_THR: Threat one | Threat two
 * AI_NET: Net assessment sentence.
 * VALUATION: FAIR=$X-Y BEAR=$Z METHOD=Description of methods and targets. UPSIDE=X%
 * CATALYSTS: Catalyst one | Catalyst two | Catalyst three
 * RISKS: Risk one | Risk two | Risk three
 * UPCOMING: Event one | Event two
 * TRADE: ENTRY=$X STOP=$Y T1=$A T2=$B SIZE=Description CONFIRM=Exact trigger to add the second tranche AVOID=What not to do
 * VERDICT: RATING=STRONG BUY STARS=5 CONVICTION=High BOTTOM=One paragraph conclusion.
 * SOURCES: Source1 URL1 | Source2 URL2 | Source3 URL3
 * ─────────────────────────────────────────────────────────────────────
 * Usage:  node stockmd.js {TICKER}_report.txt
 *         → writes {ticker}_rich_report.html in ~500ms total
 */'use strict';
const yahooFinance = require('yahoo-finance2').default;
const yf = new yahooFinance({ suppressNotices: ['yahooSurvey'] });
const fs = require('fs');

// ── Parse plain text file ─────────────────────────────────────────────────────
function parseTxt(src) {
  const d = {};
  let cur = null;
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    const col = line.indexOf(':');
    // Key line if colon exists and key has no spaces and is uppercase-ish
    if (col > 0 && col < 20 && !/\s/.test(line.slice(0, col))) {
      cur = line.slice(0, col).toUpperCase();
      d[cur] = line.slice(col + 1).trimStart();
    } else if (cur && line.trim()) {
      d[cur] += '\n' + line;
    }
  }
  return d;
}

// ── Mini-parsers for structured fields ───────────────────────────────────────
const pipes  = str => str ? str.split('|').map(s => s.trim()).filter(Boolean) : [];
const getKV  = (str, k) => { const m = str.match(new RegExp(k + '=([^\\s]+(?:\\s[^A-Z_=]+)*)')); return m ? m[1].trim() : ''; };
const getKVQ = (str, k) => { const m = str.match(new RegExp(k + '=(.+?)(?=\\s+[A-Z_]+=|$)')); return m ? m[1].trim() : ''; };

// ── Data fetch ────────────────────────────────────────────────────────────────
function tech(quotes) {
  if (!quotes || quotes.length < 30) return {};
  const C = quotes.map(q => q.close).filter(Boolean);
  const H = quotes.map(q => q.high).filter(Boolean);
  const L = quotes.map(q => q.low).filter(Boolean);
  const V = quotes.map(q => q.volume).filter(Boolean);
  const n = C.length; if (n < 21) return {};
  const last = C[n - 1];
  const ma = (a, p) => a.slice(-p).reduce((x, y) => x + y, 0) / p;
  const ma50 = n >= 50 ? ma(C, 50) : null;
  const ma200 = n >= 200 ? ma(C, 200) : null;
  let g = 0, l = 0;
  for (let i = n - 14; i < n; i++) { const d = C[i] - C[i - 1]; d > 0 ? g += d : l -= d; }
  const rsi = g + l === 0 ? 50 : 100 - 100 / (1 + g / (l || 1e-9));
  const ema = (a, s) => { const k = 2 / (s + 1); let e = a[0]; for (let i = 1; i < a.length; i++) e = a[i] * k + e * (1 - k); return e; };
  const macdLine = ema(C.slice(-40), 12) - ema(C.slice(-60), 26);
  let tr = 0, pdm = 0, mdm = 0;
  for (let i = n - 14; i < n; i++) {
    tr += Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1]));
    const up = H[i] - H[i - 1], dn = L[i - 1] - L[i];
    if (up > dn && up > 0) pdm += up; if (dn > up && dn > 0) mdm += dn;
  }
  const adx = tr > 0 ? 100 * Math.abs(pdm - mdm) / (pdm + mdm + 1e-9) : 0;
  const avg30 = Math.round(V.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, V.length));
  const ret = d => n >= d ? +((last / C[n - d] - 1) * 100).toFixed(2) : null;
  const ytdStart = quotes.find(q => new Date(q.date).getFullYear() === new Date().getFullYear())?.close || C[0];
  const adSlope = quotes.slice(-20).map(q => { const r = (q.high || 0) - (q.low || 0); return r > 0 ? ((q.close - q.low) - (q.high - q.close)) / r * (q.volume || 0) : 0; }).reduce((a, b) => a + b, 0);
  return {
    price: +last.toFixed(2), ma50: ma50 ? +ma50.toFixed(2) : null, ma200: ma200 ? +ma200.toFixed(2) : null,
    vs50: ma50 ? +((last - ma50) / ma50 * 100).toFixed(2) : null, vs200: ma200 ? +((last - ma200) / ma200 * 100).toFixed(2) : null,
    gc: ma50 != null && ma200 != null ? ma50 > ma200 : null, w52h: +Math.max(...H.slice(-252)).toFixed(2), w52l: +Math.min(...L.slice(-252)).toFixed(2),
    rsi: +rsi.toFixed(2), macd: +macdLine.toFixed(3), adx: +adx.toFixed(2),
    avg30, lastVol: V[V.length - 1], volPct: avg30 > 0 ? +((V[V.length - 1] - avg30) / avg30 * 100).toFixed(2) : null,
    r1m: ret(21), r3m: ret(63), rYtd: +((last / ytdStart - 1) * 100).toFixed(2),
    adTrend: adSlope * (last - C[n - 20]) > 0 ? 'confirming' : 'diverging',
    hi20: +Math.max(...H.slice(-20)).toFixed(2), lo20: +Math.min(...L.slice(-20)).toFixed(2),
    hi10: +Math.max(...H.slice(-10)).toFixed(2), lo10: +Math.min(...L.slice(-10)).toFixed(2),
  };
}

function fund(qs) {
  if (!qs) return {};
  const p = qs.price || {}, k = qs.defaultKeyStatistics || {}, fd = qs.financialData || {}, sd = qs.summaryDetail || {};
  const pct = v => v != null ? +(v * 100).toFixed(2) : null;
  const bil = v => v != null ? +(v / 1e9).toFixed(3) : null;
  const r2 = v => v != null ? +(+v).toFixed(2) : null;
  return {
    mktcap: bil(p.marketCap), fwdPE: r2(k.forwardPE), evEbitda: r2(k.enterpriseToEbitda),
    evRev: r2(k.enterpriseToRevenue), ps: r2(k.priceToSalesTrailing12Months ?? sd.priceToSalesTrailing12Months),
    peg: r2(k.pegRatio), revGr: pct(fd.revenueGrowth), grossMgn: pct(fd.grossMargins),
    opMgn: pct(fd.operatingMargins), netMgn: pct(fd.profitMargins),
    de: fd.debtToEquity != null ? +(fd.debtToEquity / 100).toFixed(3) : null,
    fcf: bil(fd.freeCashflow), fcfYield: fd.freeCashflow && p.marketCap ? pct(fd.freeCashflow / p.marketCap) : null,
    roe: pct(fd.returnOnEquity), divRate: sd.dividendRate ?? null,
    epsT: r2(k.trailingEps), epsF: r2(fd.earningsPerShare ?? k.forwardEps),
    rev: bil(fd.totalRevenue), sharesB: bil(k.sharesOutstanding),
    instPct: pct(k.heldPercentInstitutions), insPct: pct(k.heldPercentInsiders),
    beta: r2(sd.beta ?? k.beta), tgtMean: r2(fd.targetMeanPrice), tgtHigh: r2(fd.targetHighPrice),
    tgtLow: r2(fd.targetLowPrice),
    rec: typeof fd.recommendationKey === 'string' ? fd.recommendationKey.toUpperCase().replace('_', ' ') : null,
    nAnalysts: fd.numberOfAnalystOpinions ?? null,
  };
}

const SETF = { Technology: 'XLK', 'Communication Services': 'XLC', 'Consumer Cyclical': 'XLY', 'Consumer Defensive': 'XLP', Energy: 'XLE', 'Financial Services': 'XLF', Healthcare: 'XLV', Industrials: 'XLI', 'Basic Materials': 'XLB', 'Real Estate': 'XLRE', Utilities: 'XLU' };

// ── HTML builders (all formatting lives here, agent writes zero HTML) ─────────
const f2 = v => v != null ? (+v).toFixed(2) : '—';
const fB = v => v != null ? `$${(+v).toFixed(1)}B` : '—';
const fP = v => v != null ? `${(+v).toFixed(2)}%` : '—';
const ps = v => v != null ? ((+v >= 0 ? '+' : '') + (+v).toFixed(2)) : '—';
const cc = v => v != null && +v >= 0 ? 'pos' : 'neg';
const kpi = (l, v, s = '', c = '') => `<div class="kpi"><div class="label">${l}</div><div class="value${c ? ' ' + c : ''}">${v}</div>${s ? `<div class="small">${s}</div>` : ''}</div>`;
const li = items => `<ul class='list'>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
const bullets = items => items.map(i => `<div class='bullet'><div class='dot'></div><div>${i}</div></div>`).join('');

const peerRow = (sym, f, t, isPrimary) => `<tr${isPrimary ? ' style="background:rgba(178,103,255,.08)"' : ''}>
<td><strong>${sym}</strong>${isPrimary ? ' ★' : ''}</td>
<td>${f.mktcap != null ? `$${(+f.mktcap).toFixed(0)}B` : '—'}</td>
<td>${f.fwdPE != null ? `${f2(f.fwdPE)}x` : '—'}</td>
<td>${f.evEbitda != null ? `${f2(f.evEbitda)}x` : '—'}</td>
<td class="${cc(f.revGr)}">${fP(f.revGr)}</td>
<td>${fP(f.grossMgn)}</td>
<td class="${cc(f.netMgn)}">${fP(f.netMgn)}</td>
<td class="${cc(f.fcfYield)}">${fP(f.fcfYield)}</td>
<td class="${+t.rsi > 70 ? 'neg' : +t.rsi < 30 ? 'pos' : 'neu'}">${t.rsi?.toFixed(0) || '—'}</td>
<td class="${cc(t.r1m)}">${ps(t.r1m)}%</td>
<td class="${cc(t.rYtd)}">${ps(t.rYtd)}%</td></tr>`;

// ── Interactive Quadrant Plot (inline SVG + JS, zero external deps) ──────────
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
//  quadrantChart — Interactive with force-plotted primary, colored peers,
//                   first-letter labels, sector average, legend, hover tooltips
// ═══════════════════════════════════════════════════════════════════════════════
function quadrantChart(results) {
 const rows = results.map(r => ({
   sym: r.sym, fwdPE: r.f?.fwdPE, evRev: r.f?.evRev, revGr: r.f?.revGr,
   netMgn: r.f?.netMgn, fcfYield: r.f?.fcfYield, price: r.t?.price,
   r1m: r.t?.r1m, rYtd: r.t?.rYtd, rsi: r.t?.rsi,
   isPrimary: r.sym === results[0].sym
 }));
 if (rows.length < 3) return '';

 const fwdPos = rows.filter(d => d.fwdPE != null && d.fwdPE > 0).length;
 const fwdAny = rows.filter(d => d.fwdPE != null).length;
 let useEvRev = (fwdAny === 0) || (fwdPos / Math.max(1, rows.length) < 0.6);
 let xKey = useEvRev ? 'evRev' : 'fwdPE';
 let xLabel = useEvRev ? 'Valuation Multiple (EV / Revenue)' : 'Valuation Multiple (Forward P/E)';
 const xUnit = 'x';
 let data = rows.filter(d => d[xKey] != null && d.revGr != null);
 // Fallback axis
 if (data.length < 3 && useEvRev) {
   xKey = 'fwdPE'; useEvRev = false;
   xLabel = 'Valuation Multiple (Forward P/E)';
   data = rows.filter(d => d[xKey] != null && d.revGr != null);
 } else if (data.length < 3 && !useEvRev) {
   xKey = 'evRev'; useEvRev = true;
   xLabel = 'Valuation Multiple (EV / Revenue)';
   data = rows.filter(d => d[xKey] != null && d.revGr != null);
 }
 // ═══ Force-include primary ticker even if data is null ═══
 const primaryRow = rows.find(d => d.isPrimary);
 let primaryWasNull = false;
 if (primaryRow && !data.find(d => d.isPrimary)) {
   primaryWasNull = true;
   data.push({ ...primaryRow, _forced: true });
   if (!primaryRow[xKey]) primaryRow[xKey] = 0.01;
   if (!primaryRow.revGr) primaryRow.revGr = 0;
 }
 if (data.length < 3) return '';

 const xs = data.map(d => d[xKey]), ys = data.map(d => d.revGr);
 const absMax = arr => Math.max(...arr.map(Math.abs));
 const absMinNonZero = arr => { const a=arr.map(v=>Math.abs(v)).filter(v=>v>0.01); return a.length?Math.min(...a):1; };
 const needsLog = (arr, threshMax) => { const hi = absMax(arr), lo = absMinNonZero(arr); return (hi / lo > 15) && (hi >= threshMax); };
 const xLog = needsLog(xs, 20), yLog = needsLog(ys, 50);
 const symlog = (v, thresh) => Math.sign(v) * Math.log10(1 + Math.abs(v) / thresh) * thresh;
 const xThresh = Math.max(1, absMinNonZero(xs)), yThresh = Math.max(1, absMinNonZero(ys));

 // ── Sector average (exclude primary and forced) ────────────────────────
 const sectorPeers = data.filter(d => !d.isPrimary && !d._forced);
 let sectorAvgPoint = null;
 if (sectorPeers.length >= 2) {
   const avgX = sectorPeers.reduce((s,d) => s + (d[xKey] || 0), 0) / sectorPeers.length;
   const avgY = sectorPeers.reduce((s,d) => s + (d.revGr || 0), 0) / sectorPeers.length;
   sectorAvgPoint = { sym: 'SEC', [xKey]: avgX, revGr: avgY, isSector: true, fwdPE: avgX, netMgn: 0, fcfYield: 0, price: 0, r1m: 0, rYtd: 0, rsi: 0 };
   data.push(sectorAvgPoint);
   xs.push(avgX); ys.push(avgY);
 }
 // ═══ Peer color palette ════════════════════════════════════════════════
 const PEER_COLORS = ['#5dade2','#f7dc6f','#bb8fce','#58d68d','#f0b27a','#85c1e9','#f1948a','#82e0aa'];
 let peerColorIdx = 0;
 data.forEach(d => {
   if (!d.isPrimary && !d._forced && !d.isSector) {
     d._color = PEER_COLORS[peerColorIdx % PEER_COLORS.length];
     peerColorIdx++;
   }
 });

 const tx = v => xLog ? symlog(v, xThresh) : v;
 const ty = v => yLog ? symlog(v, yThresh) : v;
 const txs = xs.map(tx), tys = ys.map(ty);
 const xMinT = Math.min(...txs), xMaxT = Math.max(...txs);
 const yMinT = Math.min(...tys), yMaxT = Math.max(...tys);
 const xPad = Math.max((xMaxT - xMinT) * 0.18, Math.abs(xMaxT) * 0.1 || 1);
 const yPad = Math.max((yMaxT - yMinT) * 0.18, Math.abs(yMaxT) * 0.1 || 2);
 const x0 = xMinT - xPad, x1 = xMaxT + xPad;
 const y0 = Math.min(yMinT - yPad, ty(-5)), y1 = yMaxT + yPad;
 const med = arr => { const a=[...arr].sort((p,q)=>p-q); return a[Math.floor(a.length/2)]; };
 const medX = med(xs), medY = med(ys);
 const medXT = tx(medX), medYT = ty(medY);
 const w = 820, h = 540, m = { t: 32, r: 28, b: 60, l: 72 };
 const pw = w - m.l - m.r, ph = h - m.t - m.b;
 const sx = v => m.l + (tx(v) - x0) / (x1 - x0) * pw;
 const sy = v => m.t + ph - (ty(v) - y0) / (y1 - y0) * ph;
 const inv = (vt, thresh) => Math.sign(vt) * (Math.pow(10, Math.abs(vt)/thresh) - 1) * thresh;
 const xTickVal = i => xLog ? inv(x0 + (x1-x0)*i/4, xThresh) : (x0 + (x1-x0)*i/4);
 const yTickVal = i => yLog ? inv(y0 + (y1-y0)*(4-i)/4, yThresh) : (y0 + (y1-y0)*(4-i)/4);
 const chartId = 'qc_' + Math.random().toString(36).slice(2, 8);

 let svg = `<svg id="${chartId}" viewBox="0 0 ${w} ${h}" style="width:100%;max-width:820px;font-family:system-ui,sans-serif;background:rgba(255,255,255,.01);border-radius:24px">`;
 svg += `<defs><filter id="qpglow_${chartId}"><feGaussianBlur stdDeviation="3"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;

 const qx = m.l + (medXT - x0) / (x1 - x0) * pw;
 const qy = m.t + ph - (medYT - y0) / (y1 - y0) * ph;
 const rects = [
   { x: m.l, y: m.t, w: qx - m.l, h: qy - m.t, fill: 'rgba(46,224,160,0.05)', label: 'VALUE PICK', lc: '#2ee0a0' },
   { x: qx, y: m.t, w: m.l + pw - qx, h: qy - m.t, fill: 'rgba(178,103,255,0.05)', label: 'PREMIUM GROWTH', lc: '#b267ff' },
   { x: m.l, y: qy, w: qx - m.l, h: m.t + ph - qy, fill: 'rgba(255,213,110,0.05)', label: 'VALUE TRAP?', lc: '#ffd56e' },
   { x: qx, y: qy, w: m.l + pw - qx, h: m.t + ph - qy, fill: 'rgba(255,111,125,0.05)', label: 'HIGH RISK', lc: '#ff6f7d' }
 ];
 rects.forEach(q => {
   svg += `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="${q.fill}" rx="6"/>`;
   svg += `<text x="${q.x+q.w/2}" y="${q.y+16}" text-anchor="middle" fill="${q.lc}" font-size="10" font-weight="700" opacity="0.6">${q.label}</text>`;
 });

 const fmtX = v => (xLog && Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) + xUnit;
 const fmtY = v => (yLog && Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) + '%';
 for (let i = 0; i <= 4; i++) {
   const xv = m.l + pw * i / 4;
   svg += `<line x1="${xv}" y1="${m.t}" x2="${xv}" y2="${m.t+ph}" stroke="rgba(255,255,255,.06)" stroke-dasharray="4,4"/>`;
   svg += `<text x="${xv}" y="${m.t+ph+18}" text-anchor="middle" fill="#b9add0" font-size="11">${fmtX(xTickVal(i))}</text>`;
 }
 for (let i = 0; i <= 4; i++) {
   const yv = m.t + ph * i / 4;
   svg += `<line x1="${m.l}" y1="${yv}" x2="${m.l+pw}" y2="${yv}" stroke="rgba(255,255,255,.06)" stroke-dasharray="4,4"/>`;
   svg += `<text x="${m.l-8}" y="${yv+4}" text-anchor="end" fill="#b9add0" font-size="11">${fmtY(yTickVal(i))}</text>`;
 }
 svg += `<line x1="${qx}" y1="${m.t}" x2="${qx}" y2="${m.t+ph}" stroke="rgba(255,255,255,.12)" stroke-dasharray="6,3"/>`;
 svg += `<line x1="${m.l}" y1="${qy}" x2="${m.l+pw}" y2="${qy}" stroke="rgba(255,255,255,.12)" stroke-dasharray="6,3"/>`;
 if (x0 < 0 && x1 > 0) svg += `<line x1="${sx(0)}" y1="${m.t}" x2="${sx(0)}" y2="${m.t+ph}" stroke="rgba(255,255,255,.18)"/>`;
 if (y0 < 0 && y1 > 0) svg += `<line x1="${m.l}" y1="${sy(0)}" x2="${m.l+pw}" y2="${sy(0)}" stroke="rgba(255,255,255,.18)"/>`;
 svg += `<text x="${m.l+pw/2}" y="${h-6}" text-anchor="middle" fill="#b9add0" font-size="13" font-weight="600">${xLabel}${xLog?' · symlog scale':''}</text>`;
 svg += `<text x="${14}" y="${m.t+ph/2}" text-anchor="middle" fill="#b9add0" font-size="13" font-weight="600" transform="rotate(-90,14,${m.t+ph/2})">Revenue Growth (%)${yLog?' · symlog scale':''}</text>`;

 // ── Draw dots ───────────────────────────────────────────────────────────
 const dotData = {};
 const placed = [];
 data.forEach((d, idx) => {
   const cx = sx(d[xKey]), cy = sy(d.revGr);
   const isP = d.isPrimary, isS = d.isSector;
   let fill, r, label;
   if (isP)    { fill = '#f4c64a'; r = 9; label = d.sym.charAt(0) + ' ★'; }
   else if (isS) { fill = '#ffffff'; r = 7; label = 'Avg'; }
   else         { fill = d._color || '#b9add0'; r = 6; label = d.sym.charAt(0); }
   let strokeColor = isP ? '#fff' : (isS ? '#b9add0' : 'none');
   let strokeWidth = isP ? 2 : (isS ? 1 : 0);
   if (d._forced) { strokeColor = '#ff6f7d'; strokeWidth = 2; label += ' ⚠'; }
   const glow = isP ? `filter="url(#qpglow_${chartId})"` : '';
   let dy = -14;
   while (placed.some(p => Math.abs(p.cx - cx) < 38 && Math.abs((p.cy + p.dy) - (cy + dy)) < 14)) {
     dy = dy < 0 ? Math.abs(dy) + 6 : -(dy + 6);
     if (Math.abs(dy) > 40) break;
   }
   placed.push({ cx, cy, dy });
   const dotId = `dot_${chartId}_${idx}`;
   dotData[dotId] = {
     sym: d.isSector ? 'Sector Avg' : d.sym,
     isPrimary: d.isPrimary,
     fwdPE: d.fwdPE, evRev: d.evRev, revGr: d.revGr,
     netMgn: d.netMgn, fcfYield: d.fcfYield,
     price: d.price, r1m: d.r1m, rYtd: d.rYtd, rsi: d.rsi,
   };
   svg += `<circle cx="${cx}" cy="${cy}" r="${r+8}" fill="transparent" class="qdothit" data-dot-id="${dotId}" style="cursor:pointer"/>`;
   svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${glow} stroke="${strokeColor}" stroke-width="${strokeWidth}" class="qdotvis" data-dot-id="${dotId}" style="pointer-events:none"/>`;
   svg += `<text x="${cx}" y="${cy+dy}" text-anchor="middle" fill="${fill}" font-size="${isP?13:11}" font-weight="${isP?800:600}" class="qdotlbl" data-dot-id="${dotId}" style="cursor:pointer;pointer-events:auto">${label}</text>`;
 });
 svg += `</svg>`;

 // ── Legend ──────────────────────────────────────────────────────────────
 const legendItems = [];
 data.forEach(d => {
   if (d.isPrimary) legendItems.push({ color: '#f4c64a', shape: '★', label: d.sym + ' (target)' });
   else if (d.isSector) legendItems.push({ color: '#ffffff', shape: '●', label: 'Sector Avg' });
   else legendItems.push({ color: d._color || '#b9add0', shape: '●', label: d.sym });
 });
 const legend = `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:11px;color:#b9add0">${legendItems.map(li => `<span style="display:flex;align-items:center;gap:4px"><span style="color:${li.color};font-weight:800">${li.shape}</span> ${li.label}</span>`).join('')}</div>`;

 // ── Tooltip HTML ────────────────────────────────────────────────────────
 const tooltipHTML = `<div id="qtip_${chartId}" class="qtip" style="display:none;position:absolute;pointer-events:none;z-index:9999;background:linear-gradient(180deg,rgba(24,11,38,.98),rgba(10,6,18,.98));border:1px solid rgba(178,103,255,.4);border-radius:16px;padding:14px 18px;font-size:12px;line-height:1.6;color:#f6f1ff;box-shadow:0 16px 48px rgba(0,0,0,.6);max-width:240px"><div class="qtip-sym" style="font-weight:900;font-size:15px;margin-bottom:8px;color:#f4c64a"></div><div class="qtip-rows"></div><div class="qtip-arrow" style="position:absolute;bottom:-6px;left:50%;margin-left:-6px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid rgba(178,103,255,.4)"></div></div>`;

 // ── Tooltip JS ──────────────────────────────────────────────────────────
 const dotDataJSON = JSON.stringify(dotData);
 const tooltipJS = `<script>(function(){
var tip=document.getElementById('qtip_${chartId}');
var chart=document.getElementById('${chartId}');
var dotData=${dotDataJSON};
var activeDot=null;
var fmt=function(v,d){return v!=null?(typeof v==='number'?(v>=0?'+':'')+v.toFixed(d||2):'—'):'—';};
var fmtPct=function(v){return fmt(v,2)+'%';};
var show=function(id,ev){
  var d=dotData[id]; if(!d)return;
  var sym=d.sym+(d.isPrimary?' \u2605':'');
  tip.querySelector('.qtip-sym').textContent=sym;
  var rows=[];
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">Fwd P/E</span><span>'+fmt(d.fwdPE,1)+'x</span></div>');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">Rev Growth</span><span style="color:'+(d.revGr>=0?'#2ee0a0':'#ff6f7d')+'">'+fmtPct(d.revGr)+'</span></div>');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">Net Margin</span><span style="color:'+(d.netMgn>=0?'#2ee0a0':'#ff6f7d')+'">'+fmtPct(d.netMgn)+'</span></div>');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">FCF Yield</span><span>'+fmtPct(d.fcfYield)+'</span></div>');
  rows.push('<hr style="border-color:rgba(255,255,255,.08);margin:4px 0">');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">Price</span><span>$'+fmt(d.price,2)+'</span></div>');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">1M Return</span><span style="color:'+(d.r1m>=0?'#2ee0a0':'#ff6f7d')+'">'+fmtPct(d.r1m)+'</span></div>');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">YTD Return</span><span style="color:'+(d.rYtd>=0?'#2ee0a0':'#ff6f7d')+'">'+fmtPct(d.rYtd)+'</span></div>');
  rows.push('<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#b9add0">RSI-14</span><span>'+fmt(d.rsi,0)+'</span></div>');
  tip.querySelector('.qtip-rows').innerHTML=rows.join('');
  tip.style.display='block';
  activeDot=id;
  position(ev);
};
var hide=function(){tip.style.display='none';activeDot=null;};
var position=function(ev){
  var rect=chart.getBoundingClientRect();
  var tx=ev.clientX-rect.left+14,ty=ev.clientY-rect.top-10;
  var tw=tip.offsetWidth,th=tip.offsetHeight;
  if(tx+tw+10>rect.width)tx=tx-tw-28;
  if(tx<0)tx=8;
  if(ty-th-10<0){
    ty=ty+24;
    tip.querySelector('.qtip-arrow').style.cssText='top:-6px;bottom:auto;border-top:none;border-bottom:6px solid rgba(178,103,255,.4)';
  }else{
    tip.querySelector('.qtip-arrow').style.cssText='bottom:-6px;top:auto;border-bottom:none;border-top:6px solid rgba(178,103,255,.4)';
  }
  tip.style.left=tx+'px';tip.style.top=ty+'px';
};
chart.parentNode.style.position='relative';
chart.parentNode.insertBefore(tip,chart.nextSibling);
var els=chart.querySelectorAll('.qdothit,.qdotlbl');
els.forEach(function(el){
  el.addEventListener('mouseenter',function(e){show(el.getAttribute('data-dot-id'),e);});
  el.addEventListener('mouseleave',function(){hide();});
  el.addEventListener('mousemove',function(e){if(activeDot)position(e);});
});
chart.addEventListener('touchstart',function(e){
  var t=e.touches[0];var target=document.elementFromPoint(t.clientX,t.clientY);
  var dotId=target?.getAttribute?.('data-dot-id');
  if(dotId){show(dotId,{clientX:t.clientX,clientY:t.clientY});e.preventDefault();}
  else hide();
},{passive:false});
chart.addEventListener('touchmove',function(e){
  if(activeDot){var t=e.touches[0];position({clientX:t.clientX,clientY:t.clientY});}
});
chart.addEventListener('touchend',function(){hide();});
})();<\/script>`;

 const notes = [];
 notes.push(`X: ${useEvRev ? 'EV/Revenue' : 'Forward P/E'}${useEvRev ? ' (auto-selected)' : ''}${primaryWasNull ? ' · ⚠ Primary plotted at estimate' : ''}`);
 if (xLog) notes.push('X uses symlog (high dispersion)');
 if (yLog) notes.push('Y uses symlog (high dispersion)');
 notes.push('🖱️ Hover/touch any dot for live metrics');
 const caption = `<div style="margin-top:6px;font-size:11px;color:#b9add0;text-align:center">${notes.join(' · ')}</div>`;

 return `<div style="margin:20px 0"><h3 style="color:#f4c64a;margin:0 0 8px">📊 Peer Quadrant — Growth vs Valuation</h3>${svg}${legend}${tooltipHTML}${tooltipJS}${caption}</div>`;
}


// ── CSS (embedded, zero external deps) ───────────────────────────────────────
const CSS = `:root{--ink:#f6f1ff;--muted:#b9add0;--gold:#f4c64a;--gold2:#ffe08b;--line:rgba(178,103,255,.24);--green:#2ee0a0;--red:#ff6f7d;--amber:#ffd56e;--greenbg:rgba(46,224,160,.14);--redbg:rgba(255,111,125,.14);--amberbg:rgba(255,213,110,.12);--panel:linear-gradient(180deg,rgba(24,11,38,.96),rgba(10,6,18,.98));--shadow:0 24px 80px rgba(0,0,0,.45)}
*{box-sizing:border-box}body{margin:0;color:var(--ink);font:16px/1.56 system-ui,-apple-system,sans-serif;background:radial-gradient(1200px 700px at 10% -5%,rgba(130,47,255,.20),transparent 50%),radial-gradient(800px 600px at 100% 8%,rgba(244,198,74,.10),transparent 40%),linear-gradient(180deg,#090510 0%,#05030a 60%,#040208 100%)}
.w{max-width:1220px;margin:28px auto 70px;padding:0 18px}
.hero,.panel,details{background:var(--panel);border:1px solid var(--line);border-radius:30px;box-shadow:var(--shadow)}
.hero{padding:28px;position:relative;overflow:hidden}.hero:after{content:"";position:absolute;right:-120px;bottom:-120px;width:440px;height:440px;background:radial-gradient(circle,rgba(178,103,255,.18),transparent 60%)}
.ey{display:flex;gap:10px;align-items:center;color:var(--gold2);text-transform:uppercase;font-size:12px;font-weight:800;letter-spacing:.05em;flex-wrap:wrap}
h1{margin:12px 0 10px;font-size:clamp(30px,4vw,52px);line-height:1.03;letter-spacing:-.03em}.sub{color:var(--muted)}
.mg{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:12px;margin-top:18px}
.kpi{background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.015));border:1px solid rgba(255,255,255,.075);border-radius:18px;padding:14px}
.gold{color:var(--gold)}.pos{color:var(--green)}.neg{color:var(--red)}.neu{color:var(--amber)}
.dir{margin-top:18px;padding:16px 18px;border-left:4px solid var(--gold);background:rgba(255,255,255,.03);border-radius:16px}
.s{margin-top:28px}.s h2{margin:0 0 14px;color:var(--gold);font-weight:900;font-size:clamp(20px,2.6vw,32px)}
.panel{padding:22px;border-radius:24px}.g{display:grid;gap:16px}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.two{display:grid;grid-template-columns:1.15fr .85fr;gap:16px}@media(max-width:900px){.two,.g2,.g3,.g4{grid-template-columns:1fr}}
.label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:800}.value{font-size:18px;font-weight:800;margin-top:5px}.big{font-size:28px;font-weight:900}.small{font-size:13px;color:var(--muted)}
details{overflow:hidden}summary{list-style:none;cursor:pointer;padding:22px 24px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.05)}summary::-webkit-details-marker{display:none}
.eli{padding:18px 22px 22px}.bullet{display:grid;grid-template-columns:18px 1fr;gap:12px;margin:10px 0}.dot{width:9px;height:9px;border-radius:50%;background:var(--gold);margin-top:10px;box-shadow:0 0 12px rgba(244,198,74,.7)}
.box{border-radius:20px;padding:16px 18px;border:1px solid rgba(255,255,255,.06)}.bull{background:var(--greenbg);border-left:5px solid var(--green)}.bear{background:var(--redbg);border-left:5px solid var(--red)}.neutral{background:var(--amberbg);border-left:5px solid var(--amber)}
.list{padding-left:20px;margin:10px 0}.list li{margin:6px 0}
table{width:100%;border-collapse:collapse}thead th{padding:11px 12px;background:rgba(255,255,255,.04);text-align:left;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid rgba(255,255,255,.07)}
tbody td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px}tbody tr:nth-child(odd){background:rgba(255,255,255,.015)}tbody tr:last-child td{border-bottom:none}
.tw{overflow:auto;border-radius:18px;border:1px solid rgba(255,255,255,.06)}
.badge{display:inline-block;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:800}.bg{background:rgba(46,224,160,.18);color:#8effd4}.br{background:rgba(255,111,125,.18);color:#ffb2b9}.ba{background:rgba(255,213,110,.15);color:#ffe59b}.bv{background:rgba(178,103,255,.16);color:#e2c7ff}
a{color:var(--gold2)}.call{padding:14px 16px;border-radius:18px;background:rgba(178,103,255,.10);border:1px solid rgba(178,103,255,.22)}
.vbox{border-radius:24px;padding:28px;background:linear-gradient(135deg,rgba(46,224,160,.10),rgba(178,103,255,.10));border:2px solid rgba(178,103,255,.4);margin-top:20px}
.vr{font-size:38px;font-weight:900;color:var(--green)}hr{border:none;border-top:1px solid var(--line);margin:16px 0}`;

// ── MAIN ──────────────────────────────────────────────────────────────────────
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
    return { sym, f: fund(qs), t: tech(ch?.quotes || []) };
  };

  const allSyms = [TICKER, ...PEERS];
  const results = await Promise.all(allSyms.map(fetchOne));
  const prim = results[0], peers = results.slice(1), F = prim.f, T = prim.t;

  const sector = await fetchOne(TICKER).then(d => SETF[d?.f?.sector || ''] || 'XLK').catch(() => 'XLK');
  const [etfQ, spyQ] = await Promise.all([
    yf.chart(sector, { period1: d1, interval: '1d' }).catch(() => null),
    yf.chart('SPY',   { period1: d1, interval: '1d' }).catch(() => null)
  ]);
  const etfR = q => { const arr = q?.quotes; if (!arr || arr.length < 22) return null; return +((arr.at(-1).close / arr[arr.length - 22].close - 1) * 100).toFixed(2); };
  const etfY = q => { const arr = q?.quotes; if (!arr) return null; const yr = new Date().getFullYear(); const s = arr.find(x => new Date(x.date).getFullYear() === yr)?.close; return s ? +((arr.at(-1).close / s - 1) * 100).toFixed(2) : null; };
  const etfP = q => q?.quotes?.at(-1)?.close?.toFixed(2) || '—';
  const etf  = { p: etfP(etfQ), r1: etfR(etfQ), ytd: etfY(etfQ) };
  const spy  = { p: etfP(spyQ), r1: etfR(spyQ), ytd: etfY(spyQ) };

  const fetchMs = Date.now() - t0;

  // ── Number cross-check: prose vs script ────────────────────────────────────
  const integ = D.DATA_INTEGRITY || '';
  const integFields = {};
  for (const m of integ.matchAll(/([A-Z0-9_]+)=([^|\s][^|]*?)(?=\s+[A-Z0-9_]+=|$)/g)) {
    integFields[m[1].trim()] = m[2].trim();
  }
  const driftWarns = [];
  const agentEntryRaw = (D.TRADE||'').match(/ENTRY=\$?([\d.]+)/)?.[1];
  const agentPERaw    = (D.VALUATION||'').match(/FAIR=\$?[\d.]+-?\$?[\d.]*/)?.[0];
  const agentTgtRaw   = (D.VALUATION||'').match(/\$([5-9]\d{2}|[1-9]\d{3})/)?.[1];

  if (agentEntryRaw) {
    const drift = Math.abs(+agentEntryRaw - T.price) / (T.price||1);
    if (drift > 0.08) driftWarns.push(`ENTRY ${agentEntryRaw} vs live ${T.price} (${(drift*100).toFixed(0)}% off)`);
  }
  if (agentTgtRaw && F.tgtMean) {
    const drift = Math.abs(+agentTgtRaw - F.tgtMean) / F.tgtMean;
    if (drift > 0.12) driftWarns.push(`Analyst target ${agentTgtRaw} vs script ${F.tgtMean} (${(drift*100).toFixed(0)}% off)`);
  }

  const anchorChecks = [
    { label:'Price',    script: T.price,   agent: integFields.PRICE   },
    { label:'Fwd P/E',  script: F.fwdPE,   agent: integFields.FWDPE   },
    { label:'Rev Gr%',  script: F.revGr,   agent: integFields.REVGR   },
    { label:'Tgt Mean', script: F.tgtMean, agent: integFields.TGTMEAN },
    { label:'50D MA',   script: T.ma50,    agent: integFields.MA50    },
    { label:'200D MA',  script: T.ma200,   agent: integFields.MA200   },
  ];
  let anchorMatches = 0, anchorTotal = 0;
  for (const c of anchorChecks) {
    if (c.script != null && c.agent != null) {
      anchorTotal++;
      const drift = Math.abs(+c.agent - +c.script) / (+c.script||1);
      if (drift <= 0.02) anchorMatches++;
      else driftWarns.push(`${c.label}: agent ${c.agent} vs script ${c.script} (${(drift*100).toFixed(0)}% drift)`);
    }
  }
  const anchorScore = anchorTotal > 0 ? anchorMatches : -1;
  const anchorPct   = anchorTotal > 0 ? Math.round(anchorMatches/anchorTotal*100) : 0;
  const integStatus = driftWarns.length === 0 ? 'VERIFIED' : driftWarns.length <= 2 ? 'PARTIAL' : 'DRIFT';
  const integColor  = integStatus==='VERIFIED'?'var(--green)':integStatus==='PARTIAL'?'var(--amber)':'var(--red)';
  const integIcon   = integStatus==='VERIFIED'?'✅':'PARTIAL'===integStatus?'⚠️':'❌';

  if (driftWarns.length) {
    process.stderr.write('\n[stockmd] ⚠️  NUMBER DRIFT DETECTED:\n');
    driftWarns.forEach(w => process.stderr.write('  '+w+'\n'));
    process.stderr.write('  → Re-read stockfetch.js output and correct '+srcFile+'\n\n');
  } else {
    process.stderr.write('[stockmd] ✅ All anchor numbers verified against script data\n');
  }

  const divYield = F.divRate && T.price ? ((F.divRate / T.price) * 100).toFixed(2) : null;
  const upside   = F.tgtMean && T.price ? (((+F.tgtMean - +T.price) / +T.price) * 100).toFixed(1) : null;
  const dateStr  = new Date().toISOString().slice(0, 10);
  // Integrity badge HTML
  const integBadge = `
<div class="s"><div class="panel" style="border:2px solid ${integColor}33;background:linear-gradient(135deg,${integColor}0d,rgba(10,6,18,.98))">
<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
  <div style="font-size:28px">${integIcon}</div>
  <div>
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:800">Data Integrity</div>
    <div style="font-size:20px;font-weight:900;color:${integColor}">${integStatus} — Yahoo Finance Anchored</div>
    <div style="font-size:13px;color:var(--muted);margin-top:4px">
      Source: Yahoo Finance via Node.js yahoo-finance2 &nbsp;·&nbsp;
      Fetched: ${dateStr} in ${fetchMs}ms &nbsp;·&nbsp;
      Anchor checks: ${anchorMatches}/${anchorTotal} matched &nbsp;·&nbsp;
      KPI tables, technicals, peer table, returns: 100% script-generated
    </div>
  </div>
  <div style="margin-left:auto;text-align:right">
    ${anchorTotal>0?`<div style="font-size:32px;font-weight:900;color:${integColor}">${anchorPct}%</div><div style="font-size:11px;color:var(--muted)">prose anchor</div>`:''}
  </div>
</div>
${driftWarns.length?`<div style="margin-top:12px;padding:10px 14px;border-radius:12px;background:rgba(255,111,125,.12);font-size:13px;color:var(--red)">
  <strong>Drift warnings:</strong> ${driftWarns.join(' &nbsp;·&nbsp; ')}
</div>`:''}
<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
  <div style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;background:${integColor}22;color:${integColor}">
    ${integIcon} Price: ${T.price} (script)
  </div>
  <div style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;background:rgba(255,255,255,.05);color:var(--muted)">
    Fwd P/E: ${F.fwdPE}x · Rev Growth: +${F.revGr}% · Net Margin: ${F.netMgn}%
  </div>
  <div style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;background:rgba(255,255,255,.05);color:var(--muted)">
    50D MA: ${T.ma50} · 200D MA: ${T.ma200} · RSI: ${T.rsi}
  </div>
  <div style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;background:rgba(255,255,255,.05);color:var(--muted)">
    Analyst Mean: ${F.tgtMean} (${F.nAnalysts} analysts) · ${F.rec}
  </div>
</div>
</div></div>`;

  // ── Parse agent's plain text fields ─────────────────────────────────────────
  const bullItems    = pipes(D.BULL);
  const bearItems    = pipes(D.BEAR);
  const catalysts    = pipes(D.CATALYSTS);
  const risks        = pipes(D.RISKS);
  const upcoming     = pipes(D.UPCOMING);
  const aiOpp        = pipes(D.AI_OPP);
  const aiThr        = pipes(D.AI_THR);
  const supplyItems  = pipes(D.SUPPLY);
  const sources      = pipes(D.SOURCES || '');

  const ins = D.INSIDER || '';
  const insScore  = getKV(ins, 'SCORE');
  const insSent   = getKVQ(ins, 'SENTIMENT');
  const insBuys   = getKVQ(ins, 'BUYS');
  const insSells  = getKVQ(ins, 'SELLS');
  const insSignal = ins.replace(/\w+=\S+\s*/g, '').trim();

  const val = D.VALUATION || '';
  const fairVal = getKV(val, 'FAIR');
  const bearFloor = getKV(val, 'BEAR');
  const valUpside = getKV(val, 'UPSIDE');
  const valMethod = val.replace(/\w+=\S+\s*/g, '').trim();

  const trade = D.TRADE || '';
  const trEntry = getKV(trade, 'ENTRY');
  const trStop  = getKV(trade, 'STOP');
  const trT1    = getKV(trade, 'T1');
  const trT2    = getKV(trade, 'T2');
  const trSize  = getKVQ(trade, 'SIZE');
  const trAvoid = getKVQ(trade, 'AVOID');

  const vrd = D.VERDICT || '';
  const vRating  = getKVQ(vrd, 'RATING');
  const vStars   = getKV(vrd, 'STARS') || '3';
  const vConv    = getKVQ(vrd, 'CONVICTION');
  const vBottom  = vrd.replace(/\w+=(?:"[^"]*"|\S+)\s*/g, '').trim();

  const storyParas = (D.STORY || '').split(/\n\n+/).map(p => `<p>${p.trim()}</p>`).join('');

  // ── Interactive quadrant chart ───────────────────────────────────────────────
  const quadHTML = quadrantChart(results);

  const starStr    = '★'.repeat(+vStars) + '☆'.repeat(Math.max(0, 5 - +vStars));

  // ── Render supply chain boxes (auto-color by leading emoji) ─────────────────
  const supplyBoxes = supplyItems.map(item => {
    const cls = item.startsWith('✅') || item.startsWith('🟢') ? 'bull' : item.startsWith('⚠️') || item.startsWith('🔴') ? 'bear' : 'neutral';
    return `<div class="box ${cls}"><p style="font-size:14px;margin:0">${item}</p></div>`;
  }).join('');

  // ── Source links ─────────────────────────────────────────────────────────────
  const sourceLinks = sources.length
    ? `<ul class='list'>${sources.map(s => { const [name, url] = s.split(' '); return `<li>${url ? `<a href="${url}" target="_blank">${name}</a>` : name}</li>`; }).join('')}</ul>`
    : '<p style="color:var(--muted)">Yahoo Finance via Node.js yahoo-finance2</p>';

  // ── Build HTML ────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${TICKER} — ${NAME} Research | ${dateStr}</title>
<style>${CSS}</style></head><body><div class="w">

<div class="hero">
<div class="ey"><span>📊 Research</span><span>•</span><span>${TICKER}</span><span>•</span><span>${dateStr}</span><span>•</span>
<span class="badge bv">Momentum · Med Risk · ½ Pos · 3–6Mo</span>
<span class="badge ba">⚡ ${fetchMs}ms fetch</span></div>
<h1>${NAME} <span class="gold">Inc.</span></h1>
<p class="sub">${D.DESC || ''}</p>
<div class="mg">
${kpi('Price', `$${f2(T.price)}`, dateStr, 'big')}
${kpi('Market Cap', fB(F.mktcap), `${f2(F.sharesB)}B shares`)}
${kpi('YTD Return', `${ps(T.rYtd)}%`, `vs SPY ${ps(spy.ytd)}%`, cc(T.rYtd))}
${kpi('1-Month', `${ps(T.r1m)}%`, '30-day', cc(T.r1m))}
${kpi('52-Wk Range', `$${f2(T.w52l)}–$${f2(T.w52h)}`, 'High/Low')}
${kpi('Next Earnings', D.NEXT_EARNINGS || '—')}
${kpi('Analyst Rating', F.rec || '—', `${F.nAnalysts || '?'} analysts · Mean $${f2(F.tgtMean)}`, 'pos')}
${kpi('Revenue TTM', fB(F.rev), `+${fP(F.revGr)} YoY`)}
</div>
<div class="dir">${D.SETUP || ''}</div></div>

${integBadge}

<div class="s"><details>
<summary><div><strong style="font-size:21px">🧒 ELI5 — What is ${TICKER}?</strong><div style="color:var(--muted);font-size:14px">Click to expand</div></div><span style="font-size:12px;border:1px solid rgba(255,255,255,.1);padding:5px 10px;border-radius:999px">▼</span></summary>
<div class="eli">${(() => {  const raw = (D.ELI5 || '').trim();  if (raw) {    const paras = raw.split('\n').map(p => p.trim()).filter(Boolean);    return paras.map(p => `<p style=\"margin:0 0 12px;line-height:1.6\">${p.replace(/\n/g,' ')}</p>`).join('');  }  return `<p style=\"margin:0 0 8px;color:var(--muted);font-style:italic\">⚠️ No ELI5: provided in report. Add an ELI5: field to ${TICKER}_report.txt explaining the business in plain English (what they sell, who pays, how they make money).</p>` + bullets(bullItems.slice(0, 3));})()}</div></details></div>

<div class="s"><h2>📖 Investment Story</h2><div class="panel"><div class="two">
<div>${storyParas}</div>
<div>
<div class="box bull" style="margin-bottom:14px"><div class="label">🐂 Bull Case</div>${li(bullItems)}</div>
<div class="box bear"><div class="label">🐻 Bear Case</div>${li(bearItems)}</div>
</div></div></div></div>

<div class="s"><h2>🌐 Sector Rotation</h2><div class="panel">
<div class="tw"><table><thead><tr><th>Name</th><th>Price</th><th>1M</th><th>YTD</th><th>${TICKER} vs YTD</th></tr></thead><tbody>
<tr style="background:rgba(178,103,255,.08)"><td><strong>${TICKER} ★</strong></td><td>$${f2(T.price)}</td><td class="${cc(T.r1m)}">${ps(T.r1m)}%</td><td class="${cc(T.rYtd)}">${ps(T.rYtd)}%</td><td>—</td></tr>
<tr><td>${sector}</td><td>$${etf.p}</td><td class="${cc(etf.r1)}">${ps(etf.r1)}%</td><td class="${cc(etf.ytd)}">${ps(etf.ytd)}%</td><td class="${cc(T.rYtd - (etf.ytd || 0))}">${T.rYtd && etf.ytd ? ps((T.rYtd - etf.ytd).toFixed(1)) + 'pp' : '—'}</td></tr>
<tr><td>SPY</td><td>$${spy.p}</td><td class="${cc(spy.r1)}">${ps(spy.r1)}%</td><td class="${cc(spy.ytd)}">${ps(spy.ytd)}%</td><td class="${cc(T.rYtd - (spy.ytd || 0))}">${T.rYtd && spy.ytd ? ps((T.rYtd - spy.ytd).toFixed(1)) + 'pp' : '—'}</td></tr>
</tbody></table></div>
<p style="margin-top:14px;color:var(--muted)">${D.SECTOR || ''}</p></div></div>

<div class="s"><h2>🔬 Peer Comparison</h2><div class="panel">
<div class="tw"><table><thead><tr><th>Ticker</th><th>MktCap</th><th>Fwd P/E</th><th>EV/EBITDA</th><th>Rev Gr</th><th>Gross Mgn</th><th>Net Mgn</th><th>FCF Yield</th><th>RSI</th><th>1M</th><th>YTD</th></tr></thead><tbody>
${peerRow(TICKER, F, T, true)}
${peers.map(p => peerRow(p.sym, p.f, p.t, false)).join('\n')}
</tbody></table></div>
${quadHTML}
<div class="g g2" style="margin-top:14px">
<div class="call">${D.PEER1 || ''}</div>
<div class="call">${D.PEER2 || ''}</div>
</div></div></div>

<div class="s"><h2>🏗️ Supply Chain / Dependencies</h2><div class="panel">
<div class="g g3">${supplyBoxes}</div></div></div>

<div class="s"><h2>🕵️ Insider Activity</h2><div class="panel">
<div class="g g2" style="margin-bottom:14px">
<div><p>📎 <a href="https://www.dataroma.com/m/stock.php?sym=${TICKER}" target="_blank">Dataroma — ${TICKER}</a></p>
<p>📎 <a href="https://www.dataroma.com/m/ins/ins.php?t=y&sym=${TICKER}&o=fd&d=d" target="_blank">Dataroma Insiders</a></p></div>
<div class="box ${+insScore >= 7 ? 'bull' : +insScore <= 3 ? 'bear' : 'neutral'}">
<div class="label">YTD Insider Summary</div>
<div class="value">Buys: <span class="pos">${insBuys}</span></div>
<div class="small">Sells: ${insSells}</div></div></div>
<div class="box neutral"><div class="label">Signal Quality Analysis</div>
<p style="font-size:14px;margin-top:8px">${insSignal}</p></div>
<div class="g g2" style="margin-top:12px">
${kpi('Sentiment', insSent || '—')}
${kpi('Conviction Score', `${insScore} / 10`, '1 = heavy sell · 10 = cluster buy', +insScore >= 7 ? 'pos' : +insScore <= 3 ? 'neg' : 'neu')}
</div></div></div>

<div class="s"><h2>⚡ Catalysts & News</h2><div class="panel"><div class="g g2">
<div class="box bull"><div class="label">🐂 Bullish Catalysts</div>${li(catalysts)}</div>
<div><div class="box bear" style="margin-bottom:14px"><div class="label">🐻 Bearish / Risks</div>${li(risks)}</div>
<div class="box neutral"><div class="label">📅 Upcoming Events</div>${li(upcoming)}</div></div>
</div></div></div>

<div class="s"><h2>🤖 AI Threat & Opportunity</h2><div class="panel">
<div class="g g2">
<div class="box bull"><div class="label">✅ AI Opportunity</div>${li(aiOpp)}</div>
<div class="box bear"><div class="label">⚠️ AI Threat</div>${li(aiThr)}</div></div>
<div class="call" style="margin-top:14px"><strong class="gold">Net AI Assessment:</strong> ${D.AI_NET || ''}</div>
</div></div>

<div class="s"><h2>💰 Valuation</h2><div class="panel">
<div class="g4 g" style="margin-bottom:16px">
${kpi('Price', `$${f2(T.price)}`, dateStr, 'big')}
${kpi('Market Cap', fB(F.mktcap))}
${kpi('Fwd P/E', F.fwdPE ? `${f2(F.fwdPE)}x` : '—', `$${f2(F.epsF)} fwd EPS`)}
${kpi('EV/EBITDA', F.evEbitda ? `${f2(F.evEbitda)}x` : '—')}
${kpi('P/Sales', F.ps ? `${f2(F.ps)}x` : '—')}
${kpi('FCF Yield', fP(F.fcfYield), fB(F.fcf) + ' FCF TTM', cc(F.fcfYield))}
${kpi('PEG', f2(F.peg), +F.peg < 1 ? '< 1.0 — growth discount' : 'Premium')}
${kpi('Analyst Target', `$${f2(F.tgtMean)}`, `${F.nAnalysts || '?'} analysts · ${upside ? upside + '% upside' : ''}`, upside && +upside > 0 ? 'pos' : 'neg')}
</div>
<p style="font-size:14px;margin-top:0">${valMethod}</p>
<div class="box bull" style="margin-top:14px">
<div class="label">📊 Blended Fair Value</div>
<div style="font-size:24px;font-weight:900;color:var(--green);margin-top:8px">${fairVal}</div>
<p style="font-size:14px;margin-top:8px">Upside: <strong class="pos">${valUpside}</strong> · Bear floor: ${bearFloor}</p>
</div></div></div>

<div class="s"><h2>📉 Technical Setup</h2><div class="panel">
<div class="g4 g" style="margin-bottom:14px">
${kpi('Price', `$${f2(T.price)}`, '', 'big')}
${kpi('50D MA', `$${f2(T.ma50)}`, `${ps(T.vs50)}% vs price`, cc(T.vs50))}
${kpi('200D MA', `$${f2(T.ma200)}`, `${ps(T.vs200)}% vs price`, cc(T.vs200))}
${kpi('Golden Cross', T.gc ? '<span class="pos">YES ✅</span>' : '<span class="neg">NO ⚠️</span>', '50D vs 200D')}
${kpi('RSI-14', f2(T.rsi), +T.rsi > 70 ? 'Overbought' : +T.rsi < 30 ? 'Oversold' : 'Neutral', +T.rsi > 70 ? 'neg' : +T.rsi < 30 ? 'pos' : 'neu')}
${kpi('MACD', +T.macd > 0 ? '<span class="pos">Bullish</span>' : '<span class="neg">Bearish</span>', `Line: ${f2(T.macd)}`)}
${kpi('ADX-14', f2(T.adx), +T.adx > 25 ? 'Trending' : +T.adx > 20 ? 'Developing' : 'Weak', +T.adx > 25 ? 'pos' : 'neu')}
${kpi('A/D Line', T.adTrend === 'confirming' ? '<span class="pos">Confirming ✅</span>' : '<span class="neg">Diverging ⚠️</span>', '20-day')}
</div>
<div class="g g2" style="margin-bottom:14px">
${kpi('52-Wk High', `$${f2(T.w52h)}`)} ${kpi('52-Wk Low', `$${f2(T.w52l)}`)}
${kpi('20D High/Low', `$${f2(T.hi20)} / $${f2(T.lo20)}`, 'Recent range')}
${kpi('10D High/Low', `$${f2(T.hi10)} / $${f2(T.lo10)}`, 'Near-term')}
${kpi('Vol vs 30D Avg', `${ps(T.volPct)}%`, `Last: ${T.lastVol?.toLocaleString() || '—'}`, cc(T.volPct))}
${kpi('YTD/3M/1M', `<span class="${cc(T.rYtd)}">${ps(T.rYtd)}%</span> / <span class="${cc(T.r3m)}">${ps(T.r3m)}%</span> / <span class="${cc(T.r1m)}">${ps(T.r1m)}%</span>`, '')}
</div></div></div>

<div class="s"><h2>🎯 Trade Plan</h2><div class="panel">
<div class="tw"><table><thead><tr><th>Entry</th><th>Stop</th><th>Target 1</th><th>Target 2</th><th>Size</th><th>Avoid</th></tr></thead>
<tbody><tr>
<td class="pos"><strong>${trEntry}</strong></td>
<td class="neg">${trStop}</td>
<td class="pos">${trT1}</td>
<td class="pos">${trT2}</td>
<td>${trSize}</td>
<td>${trAvoid}</td>
</tr></tbody></table></div>
<div class="g g3" style="margin-top:14px">
<div class="box neutral"><div class="label">Entry</div><p style="font-size:14px;margin:6px 0 0">${trEntry}</p></div>
<div class="box bull"><div class="label">Targets</div><p style="font-size:14px;margin:6px 0 0">T1: ${trT1} &nbsp;|&nbsp; T2: ${trT2}</p></div>
<div class="box bear"><div class="label">Stop / Avoid</div><p style="font-size:14px;margin:6px 0 0">Stop: ${trStop}<br>${trAvoid}</p></div>
</div></div></div>

<div class="s"><h2>🏆 Final Verdict</h2><div class="vbox"><div class="two">
<div><div class="label">Rating</div>
<div class="vr">${vRating}</div>
<div style="font-size:20px;color:var(--muted);margin-top:4px">${starStr}</div>
<p style="font-size:14px;margin-top:16px">${vBottom}</p></div>
<div class="g g2" style="gap:12px">
${kpi('Price', `$${f2(T.price)}`)}
${kpi('Fair Value', fairVal, '', 'pos')}
${kpi('Upside', valUpside || (upside ? '+' + upside + '%' : '—'), 'to fair value', 'pos')}
${kpi('Bear Floor', bearFloor)}
${kpi('Ideal Entry', trEntry, '', 'pos')}
${kpi('Stop Loss', trStop, '', 'neg')}
${kpi('Targets', `${trT1} → ${trT2}`)}
${kpi('Max Position', '½ Position', '¼ starter first', 'neu')}
${kpi('Conviction', vConv || '—')}
${kpi('Insider Score', `${insScore} / 10`, '', +insScore >= 7 ? 'pos' : +insScore <= 3 ? 'neg' : 'neu')}
${divYield ? kpi('Div Yield', divYield + '%', `$${f2(F.divRate)}/yr`) : kpi('Dividend', 'None', 'Price only')}
${kpi('Horizon', '3–6 Months')}
</div></div></div></div>

<div class="s"><div class="panel" style="color:var(--muted);font-size:13px">
<h2 style="color:var(--gold)">📎 Sources</h2>${sourceLinks}
<hr><p style="font-size:12px">Not financial advice. Data: ${dateStr} in ${fetchMs}ms via Node.js yahoo-finance2. Arena.ai Agent Mode.</p>
</div></div>

</div></body></html>`;

  const out = `${TICKER.toLowerCase()}_rich_report.html`;
  fs.writeFileSync(out, html);
  const total = Date.now() - t0;
  process.stderr.write(`[stockmd] ✓ ${out} — ${(html.length / 1024).toFixed(0)}KB — total ${total}ms\n`);
  console.log(out);
})();
// ── APPENDED: Number cross-check guard ──
// Runs after HTML write. Warns if agent's prose values deviate from script.
```

---

## COMPLETE EXECUTION CHECKLIST

Copy this into chat when running a new ticker. Check off each step.

```
[ ] 0. DELETE old report files: rm -f {PREV_TICKER}_data.json {PREV_TICKER}_report.txt {prev_ticker}_rich_report.html
[ ] 1. Identify peers → output: PEERS line
[ ] 2. Confirm stockfetch.js exists (extract from this .md if needed)
[ ] 3. Run: node stockfetch.js {TICKER} {PEER1} {PEER2} {PEER3} {PEER4} {PEER5}
[ ] 3b. Run: node insiderfetch.js {TICKER} to get definitive 6-month insider activity
[ ] 4. Confirm {TICKER}_data.json exists and price/ratios look reasonable
[ ] 5. Read the JSON summary output completely
[ ] 6. Web research: earnings + guidance (search)
[ ] 7. Read output from `node insiderfetch.js` for definitive SEC insider activity
[ ] 8. Web research: catalysts, moat, AI, supply chain
[ ] 9. Write {TICKER}_report.txt using ONLY numbers from the JSON
[ ]    — verify: every price/ratio/return in txt matches _data.json
[ ] 10. Confirm stockmd.js exists (extract from this .md if needed)
[ ] 11. Run: node stockmd.js {TICKER}_report.txt
[ ] 12. Open {ticker}_rich_report.html and verify numbers match JSON
[ ] 13. Check the DATA INTEGRITY badge — must show ✅ VERIFIED (green)
        If ⚠️ PARTIAL or ❌ DRIFT: fix DATA_INTEGRITY line in report.txt and re-run
[ ] 14. Hover over quadrant plot dots to verify peer tooltip metrics appear
[ ] 15. Workspace is clean: only the 4 uploaded files + 3 new report files
```

---

## DATA INTEGRITY RULES

**These are non-negotiable:**

1. **Price in report.txt = price in _data.json.** If they differ, the txt is wrong.
2. **Fwd P/E, EV/EBITDA, margins, returns** — all from JSON, never estimated.
3. **Analyst mean target** — from JSON `fund.tgtMean`. Upside% calculated as `(tgtMean - price) / price * 100`.
4. **Peer table numbers** — from JSON `peerTable` array. No estimates.
5. **Trade plan levels (ENTRY, STOP, T1, T2)** — agent's judgment, not from Yahoo. These are the only numbers the agent may set independently.
6. **DATA_INTEGRITY field** — must be filled by copying stockfetch.js stdout values verbatim. `stockmd.js` cross-checks these on every run and shows:
   - ✅ `VERIFIED` badge (green) — all anchor numbers match within 2% tolerance
   - ⚠️ `PARTIAL` badge (amber) — 1-2 numbers drifted, possible news vs Yahoo lag
   - ❌ `DRIFT` badge (red) — 3+ numbers wrong; agent must re-read data and fix report

**If stockfetch.js fails for a symbol**, note `[DATA UNAVAILABLE]` for that ticker's peer row. Never fill in numbers from memory.

---

## QUICK REFERENCE: PLAIN TEXT KEY GLOSSARY

| Key | What to write |
|-----|--------------|
| TICKER | Symbol only, e.g. `GEHC` |
| NAME | Full company name |
| PEERS | Space-separated symbols |
| DESC | 3–5 segment descriptors separated by ` · ` |
| NEXT_EARNINGS | Human-readable date, e.g. `Late July 2026` |
| SETUP | One sentence — price context + key signal |
| STORY | 3 paragraphs separated by blank lines |
| BULL | Pipe-separated items (6–8 items) |
| BEAR | Pipe-separated items (5–7 items) |
| SECTOR | One paragraph prose |
| PEER1 / PEER2 | One sentence each |
| SUPPLY | Pipe-separated, start items with ✅🟢⚠️🔴 |
| INSIDER | `SCORE=N SENTIMENT=X BUYS=... SELLS=...` then signal analysis |
| AI_OPP | Pipe-separated (4–5 items) |
| AI_THR | Pipe-separated (2–4 items) |
| AI_NET | One sentence |
| VAL_BASE/BULL/BEAR | `TARGET=$X \| Assumption 1` |
| VAL_METHOD | Detailed prose explaining Sector-Specific Valuation Lens, Target Multiple Assumptions, WACC, and DCF formula |
| VAL_MATRIX | Multiline pipe-separated table: `TICKER \| Price \| Multiple Val \| DCF Val \| Analyst Tgt \| Blended Val \| Upside% \| Verdict` |
| SUPPLY_UP | Pipe-separated list of Upstream Suppliers (e.g. `Broadcom (AVGO) - ASICs`) |
| SUPPLY_DOWN | Pipe-separated list of Downstream Customers (e.g. `Microsoft (MSFT) - 26% Rev`) |
| SUPPLY_SIGNALS | Multiline pipe-separated table of recent earnings signals: `Company \| Relationship (Supplier/Customer) \| Result (Beat/Miss) \| Implication` |
| SUPPLY_RISK | `Risk Level (High/Med/Low) \| Detailed analysis of systemic/idiosyncratic risks, geo-political chokepoints, and exact impact on margins` | Description of dependency risks` |
| CATALYSTS_HIST | Multiline pipe-separated table: `Date \| Catalyst Name \| Type (Earnings/Event/Product) \| Impact (Positive/Negative) \| Detail/Source` | `TARGET=$X \| Assumption 1 \| Assumption 2` (Base must = TGTMEAN. Bull > Base. Bear < Base) |
| CATALYSTS | Pipe-separated (5–6 items) |
| RISKS | Pipe-separated list of `Title ~ Impact(High/Medium/Low) ~ Category ~ Description` |
| UPCOMING | Pipe-separated (3–4 items) |
| TRADE | `ENTRY=$X STOP=$Y T1=$A T2=$B SIZE=... CONFIRM=... AVOID=...` — if SIZE is scaled (¼ starter / add ¼), CONFIRM MUST define the exact observable trigger (price level, MA reclaim, volume, or event) for the add. |
| VERDICT | `RATING=... STARS=N CONVICTION=...` then `BOTTOM=Prescriptive, definitive stance. No generic filler. Synthesize supply chain, risks, and valuation to make a firm call. Use the actual COMPANY NAME (not just the ticker). Do not give conflicting statements; weigh the risks but take a definitive stand.` |
| SOURCES | `Name URL` pairs separated by pipes |
| DATA_INTEGRITY | Copy exact values from `stockfetch.js` stdout. `PRICE=X FWDPE=X TGTMEAN=X REVGR=X MA50=X MA200=X W52H=X W52L=X ROIC=X WACC=X VALUE_SPREAD=X FSCORE=N/9 EVA_SPREAD=X CASH_CONV=X MOS=X COMPOSITE=X SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=YYYY-MM-DD` |

---

*Not financial advice. This playbook is for research and educational purposes only.*
