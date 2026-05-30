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
    console.log(`Total Buys: ${buys} ($${(buyVolUSD/1000000).toFixed(2)}M) | Total Sells: ${sells} ($${((sellVolUSD_Disc+sellVolUSD_10b51)/1000000).toFixed(2)}M)`);
    if (sellVolUSD_10b51 > 0) { console.log(`Note: ${(sellVolUSD_10b51/1000000).toFixed(2)}M of sales were under pre-planned 10b5-1 programs.`); }
    if (sellVolUSD_Disc > 0) { console.log(`Note: ${(sellVolUSD_Disc/1000000).toFixed(2)}M of sales were Discretionary.`); }
    console.log(`=================================================================\n`);
})();
