const { piotroski, earningsQuality, eva, marginOfSafety, compositeScore } = require('../lib/quality.js');
let pass=0, fail=0;
const ok=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('FAIL:',name);} };

// Synthetic firm: improving across the board -> should score high
const cur={netIncome:120,operatingCashFlow:150,totalAssets:1000,currentAssets:500,currentLiabilities:200,longTermDebt:100,grossProfit:400,totalRevenue:800,dilutedAverageShares:100};
const prv={netIncome:80, operatingCashFlow:90, totalAssets:950, currentAssets:400,currentLiabilities:220,longTermDebt:150,grossProfit:340,totalRevenue:760,dilutedAverageShares:100};
const f=piotroski(cur,prv);
ok('improving firm F>=8', f.score>=8);
ok('F max=9', f.max===9);
ok('all 9 evaluated', f.evaluated===9);

// Missing field -> marked n/a, not crash
const f2=piotroski({netIncome:10,operatingCashFlow:12,totalAssets:100,totalRevenue:50,grossProfit:20},{netIncome:8,totalAssets:90,totalRevenue:45,grossProfit:18});
ok('missing fields no crash', typeof f2.score==='number');
ok('missing -> evaluated<9', f2.evaluated<9);

const eq=earningsQuality(cur,prv);
ok('cash conversion = CFO/NI', Math.abs(eq.cashConversion-150/120)<0.01);
ok('accruals negative (CFO>NI)', eq.accrualRatioPct<0);

const e=eva({roicPct:24,waccPct:12,investedCapitalB:10});
ok('EVA = spread*IC', Math.abs(e.evaB-1.2)<0.001);
ok('EVA verdict creating', e.verdict.includes('Creating'));

const m=marginOfSafety(80,100);
ok('MoS 20%', m.discountPct===20);
ok('MoS band moderate', m.band.includes('Moderate'));
const m2=marginOfSafety(120,100);
ok('MoS negative -> premium', m2.discountPct<0 && m2.band.includes('None'));

const c=compositeScore({revGr:35,netMgn:38,fScore:4,evaSpreadPct:11.5,cashConversion:1.25,marginOfSafetyPct:15,price:159,ma50:149,ma200:140,rsi:57,macd:0.5,goldenCross:true,insiderScore:1});
ok('composite in range', c.composite>=0 && c.composite<=10);
ok('has subscores', c.subScores.fundamentals!=null);
ok('insider folded', c.subScores.insider===1);
const c2=compositeScore({revGr:35,netMgn:38,fScore:4,evaSpreadPct:11.5,cashConversion:1.25,marginOfSafetyPct:15,price:159,ma50:149,ma200:140,rsi:57,macd:0.5,goldenCross:true});
ok('no-insider redistributes (no insider subscore)', c2.subScores.insider==null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
