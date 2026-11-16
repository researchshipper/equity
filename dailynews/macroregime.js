#!/usr/bin/env node
/**
 * Deterministic leading macro-regime engine. No API key; FRED CSV + Yahoo charts.
 * Writes macroregime.json. This is a risk-budget classifier, not investment advice.
 */
'use strict';
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'macroregime.json');
const UA = 'Mozilla/5.0 MarketBeatMacro/1.0';
const clamp2 = x => Math.max(-2, Math.min(2, x));
const round = (x,n=2) => Number.isFinite(x) ? +x.toFixed(n) : null;
const pct = (a,b) => a != null && b != null && b !== 0 ? (a/b-1)*100 : null;
const last = a => a[a.length-1];
async function text(url){ const c=new AbortController(), t=setTimeout(()=>c.abort(),15000); try { const r=await fetch(url,{headers:{'User-Agent':UA},signal:c.signal}); if(!r.ok) throw Error('HTTP '+r.status); return await r.text(); } finally { clearTimeout(t); } }
function csv(s){ return s.trim().split(/\r?\n/).slice(1).map(x=>x.split(',')).filter(x=>x.length>=2 && x[1]!=='.').map(x=>({date:x[0],value:+x[1]})).filter(x=>Number.isFinite(x.value)); }
async function fred(id){ return csv(await text(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`)); }
async function yahoo(sym){ const j=JSON.parse(await text(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1y`)); const r=j.chart?.result?.[0], q=r?.indicators?.quote?.[0]?.close||[], ts=r?.timestamp||[]; const a=[]; q.forEach((v,i)=>{if(Number.isFinite(v))a.push({date:new Date(ts[i]*1000).toISOString().slice(0,10),value:v})}); if(a.length<70) throw Error('insufficient daily history'); return a; }
function commonRatio(a,b){ const mb=new Map(b.map(x=>[x.date,x.value])); return a.filter(x=>mb.has(x.date)).map(x=>({date:x.date,value:x.value/mb.get(x.date)})); }
function sma(a,n){ return a.length>=n ? a.slice(-n).reduce((s,x)=>s+x.value,0)/n : null; }
function change(a,n){ return a.length>n ? pct(last(a).value,a[a.length-1-n].value) : null; }
function nearestBefore(a,date){ return [...a].reverse().find(x=>x.date<=date); }
function liquidity(walcl,tga,rrp){ const dates=walcl.map(x=>x.date).filter(d=>nearestBefore(tga,d)&&nearestBefore(rrp,d)); return dates.map(date=>({date,value:(nearestBefore(walcl,date).value-nearestBefore(tga,date).value-nearestBefore(rrp,date).value)/1000})); } // FRED $m -> $bn
function classify(score, input){ const inflationRisk=(input.inter.dxy63>0 && input.inter.cg63<0) || (input.lag.cpi!=null&&input.lag.cpi>3.5); if(score>=60) return inflationRisk ? ['LIQUIDITY EXPANSION · REFLATION','INVEST',70,.85] : ['LIQUIDITY EXPANSION · GOLDILOCKS','INVEST',80,1]; if(score>=40) return ['SLOWDOWN · DISINFLATION','NEUTRAL',55,.6]; return [inflationRisk?'STAGFLATION RISK':'LIQUIDITY DRAIN · RISK-OFF','CASH',25,.25]; }
async function main(){
 const warnings=[]; let status='ok';
 const get=async(fn,name)=>{try{return await fn()}catch(e){warnings.push(`${name}: ${e.message}`);status='degraded';return null}};
 const [walcl,tga,rrp,t10y2y,t10y3m,cpi,sahm,claims,hyOas,nfci,fedfunds,hyg,tlt,lqd,hg,gc,dxy]=await Promise.all([
  get(()=>fred('WALCL'),'WALCL'),get(()=>fred('WTREGEN'),'WTREGEN'),get(()=>fred('RRPONTSYD'),'RRPONTSYD'),get(()=>fred('T10Y2Y'),'T10Y2Y'),get(()=>fred('T10Y3M'),'T10Y3M'),get(()=>fred('CPIAUCSL'),'CPIAUCSL'),get(()=>fred('SAHMREALTIME'),'SAHMREALTIME'),get(()=>fred('ICSA'),'ICSA'),get(()=>fred('BAMLH0A0HYM2'),'HY OAS'),
  get(()=>fred('NFCI'),'NFCI'),get(()=>fred('FEDFUNDS'),'FEDFUNDS'),
  get(()=>yahoo('HYG'),'HYG'),get(()=>yahoo('TLT'),'TLT'),get(()=>yahoo('LQD'),'LQD'),get(()=>yahoo('HG=F'),'Copper'),get(()=>yahoo('GC=F'),'Gold'),get(()=>yahoo('DX-Y.NYB'),'DXY')
 ]);
 const liq=walcl&&tga&&rrp?liquidity(walcl,tga,rrp):null, ht=hyg&&tlt?commonRatio(hyg,tlt):null, hl=hyg&&lqd?commonRatio(hyg,lqd):null, cg=hg&&gc?commonRatio(hg,gc):null;
 const liq4=liq&&liq.length>4?last(liq).value-liq[liq.length-5].value:null, liq13=liq&&liq.length>13?last(liq).value-liq[liq.length-14].value:null;
 const ht63=ht?change(ht,63):null, hl63=hl?change(hl,63):null, oas21=hyOas&&hyOas.length>21?last(hyOas).value-hyOas[hyOas.length-22].value:null;
 const c2=last(t10y2y)?.value, c3=last(t10y3m)?.value, curve21=t10y2y&&t10y2y.length>21?(c2-t10y2y[t10y2y.length-22].value)*100:null;
 const crossed=t10y2y&&t10y2y.length>21&&c2>=0&&t10y2y[t10y2y.length-22].value<0;
 const claims4=claims&&claims.length>4?pct(last(claims).value,claims[claims.length-5].value):null;
 const cg63=cg?change(cg,63):null, dxy63=dxy?change(dxy,63):null;
 const cpiYoy=cpi&&cpi.length>12?pct(last(cpi).value,cpi[cpi.length-13].value):null;
 const growthDeteriorating=(claims4!=null&&claims4>=5); const recessionary=!!(crossed&&curve21>=35&&growthDeteriorating);
 const sL=liq4==null?0:clamp2(liq4/100);
 const sC=(ht63==null||hl63==null||oas21==null||!ht)?0:clamp2(ht63*.35+(last(ht).value>sma(ht,63) ? .5 : -.5)+hl63*.2+clamp2(-oas21/25)*.2);
 const sCurve=recessionary?-2:(c2>.5&&c3>0?1.5:(c2<0||c3<0?-1:0));
 const sInter=(cg63==null||dxy63==null)?0:clamp2(cg63*.2-dxy63*.2);
 const sConfirm=claims4==null?0:clamp2(claims4<=0?.5:-.5);
 const raw=sL+sC+sCurve+sInter+.25*sConfirm, rawScore=Math.max(0,Math.min(100,(raw+8.5)/17*100));
 let cap=100, gates=[]; if(liq4!=null&&liq4<-50){cap=Math.min(cap,45);gates.push('NET_LIQUIDITY_DRAIN')} if(recessionary){cap=Math.min(cap,35);gates.push('RECESSIONARY_UNINVERSION')} if((oas21!=null&&oas21>=75)||(hl63!=null&&hl63<=-3)){cap=Math.min(cap,35);gates.push('CREDIT_STRESS')}
 const final=Math.min(rawScore,cap), input={inter:{dxy63,cg63},lag:{cpi:cpiYoy}}, [label,riskState,allocation,riskMultiplier]=classify(final,input);

 // 1. Exuberance & Bubble-Pop Risk (greed/leverage + margin-call/credit stress)
 const exuberanceStatus =
  (oas21 != null && oas21 >= 30) || (hl63 != null && hl63 <= -2) ? 'RED' :
  (oas21 != null && oas21 >= 15) || (ht63 != null && ht63 < 0)    ? 'YELLOW' : 'GREEN';
 const exuberanceBubblePop = {
  status: exuberanceStatus,
  hyOasChange21dBp: round(oas21),
  hygTltChange63dPct: round(ht63),
  hygLqdChange63dPct: round(hl63),
  summary: exuberanceStatus === 'RED'
    ? 'High leverage + expanding credit stress; elevated margin-call / bubble-pop risk.'
    : exuberanceStatus === 'YELLOW'
    ? 'Early credit-spread widening or risk-appetite softening.'
    : 'Credit spreads stable; no immediate margin-call stress.'
 };

 // 2. Liquidity Drain & Fed Tightening Velocity
 const ffNow = fedfunds?.length ? last(fedfunds).value : null;
 const ff3m  = fedfunds && fedfunds.length > 3 ? fedfunds[fedfunds.length - 4].value : null;
 const fedFunds3mBp = (ffNow != null && ff3m != null) ? (ffNow - ff3m) * 100 : null;
 const liqDrainStatus =
  (fedFunds3mBp != null && fedFunds3mBp >= 50) || (liq4 != null && liq4 <= -150) ? 'RED' :
  (fedFunds3mBp != null && fedFunds3mBp >= 25) || (liq4 != null && liq4 <= -50)  ? 'YELLOW' : 'GREEN';
 const liquidityDrain = {
  status: liqDrainStatus,
  fedFundsPct: round(ffNow),
  fedFunds3mChangeBp: round(fedFunds3mBp),
  netLiquidity4wUsdBn: round(liq4, 1),
  netLiquidity13wUsdBn: round(liq13, 1)
 };

 // 3. Market Liquidity — NFCI Tightening Trajectory (1W / 1M / 6M / 1Y)
 const nfciVal = (n) => nfci && nfci.length > n ? nfci[nfci.length - 1 - n].value : null;
 const nfciCur = nfci?.length ? last(nfci).value : null;
 const nfci1w = nfciVal(1), nfci1m = nfciVal(4), nfci6m = nfciVal(26), nfci1y = nfciVal(52);
 const tight1w = nfciCur != null && nfci1w != null && nfciCur > nfci1w;
 const tight1m = nfciCur != null && nfci1m != null && nfciCur > nfci1m;
 const tight6m = nfciCur != null && nfci6m != null && nfciCur > nfci6m;
 const tight1y = nfciCur != null && nfci1y != null && nfciCur > nfci1y;
 const nfciStatus =
  (tight1w && tight1m && tight6m && tight1y) || (nfciCur != null && nfciCur > 0 && tight1w && tight1m) ? 'RED' :
  (tight1w && tight1m) ? 'YELLOW' : 'GREEN';
 const bubblePopNear = nfciStatus === 'RED' || [exuberanceStatus, liqDrainStatus, nfciStatus].filter(s => s === 'RED').length >= 2;
 const nfciTrajectory = {
  status: nfciStatus,
  current: round(nfciCur, 3),
  vs1w: { prior: round(nfci1w, 3), tighter: tight1w },
  vs1m: { prior: round(nfci1m, 3), tighter: tight1m },
  vs6m: { prior: round(nfci6m, 3), tighter: tight6m },
  vs1y: { prior: round(nfci1y, 3), tighter: tight1y }
 };

 const out={asOf:[liq&&last(liq).date,last(hyg)?.date].filter(Boolean).sort().slice(-1)[0]||new Date().toISOString().slice(0,10),generatedAt:new Date().toISOString(),status,dataQuality:{confidence:status==='ok'?'HIGH':'LOW',warnings,staleSeries:[]},model:{version:'macro-regime-v1',lookbacks:{liquidityWeeks:[4,13],marketDays:63,curveDays:21}},inputs:{netLiquidity:{valueUsdBn:liq?round(last(liq).value,1):null,change4wUsdBn:round(liq4,1),change13wUsdBn:round(liq13,1),observationDate:liq?last(liq).date:null},credit:{hygTltChange63dPct:round(ht63),hygTltAboveSma63:ht?last(ht).value>sma(ht,63):null,hygLqdChange63dPct:round(hl63),hyOasChange21dBp:round(oas21)},curve:{t10y2yPct:round(c2),t10y3mPct:round(c3),change21dBp:round(curve21),isUninverting:crossed,isBearSteepening:curve21>=35,isRecessionaryUninversion:recessionary},intermarket:{copperGoldChange63dPct:round(cg63),dxyChange63dPct:round(dxy63)},leadingConfirmation:{initialClaims4wChangePct:round(claims4),available:claims4!=null},laggingContext:{cpiYoyPct:round(cpiYoy),sahmGapPct:round(last(sahm)?.value)}},scores:{liquidity:round(sL),credit:round(sC),curve:round(sCurve),intermarket:round(sInter),leadingConfirmation:round(sConfirm),raw:round(raw),rawScore:round(rawScore,1),ema8:round(rawScore,1),final:round(final,1)},gates:{liquidityDrain:gates.includes('NET_LIQUIDITY_DRAIN'),recessionaryUninversion:recessionary,creditStress:gates.includes('CREDIT_STRESS'),scoreCap:cap,applied:gates},regime:{label,riskState,allocationGuidePct:allocation,riskMultiplier},bubblePopFactors:{bubblePopNear,exuberanceBubblePop,liquidityDrain,nfciTrajectory},evidence:{leading:[liq4!=null?`Net liquidity changed ${liq4>=0?'+':''}$${round(liq4,1)}bn over four weeks.`:'Net liquidity unavailable.',ht63!=null?`HYG/TLT changed ${round(ht63)}% over 63 sessions.`:'Credit ratio unavailable.',cg63!=null&&dxy63!=null?`Copper/gold changed ${round(cg63)}% and DXY ${round(dxy63)}% over 63 sessions.`:'Intermarket confirmation unavailable.'],lagging:[cpiYoy!=null?`CPI changed ${round(cpiYoy)}% YoY; this is context, not a leading score input.`:'Lagging CPI context unavailable.'],risks:[...gates.length?gates.map(x=>`Active circuit breaker: ${x}.`):['No macro circuit breaker is active.']]}};
 fs.writeFileSync(OUT,JSON.stringify(out,null,2)); if(process.argv.includes('--print')) console.log(JSON.stringify(out,null,2)); else console.log(`✅ Macro regime ${out.regime.label} · ${out.scores.final}/100 → ${OUT}`);
}
main().catch(e=>{console.error('❌ macroregime:',e.message);process.exit(1)});
