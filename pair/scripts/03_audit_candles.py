#!/usr/bin/env python3
"""Step 3: Print exact last-10-session daily OHLC candles vs 20-EMA, 50-DMA & 50-EMA
for candidate lagging stocks to verify true technical support holds."""
import json, sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

def main():
    with open(DATA_DIR / "stock_ohlcv_cache.json") as f:
        cache = json.load(f)
    tickers = [t.upper() for t in sys.argv[1:]] if len(sys.argv) > 1 else sorted(cache.keys())[:10]

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
        print(f"\n=== {t} | Close ${last['close']:.2f} | 20E ${last['e20']:.2f} ({(last['close']/last['e20']-1)*100:+.2f}%) | 50D ${last['s50']:.2f} ({(last['close']/last['s50']-1)*100:+.2f}%) | 50E ${last['e50']:.2f} ===")
        print(f"{'Date':<11} {'Open':>8} {'High':>8} {'Low':>8} {'Close':>8} | {'vs20E':>7} {'vs50D':>7} {'Hold?':<12}")
        for _, r in sub.iterrows():
            v20 = (r["close"] / r["e20"] - 1) * 100
            v50 = (r["close"] / r["s50"] - 1) * 100
            flags = ("20E " if r["close"] >= r["e20"] else "--- ") + ("50D " if r["close"] >= r["s50"] else "--- ") + ("50E" if r["close"] >= r["e50"] else "---")
            print(f"{r['date']:<11} {r['open']:8.2f} {r['high']:8.2f} {r['low']:8.2f} {r['close']:8.2f} | {v20:+6.2f}% {v50:+6.2f}% {flags}")

if __name__ == "__main__":
    main()
