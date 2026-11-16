#!/usr/bin/env python3
"""Step 2: Pull live ETFdb 5D/1M/3M net flows and StockAnalysis top-25 constituent
breadth (% constituents above 20-DMA and 50-DMA + top-5 weight concentration)."""
import json, re, sys, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
import pandas as pd
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

H = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

def parse_etfdb_flows(ticker):
    url = f"https://etfdb.com/etf/{ticker}/"
    for _ in range(2):
        try:
            r = requests.get(url, headers=H, timeout=18)
            if r.status_code != 200:
                continue
            text = BeautifulSoup(r.text, "html.parser").get_text(" ", strip=True)
            res = {"ticker": ticker}
            m_aum = re.search(r"AUM\s*\$([0-9,\.]+\s*[MBT]?)", text)
            if m_aum:
                res["aum"] = "$" + m_aum.group(1).strip()
            for label, key in [
                ("5 Day Net Flows", "f5d"), ("1 Month Net Flows", "f1m"),
                ("3 Month Net Flows", "f3m"), ("1 Year Net Flows", "f1y"),
            ]:
                m = re.search(rf"{label}:?\s*(-?\$?[0-9,\.]+\s*[KMBT]?)", text)
                if m:
                    res[key] = m.group(1).strip()
            return res
        except Exception:
            time.sleep(0.5)
    return {"ticker": ticker, "aum": "n/a", "f5d": "n/a", "f1m": "n/a", "f3m": "n/a"}

def fetch_sa_holdings(ticker, top_n=25):
    url = f"https://stockanalysis.com/etf/{ticker.lower()}/holdings/"
    try:
        r = requests.get(url, headers=H, timeout=15)
        if r.status_code != 200:
            return []
        table = BeautifulSoup(r.text, "html.parser").find("table")
        if not table:
            return []
        out = []
        for tr in table.find_all("tr")[1:]:
            tds = [td.get_text(strip=True) for td in tr.find_all("td")]
            if len(tds) >= 4:
                sym = tds[1].strip()
                wt = tds[3].replace("%", "").strip()
                if sym and re.match(r"^[A-Z]{1,5}(\.[A-Z])?$", sym):
                    out.append({"sym": sym.replace(".", "-"), "wt": float(wt) if wt.replace(".", "", 1).isdigit() else 0.0})
        return out[:top_n]
    except Exception:
        return []

def fetch_close_6mo(sym):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=6mo&interval=1d"
    for _ in range(2):
        try:
            r = requests.get(url, headers=H, timeout=12)
            if r.status_code == 200:
                res = r.json()["chart"]["result"]
                if res and "timestamp" in res[0]:
                    c = pd.Series(res[0]["indicators"]["quote"][0]["close"]).dropna().astype(float)
                    if len(c) >= 55:
                        return bool(c.iloc[-1] > c.rolling(20).mean().iloc[-1]), bool(c.iloc[-1] > c.rolling(50).mean().iloc[-1])
        except Exception:
            pass
        time.sleep(0.15)
    return None

def main():
    if len(sys.argv) > 1:
        targets = [t.upper() for t in sys.argv[1:]]
    else:
        with open(DATA_DIR / "etf_scan.json") as f:
            scan = json.load(f)
        # Auto-select all Core 7 legs + top 12 expanded divergent laggards
        tset = set()
        for p in scan["pairs"]:
            if p["cat"] == "CORE":
                tset.update([p["ldr"], p["lag"]])
        exp_sorted = sorted([p for p in scan["pairs"] if p["cat"] != "CORE"], key=lambda x: min(x["z63"], x["z21"]))
        for p in exp_sorted[:12]:
            tset.update([p["ldr"], p["lag"]])
        targets = sorted(tset)

    print(f"Enriching {len(targets)} ETFs with live ETFdb flows & constituent breadth...")
    flows = {}
    holdings = {}
    for t in targets:
        flows[t] = parse_etfdb_flows(t)
        holdings[t] = fetch_sa_holdings(t, top_n=25)
        time.sleep(0.2)

    all_syms = sorted({x["sym"] for v in holdings.values() for x in v})
    print(f"Fetching 6M closes for {len(all_syms)} underlying constituents...")
    sym_state = {}
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(fetch_close_6mo, s): s for s in all_syms}
        for fut in as_completed(futs):
            s = futs[fut]
            res = fut.result()
            if res is not None:
                sym_state[s] = res

    breadth = {}
    print(f"\n{'ETF':<6} {'AUM':<10} {'5D Flow':<10} {'1M Flow':<10} {'3M Flow':<10} | {'N':>2} {'%>20D':>6} {'%>50D':>6} {'Top5Wt':>7}")
    print("-" * 82)
    for t in targets:
        h = holdings.get(t, [])
        valid = [x for x in h if x["sym"] in sym_state]
        n = len(valid)
        p20 = round(100.0 * sum(1 for x in valid if sym_state[x["sym"]][0]) / n, 1) if n else None
        p50 = round(100.0 * sum(1 for x in valid if sym_state[x["sym"]][1]) / n, 1) if n else None
        top5 = round(sum(x["wt"] for x in h[:5]), 1) if h else None
        breadth[t] = {"n_checked": n, "pct_above_20d": p20, "pct_above_50d": p50, "top5_wt": top5, "top5": h[:5]}
        fl = flows[t]
        s20 = f"{p20:5.1f}%" if p20 is not None else "   n/a"
        s50 = f"{p50:5.1f}%" if p50 is not None else "   n/a"
        sw5 = f"{top5:6.1f}%" if top5 is not None else "    n/a"
        print(f"{t:<6} {fl.get('aum','n/a'):<10} {fl.get('f5d','n/a'):<10} {fl.get('f1m','n/a'):<10} {fl.get('f3m','n/a'):<10} | {n:>2} {s20} {s50} {sw5}")

    with open(DATA_DIR / "etf_flows.json", "w") as f:
        json.dump(flows, f, indent=2)
    with open(DATA_DIR / "etf_breadth.json", "w") as f:
        json.dump(breadth, f, indent=2)

if __name__ == "__main__":
    main()
