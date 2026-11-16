#!/usr/bin/env python3
"""Step 2: Narrow-Funnel StockAnalysis Valuation & Earnings Scraper.
By default scrapes ONLY the ~40-55 unique tickers in Step 1's deterministic Shortlist
(~3-5s total, zero rate-limit risk even when Step 1 scans all 500 S&P 500 stocks).
Pass explicit tickers as CLI arguments to append/refresh extra names, or --all for full universe."""
import argparse, json, re, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

H = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


def make_session():
    sess = requests.Session()
    adapter = HTTPAdapter(pool_connections=16, pool_maxsize=16)
    sess.mount("https://", adapter)
    sess.headers.update(H)
    return sess


def fetch_sa_val(sess: requests.Session, ticker: str) -> tuple[str, dict]:
    slug = ticker.lower().replace("-", ".")
    url = f"https://stockanalysis.com/stocks/{slug}/"
    for attempt in range(2):
        try:
            r = sess.get(url, timeout=15)
            if r.status_code != 200:
                time.sleep(0.4 * (attempt + 1))
                continue
            soup = BeautifulSoup(r.text, "html.parser")
            kv = {}
            for tr in soup.find_all("tr"):
                tds = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
                if len(tds) >= 2:
                    kv[tds[0]] = tds[1]
            div_raw = kv.get("Dividend", "—")
            m_yld = re.search(r"\(([\d\.]+%)\)", div_raw)
            mcap_raw = kv.get("Market Cap", "—")
            return ticker, {
                "ticker": ticker,
                "mcap": mcap_raw.split()[0] if mcap_raw and mcap_raw != "—" else "—",
                "pe": kv.get("PE Ratio", "—"),
                "fpe": kv.get("Forward PE", "—"),
                "div_yld": m_yld.group(1) if m_yld else "0.00%",
                "earn_dt": kv.get("Earnings Date", "—"),
            }
        except Exception:
            time.sleep(0.4 * (attempt + 1))
    return ticker, {"ticker": ticker, "mcap": "—", "pe": "—", "fpe": "—", "div_yld": "—", "earn_dt": "—"}


def main():
    ap = argparse.ArgumentParser(description="Scrape live StockAnalysis Forward P/E, Div Yield & Earnings Dates")
    ap.add_argument("tickers", nargs="*", help="Optional explicit tickers to fetch & merge into stock_valuations.json")
    ap.add_argument("--all", action="store_true", help="Scrape every ticker in stock_rv_scan.json (slow for S&P 500)")
    args = ap.parse_args()

    val_path = DATA_DIR / "stock_valuations.json"
    out = json.loads(val_path.read_text()) if (args.tickers and val_path.exists()) else {}

    if args.tickers:
        tickers = sorted({t.upper().replace(".", "-") for t in args.tickers})
        mode = "EXPLICIT MERGE"
    else:
        scan = json.loads((DATA_DIR / "stock_rv_scan.json").read_text())
        if args.all:
            tickers = sorted(scan["stats"].keys())
            mode = "FULL UNIVERSE"
        else:
            tickers = sorted(scan.get("shortlist_tickers") or scan["stats"].keys())
            mode = "FUNNEL SHORTLIST"

    t0 = time.time()
    print(f"[{mode}] Scraping live StockAnalysis multiples & earnings dates for {len(tickers)} stocks...")
    sess = make_session()
    with ThreadPoolExecutor(max_workers=10) as ex:
        for t, res in ex.map(lambda tk: fetch_sa_val(sess, tk), tickers):
            out[t] = res

    val_path.write_text(json.dumps(out, indent=2))
    print(f"Completed in {time.time() - t0:.2f}s -> data/stock_valuations.json ({len(out)} total cached)\n")

    print(f"{'Ticker':<7} {'MktCap':<10} {'FwdPE':>7} {'TrlPE':>7} {'DivYld':>8}  {'Next Earnings'}")
    print("-" * 62)
    for t in tickers:
        v = out[t]
        print(f"{t:<7} {v['mcap']:<10} {v['fpe']:>7} {v['pe']:>7} {v['div_yld']:>8}  {v['earn_dt']}")


if __name__ == "__main__":
    main()
