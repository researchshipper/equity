/**
 * sources.js — RSS + HTML source registry for Market Beat
 *
 * RSS feeds bypass the User-Agent gating that blocks plain HTML scraping
 * on Bloomberg/FT/Reuters/MarketWatch. Each entry exposes a uniform
 * { name, url, type, weight, parser } shape so newsbeat.js can iterate.
 *
 * Add new sources by appending to the SOURCES array.
 */
'use strict';

// ─── tiny XML / RSS parsers (no deps) ───────────────────────────────────────
const stripCdata = s => String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const stripTags  = s => String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const decode     = s => String(s||'')
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&apos;/g,"'")
  .replace(/&#(\d+);/g, (_,n)=>String.fromCharCode(+n));
const clean = s => decode(stripTags(stripCdata(s)));

function parseRss(xml){
  const items = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let m;
  while((m = re.exec(xml)) !== null){
    const block = m[0];
    const title = clean((block.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]);
    const link  = clean((block.match(/<link>([\s\S]*?)<\/link>/i)||[])[1]);
    const desc  = clean((block.match(/<description>([\s\S]*?)<\/description>/i)||[])[1]);
    const date  = clean((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)||[])[1]);
    if (title && link) items.push({ text: title, href: link, summary: desc, pubDate: date });
  }
  return items;
}

function parseAtom(xml){
  const items = [];
  const re = /<entry\b[\s\S]*?<\/entry>/gi;
  let m;
  while((m = re.exec(xml)) !== null){
    const block = m[0];
    const title = clean((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]);
    const linkM = block.match(/<link[^>]*href=["']([^"']+)["']/i);
    const link  = linkM ? linkM[1] : '';
    const summ  = clean((block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)||[])[1]);
    const date  = clean((block.match(/<updated>([\s\S]*?)<\/updated>/i)||[])[1]);
    if (title && link) items.push({ text: title, href: link, summary: summ, pubDate: date });
  }
  return items;
}

function parseFeed(xml){
  // try RSS first, then Atom
  const rss = parseRss(xml);
  if (rss.length) return rss;
  return parseAtom(xml);
}

// Fallback HTML <a> extractor (for non-RSS sources)
function parseHtml(html){
  const out = [];
  const re  = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m = re.exec(html)) !== null){
    const href = m[1];
    const text = clean(m[2]);
    if (text.length > 25 && text.length < 220) out.push({ text, href });
  }
  return out;
}

// ─── source registry ───────────────────────────────────────────────────────
const SOURCES = [
  // ===== RSS / Atom feeds (preferred — UA-resistant) =====
  { name: 'Yahoo Finance RSS',     url: 'https://finance.yahoo.com/news/rssindex',                              type: 'rss', weight: 3 },
  { name: 'Yahoo Top Stories',     url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US', type: 'rss', weight: 3 },
  { name: 'CNBC Top News RSS',     url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',                type: 'rss', weight: 3 },
  { name: 'CNBC Markets RSS',      url: 'https://www.cnbc.com/id/15839135/device/rss/rss.html',                 type: 'rss', weight: 3 },
  { name: 'CNBC Earnings RSS',     url: 'https://www.cnbc.com/id/15839135/device/rss/rss.html',                 type: 'rss', weight: 2 },
  { name: 'MarketWatch Top RSS',   url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',           type: 'rss', weight: 2 },
  { name: 'MarketWatch Realtime',  url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines',    type: 'rss', weight: 2 },
  { name: 'Reuters Business RSS',  url: 'https://feeds.reuters.com/reuters/businessNews',                       type: 'rss', weight: 3 },
  { name: 'Reuters Markets RSS',   url: 'https://feeds.reuters.com/news/wealth',                                type: 'rss', weight: 2 },
  { name: 'Investing.com News',    url: 'https://www.investing.com/rss/news.rss',                               type: 'rss', weight: 2 },
  { name: 'Investing.com Stocks',  url: 'https://www.investing.com/rss/news_25.rss',                            type: 'rss', weight: 2 },
  { name: 'Benzinga News RSS',     url: 'https://www.benzinga.com/feed',                                        type: 'rss', weight: 1 },
  { name: 'Seeking Alpha RSS',     url: 'https://seekingalpha.com/feed.xml',                                    type: 'rss', weight: 2 },
  { name: 'FT Companies RSS',      url: 'https://www.ft.com/companies?format=rss',                              type: 'rss', weight: 3 },
  { name: 'Bloomberg Markets RSS', url: 'https://feeds.bloomberg.com/markets/news.rss',                         type: 'rss', weight: 3 },
  { name: 'WSJ Markets RSS',       url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',                        type: 'rss', weight: 3 },
  { name: 'NYT Business RSS',      url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',            type: 'rss', weight: 2 },
  { name: 'NYT Economy RSS',       url: 'https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml',             type: 'rss', weight: 2 },

  // ===== HTML fallback (when RSS is rate-limited or missing) =====
  { name: 'Yahoo Finance HTML',    url: 'https://finance.yahoo.com/',                                           type: 'html', weight: 2 },
  { name: 'CNBC Finance HTML',     url: 'https://www.cnbc.com/finance/',                                        type: 'html', weight: 1 },
];

// ─── insider cluster-buy sources (used by insiders.js) ──────────────────────
// Dataroma blocks plain scraping (403 to non-browser UAs) and is superinvestor-
// focused, not a market-wide cluster feed — so it is used only as a per-ticker
// LINK, never as the data source. OpenInsider has purpose-built cluster pages.
// Fallback order is top→bottom; insiders.js clusters whatever rows it parses.
// If one stops working, reorder or add a mirror here and re-run the health check.
const INSIDER_SOURCES = [
  { name: 'OpenInsider purchases 25k+',  url: 'http://openinsider.com/latest-insider-purchases-25k', type: 'openinsider' },
  { name: 'OpenInsider all purchases',   url: 'http://openinsider.com/latest-insider-purchases',     type: 'openinsider' },
  { name: 'OpenInsider cluster buys',    url: 'http://openinsider.com/latest-cluster-buys',          type: 'openinsider' },
];

// ─── market-data sources (used by marketdata.js) ────────────────────────────
// Real index/futures/commodity/rate/crypto prints to anchor + fact-check mood[]
// and macro numbers. Per-symbol fallback (Yahoo → Stooq) lives in marketdata.js.
const MARKET_SOURCES = [
  { name: 'Yahoo chart API', url: 'https://query1.finance.yahoo.com/v8/finance/chart/', type: 'json', role: 'primary' },
  { name: 'Stooq CSV',       url: 'https://stooq.com/q/l/',                              type: 'csv',  role: 'fallback' },
];

// ─── fetcher ───────────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 ' +
           '(KHTML, like Gecko) Version/17.5 Safari/605.1.15';

async function fetchSource(src, { timeoutMs = 10000, verbose = true } = {}){
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(src.url, {
      headers: {
        'User-Agent': UA,
        'Accept': src.type === 'rss'
          ? 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
          : 'text/html,*/*',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    const items = src.type === 'rss' ? parseFeed(body) : parseHtml(body);
    if (verbose) console.log(`  ✓ ${src.name.padEnd(28)} ${items.length} items`);
    return items.map(it => ({ ...it, source: src.name, weight: src.weight }));
  }catch(err){
    if (verbose) console.warn(`  ✗ ${src.name.padEnd(28)} ${err.message}`);
    return [];
  }finally{
    clearTimeout(timer);
  }
}

async function fetchAll(sources = SOURCES, opts = {}){
  // parallel fetch with bounded concurrency = 6
  const out = [];
  const queue = [...sources];
  const workers = Array.from({length: 6}, async () => {
    while(queue.length){
      const src = queue.shift();
      const items = await fetchSource(src, opts);
      out.push(...items);
    }
  });
  await Promise.all(workers);
  return out;
}

// Dedupe identical headlines by title-prefix
function dedupe(items){
  const seen = new Set(); const out = [];
  for(const it of items){
    const key = it.text.toLowerCase().slice(0,90).replace(/[^\w ]/g,'');
    if (seen.has(key)) continue;
    seen.add(key); out.push(it);
  }
  return out;
}

module.exports = { SOURCES, INSIDER_SOURCES, MARKET_SOURCES, fetchSource, fetchAll, dedupe, parseFeed, parseHtml };

// CLI: list sources or do a quick health-check
if (require.main === module){
  (async () => {
    const arg = process.argv[2];
    if (arg === '--list'){
      console.log(`${SOURCES.length} news sources registered:\n`);
      SOURCES.forEach(s => console.log(`  [${s.type}] (w${s.weight}) ${s.name.padEnd(28)} ${s.url}`));
      console.log(`\n${INSIDER_SOURCES.length} insider sources:`);
      INSIDER_SOURCES.forEach(s => console.log(`  [${s.type}] ${s.name.padEnd(28)} ${s.url}`));
      console.log(`\n${MARKET_SOURCES.length} market-data sources:`);
      MARKET_SOURCES.forEach(s => console.log(`  [${s.type}/${s.role}] ${s.name.padEnd(20)} ${s.url}`));
      return;
    }
    console.log(`📡 Health-check on ${SOURCES.length} news sources…\n`);
    const all = await fetchAll();
    const ok  = new Set(all.map(i => i.source));
    console.log(`\n✅ ${ok.size}/${SOURCES.length} news sources returned items`);
    console.log(`📰 ${all.length} raw headlines, ${dedupe(all).length} after dedupe`);

    // probe insider + market endpoints (HEAD-ish) so "which sources work" is answerable
    console.log(`\n🕵️  Insider + 📈 market endpoints:`);
    const probe = async (name, url) => {
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal }).finally(() => clearTimeout(t));
        console.log(`  ${res.ok ? '✓' : '✗'} ${String(res.status).padEnd(4)} ${name}`);
      } catch (e) { console.log(`  ✗ ERR  ${name} (${e.message})`); }
    };
    for (const s of INSIDER_SOURCES) await probe(s.name, s.url);
    await probe('Yahoo chart (AAPL)', 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d');
    await probe('Stooq (^spx)', 'https://stooq.com/q/l/?s=^spx&f=sd2t2ohlcv&h&e=csv');
  })().catch(console.error);
}
