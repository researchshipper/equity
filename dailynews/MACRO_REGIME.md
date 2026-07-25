# Dailynews — Deterministic Leading Macro-Regime Upgrade

## Recommendation in one sentence

Do **not** ask the LLM to calculate or “deduce” the market regime from prose or a screenshot. Add a deterministic `macroregime.js` data/calculation step, pass its immutable output to the LLM, require a short evidence-bounded explanation in `report.json`, and render that block **above the calendar and market commentary**.

This preserves the repository’s design principle: live data → structured JSON → deterministic renderer. It also prevents the current dashboard’s individual indicator cards from becoming an un-auditable, hyper-sensitive AI score.

---

## What is weak in the proposed specification—and the corrections

| Proposed item | Keep/change | Production correction |
|---|---|---|
| Fed net liquidity = `WALCL − WTREGEN − RRPONTSYD` | **Keep** | Excellent primary plumbing measure, but it is predominantly **weekly**. Use the latest common weekly observation and a **4-week / 13-week** change, not a synthetic 20-trading-day comparison. Preserve observation dates and mark stale series. |
| HYG/TLT 50-day momentum | **Keep** | Good leading risk-appetite proxy. Add **HYG/LQD** (lower-quality credit preference) and preferably option-adjusted spreads (**BAMLH0A0HYM2**) as confirmation. A ratio alone may move because Treasury duration changes. |
| 10Y–2Y curve | **Keep, demote as a gate** | A 2s10s un-inversion is not automatically bearish. It needs a **bear-steepening / growth-deterioration confirmation**. Add 10Y–3M (`T10Y3M`) as the primary recession-curve confirmation, require a 21-day steepening threshold, and use claims/ISM/new-orders deterioration as confirmation. |
| Copper/gold and DXY | **Keep, lower confidence** | Useful cyclicality/currency cross-check, not a standalone growth signal. Use 63 trading days (one quarter) and label it a “cross-asset confirmation.” |
| VIX/Fear & Greed/FedWatch | **Do not score as leading macro** | Retain for the dashboard as **market positioning / policy-expectations context**, but do not use them as core regime inputs. VIX is contemporaneous; fear/greed is derivative; FedWatch is a market price, not an independent macro fact. |
| CPI, NFP, housing starts, Sahm | **Use as lagging/confirmation** | Clearly separate them from the leading engine. CPI/NFP are important but lagging/coincident. Sahm is a recession-warning confirmation and should never drive a “risk-on” score. |

### Recommended indicator set

**Leading / primary (score):**

1. Net liquidity: `WALCL − WTREGEN − RRPONTSYD`; 4-week and 13-week changes.
2. Credit: HYG/TLT 63-day trend **and** HYG/LQD 63-day trend; high-yield OAS direction as confirmation.
3. Curve: `T10Y2Y`, `T10Y3M`, 21-day changes, plus an explicit “un-inversion” rule.
4. Cyclical demand: copper/gold 63-day trend and DXY 63-day inverse trend.
5. Leading real-economy confirmation: ISM new orders and initial claims 4-week average (if available). This prevents treating a harmless bull-steepener as a recession call.

**Lagging/coincident (explanation only):** CPI/PCE, unemployment/Sahm, payrolls, housing starts.

**Market/positioning context (explanation only):** VIX, equity breadth, put/call, FedWatch, S&P trend.

---

# Files to change

| File | Required change |
|---|---|
| `dailynews/macroregime.js` | **New.** Fetch/normalize inputs; calculate scores, confidence, gates, and regime JSON deterministically. |
| `dailynews/marketdata.js` | Add Yahoo daily-history support for `HYG`, `TLT`, `LQD`, `HG=F`, `GC=F`, `DX-Y.NYB`; alternatively keep this logic entirely in `macroregime.js`. Do not put FRED transformations in LLM text. |
| `dailynews/daily.js` | Run `node macroregime.js` during Phase 0 before lint/render. |
| `dailynews/report.schema.json` | Add the `macroRegime` contract below. |
| `dailynews/render.js` | Add `renderMacroRegime()` and insert it before `renderMacro(r.macro)`. |
| `dailynews/lint.js` | Require the block, verify allowed regime/allocation values, verify numeric values against `macroregime.json`, and reject fabricated calculations. |
| `dailynews/validate.js` | Require the rendered Macro Regime section and its “Leading / confirmation / risk” labels. |
| `dailynews/PROMPT.md` | Add the copy/paste instructions in the last section of this document. |
| `.gitignore` | Add `macroregime.json`; it is a per-run generated input just like `marketdata.json`. |

> **Important:** A `PROMPT.md` change alone is insufficient. The prompt can make an LLM write a convincing narrative, but cannot make it consistently calculate weekly FRED transformations, common-date alignment, score smoothing, circuit-breakers, and stale-data handling.

---

# 1. New generated artifact: `dailynews/macroregime.json`

The calculation engine owns all numeric fields and the calculated regime. The LLM may only copy these values and write `aiExplanation` using the supplied evidence.

```json
{
  "asOf": "2026-07-24",
  "generatedAt": "2026-07-25T21:10:00.000Z",
  "status": "ok",
  "dataQuality": {
    "confidence": "HIGH",
    "warnings": [],
    "staleSeries": []
  },
  "model": {
    "version": "macro-regime-v1",
    "lookbacks": { "liquidityWeeks": [4, 13], "marketDays": 63, "curveDays": 21, "emaPeriods": 8 }
  },
  "inputs": {
    "netLiquidity": {
      "valueUsdBn": 6250.4,
      "change4wUsdBn": 72.6,
      "change13wUsdBn": 183.1,
      "observationDate": "2026-07-22"
    },
    "credit": {
      "hygTltChange63dPct": 2.1,
      "hygTltAboveSma63": true,
      "hygLqdChange63dPct": 0.7,
      "hyOasChange21dBp": -18
    },
    "curve": {
      "t10y2yPct": 0.54,
      "t10y3mPct": 0.18,
      "change21dBp": 8,
      "isUninverting": false,
      "isBearSteepening": false
    },
    "intermarket": {
      "copperGoldChange63dPct": 3.4,
      "dxyChange63dPct": -1.2
    },
    "leadingConfirmation": {
      "initialClaims4wChangePct": -1.9,
      "ismNewOrders": 51.2,
      "available": true
    },
    "laggingContext": {
      "cpiYoyPct": 3.1,
      "sahmGapPct": 0.45,
      "nfpLatest": 175000
    }
  },
  "scores": {
    "liquidity": 0.73,
    "credit": 1.14,
    "curve": 1.5,
    "intermarket": 0.92,
    "leadingConfirmation": 0.5,
    "raw": 4.79,
    "rawScore": 79.9,
    "ema8": 71.4,
    "final": 71.4
  },
  "gates": {
    "liquidityDrain": false,
    "recessionaryUninversion": false,
    "creditStress": false,
    "scoreCap": 100,
    "applied": []
  },
  "regime": {
    "code": "LIQUIDITY_EXPANSION_GOLDILOCKS",
    "label": "LIQUIDITY EXPANSION · GOLDILOCKS",
    "riskState": "INVEST",
    "allocationGuidePct": 80,
    "riskMultiplier": 1.0
  },
  "evidence": {
    "leading": [
      "Net liquidity rose $72.6bn over four weeks.",
      "HYG/TLT is +2.1% over 63 sessions and above its 63-day average.",
      "Copper/gold rose while DXY fell over 63 sessions."
    ],
    "lagging": ["CPI is 3.1% YoY; Sahm gap is 0.45pp."],
    "risks": ["Inflation remains above a 2% target; this is not a forecast."]
  }
}
```

If any primary input is unavailable, output `status: "degraded"`, list the missing/stale series, reduce confidence, and **do not silently substitute values**. The renderer must show `DATA DEGRADED`, not a false-precision score.

---

# 2. Calculation rules for `macroregime.js`

Use a `clamp2(x) = max(-2, min(2, x))` helper. Normalize all price inputs to the latest common trading date before calculating ratios. Store raw observations and source URLs in the JSON for auditability.

## Scores

```js
// Weekly FRED liquidity series: latest common weekly date, not “20 trading days”.
S_liq = clamp2(netLiquidity.change4wUsdBn / 100);

// Structural credit: one-quarter trend.  HYG/LQD/OAS are confirmations,
// not an invitation to double-count the same signal.
const trendBonus = credit.hygTltAboveSma63 ? 0.5 : -0.5;
S_cred = clamp2(
  credit.hygTltChange63dPct * 0.35 + trendBonus +
  credit.hygLqdChange63dPct * 0.20 +
  clamp2((-credit.hyOasChange21dBp) / 25) * 0.20
);

// Curve gate: normal curve is constructive; inversion is late-cycle caution.
// Do not call un-inversion recessionary without steepening + growth confirmation.
if (curve.isRecessionaryUninversion) S_curve = -2.0;
else if (curve.t10y2yPct > 0.50 && curve.t10y3mPct > 0) S_curve = 1.5;
else if (curve.t10y2yPct < 0 || curve.t10y3mPct < 0) S_curve = -1.0;
else S_curve = 0;

S_inter = clamp2(
  intermarket.copperGoldChange63dPct * 0.20 -
  intermarket.dxyChange63dPct * 0.20
);

// Small confirmation only. Do not use CPI/NFP/Sahm here.
S_confirm = clamp2(
  (leadingConfirmation.ismNewOrders >= 50 ? 0.5 : -0.5) +
  (leadingConfirmation.initialClaims4wChangePct <= 0 ? 0.5 : -0.5)
);

// Preserve the four equally-weighted core pillars. Confirmation is a capped modifier.
macroRaw = S_liq + S_cred + S_curve + S_inter + 0.25 * S_confirm;
rawScore = ((macroRaw + 8.5) / 17.0) * 100;
macroScore = EMA(rawScore, 8);
```

## Explicit un-inversion definition

```js
const rapidlySteepening = curve.change21dBp >= 35;
const crossedFromInversion = curve.t10y2yPct >= 0 && curve.previous21dT10y2yPct < 0;
const growthDeteriorating =
  leadingConfirmation.initialClaims4wChangePct >= 5 ||
  leadingConfirmation.ismNewOrders < 47;

curve.isRecessionaryUninversion = crossedFromInversion && rapidlySteepening && growthDeteriorating;
```

This avoids a common false positive: calling every post-inversion normalisation a recession signal.

## Circuit breakers

```js
let scoreCap = 100;
const applied = [];

if (netLiquidity.change4wUsdBn < -50) {
  scoreCap = Math.min(scoreCap, 45);
  applied.push("NET_LIQUIDITY_DRAIN");
}
if (curve.isRecessionaryUninversion) {
  scoreCap = Math.min(scoreCap, 35);
  applied.push("RECESSIONARY_UNINVERSION");
}
if (credit.hyOasChange21dBp >= 75 || credit.hygLqdChange63dPct <= -3) {
  scoreCap = Math.min(scoreCap, 35);
  applied.push("CREDIT_STRESS");
}
finalScore = Math.min(macroScore, scoreCap);
```

## Output classification

Keep the requested action bands, but add an economic label. The action band is **not investment advice**; it is an internal risk-budget guide.

| Conditions | Regime code / display label | State / guide |
|---|---|---|
| Final ≥60, liquidity/credit positive, inflation context not accelerating | `LIQUIDITY_EXPANSION_GOLDILOCKS` / **LIQUIDITY EXPANSION · GOLDILOCKS** | `INVEST`, 80%, 1.0x |
| Final ≥60, cyclicals positive but inflation/DXY/oil imply pricing pressure | `LIQUIDITY_EXPANSION_REFLATION` / **LIQUIDITY EXPANSION · REFLATION** | `INVEST`, 70%, 0.85x |
| 40–59.9, disinflation/slowdown with no credit stress | `SLOWDOWN_DISINFLATION` / **SLOWDOWN · DISINFLATION** | `NEUTRAL`, 55%, 0.6x |
| <40, or a liquidity/curve/credit cap applies | `LIQUIDITY_DRAIN_RISK_OFF` / **LIQUIDITY DRAIN · RISK-OFF** | `CASH`, 25%, 0.25x |
| Low growth plus rising inflation pressure | `STAGFLATION_RISK` / **STAGFLATION RISK** | `CASH`, 25%, 0.25x |

---

# 3. Add this `report.schema.json` property

Add this top-level property after `macro` (and add `"macroRegime"` to the root `required` array once the engine is deployed):

```json
"macroRegime": {
  "type": "object",
  "description": "Deterministic leading macro-regime output copied from macroregime.json. Numeric facts and state must not be invented by the LLM.",
  "required": ["asOf", "status", "label", "score", "riskState", "allocationGuidePct", "riskMultiplier", "leading", "lagging", "risks", "aiExplanation"],
  "properties": {
    "asOf": { "type": "string" },
    "status": { "type": "string", "enum": ["ok", "degraded"] },
    "confidence": { "type": "string", "enum": ["HIGH", "MEDIUM", "LOW"] },
    "label": { "type": "string", "enum": ["LIQUIDITY EXPANSION · GOLDILOCKS", "LIQUIDITY EXPANSION · REFLATION", "SLOWDOWN · DISINFLATION", "LIQUIDITY DRAIN · RISK-OFF", "STAGFLATION RISK"] },
    "score": { "type": "number", "minimum": 0, "maximum": 100 },
    "riskState": { "type": "string", "enum": ["INVEST", "NEUTRAL", "CASH"] },
    "allocationGuidePct": { "type": "number", "minimum": 0, "maximum": 100 },
    "riskMultiplier": { "type": "number", "minimum": 0, "maximum": 1 },
    "gates": { "type": "array", "items": { "type": "string" } },
    "leading": { "type": "array", "minItems": 2, "maxItems": 5, "items": { "type": "string" } },
    "lagging": { "type": "array", "minItems": 1, "maxItems": 4, "items": { "type": "string" } },
    "risks": { "type": "array", "minItems": 1, "maxItems": 4, "items": { "type": "string" } },
    "aiExplanation": {
      "type": "string",
      "description": "Exactly 2–4 sentences. Interpret supplied leading, lagging, and risk evidence; do not add numeric facts or make a return forecast."
    },
    "dataWarnings": { "type": "array", "items": { "type": "string" } }
  }
}
```

## Required `report.json` syntax example

```json
"macroRegime": {
  "asOf": "2026-07-24",
  "status": "ok",
  "confidence": "HIGH",
  "label": "LIQUIDITY EXPANSION · GOLDILOCKS",
  "score": 71.4,
  "riskState": "INVEST",
  "allocationGuidePct": 80,
  "riskMultiplier": 1.0,
  "gates": [],
  "leading": [
    "Net liquidity: +$72.6bn over 4 weeks (latest common weekly observation: Jul 22).",
    "Credit: HYG/TLT +2.1% over 63 sessions and above its 63-day average.",
    "Cross-asset: copper/gold +3.4% and DXY -1.2% over 63 sessions."
  ],
  "lagging": [
    "Confirmation context: CPI 3.1% YoY; Sahm gap 0.45pp. These are not used as leading score inputs."
  ],
  "risks": [
    "Inflation remains above target; a 4-week net-liquidity reversal below -$50bn would cap the score at 45."
  ],
  "aiExplanation": "The leading basket is constructive because liquidity, credit appetite, and cyclical cross-asset demand are aligned on quarter-length windows. Lagging inflation and labor measures still argue for monitoring policy sensitivity rather than extrapolating the current score. No macro circuit breaker is active; this is a risk-budget classification, not a price forecast.",
  "dataWarnings": []
}
```

---

# 4. Renderer placement and formatting requirement

Add `renderMacroRegime(r.macroRegime)` in `render.js` and place it directly after the hero/insider block and **before** the existing macro calendar:

```js
${insiderBlock}
${renderMacroRegime(r.macroRegime)}
${renderMacro(r.macro)}
${renderCommentary(r.marketCommentary)}
```

The section should show, in this exact order:

1. `🧭 LEADING MACRO REGIME` header;
2. regime label, final score `/100`, confidence, and `DATA DEGRADED` warning if applicable;
3. `Risk state`, allocation guide, and risk multiplier;
4. a visually distinct `Circuit breakers` row (`None active` or exact gate codes);
5. three labelled lists: **Leading evidence**, **Lagging / confirmation context**, **Risks / falsifiers**;
6. `AI synthesis` as the 2–4 sentence constrained explanation;
7. a small footer: `Model v1 · 4w liquidity / 63-session market trends / 21-session curve gate · Not investment advice.`

Do **not** display a fabricated “probability of recession” or a directional S&P target.

---

# 5. Exact additions for `PROMPT.md`

Paste the following block under `CONTENT REQUIREMENTS` and before `DETERMINISTIC REQUIREMENTS`.

```md
## 🧭 LEADING MACRO REGIME — REQUIRED, DETERMINISTIC

PHASE 0b — run the macro engine after market data and before research:

```bash
node news/macroregime.js --print
```

This writes `news/macroregime.json`. It is the sole source of truth for the
leading macro regime, score, allocation guide, risk multiplier, gates, dates,
and all macro-regime numeric values. Never calculate these values yourself,
round them differently, substitute stale values, or infer them from a chart.

### Regime discipline
- `macroregime.js` uses leading inputs: 4-week/13-week Fed net liquidity,
  63-session credit and intermarket trends, and a 21-session yield-curve gate.
- CPI/PCE, NFP/unemployment/Sahm, housing starts, VIX/Fear & Greed, and FedWatch
  are **lagging, coincident, or market-positioning context**. They may explain
  or qualify the regime but must not be described as the leading score driver.
- A yield-curve un-inversion is bearish only when the engine says
  `recessionaryUninversion: true`; do not override it editorially.
- A gate is binding. If the engine returns a score cap or `CASH`, do not call
  the regime bullish because equities, VIX, or FedWatch moved favorably.
- If `status` is `degraded`, show the exact data warning and write a cautious
  explanation. Do not fill missing inputs with estimates.

### Required `report.json` block
Copy the engine values into `macroRegime` exactly. Then write only:
- `leading`: 2–5 concise evidence lines from `macroregime.json.evidence.leading`;
- `lagging`: 1–4 lines from its lagging/coincident context;
- `risks`: 1–4 active risks/falsifiers, including any circuit breaker;
- `aiExplanation`: exactly 2–4 analyst sentences.

The explanation must distinguish **leading evidence**, **lagging confirmation**,
and **risk/falsifiers**. It must be conditional and evidence-bound; it must not
predict index returns, claim certainty, or give personalized investment advice.

Use this output structure:

```json
"macroRegime": {
  "asOf": "COPY_FROM_ENGINE",
  "status": "COPY_FROM_ENGINE",
  "confidence": "COPY_FROM_ENGINE",
  "label": "COPY_FROM_ENGINE",
  "score": 0,
  "riskState": "COPY_FROM_ENGINE",
  "allocationGuidePct": 0,
  "riskMultiplier": 0,
  "gates": ["COPY_FROM_ENGINE"],
  "leading": ["Engine-backed leading evidence"],
  "lagging": ["Clearly labelled lagging/coincident context"],
  "risks": ["Specific invalidation or active circuit breaker"],
  "aiExplanation": "Two to four sentences; no new numerical facts.",
  "dataWarnings": []
}
```
```

Finally, amend the existing Phase 0 commands in both workflow copies:

```bash
node news/marketdata.js --print
node news/macroregime.js --print
node news/insiders.js fetch
```

And amend Phase 4 so `daily.js --strict` runs `macroregime.js` prior to linting.

---

# 6. Lint/validate acceptance rules

Add these deterministic checks:

- `E060`: `macroRegime` missing.
- `E061`: report values differ from `macroregime.json` beyond display rounding (`score ±0.05`; allocation/risk state/label/gates exact match).
- `E062`: explanation has fewer than 2 or more than 4 sentences, or includes a number not present in engine evidence.
- `E063`: `status: degraded` but report omits any engine warning.
- `E064`: report calls a lagging/positioning metric a leading driver.
- `E065`: active circuit breaker is absent from `risks` or renderer output.

In `validate.js --strict`, require these strings in the final HTML:

```js
const macroRegimePhrases = [
  'LEADING MACRO REGIME',
  'Leading evidence',
  'Lagging / confirmation context',
  'Risks / falsifiers',
  'Circuit breakers',
  'AI synthesis'
];
```

---

# Rollout order

1. Implement and self-test `macroregime.js` with fixed fixture data before live sources.
2. Add the schema, renderer, lint, and validator changes.
3. Update `daily.js` and `.gitignore`.
4. Add the `PROMPT.md` block last—after the data contract exists.
5. Run:

```bash
node dailynews/macroregime.js --selftest
node dailynews/marketdata.js --print
node dailynews/macroregime.js --print
node dailynews/lint.js --strict --fix-prompt
node dailynews/daily.js --strict
```

This implementation makes the screenshot-style tiles useful as readable context while ensuring the reported regime is reproducible, resilient to brief rallies, and explicit about whether it is based on leading signals, lagging confirmation, or a binding liquidity/credit risk gate.
