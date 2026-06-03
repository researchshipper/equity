#!/usr/bin/env node
/**
 * enrich.js — LLM-enrichment helper for Market Beat
 *
 * In Arena agent mode (or any LLM-equipped runtime), the LLM is already
 * available — there's no API key to wire up. This script doesn't call an
 * API. Instead, it:
 *
 *   1. Reads report.json (typically the output of newsbeat.js Path B,
 *      which has thin L2/L3 narratives like "Peer ripple (auto-derived)").
 *   2. Identifies cards that need enrichment (heuristic: L2/L3 text length
 *      is very short, or beneficiaries/victims lists are empty).
 *   3. Writes a prompt file (enrich.prompt.md) the agent can read and
 *      respond to. The agent's response is a small JSON patch that this
 *      script applies back to report.json.
 *
 * Two-mode usage:
 *
 *   A) Generate the prompt for the agent to fulfil:
 *        node enrich.js plan
 *
 *      → writes enrich.prompt.md  (agent reads this, writes enrich.patch.json)
 *
 *   B) Apply an agent-produced patch back into report.json:
 *        node enrich.js apply
 *
 *      → reads enrich.patch.json, merges into report.json, re-renders HTML.
 *
 * Round-trip:
 *   node newsbeat.js                 # autonomous fetch + thin report.json
 *   node enrich.js plan              # writes enrich.prompt.md
 *   (agent fulfils enrich.prompt.md, writes enrich.patch.json)
 *   node enrich.js apply             # merges patch + re-renders HTML
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { renderReport } = require('./render.js');

const REPORT   = path.join(__dirname, 'report.json');
const PROMPT   = path.join(__dirname, 'enrich.prompt.md');
const PATCH    = path.join(__dirname, 'enrich.patch.json');

// Heuristic: which cards need enrichment?
function needsEnrichment(card){
  const reasons = [];
  const l1 = card.levels?.L1?.text || '';
  const l2 = card.levels?.L2?.text || '';
  const l3 = card.levels?.L3?.text || '';
  if (l1.length < 80)  reasons.push('L1 too short');
  if (l2.length < 80)  reasons.push('L2 too short');
  if (l3.length < 80)  reasons.push('L3 too short');
  if (/auto-derived|placeholder|Direct impact from headline/i.test(l1+l2+l3)) reasons.push('placeholder language');
  if (!(card.beneficiaries||[]).length) reasons.push('no beneficiaries');
  if (!(card.victims||[]).length)       reasons.push('no victims');
  if (!card.timeline?.M || card.timeline.M.length < 40) reasons.push('thin timeline');
  return reasons;
}

// ─── PLAN ──────────────────────────────────────────────────────────────────
function plan(){
  if (!fs.existsSync(REPORT)){
    console.error(`❌ ${REPORT} not found. Run newsbeat.js first.`);
    process.exit(1);
  }
  const r = JSON.parse(fs.readFileSync(REPORT,'utf8'));

  const targets = (r.news||[]).map(card => ({
    id: card.id,
    headline: card.headline,
    source: card.source,
    url: card.url,
    tickers: card.tickers,
    current: {
      L1: card.levels?.L1?.text || '',
      L2: card.levels?.L2?.text || '',
      L3: card.levels?.L3?.text || '',
      beneficiaries: card.beneficiaries || [],
      victims: card.victims || [],
      timeline: card.timeline || {},
    },
    reasons: needsEnrichment(card),
  })).filter(c => c.reasons.length > 0);

  if (!targets.length){
    console.log('✨ Nothing to enrich — every card already has rich L1/L2/L3.');
    return;
  }

  const md = `# Enrich Market Beat report.json — agent instructions

You have ${targets.length} news cards to enrich in news/report.json.
For each card below, **deepen the L1/L2/L3 narratives and beneficiaries/victims**
to senior-analyst quality. Do NOT change ticker scores, priority, or headlines.

## Output format

Write your enrichments to **\`news/enrich.patch.json\`** as:

\`\`\`json
{
  "patches": [
    {
      "id": 1,
      "levels": {
        "L1": { "text": "Direct impact narrative — 1-3 sentences with specific numbers." },
        "L2": { "text": "Ecosystem/peer ripple — name peers, suppliers, customers." },
        "L3": { "text": "Macro/sector/structural — connect to rates, USD, CPI, geopolitics." }
      },
      "beneficiaries": ["TICKER — why ...", "..."],
      "victims":       ["TICKER — why ...", "..."],
      "timeline": {
        "D": "Days ...", "W": "Weeks ...", "M": "Months ...", "L": "Long-term ..."
      }
    },
    ...
  ]
}
\`\`\`

Then say "patch ready" and I'll run \`node enrich.js apply\`.

## Style guide

- Analyst voice. Specific numbers when known (price moves, multiples, $).
- L2 must name **PEERS, SUPPLIERS, or CUSTOMERS** as the ripple chain.
- L3 must connect to a **macro lens**: rates, USD, CPI, oil, regulation, China.
- Beneficiaries/victims are 3–6 bullets each, format \`"TICKER — short reason"\`.
- Timeline has 4 short sentences (D/W/M/L).

## Cards to enrich

${targets.map(t => `
### Card #${t.id} — ${t.headline}

- **Source**: ${t.source || '(unknown)'}
- **URL**: ${t.url || '(none)'}
- **Tickers**: ${(t.tickers||[]).map(x => `${x.symbol}:${x.score>0?'+':''}${x.score}`).join(', ') || '(none)'}
- **Why this needs enrichment**: ${t.reasons.join('; ')}
- **Current L1**: ${t.current.L1 || '(empty)'}
- **Current L2**: ${t.current.L2 || '(empty)'}
- **Current L3**: ${t.current.L3 || '(empty)'}
- **Current beneficiaries**: ${t.current.beneficiaries.length ? t.current.beneficiaries.join(' · ') : '(empty)'}
- **Current victims**:       ${t.current.victims.length       ? t.current.victims.join(' · ')       : '(empty)'}
`).join('\n')}

---

Total: **${targets.length}** cards. When done, save \`enrich.patch.json\` and run:
\`\`\`bash
node news/enrich.js apply
\`\`\`
`;

  fs.writeFileSync(PROMPT, md);
  console.log(`📝 Prompt → ${PROMPT}`);
  console.log(`   ${targets.length} cards flagged for enrichment.`);
  console.log(`\nNext: agent reads ${PROMPT}, writes ${PATCH}, then run:`);
  console.log(`   node enrich.js apply`);
}

// ─── APPLY ─────────────────────────────────────────────────────────────────
function apply(){
  if (!fs.existsSync(PATCH)){
    console.error(`❌ ${PATCH} not found. Run \`enrich.js plan\` first, then have the agent fulfil it.`);
    process.exit(1);
  }
  const patch  = JSON.parse(fs.readFileSync(PATCH,'utf8'));
  const report = JSON.parse(fs.readFileSync(REPORT,'utf8'));

  const byId = {};
  for(const c of (report.news||[])) byId[c.id] = c;

  let count = 0;
  for(const p of (patch.patches || [])){
    const card = byId[p.id];
    if (!card){ console.warn(`  ! No card id=${p.id}`); continue; }

    if (p.levels){
      card.levels = card.levels || {};
      for(const k of ['L1','L2','L3']){
        if (p.levels[k]){
          card.levels[k] = card.levels[k] || {};
          if (p.levels[k].text)    card.levels[k].text    = p.levels[k].text;
          if (p.levels[k].tickers) card.levels[k].tickers = p.levels[k].tickers;
        }
      }
    }
    if (Array.isArray(p.beneficiaries)) card.beneficiaries = p.beneficiaries;
    if (Array.isArray(p.victims))       card.victims       = p.victims;
    if (p.timeline){
      card.timeline = { ...(card.timeline||{}), ...p.timeline };
    }
    count++;
  }

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(`✅ Applied ${count} patches → ${REPORT}`);

  // re-render
  const html = renderReport(report);
  const outPath = path.join(__dirname, `marketbeat_report_${report.date}.html`);
  fs.writeFileSync(outPath, html);
  console.log(`✅ Re-rendered HTML → ${outPath}`);

  // archive the patch
  const archive = path.join(__dirname, `enrich.patch.${report.date}.json`);
  fs.renameSync(PATCH, archive);
  console.log(`📦 Patch archived → ${archive}`);
}

// ─── CLI ───────────────────────────────────────────────────────────────────
function main(){
  const cmd = process.argv[2];
  if (cmd === 'plan')  return plan();
  if (cmd === 'apply') return apply();
  console.error(`Usage:
  node enrich.js plan      # write enrich.prompt.md for the agent
  node enrich.js apply     # merge enrich.patch.json into report.json + re-render`);
  process.exit(1);
}

if (require.main === module) main();

module.exports = { plan, apply, needsEnrichment };
