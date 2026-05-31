#!/usr/bin/env node
'use strict';

const yahooFinance = require('yahoo-finance2').default;
const yf = new yahooFinance({ suppressNotices: ['yahooSurvey'] });
const fs = require('fs');
const { getRSI, getSMA, getMACD, getADX } = require('../lib/indicators.js');
const { computeValuation } = require('../lib/valuation.js');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node stockfetch.js TICKER [PEER1 PEER2 ...]');
  process.exit(1);
}

const TICKER = args[0].toUpperCase();
const PEERS = args.slice(1).map(s => s.toUpperCase());

function safeNum(v, digits = 2) {
  return v != null && !Number.isNaN(v) ? +(+v).toFixed(digits) : null;
}

function computeTech(quotes) {
  if (!quotes || quotes.length < 30) return { error: 'insufficient history' };

  const closes = quotes.map(q => q.close).filter(v => v != null);
  const highs = quotes.map(q => q.high).filter(v => v != null);
  const lows = quotes.map(q => q.low).filter(v => v != null);
  const vols = quotes.map(q => q.volume).filter(v => v != null);
  const n = closes.length;
  const last = closes[n - 1];

  const ma50 = getSMA(closes, 50);
  const ma200 = getSMA(closes, 200);
  const rsi = getRSI(quotes, 14);
  const macd = getMACD(quotes);
  const adx = getADX(quotes, 14);

  const avg30 = getSMA(vols, 30);
  const lastVol = vols[n - 1];
  const volPct = avg30 > 0 ? safeNum(((lastVol - avg30) / avg30) * 100) : null;

  const yr = new Date().getFullYear();
  const ytdStart = quotes.find(q => new Date(q.date).getFullYear() === yr)?.close || closes[0];
  const rYtd = safeNum(((last / ytdStart) - 1) * 100);
  const r1m = n >= 21 ? safeNum(((last / closes[n - 21]) - 1) * 100) : null;

  const trailingHighs = highs.slice(-252);
  const trailingLows = lows.slice(-252);

  return {
    price: safeNum(last),
    ma50: safeNum(ma50),
    ma200: safeNum(ma200),
    vs50: ma50 ? safeNum(((last - ma50) / ma50) * 100) : null,
    vs200: ma200 ? safeNum(((last - ma200) / ma200) * 100) : null,
    goldenCross: ma50 != null && ma200 != null ? ma50 > ma200 : null,
    rsi: safeNum(rsi),
    macd: safeNum(macd, 3),
    adx: safeNum(adx),
    avg30Vol: avg30 != null ? Math.round(avg30) : null,
    lastVol,
    volPct,
    rYtd,
    r1m,
    w52h: trailingHighs.length ? safeNum(Math.max(...trailingHighs)) : null,
    w52l: trailingLows.length ? safeNum(Math.min(...trailingLows)) : null,
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

  const totalDebt = fd.totalDebt || 0;
  const marketCap = p.marketCap || 0;

  let bookEquity = 0;
  if (k.bookValue && k.sharesOutstanding) {
    bookEquity = k.bookValue * k.sharesOutstanding;
  } else if (marketCap > 0 && sd.priceToBook > 0) {
    bookEquity = marketCap / sd.priceToBook;
  }

  const val = computeValuation({
    operatingMargin: fd.operatingMargins,
    totalRevenue: fd.totalRevenue,
    totalDebt,
    bookEquity,
    cash: fd.totalCash,
    marketCap,
    beta: sd.beta ?? k.beta,
    debtToEquity: fd.debtToEquity,
    sector: k.sector,
    priceToBook: sd.priceToBook,
    returnOnEquity: fd.returnOnEquity,
    interestExpense: fd.interestExpense,
  });

  return {
    mktcap: bil(p.marketCap),
    fwdPE: r2(k.forwardPE),
    evEbitda: r2(k.enterpriseToEbitda),
    evRev: r2(k.enterpriseToRevenue),
    ps: r2(k.priceToSalesTrailing12Months ?? sd.priceToSalesTrailing12Months),
    peg: r2(k.pegRatio),
    revGr: pct(fd.revenueGrowth),
    grossMgn: pct(fd.grossMargins),
    opMgn: pct(fd.operatingMargins),
    netMgn: pct(fd.profitMargins),
    de: fd.debtToEquity != null ? +(fd.debtToEquity / 100).toFixed(3) : null,
    fcf: bil(fd.freeCashflow),
    fcfYield: fd.freeCashflow && marketCap ? pct(fd.freeCashflow / marketCap) : null,
    roe: pct(fd.returnOnEquity),
    divRate: sd.dividendRate ?? null,
    epsT: r2(k.trailingEps),
    epsF: r2(fd.earningsPerShare ?? k.forwardEps),
    rev: bil(fd.totalRevenue),
    sharesB: bil(k.sharesOutstanding),
    instPct: pct(k.heldPercentInstitutions),
    insPct: pct(k.heldPercentInsiders),
    beta: r2(sd.beta ?? k.beta),
    tgtMean: r2(fd.targetMeanPrice),
    tgtHigh: r2(fd.targetHighPrice),
    tgtLow: r2(fd.targetLowPrice),
    name: p.shortName || p.longName || null,
    sector: k.sector || null,
    rec: typeof fd.recommendationKey === 'string'
      ? fd.recommendationKey.toUpperCase().replace('_', ' ')
      : null,
    nAnalysts: fd.numberOfAnalystOpinions ?? null,
    envScore: esg.environmentScore,
    socScore: esg.socialScore,
    govScore: esg.governanceScore,
    wacc: val.wacc,
    roic: val.roic,
    valueSpread: val.spread,
    roicNaive: val.roicNaive,
    roicAdjusted: val.roicAdjusted,
    valuationBasis: val.basisLabel,
    valuationRegime: val.regime,
    valuationFlag: val.artifactFlag,
    investedCapitalB: val.investedCapitalB,
    financeArmDebtB: val.financeArmDebtB,
    costOfEquityPct: val.costOfEquityPct,
    costOfDebtPreTaxPct: val.costOfDebtPreTaxPct,
  };
}

async function fetchOne(sym) {
  const d1 = Math.floor(Date.now() / 1000) - 370 * 24 * 3600;
  const [qs, ch] = await Promise.all([
    yf.quoteSummary(sym, {
      modules: ['price', 'defaultKeyStatistics', 'financialData', 'summaryDetail']
    }).catch(() => null),
    yf.chart(sym, { period1: d1, interval: '1d' }).catch(() => null),
  ]);

  return {
    sym,
    fund: extractFund(qs),
    tech: computeTech(ch?.quotes || []),
  };
}

(async () => {
  const allSyms = [TICKER, ...PEERS];
  const results = await Promise.all(allSyms.map(fetchOne));
  fs.writeFileSync(`${TICKER}_data.json`, JSON.stringify(results, null, 2));

  const primary = results[0] || {};
  const f = primary.fund || {};
  const t = primary.tech || {};
  const fetchDate = new Date().toISOString().slice(0, 10);

  console.log(`[stockfetch] ✓ Wrote ${TICKER}_data.json with unified valuation math.`);
  console.log(`DATA_INTEGRITY: PRICE=${t.price ?? 'NA'} FWDPE=${f.fwdPE ?? 'NA'} TGTMEAN=${f.tgtMean ?? 'NA'} REVGR=${f.revGr ?? 'NA'} MA50=${t.ma50 ?? 'NA'} MA200=${t.ma200 ?? 'NA'} W52H=${t.w52h ?? 'NA'} W52L=${t.w52l ?? 'NA'} ROIC=${f.roic ?? 'NA'} WACC=${f.wacc ?? 'NA'} VALUE_SPREAD=${f.valueSpread ?? 'NA'} SOURCE=Yahoo-Finance-yahoo-finance2 FETCHDATE=${fetchDate}`);
})();
