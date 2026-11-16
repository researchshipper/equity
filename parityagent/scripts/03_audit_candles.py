#!/usr/bin/env python3
"""Step 3: Print exact last-10-session daily OHLC candles vs 20-EMA, 50-DMA & 50-EMA
for candidate lagging stocks to verify true technical support holds.
Defaults to all actionable Funnel Shortlist laggards from Step 1 (or pass explicit tickers)."""
import json, signal, sys
from pathlib import Path
import pandas as pd

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


def main():
    cache = json.loads((DATA_DIR / "stock_ohlcv_cache.json").read_text())
    if len(sys.argv) > 1:
        tickers = [t.upper().replace(".", "-") for t in sys.argv[1:]]
    else:
        scan_path = DATA_DIR / "stock_rv_scan.json"
        if scan_path.exists():
            scan = json.loads(scan_path.read_text())
            tickers = scan.get("shortlist_laggards") or sorted(cache.keys())[:15]
        else:
            tickers = sorted(cache.keys())[:15]

    print(f"Auditing last 10 daily sessions vs 20-EMA / 50-DMA / 50-EMA for {len(tickers)} laggards...")
    for t in tickers:
        if t not in cache:
            print(f"[SKIP] {t} not in cache")
            continue
        df = pd.DataFrame(cache[t])
        c = df["close"].astype(float)
        df["e20"] = c.ewm(span=20, adjust=False).mean()
        df["s50"] = c.rolling(50).mean()
        df["e50"] = c.ewm(span=50, adjust=False).mean()
        sub = df.tail(10)
        last = sub.iloc[-1]
        print(
            f"\n=== {t} | Close ${last['close']:.2f} | 20E ${last['e20']:.2f} ({(last['close']/last['e20']-1)*100:+.2f}%) "
            f"| 50D ${last['s50']:.2f} ({(last['close']/last['s50']-1)*100:+.2f}%) | 50E ${last['e50']:.2f} ==="
        )
        print(f"{'Date':<11} {'Open':>8} {'High':>8} {'Low':>8} {'Close':>8} | {'vs20E':>7} {'vs50D':>7} {'Hold?':<12}")
        for _, r in sub.iterrows():
            v20 = (r["close"] / r["e20"] - 1) * 100
            v50 = (r["close"] / r["s50"] - 1) * 100
            flags = (
                ("20E " if r["close"] >= r["e20"] else "--- ")
                + ("50D " if r["close"] >= r["s50"] else "--- ")
                + ("50E" if r["close"] >= r["e50"] else "---")
            )
            print(f"{r['date']:<11} {r['open']:8.2f} {r['high']:8.2f} {r['low']:8.2f} {r['close']:8.2f} | {v20:+6.2f}% {v50:+6.2f}% {flags}")


if __name__ == "__main__":
    main()
