function parseJsonl(text) {
  if (!text) return [];
  return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function evaluateSignals(ledger, quotesBySym) {
  let wins = 0;
  let losses = 0;
  let open = 0;
  let totalR = 0;

  ledger.forEach(signal => {
    const { sym, entry, stop, t1, date } = signal;
    const quotes = quotesBySym[sym] || [];
    
    // Find quotes after entry date
    const postEntry = quotes.filter(q => new Date(q.date) >= new Date(date));
    if (postEntry.length === 0) {
      open++;
      return;
    }

    // Basic evaluation logic
    const risk = entry - stop;
    let closed = false;

    for (const q of postEntry) {
      if (q.low <= stop) {
        losses++;
        totalR -= 1;
        closed = true;
        break;
      }
      if (q.high >= t1) {
        wins++;
        const profit = t1 - entry;
        totalR += (profit / risk);
        closed = true;
        break;
      }
    }
    if (!closed) open++;
  });

  const closedTotal = wins + losses;
  return {
    signals: ledger,
    stats: {
      total: ledger.length,
      open,
      winRatePct: closedTotal > 0 ? ((wins / closedTotal) * 100).toFixed(1) : 0,
      avgR: closedTotal > 0 ? (totalR / closedTotal).toFixed(2) : 0,
      cumR: totalR.toFixed(2)
    }
  };
}

module.exports = { parseJsonl, evaluateSignals };