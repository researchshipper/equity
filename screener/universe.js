'use strict';
/**
 * universe.js — single source of truth for the screening universe.
 * Curated AI/power/space/defense/crypto-infra list (MAXR removed — delisted 2023)
 * plus optional S&P 500 merge (Wikipedia constituents, same parser as legacy screener).
 *
 *   const { resolveUniverse } = require('./universe.js');
 *   const universe = await resolveUniverse(process.argv); // honors --universe=sp500
 */
const https = require('https');

const CURATED = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "TSM", "AMD", "ASML", "CRM", "ADBE", "NFLX", "NOW", "UBER", "INTU", "WDAY", "SNOW", "PLTR", "DDOG", "CRWD", "PANW", "ZS", "NET", "MDB", "TEAM", "HUBS", "SHOP", "MELI", "CPNG", "SE", "BABA", "JD", "PDD", "QCOM", "TXN", "INTC", "AMAT", "LRCX", "MU", "KLAC", "ARM", "MRVL", "SMCI", "VRT", "ANET", "CEG", "VST", "TLN", "GEV", "CCJ", "UUUU", "BWXT", "LEU", "RDW", "LUNR", "ASTS", "RKLB", "SPIR", "BKSY", "PL", "RTX", "LMT", "GD", "NOC", "AVAV", "KTOS", "CLSK", "MARA", "RIOT", "IREN", "CORZ", "WULF", "CIFR"];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function getSP500() {
  try {
    const raw = await fetchUrl('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies');
    const tableStart = raw.indexOf('id="constituents"');
    if (tableStart === -1) throw new Error('Constituents table not found');
    const tableHtml = raw.substring(tableStart, raw.indexOf('</tbody>', tableStart));
    const rows = tableHtml.split('<tr');
    const tickers = new Set();
    for (let i = 2; i < rows.length; i++) {
      const m = rows[i].match(/>\s*<(td|th)[^>]*>([\s\S]*?)<\/\1>/i);
      if (m) {
        const text = m[2].replace(/<[^>]*>/g, '').trim().replace('.', '-');
        if (text && /^[A-Z-]+$/.test(text)) tickers.add(text);
      }
    }
    if (tickers.size < 100) throw new Error(`Only parsed ${tickers.size} tickers`);
    return Array.from(tickers);
  } catch (e) {
    console.log(`⚠️  S&P 500 fetch failed (${e.message}) — using curated universe only.`);
    return [];
  }
}

/** Resolve universe from CLI args. --universe=sp500 merges S&P 500 with curated list. */
async function resolveUniverse(argv = []) {
  if (argv.some(a => a === '--universe=sp500')) {
    console.log('Fetching S&P 500 constituents from Wikipedia…');
    const sp500 = await getSP500();
    const merged = Array.from(new Set([...CURATED, ...sp500]));
    console.log(`Merged universe: ${merged.length} tickers (${CURATED.length} curated + S&P 500).`);
    return merged;
  }
  return CURATED;
}

module.exports = CURATED;                 // backward compatible: require('./universe.js') → array
module.exports.CURATED = CURATED;
module.exports.getSP500 = getSP500;
module.exports.resolveUniverse = resolveUniverse;
