'use strict';
// selftest_v2.js — offline validation of indicators_v2 / setups / regime with synthetic series.
const I = require('./lib/indicators_v2.js');
const { classifySetup } = require('./lib/setups.js');
const { classifyRegime } = require('./lib/regime.js');

let pass = 0, fail = 0;
const ok = (c, n) => c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.error(`  ✗ ${n}`));

// ── synthetic builders ──────────────────────────────────────────────────────
function bar(c, rangePct, vol) {
  const h = c * (1 + rangePct / 2), l = c * (1 - rangePct / 2);
  return { open: c, high: h, low: l, close: c, volume: vol };
}
// 120 trending bars, then 40-bar tightening base under pivot 110, then optional breakout bar
function coilSeries({ breakout = false, extended = false } = {}) {
  const q = [];
  for (let i = 0; i < 120; i++) q.push(bar(60 + i * 0.4, 0.03 + 0.01 * Math.sin(i), 1e6 + (i % 7) * 1e5));
  // base: oscillate 100–109, shrinking range + drying volume
  for (let i = 0; i < 45; i++) {
    const amp = 4.5 * (1 - i / 50);                       // contracting
    const c = 105 + amp * Math.sin(i / 3);
    q.push(bar(c, 0.025 * (1 - i / 60), 9e5 * (1 - i * 0.012))); // vol dry-up
  }
  if (breakout) {
    const px = extended ? 122 : 111.5;                     // pivot ≈ high of base ~109.6
    const b = bar(px, 0.03, 2.2e6);                        // 2.2x vol thrust
    b.low = px * 0.97; b.high = px * 1.005; b.close = px;  // strong closing range
    q.push(b);
  }
  return q;
}

// ── indicators_v2 ───────────────────────────────────────────────────────────
console.log('indicators_v2:');
const coil = coilSeries();
const closes = coil.map(q => q.close);
ok(I.bbWidthPercentile(closes) < 35, `bbWidthPercentile low in coil (${I.bbWidthPercentile(closes)})`);
ok(I.volDryUp(coil) < 0.95, `volDryUp detected (${I.volDryUp(coil)})`);
const cs = I.contractionSequence(coil);
ok(cs && cs.contracting, `contractionSequence ${JSON.stringify(cs?.ranges)}`);
const bench = closes.map((c, i) => 100 + i * 0.1);
ok(I.relStrength(closes, bench) != null, 'relStrength computes');
ok(I.closingRange({ high: 110, low: 100, close: 108 }) === 0.8, 'closingRange 0.8');

// ── setups state machine ────────────────────────────────────────────────────
console.log('setups:');
const sCoil = classifySetup(coilSeries());
ok(sCoil.state === 'COILING', `coil base → COILING (got ${sCoil.state}, comp ${sCoil.compression?.score})`);
const sTrig = classifySetup(coilSeries({ breakout: true }));
ok(sTrig.state === 'TRIGGERED', `pivot break on thrust → TRIGGERED (got ${sTrig.state})`);
ok(sTrig.rr >= 2, `R:R floor ≥2 (got ${sTrig.rr})`);
ok((sTrig.entry - sTrig.stop) / sTrig.entry <= 0.081, `stop clamped ≤8% (got ${(((sTrig.entry - sTrig.stop) / sTrig.entry) * 100).toFixed(1)}%)`);
const sExt = classifySetup(coilSeries({ breakout: true, extended: true }));
ok(sExt.state === 'EXTENDED', `+11% past pivot → EXTENDED, no chase (got ${sExt.state})`);

// ── regime ──────────────────────────────────────────────────────────────────
console.log('regime:');
const up = n => Array.from({ length: n }, (_, i) => 100 + i * 0.3);
const dn = n => Array.from({ length: n }, (_, i) => 100 - i * 0.25);
const flatV = n => Array.from({ length: n }, () => 14);
const spikeV = n => Array.from({ length: n }, (_, i) => 15 + (i > n - 8 ? (i - n + 8) * 3 : 0));
const rOn = classifyRegime({ SPY: up(220), QQQ: up(220), IWM: up(220), HYG: up(220), IEF: dn(220), VIX: flatV(220), RSP: up(220) });
ok(rOn.regime === 'RISK_ON' && rOn.exposure === 1, `bull tape → RISK_ON (got ${rOn.regime}, ${rOn.score})`);
const rOff = classifyRegime({ SPY: dn(220), QQQ: dn(220), IWM: dn(220), HYG: dn(220), IEF: up(220), VIX: spikeV(220), RSP: dn(220) });
ok(rOff.regime === 'RISK_OFF' && rOff.exposure < 0.5, `bear tape → RISK_OFF (got ${rOff.regime}, ${rOff.score})`);
ok(rOn.weights.technical > rOff.weights.technical && rOff.weights.quality > rOn.weights.quality, 'adaptive composite weights shift by regime');

console.log(`\nselftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
