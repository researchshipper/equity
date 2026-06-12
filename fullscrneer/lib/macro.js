/**
 * macro.js — Macro Regime Engine (Section 4 of Pine Script)
 * Fetches FRED data and computes macro regime (INVEST / NEUTRAL / CASH)
 */

import https from 'https';
import cfg from '../config.js';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function fetchFRED(seriesId) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  try {
    const csv = await fetchUrl(url);
    const lines = csv.trim().split('\n');
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const [date, val] = lines[i].split(',');
      if (val && val !== '.') {
        data.push({ date, value: parseFloat(val) });
      }
    }
    return data;
  } catch (e) {
    console.error(`  [MACRO] Failed to fetch ${seriesId}: ${e.message}`);
    return [];
  }
}

function clamp2(v) { return Math.max(-2.0, Math.min(2.0, v)); }

function emaArray(arr, period) {
  if (arr.length === 0) return [];
  const k = 2 / (period + 1);
  const result = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    result.push(arr[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export async function computeMacroRegime() {
  console.log('[MACRO] Fetching FRED economic data...');

  const [curveRaw, unrateRaw, ffRaw, houstRaw] = await Promise.all([
    fetchFRED('T10Y2Y'),
    fetchFRED('UNRATE'),
    fetchFRED('DFF'),
    fetchFRED('HOUST')
  ]);

  // ── Yield Curve Score ───────────────────────────────────────────
  const curveVals = curveRaw.map(d => d.value);
  const curveLatest = curveVals.length > 0 ? curveVals[curveVals.length - 1] : null;
  const invLookbk = Math.min(cfg.inv_lookbk, curveVals.length);
  const recentSlice = curveVals.slice(-invLookbk);
  const invNow = curveLatest !== null && curveLatest < 0;
  const invRecent = recentSlice.some(v => v < 0);
  let steep3m = null;
  if (curveVals.length >= 63) steep3m = curveVals[curveVals.length - 1] - curveVals[curveVals.length - 64];
  const unInverting = invRecent && !invNow && steep3m !== null && steep3m > cfg.steep_trig;
  let sCurve = clamp2((curveLatest || 0) * 1.5);
  if (unInverting) sCurve = clamp2(Math.min(sCurve, -1.5) - 0.5);
  else if (invRecent && !invNow) sCurve = Math.min(sCurve, 0);

  // ── Labor/Sahm Score ────────────────────────────────────────────
  const unrateVals = unrateRaw.map(d => d.value);
  let sahmGap = null, unTr6 = null;
  if (unrateVals.length >= 13) {
    const u3 = [];
    for (let i = 2; i < unrateVals.length; i++) u3.push((unrateVals[i] + unrateVals[i - 1] + unrateVals[i - 2]) / 3);
    if (u3.length >= 12) { const latestU3 = u3[u3.length - 1]; sahmGap = latestU3 - Math.min(...u3.slice(-12)); }
    if (u3.length >= 7) unTr6 = u3[u3.length - 1] - u3[u3.length - 7];
  }
  const sLabor = sahmGap !== null ? clamp2(2.0 - (sahmGap / cfg.sahm_trig) * 4.0 - clamp2((unTr6 || 0) * 4.0)) : 0;
  const laborWeak = sahmGap !== null && sahmGap >= cfg.sahm_warn;

  // ── Fed Policy Score ────────────────────────────────────────────
  const ffVals = ffRaw.map(d => d.value);
  let ffChg6m = null, ffChg3m = null;
  if (ffVals.length >= 126) ffChg6m = ffVals[ffVals.length - 1] - ffVals[ffVals.length - 127];
  if (ffVals.length >= 63) ffChg3m = ffVals[ffVals.length - 1] - ffVals[ffVals.length - 64];
  const fedCutting = ffChg6m !== null && ffChg6m < -0.25;
  let sFed = 0;
  if (laborWeak && ffChg6m !== null && ffChg6m < 0) sFed = clamp2(ffChg6m * 4.0);
  else if (ffChg6m !== null) sFed = clamp2(-ffChg6m * 2.0);

  // ── Housing Score ───────────────────────────────────────────────
  const houstVals = houstRaw.map(d => d.value);
  let houstYoy = null;
  if (houstVals.length >= 13) {
    const prev = houstVals[houstVals.length - 13];
    if (prev !== 0) houstYoy = ((houstVals[houstVals.length - 1] / prev) - 1) * 100;
  }
  const sHousing = houstYoy !== null ? clamp2(houstYoy / 5.0) : 0;

  // ── Macro Composite ─────────────────────────────────────────────
  const compRaw = sCurve + sLabor + sFed + sHousing;
  const macroScore = (compRaw + 8.0) / 16.0 * 100.0;

  let macroRegime = 0;
  if (macroScore >= cfg.macro_ro_th + cfg.macro_hyst) macroRegime = 1;
  else if (macroScore < cfg.macro_nt_th - cfg.macro_hyst) macroRegime = -1;

  const macroLbl = macroRegime === 1 ? 'INVEST' : macroRegime === 0 ? 'NEUTRAL' : 'CASH';
  const equityAlloc = macroRegime === 1 ? cfg.alloc_invest : macroRegime === 0 ? cfg.alloc_neutral : cfg.alloc_cash;
  const macroRiskMult = !cfg.enable_macro ? 1.0 : macroRegime === 1 ? 1.0 : macroRegime === 0 ? 0.6 : 0.25;

  const fSgn = v => (v >= 0 ? '+' : '') + v.toFixed(1);
  const curveState = unInverting ? 'UN-INVERTING ⚠ (recession-imminent)'
    : invNow ? `inverted ${fSgn(curveLatest)}pp (clock running)`
    : invRecent ? `recovering, ${fSgn(curveLatest)}pp (recently inverted)`
    : `normal +${fSgn(curveLatest)}pp`;
  const laborState = sahmGap === null ? 'no data'
    : sahmGap >= cfg.sahm_trig ? `SAHM TRIGGERED 🔴 gap ${fSgn(sahmGap)}pp`
    : sahmGap >= cfg.sahm_warn ? `weakening, gap ${fSgn(sahmGap)}pp`
    : (unTr6 || 0) < -0.10 ? 'improving (unemp falling)'
    : `stable, gap ${fSgn(sahmGap)}pp`;
  const fedState = (laborWeak && ffChg6m !== null && ffChg6m < 0) ? `cutting INTO weak labor ⚠ (${fSgn(ffChg6m)}pp/6m)`
    : fedCutting ? `easing tailwind (${fSgn(ffChg6m)}pp/6m)`
    : ffChg6m !== null && ffChg6m > 0.50 ? `hiking hard (${fSgn(ffChg6m)}pp/6m)`
    : ffChg6m !== null ? `on hold (${fSgn(ffChg6m)}pp/6m)` : 'no data';
  const housingState = houstYoy === null ? 'no data'
    : houstYoy > 5.0 ? `expanding ${fSgn(houstYoy)}% YoY`
    : houstYoy > 0.0 ? `stable ${fSgn(houstYoy)}% YoY`
    : houstYoy > cfg.houst_bad ? `softening ${fSgn(houstYoy)}% YoY`
    : `contracting ${fSgn(houstYoy)}% YoY (leads cycle ~12mo)`;

  let drags = [], supports = [];
  if (sCurve <= -0.5) drags.push(`Curve ${fSgn(sCurve)}`);
  if (sLabor <= -0.5) drags.push(`Labor ${fSgn(sLabor)}`);
  if (sFed <= -0.5) drags.push(`Fed ${fSgn(sFed)}`);
  if (sHousing <= -0.5) drags.push(`Housing ${fSgn(sHousing)}`);
  if (sCurve >= 0.5) supports.push(`Curve ${fSgn(sCurve)}`);
  if (sLabor >= 0.5) supports.push(`Labor ${fSgn(sLabor)}`);
  if (sFed >= 0.5) supports.push(`Fed ${fSgn(sFed)}`);
  if (sHousing >= 0.5) supports.push(`Housing ${fSgn(sHousing)}`);
  const dragsStr = drags.join(', ');
  const supportsStr = supports.join(', ');
  const macroWhy = macroRegime === 1
    ? `INVEST: lifted by ${supportsStr || 'balanced pillars'}${dragsStr ? '  |  watch: ' + dragsStr : ''}`
    : macroRegime === -1
    ? `CASH: dragged by ${dragsStr || 'broad weakness'}${supportsStr ? '  |  offset: ' + supportsStr : ''}`
    : `NEUTRAL: ${dragsStr ? 'drags: ' + dragsStr : 'no major drags'}${supportsStr ? '  |  supports: ' + supportsStr : ''}`;

  const result = {
    score: macroScore, regime: macroRegime, label: macroLbl,
    equityAlloc, macroRiskMult, why: macroWhy,
    pillars: {
      curve: { score: sCurve, state: curveState, val: curveLatest },
      labor: { score: sLabor, state: laborState, sahmGap, unTr6 },
      fed: { score: sFed, state: fedState, ffChg6m, ffChg3m },
      housing: { score: sHousing, state: housingState, houstYoy }
    },
    drags: dragsStr, supports: supportsStr
  };

  console.log(`[MACRO] Regime: ${result.label} (${result.score.toFixed(0)}/100) | Eq ${equityAlloc}%/Cash ${(100 - equityAlloc).toFixed(0)}%`);
  console.log(`[MACRO] Why: ${result.why}`);
  return result;
}
