#!/usr/bin/env python3
"""Step 1: Fetch live 1Y daily dividend-adjusted OHLCV for config/universe.json peer pairs
and compute 1W/1M/1Q spreads, 63d/21d ratio Z-scores, 126d correlation, MAs, RSI-14 & ATR-14."""
import json, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/json",
}

def fetch_yf(ticker, range_str="1y"):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range={range_str}&interval=1d&includeAdjustedClose=true"
    for attempt in range(3):
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                res = r.json()["chart"]["result"][0]
                q = res["indicators"]["quote"][0]
                adj = res["indicators"].get("adjclose", [{}])[0].get("adjclose", q["close"])
                df = pd.DataFrame({
                    "date": pd.to_datetime(res["timestamp"], unit="s", utc=True).tz_convert("America/New_York").date,
                    "open": q["open"], "high": q["high"], "low": q["low"],
                    "close": q["close"], "adjclose": adj, "volume": q["volume"],
                }).dropna(subset=["close"]).drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)
                return df
        except Exception:
            pass
        time.sleep(0.4 * (attempt + 1))
    return None

def ticker_stats(df):
    c = df["close"].astype(float)
    ac = df["adjclose"].astype(float)
    h, l = df["high"].astype(float), df["low"].astype(float)
    e20 = float(c.ewm(span=20, adjust=False).mean().iloc[-1])
    s50 = float(c.rolling(50).mean().iloc[-1])
    e50 = float(c.ewm(span=50, adjust=False).mean().iloc[-1])
    s200 = float(c.rolling(200).mean().iloc[-1]) if len(c) >= 200 else float(c.mean())
    px, h52 = float(c.iloc[-1]), float(h.max())
    delta = c.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rsi = float((100 - 100 / (1 + gain / loss.replace(0, np.nan))).iloc[-1])
    tr = pd.concat([h - l, (h - c.shift(1)).abs(), (l - c.shift(1)).abs()], axis=1).max(axis=1)
    atr = float(tr.rolling(14).mean().iloc[-1])
    c10_50 = int((c.tail(10) > c.rolling(50).mean().tail(10)).sum())
    return {
        "asof": str(df["date"].iloc[-1]), "px": round(px, 2),
        "r1w": round((ac.iloc[-1] / ac.iloc[-6] - 1) * 100, 2),
        "r1m": round((ac.iloc[-1] / ac.iloc[-22] - 1) * 100, 2),
        "r1q": round((ac.iloc[-1] / ac.iloc[-64] - 1) * 100, 2),
        "d52": round((px / h52 - 1) * 100, 2),
        "e20": round(e20, 2), "s50": round(s50, 2), "e50": round(e50, 2), "s200": round(s200, 2),
        "dE20": round((px / e20 - 1) * 100, 2), "dS50": round((px / s50 - 1) * 100, 2), "dE50": round((px / e50 - 1) * 100, 2),
        "rsi": round(rsi, 1), "atr": round(atr, 2), "c10_50d": c10_50,
    }

def main():
    with open(ROOT / "config/universe.json") as f:
        pairs = json.load(f)["pairs"]
    tickers = sorted({t for p in pairs for t in (p[0], p[1])})
    print(f"Fetching 1Y daily OHLCV for {len(tickers)} US equities...")

    dfs = {}
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(fetch_yf, t): t for t in tickers}
        for fut in as_completed(futs):
            t = futs[fut]
            df = fut.result()
            if df is not None and len(df) >= 70:
                dfs[t] = df
            else:
                print(f"  WARN: {t} failed or insufficient history")

    asof = str(max(df["date"].iloc[-1] for df in dfs.values()))
    print(f"Loaded {len(dfs)}/{len(tickers)} stocks cleanly (Latest Market Close: {asof}).\n")

    cache, stats = {}, {}
    for t, df in dfs.items():
        stats[t] = ticker_stats(df)
        d2 = df.copy()
        d2["date"] = d2["date"].astype(str)
        cache[t] = d2.to_dict(orient="records")
    with open(DATA_DIR / "stock_ohlcv_cache.json", "w") as f:
        json.dump(cache, f)

    rows = []
    for a, b, cluster, cat in pairs:
        if a not in dfs or b not in dfs:
            continue
        m = pd.merge(dfs[a][["date", "adjclose"]], dfs[b][["date", "adjclose"]], on="date", suffixes=("_a", "_b"))
        ra, rb = m["adjclose_a"], m["adjclose_b"]
        corr = round(float(ra.pct_change().dropna().tail(126).corr(rb.pct_change().dropna().tail(126))), 2)

        sa, sb = stats[a], stats[b]
        # Orient Leader > Laggard by 1M spread (fallback 1Q)
        if (sa["r1m"] - sb["r1m"]) >= 0:
            ldr, lag, sl, sg, rl, rg = a, b, sa, sb, ra, rb
        else:
            ldr, lag, sl, sg, rl, rg = b, a, sb, sa, rb, ra

        ratio = rg / rl
        z63 = round(float((ratio.iloc[-1] - ratio.iloc[-63:].mean()) / ratio.iloc[-63:].std()), 2)
        z21 = round(float((ratio.iloc[-1] - ratio.iloc[-21:].mean()) / ratio.iloc[-21:].std()), 2)
        rows.append({
            "cat": cat, "cluster": cluster, "ldr": ldr, "lag": lag, "corr": corr,
            "l_px": sl["px"], "g_px": sg["px"], "l_d52": sl["d52"], "g_d52": sg["d52"],
            "s1w": round(sl["r1w"] - sg["r1w"], 2), "s1m": round(sl["r1m"] - sg["r1m"], 2), "s1q": round(sl["r1q"] - sg["r1q"], 2),
            "z63": z63, "z21": z21,
            "g_dE20": sg["dE20"], "g_dS50": sg["dS50"], "g_dE50": sg["dE50"],
            "g_rsi": sg["rsi"], "g_c10_50d": sg["c10_50d"],
        })

    rows.sort(key=lambda r: (r["cat"] != "CORE", r["z63"]))
    out = {"asof": asof, "universe_tickers": len(dfs), "universe_pairs": len(rows), "stats": stats, "pairs": rows}
    with open(DATA_DIR / "stock_rv_scan.json", "w") as f:
        json.dump(out, f, indent=2)

    print(f"{'Cat':<4} {'Ldr>Lag':<11} {'Corr':>4} | {'1W':>7} {'1M':>7} {'1Q':>7} {'Z63':>6} {'Z21':>6} | {'Ldr52H':>7} {'Lag20E':>7} {'Lag50D':>7} {'RSI':>5} {'10d>50':>6} | Cluster")
    print("-" * 128)
    for r in rows:
        print(f"{r['cat']:<4} {r['ldr']+'>'+r['lag']:<11} {r['corr']:>4.2f} | {r['s1w']:+6.2f}% {r['s1m']:+6.2f}% {r['s1q']:+6.2f}% {r['z63']:+6.2f} {r['z21']:+6.2f} | {r['l_d52']:+6.1f}% {r['g_dE20']:+6.1f}% {r['g_dS50']:+6.1f}% {r['g_rsi']:>5.1f} {r['g_c10_50d']:>4d}/10 | {r['cluster']}")

if __name__ == "__main__":
    main()
