#!/usr/bin/env node
'use strict';
const yahooFinance = require('yahoo-finance2').default;
const yf = new yahooFinance({ suppressNotices: ['yahooSurvey'] });
const fs = require('fs');
const { getATR, getRSI, getSMA, getMACD, getADX } = require('../lib/indicators.js');
const { sanityCheck } = require('../lib/sanity.js');

const args = process.argv.slice(2);
if (!args.length) { console.error('Usage: node stockfetch.js TICKER [PEER1 PEER2 ...]'); process.exit(1); }
const TICKER = args[0].toUpperCase();
const PEERS = args.slice(1).map(s => s.toUpperCase());

function computeTech(quotes) {
  if (!quotes || quotes.length < 30) return { error: 'insufficient history' };
  
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
    goldenCross: ma50 != null && ma200 != null ? ma50 > ma200 : null,
    rsi: rsi ? +rsi.toFixed(2) : null,
    macd: macd ? +macd.toFixed(3) : null,
    adx: adx ? +adx.toFixed(2) : null,
    avg30Vol: avg30, lastVol, volPct,
    rYtd,
    r1m: n >= 21 ? +((last / closes[n-21] - 1)*100).toFixed(2) : null
  };
}

function extractFund(qs) {
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
async function fetchOne(sym) {
  const d1 = Math.floor(Date.now()/1000) - 370*24*3600;
  const [qs, ch] = await Promise.all([
    yf.quoteSummary(sym, { modules: ['price','defaultKeyStatistics','financialData','summaryDetail'] }).catch(() => null),
    yf.chart(sym, { period1: d1, interval: '1d' }).catch(() => null),
  ]);
  const fund = extractFund(qs);
  const tech = computeTech(ch?.quotes || []);
  return { sym, fund, tech };
}

(async () => {
  const allSyms = [TICKER, ...PEERS];
  const results = await Promise.all(allSyms.map(fetchOne));
  fs.writeFileSync(`${TICKER}_data.json`, JSON.stringify(results, null, 2));
  console.log(`[stockfetch] ✓ Wrote ${TICKER}_data.json with fixed ROIC and Wilder's Technicals.`);
})();function fund(qs) {
  if (!qs) return {};
  const p = qs.price || {}, k = qs.defaultKeyStatistics || {}, fd = qs.financialData || {}, sd = qs.summaryDetail || {}, esg = qs.esgScores || {};
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
    rec: typeof fd.recommendationKey === 'string' ? fd.recommendationKey.toUpperCase().replace('_', ' ') : null,
    nAnalysts: fd.numberOfAnalystOpinions ?? null,
    sector: k.sector || null,
    envScore: esg.environmentScore, socScore: esg.socialScore, govScore: esg.governanceScore,
    wacc: wacc ? +(wacc * 100).toFixed(2) : null, roic: roic ? +(roic * 100).toFixed(2) : null
  };
  
  return rawData;
}
async function fetchOne(sym) {
  const d1 = Math.floor(Date.now()/1000) - 370*24*3600;
  const [qs, ch] = await Promise.all([
    yf.quoteSummary(sym, { modules: ['price','defaultKeyStatistics','financialData','summaryDetail'] }).catch(() => null),
    yf.chart(sym, { period1: d1, interval: '1d' }).catch(() => null),
  ]);
  const fund = extractFund(qs);
  const tech = computeTech(ch?.quotes || []);
  return { sym, fund, tech };
}

(async () => {
  const allSyms = [TICKER, ...PEERS];
  const results = await Promise.all(allSyms.map(fetchOne));
  fs.writeFileSync(`${TICKER}_data.json`, JSON.stringify(results, null, 2));
  console.log(`[stockfetch] ✓ Wrote ${TICKER}_data.json with fixed ROIC and Wilder's Technicals.`);
})();
