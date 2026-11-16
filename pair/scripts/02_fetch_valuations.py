#!/usr/bin/env python3
"""Step 2: Scrape live Forward P/E, Trailing P/E, Market Cap, Dividend Yield,
and Next Earnings Date from StockAnalysis for universe equities."""
import json, re, sys, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

H = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

def fetch_sa_val(ticker):
    url = f"https://stockanalysis.com/stocks/{ticker.lower()}/"
    for _ in range(2):
        try:
            r = requests.get(url, headers=H, timeout=15)
            if r.status_code != 200:
                time.sleep(0.4)
                continue
            soup = BeautifulSoup(r.text, "html.parser")
            kv = {}
            for tr in soup.find_all("tr"):
                tds = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
                if len(tds) >= 2:
                    kv[tds[0]] = tds[1]
            div_raw = kv.get("Dividend", "—")
            m_yld = re.search(r"\(([\d\.]+%)\)", div_raw)
            return {
                "ticker": ticker,
                "mcap": kv.get("Market Cap", "—"),
                "pe": kv.get("PE Ratio", "—"),
                "fpe": kv.get("Forward PE", "—"),
                "div_yld": m_yld.group(1) if m_yld else "0.00%",
                "earn_dt": kv.get("Earnings Date", "—"),
            }
        except Exception:
            time.sleep(0.4)
    return {"ticker": ticker, "mcap": "—", "pe": "—", "fpe": "—", "div_yld": "—", "earn_dt": "—"}

def main():
    if len(sys.argv) > 1:
        tickers = sorted({t.upper() for t in sys.argv[1:]})
    else:
        with open(DATA_DIR / "stock_rv_scan.json") as f:
            scan = json.load(f)
        tickers = sorted(scan["stats"].keys())

    print(f"Scraping live StockAnalysis multiples & earnings dates for {len(tickers)} stocks...")
    out = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(fetch_sa_val, t): t for t in tickers}
        for fut in as_completed(futs):
            t = futs[fut]
            out[t] = fut.result()

    with open(DATA_DIR / "stock_valuations.json", "w") as f:
        json.dump(out, f, indent=2)

    print(f"\n{'Ticker':<7} {'MktCap':<10} {'FwdPE':>7} {'TrlPE':>7} {'DivYld':>8}  {'Next Earnings'}")
    print("-" * 60)
    for t in sorted(out.keys()):
        v = out[t]
        print(f"{t:<7} {v['mcap']:<10} {v['fpe']:>7} {v['pe']:>7} {v['div_yld']:>8}  {v['earn_dt']}")

if __name__ == "__main__":
    main()
