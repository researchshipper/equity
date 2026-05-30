/**
 * sanity.js — Data Clamping and Coherence Linter
 */

function clampData(val, min, max) {
    if (val === null || isNaN(val)) return null;
    return Math.max(min, Math.min(max, val));
}

function sanityCheck(financials) {
    let flags = [];
    
    // Revenue Growth Outliers (Clamp to 200% max to prevent Yahoo artifacts)
    if (financials.revGr > 2) {
        flags.push(`WARNING: Unrealistic revenue growth reported (${(financials.revGr * 100).toFixed(1)}%). Clamped to 200%.`);
        financials.revGr = 2.0;
    }
    
    return { sanitized: financials, flags };
}

function lintReport(htmlContent, roic, wacc, rsi) {
    let errors = [];
    
    const isBullish = htmlContent.includes("RATING: BUY") || htmlContent.includes("RATING: STRONG BUY");
    const isValueDestroyer = (roic != null && wacc != null) && (roic < wacc);
    const isBearishTech = rsi < 30; // severely oversold could be falling knife
    
    if (isBullish && isValueDestroyer) {
        errors.push("COHERENCE ERROR: Report issues a BUY rating but the mathematical ROIC is lower than WACC (Value Destroyer). Ensure narrative justifies this discrepancy.");
    }
    
    if (isBullish && isBearishTech) {
        errors.push("COHERENCE WARNING: Report issues a BUY rating on a stock with extremely bearish technicals (RSI < 30). This is a falling knife setup.");
    }
    
    return errors;
}

module.exports = { clampData, sanityCheck, lintReport };
