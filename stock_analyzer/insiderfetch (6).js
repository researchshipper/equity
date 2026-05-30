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
    let buyShares = 0, sellShares = 0;
    let form4Count = 0;
    for (let i = 0; i < recent.form.length; i++) {
      if (recent.form[i] === '4') {
        const filingDate = new Date(recent.filingDate[i]);
        if (filingDate >= sixMonthsAgo) {
          form4Count++;
          if(form4Count > 35) continue;
          
          const accNo = recent.accessionNumber[i].replace(/-/g, '');
          const primaryDoc = recent.primaryDocument[i];
          const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accNo}/${primaryDoc}`;
          const rawXml = await fetchUrl(xmlUrl);
          let xml = rawXml.replace(/\s+/g, '');
          xml = xml.replace(/<[a-zA-Z0-9_]+:/g, '<').replace(/<\/[a-zA-Z0-9_]+:/g, '</');
          
          const isP = xml.includes('<transactionCode>P</transactionCode>');
          const isS = xml.includes('<transactionCode>S</transactionCode>');
          
          let totalShares = 0;
          const shareMatches = xml.match(/<transactionShares><value>([\d\.]+)<\/value><\/transactionShares>/gi);
          if (shareMatches) {
              for (const block of shareMatches) {
                  const valMatch = block.match(/<value>([\d\.]+)<\/value>/i);
                  if (valMatch) totalShares += parseFloat(valMatch[1]);
              }
          }
          if (isP && totalShares > 0) buys++;
          else if (isS && totalShares > 0) sells++;
          await new Promise(r => setTimeout(r, 100));
        }
      }
    }
    
    // FIX: Deterministic Conviction Score Calculation (1 to 10)
    let score = 5; // Base neutral score
    score += (buys * 1.0); 
    score -= (sells * 0.5); 
    score = Math.max(1, Math.min(10, Math.round(score)));
    
    let sentiment = "Neutral";
    if (score >= 7) sentiment = "Bullish";
    if (score <= 3) sentiment = "Bearish";
    
    console.log(`\n===== ${TICKER} SEC FORM 4 INSIDER ACTIVITY (LAST 6 MONTHS) =====`);
    console.log(`INSIDER_SCORE: ${score}`);
    console.log(`INSIDER_SENTIMENT: ${sentiment}`);
    console.log(`Total Buys: ${buys} | Total Sells: ${sells}`);
    console.log(`=================================================================\n`);
})();
