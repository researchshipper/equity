#!/usr/bin/env node
/**
 * newsbeat.js — Market Beat: autonomous fetch + score + emit report.json
 *
 * This is the "robot" path: fetch live finance pages, heuristically score
 * headlines, write a conformant report.json, then call render.js to HTML.
 *
 * For the higher-quality "LLM-authored" path:
 *   1. The agent reads PROMPT.md and writes report.json directly.
 *   2. Then run:  node render.js   (fast, deterministic).
 *
 * Both paths share render.js → identical visual output.
 *
 * Usage:
 *   node newsbeat.js                                   # fetch → score → report.json → HTML
 *   node newsbeat.js --json-only                       # just write report.json, skip HTML
 *   node newsbeat.js --no-render                       # alias for --json-only
 *   node newsbeat.js --date=2026-06-02
 *   node newsbeat.js --out report.2026-06-02.json
 *
 * Requires: Node >= 20 (uses global fetch). No npm deps.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { renderReport } = require('./render.js');

// Optional RSS+HTML source registry (sources.js). If present, we use the full
// 20+ feed registry; otherwise fall back to the small CONFIG.sources list.
let SOURCES_REGISTRY = null, fetchAllSources = null, dedupeSources = null;
try {
  const s = require('./sources.js');
  SOURCES_REGISTRY = s.SOURCES;
  fetchAllSources  = s.fetchAll;
  dedupeSources    = s.dedupe;
} catch (_) { /* sources.js not present — fall back to legacy fetch */ }

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const CONFIG = {
  // sources can be:
  //   null  → use the full sources.js registry (20+ RSS+HTML feeds)
  //   array → use just these (HTML-only legacy mode)
  sources: null,
  // legacy fallback list when sources.js isn't available:
  legacySources: [
    { name: 'Yahoo Finance',   url: 'https://finance.yahoo.com/',                            weight: 3 },
    { name: 'Yahoo Markets',   url: 'https://finance.yahoo.com/topic/stock-market-news/',    weight: 3 },
    { name: 'CNBC',            url: 'https://www.cnbc.com/finance/',                         weight: 2 },
    { name: 'Reuters Markets', url: 'https://www.reuters.com/markets/',                      weight: 2 },
    { name: 'MarketWatch',     url: 'https://www.marketwatch.com/latest-news',               weight: 1 },
  ],
  maxHeadlines: 25,
  outputDir: __dirname,
  title: 'Market Beat — News Impact Analysis',
  region: 'GLOBAL',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

// ─── TICKER KB (subset) ─────────────────────────────────────────────────────
const TICKER_DB = {
  NVDA:{n:'Nvidia',s:'AI/CHIPS',peers:['AMD','MRVL','AVGO','TSM','INTC']},
  AMD:{n:'AMD',s:'AI/CHIPS',peers:['NVDA','INTC','MRVL']},
  INTC:{n:'Intel',s:'SEMIS',peers:['NVDA','AMD']},
  MRVL:{n:'Marvell',s:'AI/CHIPS',peers:['NVDA','AVGO','TSM']},
  AVGO:{n:'Broadcom',s:'AI/CHIPS',peers:['NVDA','MRVL']},
  TSM:{n:'Taiwan Semi',s:'FOUNDRY',peers:['NVDA','MU']},
  MU:{n:'Micron',s:'MEMORY',peers:['TSM','NVDA']},
  AAPL:{n:'Apple',s:'TECH',peers:['GOOGL','MSFT']},
  MSFT:{n:'Microsoft',s:'AI/CLOUD',peers:['GOOGL','AMZN','SNOW']},
  GOOGL:{n:'Alphabet',s:'AI/INTERNET',peers:['META','MSFT']},
  GOOG:{n:'Alphabet C',s:'AI/INTERNET',peers:['META','MSFT']},
  AMZN:{n:'Amazon',s:'AI/CLOUD',peers:['MSFT','GOOGL']},
  META:{n:'Meta',s:'AI/SOCIAL',peers:['GOOGL']},
  TSLA:{n:'Tesla',s:'EV/TECH',peers:['F','GM']},
  PANW:{n:'Palo',s:'CYBERSECURITY',peers:['ZS','CRWD','FTNT','OKTA']},
  ZS:{n:'Zscaler',s:'CYBERSECURITY',peers:['PANW','CRWD']},
  CRWD:{n:'CrowdStrike',s:'CYBERSECURITY',peers:['PANW','ZS']},
  FTNT:{n:'Fortinet',s:'CYBERSECURITY',peers:['PANW','ZS']},
  OKTA:{n:'Okta',s:'CYBERSECURITY',peers:['PANW']},
  XOM:{n:'Exxon',s:'ENERGY',peers:['CVX','OXY','BP']},
  CVX:{n:'Chevron',s:'ENERGY',peers:['XOM','BP']},
  OXY:{n:'Occidental',s:'ENERGY',peers:['XOM','CVX']},
  SLB:{n:'Schlumberger',s:'OIL SVCS',peers:['HAL','BKR']},
  HAL:{n:'Halliburton',s:'OIL SVCS',peers:['SLB']},
  BP:{n:'BP',s:'ENERGY',peers:['XOM','CVX']},
  GS:{n:'Goldman',s:'FINANCE',peers:['MS','JPM','BAC']},
  MS:{n:'Morgan',s:'FINANCE',peers:['GS','JPM']},
  JPM:{n:'JPMorgan',s:'FINANCE',peers:['GS','MS','BAC']},
  BAC:{n:'Bank of America',s:'FINANCE',peers:['JPM','C']},
  C:{n:'Citigroup',s:'FINANCE',peers:['JPM','BAC']},
  WFC:{n:'Wells',s:'FINANCE',peers:['JPM','BAC']},
  V:{n:'Visa',s:'PAYMENTS',peers:['MA','PYPL']},
  MA:{n:'Mastercard',s:'PAYMENTS',peers:['V','PYPL']},
  HOOD:{n:'Robinhood',s:'FINTECH',peers:['COIN','V']},
  COIN:{n:'Coinbase',s:'CRYPTO',peers:['HOOD','MSTR']},
  MSTR:{n:'MicroStrategy',s:'BTC PROXY',peers:['COIN']},
  AXP:{n:'American Express',s:'CARDS',peers:['COF','DFS','SYF']},
  COF:{n:'Capital One',s:'CARDS',peers:['AXP','DFS','SYF']},
  BA:{n:'Boeing',s:'AEROSPACE',peers:['LMT','RTX']},
  LMT:{n:'Lockheed',s:'DEFENSE',peers:['BA','RTX','NOC']},
  RTX:{n:'RTX',s:'DEFENSE',peers:['BA','LMT']},
  NOC:{n:'Northrop',s:'DEFENSE',peers:['LMT','RTX']},
  UAL:{n:'United Airlines',s:'AIRLINES',peers:['DAL','LUV','AAL']},
  DAL:{n:'Delta',s:'AIRLINES',peers:['UAL','LUV']},
  LUV:{n:'Southwest',s:'AIRLINES',peers:['UAL','DAL']},
  AAL:{n:'American Air',s:'AIRLINES',peers:['UAL','DAL']},
  WMT:{n:'Walmart',s:'RETAIL',peers:['TGT','COST']},
  TGT:{n:'Target',s:'RETAIL',peers:['WMT','COST']},
  DKNG:{n:'DraftKings',s:'SPORTS BETTING',peers:['FLUT','MGM','PENN']},
  FLUT:{n:'Flutter',s:'SPORTS BETTING',peers:['DKNG','MGM']},
  MGM:{n:'MGM',s:'SPORTS BETTING',peers:['DKNG','CZR','PENN']},
  PENN:{n:'Penn',s:'SPORTS BETTING',peers:['DKNG','MGM']},
  CZR:{n:'Caesars',s:'SPORTS BETTING',peers:['DKNG','MGM']},
  CRM:{n:'Salesforce',s:'SAAS',peers:['NOW','WDAY']},
  NOW:{n:'ServiceNow',s:'SAAS',peers:['CRM','WDAY']},
  WDAY:{n:'Workday',s:'SAAS',peers:['CRM','NOW']},
  SNOW:{n:'Snowflake',s:'AI/DATA',peers:['MDB','DDOG','PLTR']},
  DDOG:{n:'Datadog',s:'AI/OBSERV',peers:['MDB','SNOW']},
  MDB:{n:'MongoDB',s:'AI/DATA',peers:['SNOW','DDOG']},
  PLTR:{n:'Palantir',s:'AI/DATA',peers:['SNOW']},
  SPY:{n:'S&P 500',s:'INDEX',peers:['QQQ','DIA','IWM']},
  QQQ:{n:'Nasdaq 100',s:'INDEX',peers:['SPY','SMH']},
  DIA:{n:'Dow ETF',s:'INDEX',peers:['SPY']},
  IWM:{n:'Russell 2K',s:'INDEX',peers:['SPY','QQQ']},
  SMH:{n:'Semis ETF',s:'SECTOR',peers:['SOXX','QQQ']},
  XLE:{n:'Energy ETF',s:'SECTOR',peers:['XOM','CVX']},
  XLF:{n:'Financials ETF',s:'SECTOR',peers:['JPM','GS']},
};

const SENTIMENT = {
  pos:['soars','surge','beat','raise','raises','rally','record','upgrade','jumps','rises','rose','tops','wins','approves','launches','expands','overweight','bull','tailwind'],
  neg:['plunge','plunges','drops','falls','miss','misses','lawsuit','sanction','sanctions','downgrade','warns','insolvency','bankruptcy','probe','recall','fraud','cuts','slumps','tumbles','victim','headwind','bearish'],
};

// ─── helpers ────────────────────────────────────────────────────────────────
const today = d => (d ? new Date(d) : new Date()).toISOString().slice(0,10);

async function fetchText(url){
  try{
    const res = await fetch(url,{
      headers:{'User-Agent':CONFIG.userAgent,'Accept':'text/html,*/*'},
      redirect:'follow',
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }catch(err){
    console.warn(`  ! Skipped ${url}: ${err.message}`);
    return '';
  }
}

function extractAnchors(html){
  const out=[]; const re=/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))!==null){
    const href=m[1];
    const text=m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    if(text.length>25 && text.length<220) out.push({href,text});
  }
  return out;
}

function dedupe(items){
  const seen=new Set(); const out=[];
  for(const it of items){
    const k=it.text.toLowerCase().slice(0,90);
    if(seen.has(k)) continue;
    seen.add(k); out.push(it);
  }
  return out;
}

function findTickers(text){
  const found=new Set();
  for(const re of [/\$([A-Z]{1,5})\b/g,/\(([A-Z]{2,5})\)/g]){
    let m;
    while((m=re.exec(text))!==null){
      const t=m[1]; if(TICKER_DB[t]) found.add(t);
    }
  }
  for(const [tk,meta] of Object.entries(TICKER_DB)){
    const name=meta.n.split(/\s+/)[0];
    if(name.length>=4 && new RegExp(`\\b${name}\\b`,'i').test(text)) found.add(tk);
  }
  return [...found];
}

function sentimentScore(text){
  const low=text.toLowerCase(); let s=0;
  for(const w of SENTIMENT.pos) if(low.includes(w)) s+=1;
  for(const w of SENTIMENT.neg) if(low.includes(w)) s-=1;
  return Math.max(-3,Math.min(3,s));
}

function priorityScore(text,tickers,weight){
  let p=4+(tickers.length?2:0)+weight;
  const low=text.toLowerCase();
  if(/(record|breaking|bombshell|exclusive|crash|surge|soars)/.test(low)) p+=2;
  if(/(beats|raises|guidance|earnings)/.test(low)) p+=1;
  if(/(sanction|war|tariff|fed|inflation|cpi|jobs)/.test(low)) p+=1;
  return Math.max(1,Math.min(10,p));
}

function timelineFor(text){
  const low=text.toLowerCase();
  return {
    D: /soar|plunge|earnings|beats|raises|sanction|crash|rally|today/.test(low) ? 'Immediate move expected' : 'Headline reaction only',
    W: 'Sell-side notes / analyst PT revisions',
    M: /(guide|forecast|outlook|capex|deal)/.test(low) ? "Reflected in next quarter's guide" : 'Watch follow-through into next print',
    L: 'Structural read on the sector narrative',
  };
}

// ─── analyze a single headline into the report.json card shape ──────────────
function analyzeToCard(item, sourceWeight, idx){
  const tickers = findTickers(item.text);
  const sent    = sentimentScore(item.text);
  const prio    = priorityScore(item.text, tickers, sourceWeight);

  // primary chips
  const primary = tickers.map(t => ({
    symbol: t,
    score: sent || 1
  }));

  // L2 — peers
  const seen = new Set(tickers);
  const peerChips = [];
  for(const t of tickers){
    for(const peer of (TICKER_DB[t].peers||[])){
      if(seen.has(peer) || !TICKER_DB[peer]) continue;
      seen.add(peer);
      peerChips.push({
        symbol: peer,
        score: Math.sign(sent) * Math.max(1, Math.abs(sent)-1)
      });
    }
  }

  // L3 — sector ETFs
  const sectors = new Set(primary.map(p => TICKER_DB[p.symbol]?.s));
  const macroChips = [];
  if(sectors.has('ENERGY'))    macroChips.push({symbol:'XLE',score:Math.sign(sent)||1});
  if(sectors.has('FINANCE'))   macroChips.push({symbol:'XLF',score:Math.sign(sent)||1});
  if(sectors.has('AI/CHIPS'))  macroChips.push({symbol:'SMH',score:Math.sign(sent)||1});
  if(sectors.has('AIRLINES') && sent < 0) macroChips.push({symbol:'XLE',score:1});

  const benefs = [...primary, ...peerChips, ...macroChips].filter(x=>x.score>0)
    .map(x => `${x.symbol} — ${TICKER_DB[x.symbol]?.n||''}`);
  const victs  = [...primary, ...peerChips, ...macroChips].filter(x=>x.score<0)
    .map(x => `${x.symbol} — ${TICKER_DB[x.symbol]?.n||''}`);

  // sentiment dot from primary chip signs
  const pos = primary.filter(x=>x.score>0).length;
  const neg = primary.filter(x=>x.score<0).length;
  const sumScore = primary.reduce((s,x)=>s+x.score,0);
  let sentiment = 'neutral';
  if (pos>0 && neg>0)       sentiment = 'mixed';
  else if (sumScore > 0)    sentiment = 'bull';
  else if (sumScore < 0)    sentiment = 'bear';

  return {
    id: idx + 1,
    headline: item.text,
    source: item.source || '',
    url: item.href,
    category: '',
    priority: prio,
    confidence: prio >= 8 ? 'HIGH' : prio >= 5 ? 'MED' : 'LOW',
    sentiment,
    tickers: primary,
    levels: {
      L1: { text: 'Direct impact from headline.', tickers: primary },
      L2: { text: 'Peer / ecosystem ripple (auto-derived from TICKER_DB peers).', tickers: peerChips },
      L3: { text: 'Macro / sector ETF read.', tickers: macroChips },
    },
    beneficiaries: benefs,
    victims: victs,
    timeline: timelineFor(item.text),
  };
}

// ─── build full report.json from the wire data ──────────────────────────────
function buildReport(analyses, meta){
  // ticker table — aggregate by symbol
  const agg = {};
  for(const a of analyses){
    for(const grp of [a.tickers, a.levels.L2.tickers||[], a.levels.L3.tickers||[]]){
      for(const t of grp){
        agg[t.symbol] = agg[t.symbol] || { symbol:t.symbol, score:0, drivers:[] };
        agg[t.symbol].score += t.score;
        agg[t.symbol].drivers.push(a.headline.slice(0,60));
      }
    }
  }
  const tickerTable = Object.values(agg)
    .map(r => ({
      symbol: r.symbol,
      name:   TICKER_DB[r.symbol]?.n || r.symbol,
      sector: TICKER_DB[r.symbol]?.s || '',
      score:  Math.max(-3, Math.min(3, r.score)),
      driver: r.drivers[0],
    }))
    .sort((a,b) => b.score - a.score);

  // sector heatmap
  const sectAgg = {};
  for(const row of tickerTable){
    if(!row.sector) continue;
    sectAgg[row.sector] = (sectAgg[row.sector]||0) + row.score;
  }
  const sectorHeatmap = Object.entries(sectAgg)
    .map(([sector, score]) => ({sector, score}))
    .sort((a,b) => b.score - a.score);

  return {
    date: meta.date,
    title: CONFIG.title,
    subtitle: `${analyses.length} headlines analyzed · 3 levels traced · ${tickerTable.length} tickers scored`,
    region: CONFIG.region,
    version: '0.2',
    sources: meta.sources,
    mood: [
      { label:'Note', value:'auto-run', delta:'mood bar requires market-data feed', tone:'neu' }
    ],
    news: analyses,
    tickerTable,
    sectorHeatmap,
    actionSummary: {
      buys:      tickerTable.filter(r=>r.score>=2).slice(0,5).map(r=>`${r.symbol} — ${r.driver}`),
      sells:     tickerTable.filter(r=>r.score<=-2).slice(0,5).map(r=>`${r.symbol} — ${r.driver}`),
      watchlist: tickerTable.filter(r=>Math.abs(r.score)===1).slice(0,5).map(r=>`${r.symbol} — ${r.driver}`),
    },
    leaderboard: {
      winners: tickerTable.filter(r=>r.score>=2).slice(0,5).map((r,i)=>({
        rank: i+1,
        name: `${r.symbol} — ${r.name}`,
        why:  r.driver || `Score ${r.score>0?'+':''}${r.score} in today's news`,
      })),
      losers: tickerTable.filter(r=>r.score<=-2).slice(0,5).map((r,i)=>({
        rank: i+1,
        name: `${r.symbol} — ${r.name}`,
        why:  r.driver || `Score ${r.score} in today's news`,
      })),
    },
    otherStories: analyses
      .filter(n => n.priority <= 5)
      .slice(0, 8)
      .map(n => ({
        headline: n.headline,
        keyPoint: (n.levels?.L1?.text || '').split('. ').slice(0,1).join('. '),
        beneficiaries: (n.tickers||[]).filter(t=>t.score>0).map(t=>t.symbol).join(', '),
      })),
    footer: `Auto-generated by newsbeat.js · Not investment advice.`,
  };
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
async function main(){
  const args = process.argv.slice(2);
  const dateArg = (args.find(a => a.startsWith('--date=')) || '').split('=')[1];
  const skipRender = args.includes('--json-only') || args.includes('--no-render');
  const outArg = (args.find(a => a.startsWith('--out=')) || '').split('=')[1];
  const date = today(dateArg);

  // Choose source set: explicit CONFIG.sources > sources.js registry > legacy list
  const useSources = CONFIG.sources || SOURCES_REGISTRY || CONFIG.legacySources;
  const useRssRegistry = !CONFIG.sources && SOURCES_REGISTRY && fetchAllSources;

  console.log(`📰 Market Beat — running for ${date}`);
  console.log(`🌐 Fetching ${useSources.length} source(s) ${useRssRegistry ? '(RSS + HTML, parallel)' : '(HTML legacy)'}…\n`);

  let all = [];
  if (useRssRegistry){
    // Use the rich sources.js fetcher (RSS parser, 6-way concurrency, atom support).
    all = await fetchAllSources(useSources, { verbose: true });
  } else {
    // Legacy HTML-only mode — kept for back-compat if sources.js isn't present.
    for (const src of useSources){
      console.log(`  • ${src.name}: ${src.url}`);
      const html = await fetchText(src.url);
      if (!html) continue;
      const anchors = extractAnchors(html);
      anchors.forEach(a => all.push({ ...a, source: src.name, weight: src.weight }));
    }
  }
  console.log(`\n  → ${all.length} raw headlines`);

  const dedupeFn = dedupeSources || dedupe;
  const filtered = dedupeFn(all).filter(a =>
    // keep RSS items (no path filter needed) + news-like HTML hrefs
    !a.href || /article|news|stocks|markets|economy|finance|crypto|policy|story|business|companies/i.test(a.href)
  );
  console.log(`  → ${filtered.length} after dedupe`);

  const cards = filtered
    .map((it,i) => analyzeToCard(it, it.weight, i))
    .filter(c => (c.tickers||[]).length > 0 || c.priority >= 6)
    .sort((x,y) => y.priority - x.priority)
    .slice(0, CONFIG.maxHeadlines)
    .map((c,i) => ({...c, id: i+1}));
  console.log(`  → ${cards.length} cards kept`);

  // 1. Write report.json (the slow LLM step's deliverable shape)
  const report = buildReport(cards, { date, sources: useSources.map(s=>s.name) });
  const jsonPath = outArg || path.join(CONFIG.outputDir, `report.${date}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`💾 report.json → ${jsonPath}`);

  if(skipRender){
    console.log(`⏭  --json-only: skipping HTML render. Run:`);
    console.log(`     node render.js ${jsonPath}`);
    return;
  }

  // 2. Render — pure deterministic JSON → HTML
  const html = renderReport(report);
  const htmlPath = path.join(CONFIG.outputDir, `marketbeat_report_${date}.html`);
  fs.writeFileSync(htmlPath, html);
  console.log(`✅ HTML → ${htmlPath}`);
}

if(require.main === module){
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { CONFIG, TICKER_DB, analyzeToCard, buildReport };
