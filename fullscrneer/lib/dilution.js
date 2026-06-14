/**
 * dilution.js — FORWARD Dilution Risk Engine
 *
 * Goal: flag the CONDITIONS that PRECEDE dilution, not the share-count bump
 * that confirms it after the raise already happened. By the time
 * sharesOutstanding jumps, the dilution is priced in — too late.
 *
 * Two layers:
 *   1. DETERMINISTIC pre-condition score (always runs, no API):
 *        - Cash runway (cash / quarterly burn) — strongest forward tell
 *        - Capex outrunning operating cash flow (the META/GOOGL "funding gap")
 *        - SBC intensity (stock-comp / revenue) — slow-motion dilution in progress
 *        - Share-count YoY trend (confirms management's dilution HABIT)
 *        - Leverage + negative FCF + refinancing pressure
 *        - Depressed price + cash need (forced raise at lows = worst case)
 *   2. GEMINI JUDGE (optional, on flagged/borderline names): reads the real
 *        downloaded numbers and judges intent + trajectory, distinguishing
 *        "huge capex but self-funded + buying back stock" (META = LOW risk)
 *        from "burn accelerating, 3 quarters cash, near lows" (HIGH risk).
 *
 * IMPORTANT distinction baked in: dilution ≠ capex. Issuing shares dilutes;
 * spending cash does not. A buyback-heavy megacap with massive capex funded
 * by OCF scores LOW here, by design.
 *
 * Data caveat: convertible-debt / warrant / ATM-shelf overhang (future
 * dilution not yet in the financials) is NOT in Yahoo's data. The Gemini
 * judge is told to flag this as an explicit unknown rather than assume absent.
 */

import cfg from '../config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pct = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';

/**
 * Build the deterministic dilution pre-condition score from Yahoo fundamentals.
 * Returns a 0-100 risk score (higher = more likely to dilute soon) + factors.
 *
 * @param {object} f  Flattened fundamentals (see extractFundamentals in screener)
 * @param {object} ctx { price, pctFromLo52 }  technical context
 */
export function computeDilutionScore(f, ctx = {}) {
  const factors = [];
  let risk = 0;            // 0-100, higher = worse
  const notes = [];

  const profitable = f.fcfTTM != null && f.fcfTTM > 0;
  const ocfPos = f.ocfTTM != null && f.ocfTTM > 0;

  // ── 1. Cash runway (only meaningful if burning) ──────────────────
  // quarterly burn ≈ -FCF/4 when FCF negative
  let runwayQ = null;
  if (f.cash != null && f.fcfTTM != null && f.fcfTTM < 0) {
    const quarterlyBurn = Math.abs(f.fcfTTM) / 4;
    runwayQ = quarterlyBurn > 0 ? f.cash / quarterlyBurn : null;
    if (runwayQ != null) {
      if (runwayQ < 4)      { risk += 35; factors.push(`runway ${runwayQ.toFixed(1)}q 🔴`); notes.push(`Only ${runwayQ.toFixed(1)} quarters of cash at current burn — raise pressure HIGH`); }
      else if (runwayQ < 6) { risk += 22; factors.push(`runway ${runwayQ.toFixed(1)}q ⚠`); notes.push(`${runwayQ.toFixed(1)} quarters of cash — raise likely within a year`); }
      else if (runwayQ < 10){ risk += 10; factors.push(`runway ${runwayQ.toFixed(1)}q`); }
      else                  { factors.push(`runway ${runwayQ.toFixed(1)}q ✅`); }
    }
  } else if (profitable) {
    factors.push('FCF+ (no burn)');
  }

  // ── 2. Capex outrunning operating cash flow (funding gap) ────────
  let capexCover = null;
  if (f.capex != null && f.ocfTTM != null && f.ocfTTM !== 0) {
    capexCover = Math.abs(f.capex) / Math.abs(f.ocfTTM);   // <1 = self-funded
    if (ocfPos) {
      if (capexCover > 1.2)      { risk += 20; factors.push(`capex ${(capexCover*100).toFixed(0)}% of OCF 🔴`); notes.push(`Capex is ${(capexCover*100).toFixed(0)}% of operating cash flow — funding gap must be closed by debt or equity`); }
      else if (capexCover > 0.9) { risk += 10; factors.push(`capex ${(capexCover*100).toFixed(0)}% of OCF ⚠`); notes.push(`Capex nearly consumes operating cash flow — little FCF cushion`); }
      else                       { factors.push(`capex ${(capexCover*100).toFixed(0)}% of OCF ✅ (self-funded)`); }
    } else {
      // negative OCF + any capex = the classic pre-dilution combo
      risk += 15; factors.push('capex on negative OCF 🔴'); notes.push('Spending capex while operating cash flow is negative');
    }
  }

  // ── 3. SBC intensity (slow-motion dilution already happening) ────
  let sbcPct = null;
  if (f.sbcTTM != null && f.revTTM != null && f.revTTM > 0) {
    sbcPct = f.sbcTTM / f.revTTM;
    if (sbcPct > 0.15)      { risk += 18; factors.push(`SBC ${(sbcPct*100).toFixed(1)}% of rev 🔴`); notes.push(`Stock-based comp is ${(sbcPct*100).toFixed(1)}% of revenue — heavy ongoing dilution via grants`); }
    else if (sbcPct > 0.08) { risk += 9;  factors.push(`SBC ${(sbcPct*100).toFixed(1)}% of rev ⚠`); }
    else if (sbcPct > 0)    { factors.push(`SBC ${(sbcPct*100).toFixed(1)}% of rev`); }
  } else {
    notes.push('SBC data unavailable (Yahoo coverage gap)');
  }

  // ── 4. Share-count YoY trend (confirms the HABIT) ────────────────
  // shareTrendYoY > 0 = net issuance (dilution); < 0 = net buybacks
  if (f.shareTrendYoY != null) {
    if (f.shareTrendYoY > 0.05)       { risk += 22; factors.push(`shares ${pct(f.shareTrendYoY)} YoY 🔴`); notes.push(`Share count up ${pct(f.shareTrendYoY)} YoY — active dilution already underway`); }
    else if (f.shareTrendYoY > 0.02)  { risk += 12; factors.push(`shares ${pct(f.shareTrendYoY)} YoY ⚠`); }
    else if (f.shareTrendYoY > 0.005) { risk += 4;  factors.push(`shares ${pct(f.shareTrendYoY)} YoY`); }
    else if (f.shareTrendYoY < -0.01) { risk -= 12; factors.push(`shares ${pct(f.shareTrendYoY)} YoY ✅ (buybacks)`); notes.push(`Net buybacks (${pct(f.shareTrendYoY)} YoY) — anti-dilutive`); }
    else                              { factors.push(`shares ${pct(f.shareTrendYoY)} YoY (flat)`); }
  }

  // ── 5. Leverage + refinancing pressure ──────────────────────────
  if (f.debtToEquity != null && f.debtToEquity > 2.0 && !profitable) {
    risk += 12; factors.push(`D/E ${f.debtToEquity.toFixed(1)} + FCF− 🔴`); notes.push('High leverage with negative FCF — refinancing wall raises equity-raise odds');
  } else if (f.debtToEquity != null && f.debtToEquity > 3.0) {
    risk += 6; factors.push(`D/E ${f.debtToEquity.toFixed(1)} ⚠`);
  }

  // ── 6. Depressed price + cash need (forced raise at lows) ────────
  const needsCash = (runwayQ != null && runwayQ < 8) || (!ocfPos);
  if (needsCash && ctx.pctFromLo52 != null && ctx.pctFromLo52 < 30) {
    risk += 10; factors.push('near 52w low + cash need 🔴'); notes.push('Stock near 52-week low while needing cash — any raise would be maximally dilutive (and is often forced)');
  }

  risk = clamp(risk, 0, 100);

  const tier = risk >= 60 ? 'HIGH' : risk >= 35 ? 'ELEVATED' : risk >= 18 ? 'MODERATE' : 'LOW';
  // borderline = worth spending an AI call on
  const borderline = risk >= 25 && risk < 70;

  return {
    score: Math.round(risk), tier, borderline,
    factors, notes,
    metrics: { runwayQ, capexCover, sbcPct, shareTrendYoY: f.shareTrendYoY, debtToEquity: f.debtToEquity, profitable, ocfPos },
  };
}

/**
 * Gemini judge — reads the REAL downloaded fundamentals and returns a
 * forward-looking dilution verdict. Strict JSON contract; defends against
 * hallucinated overhang by requiring an explicit "unknowns" field.
 *
 * Requires GEMINI_API_KEY. Returns null if no key (caller falls back to
 * deterministic score only).
 */
export async function geminiDilutionJudge(sym, f, det, ctx = {}) {
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || '';
  if (!apiKey) return null;

  // Only send REAL numbers; never let the model invent. Round for token economy.
  const r = v => (v == null ? null : Math.round(v));
  const facts = {
    ticker: sym,
    price: ctx.price ?? null,
    pctFrom52wLow: ctx.pctFromLo52 != null ? Math.round(ctx.pctFromLo52) : null,
    revenueTTM: r(f.revTTM), operatingCashFlowTTM: r(f.ocfTTM), freeCashFlowTTM: r(f.fcfTTM),
    capexTTM: r(f.capex), cashAndEquivalents: r(f.cash), totalDebt: r(f.totalDebt),
    sbcTTM: r(f.sbcTTM), debtToEquity: f.debtToEquity, sharesOutstanding: r(f.shares),
    shareCountYoYpct: f.shareTrendYoY != null ? +(f.shareTrendYoY * 100).toFixed(1) : null,
    deterministicRiskScore: det.score, deterministicTier: det.tier, deterministicFactors: det.factors,
  };

  const prompt = `You are a buy-side analyst judging FORWARD dilution risk: the likelihood this company ISSUES NEW SHARES (or is forced to) in the NEXT 12 MONTHS, diluting existing holders. We want to catch this BEFORE it happens.

CRITICAL RULES:
- Dilution = issuing shares. Heavy capex alone is NOT dilution if funded by operating cash flow. A profitable megacap with huge capex AND active buybacks is LOW risk even if capex looks scary.
- Forced dilution (low cash, near 52w lows, negative FCF, refinancing wall) is the worst kind — weight it heavily.
- Convertible debt, warrants, and ATM shelf registrations are NOT in the data below. Do NOT assume they are absent. If the profile suggests they might matter (small/unprofitable, prior raises), list it under "unknowns".
- Judge TRAJECTORY and INTENT from the numbers, not just levels. Use ONLY the data provided. Do not invent figures.

DATA (USD, TTM unless noted):
${JSON.stringify(facts, null, 2)}

Respond with ONLY a JSON object, no markdown:
{
  "verdict": "LOW" | "MODERATE" | "ELEVATED" | "HIGH",
  "confidence": "low" | "medium" | "high",
  "oneLine": "<=18 word summary of the forward dilution call",
  "rationale": "2-3 sentences on WHY, citing the specific numbers",
  "unknowns": "what off-balance-sheet dilution (converts/warrants/shelf) to verify in filings, or 'none apparent'",
  "agreesWithDeterministic": true | false
}`;

  const model = cfg.geminiModel || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 500, responseMimeType: 'application/json' },
      }),
    });
    if (!resp.ok) { return { error: `gemini ${resp.status}` }; }
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return parsed;
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Top-level: run deterministic on every name; call Gemini per policy.
 * policy: 'flagged' (borderline/high only) | 'all' | 'off'
 */
export async function assessDilution(sym, f, ctx, policy = 'flagged') {
  if (!f || f.revTTM == null) {
    return { score: null, tier: 'NO DATA', factors: ['no fundamentals'], notes: ['Yahoo returned no usable fundamentals'], ai: null };
  }
  const det = computeDilutionScore(f, ctx);

  let ai = null;
  const shouldAsk = policy === 'all' || (policy === 'flagged' && (det.borderline || det.tier === 'HIGH'));
  if (shouldAsk) ai = await geminiDilutionJudge(sym, f, det, ctx);

  return { ...det, ai };
}
