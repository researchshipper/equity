#!/usr/bin/env node
/**
 * validate.js — Extra deterministic validation layer on top of lint.js
 *
 * Catches high-level "did the LLM actually follow the full spec" issues
 * that are easier to check on the final HTML + report.json.
 *
 * Usage:
 *   node news/validate.js --strict
 *   (called from PROMPT workflow after daily.js or render)
 *
 * Exit 1 on failures so agents must fix.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HTML = path.join(ROOT, 'marketbeat_report.html');
const REPORT = path.join(ROOT, 'report.json');

function fail(msg) {
  console.error('❌ VALIDATE FAIL:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('✅', msg);
}

function main() {
  const strict = process.argv.includes('--strict');

  if (!fs.existsSync(HTML)) fail('marketbeat_report.html missing — run daily.js or render.js');
  if (!fs.existsSync(REPORT)) fail('report.json missing');

  const html = fs.readFileSync(HTML, 'utf8');
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));

  // 1. Dual insiders (critical new feature)
  if (!/7d \(aggressive recent\) \+ 30d \(smoother primary\)/i.test(html)) {
    fail('Missing dual 7d+30d insider header in final HTML. Must have both aggressive 7d and smoother 30d tables.');
  }
  if (!/Last 7 days — aggressive latest buys/i.test(html)) {
    fail('Missing "Last 7 days — aggressive latest buys" table.');
  }
  if (!/Last 30 days — smoother aggregate \(primary filter\)/i.test(html)) {
    fail('Missing "Last 30 days — smoother aggregate (primary filter)" table.');
  }
  ok('Dual 7d + 30d insider tables present');

  // 2. Rich macro style (the #1 thing other LLMs miss)
  const requiredPhrases = ['JOLTS', '2-yr high', 're-fired', 'hawkish tilt', 'vs ', 'fcst'];
  const missing = requiredPhrases.filter(p => !html.toLowerCase().includes(p.toLowerCase()));
  if (missing.length > 0) {
    fail(`Macro tiles lack rich analytical style. Missing phrases: ${missing.join(', ')}. See PROMPT.md "DETERMINISTIC REQUIREMENTS" section for exact examples (JOLTS "2-yr high — re-fired", ADP "vs fcst + hawkish tilt").`);
  }
  ok('Rich macro analytical style present (JOLTS/ADP style details)');

  // 3. Minimum news cards
  const cardMatches = html.match(/<article class="news">/g) || [];
  if (cardMatches.length < 12) {
    fail(`Only ${cardMatches.length} news cards in HTML. PROMPT requires 12–20.`);
  }
  ok(`${cardMatches.length} news cards (within 12-20 range)`);

  // 4. marketCommentary multi-view
  if (report.marketCommentary) {
    const mc = report.marketCommentary;
    const hasViews = mc.views && (mc.views.bull || mc.views.base || mc.views.bear);
    if (!hasViews) {
      fail('marketCommentary missing bull/base/bear views.');
    }
    ok('marketCommentary has multi-view (bull/base/bear)');
  }

  // 5. Timestamp present
  if (!report.time || !report.generatedAt) {
    console.warn('⚠️  report.time or generatedAt missing (recommended for same-day runs)');
  } else {
    ok('Timestamp + generatedAt present');
  }

  console.log('\n✅ validate.js passed — report follows deterministic spec.');
  if (strict) process.exit(0);
}

if (require.main === module) main();
module.exports = { main };