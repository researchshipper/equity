#!/usr/bin/env python3
"""Step 1: Full-Market Single-Stock RV Scanner (3-Layer Funnel).
Combines:
  Layer 1: Curated CORE + EXP pairs from config/universe.json
  Layer 2: Full S&P 500 GICS Sub-Industry auto-generated pairs (~1,475 pairs, CIK-deduped)
  Layer 3: Optional agent-discovered hot-theme pairs from data/dynamic_pairs.json (DYNAMIC)

Fetches 1Y dividend-adjusted OHLCV in ~5s via pooled HTTP sessions, runs vectorized
correlation & Z-score math across ~1,500+ pairs, and emits a deterministic Top ~32
multi-horizon Shortlist for narrow Step 2 valuation scraping and Step 3 candle audits."""
import argparse, datetime, json, time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / "config"
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/json",
}

GICS_SHORT = {
    "Industrial Machinery & Supplies & Components": "Industrial Machinery",
    "Transaction & Payment Processing Services": "Payment Processing",
    "Technology Hardware, Storage & Peripherals": "Tech Hardware & Storage",
    "Life Sciences Tools & Services": "Life Sciences Tools",
    "Oil & Gas Exploration & Production": "Oil & Gas E&P",
    "Oil & Gas Equipment & Services": "Oilfield Services",
    "Oil & Gas Refining & Marketing": "Oil Refining & Mktg",
    "Oil & Gas Storage & Transportation": "Oil & Gas Midstream",
    "Property & Casualty Insurance": "P&C Insurance",
    "Financial Exchanges & Data": "Financial Exchanges",
    "Asset Management & Custody Banks": "Asset Management",
    "Investment Banking & Brokerage": "Investment Banks",
    "Consumer Staples Merchandise Retail": "Big-Box Retail",
    "Broadline Retail": "Broadline Retail",
    "Apparel Retail": "Apparel Retail",
    "Automotive Retail": "Auto Parts & Retail",
    "Hotels, Resorts & Cruise Lines": "Hotels & Cruises",
    "Packaged Foods & Meats": "Packaged Foods",
    "Soft Drinks & Non-alcoholic Beverages": "Beverages",
    "Semiconductor Materials & Equipment": "Semi Cap Equipment",
    "Communications Equipment": "Comms Equipment",
    "Interactive Media & Services": "Interactive Media",
    "Electronic Equipment & Instruments": "Electronic Instruments",
    "Electronic Manufacturing Services": "Electronics Mfg",
    "Electrical Components & Equipment": "Electrical Equipment",
    "Construction Machinery & Heavy Transportation Equipment": "Heavy Machinery",
    "Agricultural & Farm Machinery": "Ag & Farm Machinery",
    "Cargo Ground Transportation": "Ground Freight",
    "Passenger Airlines": "Airlines",
    "Health Care Equipment": "MedTech Equipment",
    "Health Care Supplies": "Health Care Supplies",
    "Health Care Distributors": "Health Distributors",
    "Health Care Facilities": "Health Facilities",
    "Health Care Services": "Health Care Services",
    "Managed Health Care": "Managed Care",
    "Environmental & Facilities Services": "Waste & Env Services",
    "Research & Consulting Services": "Research & Consulting",
    "Human Resource & Employment Services": "HR & Staffing",
    "Data Processing & Outsourced Services": "Data & BPO Services",
    "Real Estate Management & Development": "Real Estate Services",
    "Retail REITs": "Retail REITs",
    "Residential REITs": "Residential REITs",
    "Health Care REITs": "Health Care REITs",
    "Telecom Tower REITs": "Tower REITs",
    "Self-Storage REITs": "Self-Storage REITs",
    "Data Center REITs": "Data Center REITs",
    "Industrial REITs": "Industrial REITs",
    "Independent Power Producers & Energy Traders": "Power Producers",
    "Paper & Plastic Packaging Products & Materials": "Packaging Products",
    "Metal, Glass & Plastic Containers": "Metal & Glass Pack.",
    "Construction & Engineering": "Construction & Eng.",
    "Multi-line Insurance": "Multi-Line Insurance",
    "Life & Health Insurance": "Life & Health Ins.",
    "Distillers & Vintners": "Spirits & Beverages",
    "Personal Care Products": "Personal Care",
    "Household Products": "Household Products",
    "Specialty Chemicals": "Specialty Chemicals",
    "Industrial Gases": "Industrial Gases",
    "Construction Materials": "Construction Mat.",
    "Building Products": "Building Products",
    "Trading Companies & Distributors": "Industrial Dist.",
    "IT Consulting & Other Services": "IT Consulting",
    "Internet Services & Infrastructure": "Cloud & Internet Infra",
    "Integrated Telecommunication Services": "Integrated Telecom",
    "Movies & Entertainment": "Entertainment & Media",
    "Cable & Satellite": "Cable & Broadband",
    "Casinos & Gaming": "Casinos & Gaming",
    "Apparel, Accessories & Luxury Goods": "Apparel & Luxury",
    "Automobile Manufacturers": "Automakers",
    "Commercial & Residential Mortgage Finance": "Mortgage Finance",
    "Consumer Finance": "Consumer Finance",
    "Diversified Banks": "Money-Center Banks",
    "Regional Banks": "Regional Banks",
}


def short_cluster(name: str) -> str:
    if name in GICS_SHORT:
        return GICS_SHORT[name]
    return name if len(name) <= 26 else name[:24].rstrip() + ".."


def sync_sp500_gics(force_refresh: bool = False, refresh_days: int = 14) -> list:
    snap_path = CONFIG_DIR / "sp500_gics.json"
    need_refresh = force_refresh or not snap_path.exists()
    existing = None
    if snap_path.exists():
        try:
            existing = json.loads(snap_path.read_text())
            upd = datetime.date.fromisoformat(existing.get("updated_at", "2000-01-01"))
            if (datetime.date.today() - upd).days >= refresh_days:
                need_refresh = True
        except Exception:
            need_refresh = True

    if need_refresh:
        try:
            r = requests.get(
                "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
                headers={"User-Agent": HEADERS["User-Agent"]},
                timeout=15,
            )
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")
            tbl = soup.find("table", {"id": "constituents"})
            seen_cik, rows = set(), []
            for tr in tbl.find_all("tr")[1:]:
                tds = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
                if len(tds) < 4:
                    continue
                cik = tds[6].strip() if len(tds) > 6 else ""
                if cik and cik in seen_cik:
                    continue  # Drop dual-class share duplicates (GOOG, FOX, NWS)
                if cik:
                    seen_cik.add(cik)
                rows.append({
                    "ticker": tds[0].strip().replace(".", "-"),
                    "name": tds[1].strip(),
                    "sector": tds[2].strip(),
                    "sub_industry": tds[3].strip(),
                    "cik": cik,
                })
            if len(rows) >= 450:
                payload = {
                    "updated_at": datetime.date.today().isoformat(),
                    "source": "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
                    "count": len(rows),
                    "constituents": rows,
                }
                snap_path.write_text(json.dumps(payload, indent=2))
                print(f"[S&P 500] Synced live {len(rows)} unique constituents (CIK-deduped) -> config/sp500_gics.json")
                return rows
        except Exception as exc:
            print(f"[S&P 500] Live sync skipped ({exc}); using committed config/sp500_gics.json")

    if existing and existing.get("constituents"):
        return existing["constituents"]
    raise RuntimeError("No S&P 500 GICS list available and Wikipedia sync failed.")


def build_pair_universe(cfg: dict, include_sp500: bool, force_refresh_sp500: bool):
    """Merge Layer 1 (universe.json CORE/EXP), Layer 2 (S&P 500 GICS), Layer 3 (dynamic_pairs.json).
    Deduplication priority: CORE > DYNAMIC > EXP > SP500."""
    settings = cfg.get("settings", {})
    priority = {"CORE": 4, "DYNAMIC": 3, "EXP": 2, "SP500": 1}
    merged = {}  # frozenset({a, b}) -> (a, b, cluster, cat)
    counts = {"CORE": 0, "EXP": 0, "DYNAMIC": 0, "SP500": 0, "gics_sub_industries": 0}

    def add_pair(a, b, cluster, cat):
        a, b = a.strip().upper().replace(".", "-"), b.strip().upper().replace(".", "-")
        if not a or not b or a == b:
            return
        key = frozenset((a, b))
        if key not in merged or priority.get(cat, 0) > priority.get(merged[key][3], 0):
            merged[key] = (a, b, cluster, cat)

    # Layer 1: Curated CORE + EXP
    for item in cfg.get("pairs", []):
        a, b, cluster, cat = item[0], item[1], item[2], item[3].upper()
        add_pair(a, b, cluster, cat)

    # Layer 3: Optional Dynamic Hot-Theme Radar (data/dynamic_pairs.json)
    dyn_path = DATA_DIR / "dynamic_pairs.json"
    dyn_raw_count = 0
    if dyn_path.exists():
        try:
            dyn_data = json.loads(dyn_path.read_text())
            for item in dyn_data.get("pairs", []):
                if len(item) >= 3:
                    cat = item[3].upper() if len(item) >= 4 else "DYNAMIC"
                    add_pair(item[0], item[1], item[2], "DYNAMIC" if cat not in ("CORE",) else cat)
                    dyn_raw_count += 1
            if dyn_raw_count:
                print(f"[DYNAMIC] Loaded {dyn_raw_count} agent-discovered pairs from data/dynamic_pairs.json")
        except Exception as exc:
            print(f"[DYNAMIC] WARN: failed to parse data/dynamic_pairs.json ({exc})")

    # Layer 2: Full S&P 500 GICS Sub-Industry Auto-Pairs
    if include_sp500:
        constituents = sync_sp500_gics(
            force_refresh=force_refresh_sp500,
            refresh_days=int(settings.get("sp500_refresh_days", 14)),
        )
        by_sub = defaultdict(list)
        for c in constituents:
            by_sub[c["sub_industry"]].append(c["ticker"])
        active_subs = {k: sorted(set(v)) for k, v in by_sub.items() if len(set(v)) >= 2}
        counts["gics_sub_industries"] = len(active_subs)
        for sub_ind, tks in active_subs.items():
            lbl = short_cluster(sub_ind)
            for a, b in combinations(tks, 2):
                add_pair(a, b, lbl, "SP500")

    pairs = list(merged.values())
    for _, _, _, cat in pairs:
        counts[cat] = counts.get(cat, 0) + 1
    return pairs, counts


def make_session():
    sess = requests.Session()
    adapter = HTTPAdapter(pool_connections=32, pool_maxsize=32)
    sess.mount("https://", adapter)
    sess.headers.update(HEADERS)
    return sess


def fetch_yf(sess: requests.Session, ticker: str, range_str: str = "1y"):
    hosts = ("query1.finance.yahoo.com", "query2.finance.yahoo.com")
    for attempt in range(3):
        host = hosts[attempt % 2]
        url = f"https://{host}/v8/finance/chart/{ticker}?range={range_str}&interval=1d&includeAdjustedClose=true"
        try:
            r = sess.get(url, timeout=12)
            if r.status_code == 200:
                res = r.json()["chart"]["result"][0]
                q = res["indicators"]["quote"][0]
                adj = res["indicators"].get("adjclose", [{}])[0].get("adjclose", q["close"])
                df = pd.DataFrame({
                    "date": pd.to_datetime(res["timestamp"], unit="s", utc=True).tz_convert("America/New_York").date,
                    "open": q["open"], "high": q["high"], "low": q["low"],
                    "close": q["close"], "adjclose": adj, "volume": q["volume"],
                }).dropna(subset=["close", "adjclose"]).drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)
                return ticker, df
            elif r.status_code == 429:
                time.sleep(0.7 * (attempt + 1))
        except Exception:
            time.sleep(0.35 * (attempt + 1))
    return ticker, None


def ticker_stats(df: pd.DataFrame) -> dict:
    c = df["close"].astype(float)
    ac = df["adjclose"].astype(float)
    h, l = df["high"].astype(float), df["low"].astype(float)
    e20 = float(c.ewm(span=20, adjust=False).mean().iloc[-1])
    s50_ser = c.rolling(50).mean()
    s50 = float(s50_ser.iloc[-1])
    e50 = float(c.ewm(span=50, adjust=False).mean().iloc[-1])
    s200 = float(c.rolling(200).mean().iloc[-1]) if len(c) >= 200 else float(c.mean())
    px, h52 = float(c.iloc[-1]), float(h.max())
    delta = c.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rsi_val = (100 - 100 / (1 + gain / loss.replace(0, np.nan))).iloc[-1]
    rsi = float(rsi_val) if pd.notna(rsi_val) else 50.0
    tr = pd.concat([h - l, (h - c.shift(1)).abs(), (l - c.shift(1)).abs()], axis=1).max(axis=1)
    atr = float(tr.rolling(14).mean().iloc[-1])
    c10_50 = int((c.tail(10) > s50_ser.tail(10)).sum())
    return {
        "asof": str(df["date"].iloc[-1]),
        "px": round(px, 2),
        "r1w": round((ac.iloc[-1] / ac.iloc[-6] - 1) * 100, 2),
        "r1m": round((ac.iloc[-1] / ac.iloc[-22] - 1) * 100, 2),
        "r1q": round((ac.iloc[-1] / ac.iloc[-64] - 1) * 100, 2),
        "d52": round((px / h52 - 1) * 100, 2),
        "e20": round(e20, 2), "s50": round(s50, 2), "e50": round(e50, 2), "s200": round(s200, 2),
        "dE20": round((px / e20 - 1) * 100, 2),
        "dS50": round((px / s50 - 1) * 100, 2),
        "dE50": round((px / e50 - 1) * 100, 2),
        "rsi": round(rsi, 1),
        "atr": round(atr, 2),
        "c10_50d": c10_50,
    }


def score_pair(rec: dict) -> tuple[float, float]:
    """Deterministic institutional scoring:
    - action_score: rewards true high-corr twins, stretched parity, strong leader, constructive laggard MAs.
    - extreme_score: surfaces severe broken-technical / value-trap dislocations for Tier 3 Quarantine."""
    corr = rec["corr"]
    z63, z21 = rec["z63"], rec["z21"]
    s1w, s1m, s1q = rec["s1w"], rec["s1m"], rec["s1q"]
    l_d52, g_dS50, g_dE20, g_rsi = rec["l_d52"], rec["g_dS50"], rec["g_dE20"], rec["g_rsi"]
    cat = rec["cat"]

    a_score = 0.0
    a_score += 32.0 * max(0.0, corr - 0.40)
    a_score += 10.0 * min(3.5, max(0.0, -z63))
    a_score += 6.0 * min(3.0, max(0.0, -z21))
    a_score += 0.75 * min(20.0, max(0.0, s1m))
    a_score += 0.65 * min(12.0, max(0.0, s1w))
    a_score += 0.35 * min(30.0, max(0.0, s1q))
    if l_d52 >= -8.0:
        a_score += 8.0
    elif l_d52 >= -15.0:
        a_score += 4.0
    elif l_d52 < -25.0:
        a_score -= 10.0

    # Technical integrity on laggard (anti-falling-knife preference)
    if g_dS50 >= -1.0 and g_dE20 >= -3.0:
        a_score += 15.0
    elif g_dS50 >= -3.5:
        a_score += 8.0
    elif g_dS50 < -7.0:
        a_score -= 18.0
    elif g_dS50 < -5.0:
        a_score -= 8.0

    if 34.0 <= g_rsi <= 62.0:
        a_score += 5.0
    elif g_rsi < 28.0:
        a_score -= 6.0

    if cat == "CORE":
        a_score += 4.0
    elif cat == "DYNAMIC":
        a_score += 3.0

    # Extreme / Quarantine Trap Radar score
    e_score = 0.0
    if g_dS50 < -5.0 and corr >= 0.48:
        e_score = (
            25.0 * max(0.0, corr - 0.40)
            + 10.0 * min(4.0, max(0.0, -z63))
            + 0.9 * min(30.0, max(0.0, s1m))
            + 0.5 * min(45.0, max(0.0, s1q))
            + 1.2 * min(20.0, abs(g_dS50))
        )
        if cat in ("CORE", "DYNAMIC"):
            e_score += 5.0

    return round(a_score, 2), round(e_score, 2)


def build_smart_shortlist(rows: list, settings: dict) -> list:
    """Deterministic 6-bucket funnel with anti-spam laggard & cluster caps."""
    min_corr = float(settings.get("min_sp500_corr", 0.45))
    min_px = float(settings.get("min_price", 10.0))
    cap_1w = int(settings.get("shortlist_1w_cap", 6))
    cap_1m = int(settings.get("shortlist_1m_cap", 10))
    cap_1q = int(settings.get("shortlist_1q_cap", 8))
    cap_core = int(settings.get("shortlist_core_cap", 6))
    cap_quar = int(settings.get("shortlist_quarantine_cap", 6))
    max_cluster = int(settings.get("max_per_cluster_shortlist", 2))
    max_lag = int(settings.get("max_per_laggard_shortlist", 1))

    shortlist = []
    seen_pairs = set()
    used_laggards_act = defaultdict(int)
    used_clusters_act = defaultdict(int)

    def pair_key(r):
        return frozenset((r["ldr"], r["lag"]))

    def pick_bucket(candidates, bucket_name, limit, sort_key, check_caps=True, q_mode=False):
        picked = 0
        q_lags, q_clust = defaultdict(int), defaultdict(int)
        for r in sorted(candidates, key=sort_key, reverse=True):
            if picked >= limit:
                break
            pk = pair_key(r)
            if pk in seen_pairs:
                continue
            if check_caps:
                if q_mode:
                    if q_lags[r["lag"]] >= 1 or q_clust[r["cluster"]] >= 1:
                        continue
                else:
                    if used_laggards_act[r["lag"]] >= max_lag or used_clusters_act[r["cluster"]] >= max_cluster:
                        continue
            rec = dict(r)
            rec["bucket"] = bucket_name
            shortlist.append(rec)
            seen_pairs.add(pk)
            if q_mode:
                q_lags[r["lag"]] += 1
                q_clust[r["cluster"]] += 1
            else:
                used_laggards_act[r["lag"]] += 1
                used_clusters_act[r["cluster"]] += 1
            picked += 1

    # Base institutional quality filter for actionable market-wide buckets
    inst = [
        r for r in rows
        if r["corr"] >= min_corr and r["l_px"] >= min_px and r["g_px"] >= min_px and r["l_d52"] >= -25.0
    ]

    # Bucket 1: Top 1W Actionable Sleeve (sharp recent gap, constructive MAs)
    cand_1w = [
        r for r in inst
        if r["s1w"] >= 3.5 and r["g_dS50"] >= -3.5 and (r["z21"] <= -1.0 or r["z63"] <= -1.0 or r["s1w"] >= 5.0)
    ]
    pick_bucket(cand_1w, "1W_ACTION", cap_1w, lambda r: (r["action_score"] + 1.8 * r["s1w"] + 5.0 * max(0, -r["z21"])))

    # Bucket 2: Top 1M Actionable Sleeve (tactical dislocations)
    cand_1m = [
        r for r in inst
        if r["s1m"] >= 5.5 and r["g_dS50"] >= -4.5 and (r["z63"] <= -1.1 or r["s1m"] >= 8.0)
    ]
    pick_bucket(cand_1m, "1M_ACTION", cap_1m, lambda r: (r["action_score"] + 0.9 * r["s1m"]))

    # Bucket 3: Top 1Q Actionable Sleeve (structural catch-up, laggard stabilizing/reclaiming)
    cand_1q = [
        r for r in inst
        if r["s1q"] >= 9.0 and r["g_dS50"] >= -4.5 and (r["z63"] <= -1.0 or r["s1q"] >= 14.0)
    ]
    pick_bucket(cand_1q, "1Q_ACTION", cap_1q, lambda r: (r["action_score"] + 0.5 * r["s1q"]))

    # Bucket 4: Top CORE Anchors (preserves flagship benchmarks even in calm regimes)
    cand_core = [r for r in rows if r["cat"] == "CORE" and (r["s1w"] >= 2.5 or r["s1m"] >= 4.0 or r["s1q"] >= 7.0 or r["z63"] <= -1.2)]
    pick_bucket(cand_core, "CORE_ANCHOR", cap_core, lambda r: r["action_score"], check_caps=False)

    # Bucket 5: All DYNAMIC Hot-Theme Radar pairs (agent-discovered, still math-scored!)
    cand_dyn = [r for r in rows if r["cat"] == "DYNAMIC"]
    pick_bucket(cand_dyn, "DYNAMIC", len(cand_dyn), lambda r: r["action_score"], check_caps=False)

    # Bucket 6: Top Extreme / Quarantine Watch (deep broken technicals / trap candidates)
    cand_quar = [
        r for r in rows
        if r["corr"] >= 0.48 and r["l_px"] >= min_px and r["g_px"] >= min_px
        and r["g_dS50"] < -5.5 and (r["s1m"] >= 10.0 or r["s1q"] >= 18.0 or r["z63"] <= -1.8)
    ]
    pick_bucket(cand_quar, "QUARANTINE", cap_quar, lambda r: r["extreme_score"], check_caps=True, q_mode=True)

    return shortlist


def main():
    ap = argparse.ArgumentParser(description="Full S&P 500 GICS + Core + Dynamic Single-Stock RV Scanner")
    ap.add_argument("--refresh-sp500", action="store_true", help="Force live Wikipedia sync of config/sp500_gics.json")
    ap.add_argument("--core-only", action="store_true", help="Scan only config/universe.json + dynamic_pairs.json (skip S&P 500 GICS)")
    ap.add_argument("--use-cache", action="store_true", help="Reuse existing data/stock_ohlcv_cache.json when tickers are present")
    ap.add_argument("--min-corr", type=float, default=None, help="Override minimum 126d correlation for S&P 500 auto-pairs")
    args = ap.parse_args()

    t0 = time.time()
    cfg = json.loads((CONFIG_DIR / "universe.json").read_text())
    settings = cfg.get("settings", {})
    if args.min_corr is not None:
        settings["min_sp500_corr"] = args.min_corr
    include_sp500 = False if args.core_only else bool(settings.get("include_sp500_gics", True))
    min_hist = int(settings.get("min_history_days", 70))

    pairs, counts = build_pair_universe(cfg, include_sp500=include_sp500, force_refresh_sp500=args.refresh_sp500)
    tickers = sorted({t for a, b, _, _ in pairs for t in (a, b)})
    print(
        f"Universe assembled: {len(tickers)} equities | {len(pairs)} unique peer pairs "
        f"(CORE: {counts['CORE']}, EXP: {counts['EXP']}, SP500: {counts['SP500']} across {counts['gics_sub_industries']} GICS sub-industries, DYNAMIC: {counts['DYNAMIC']})"
    )

    dfs = {}
    cache_path = DATA_DIR / "stock_ohlcv_cache.json"
    to_fetch = list(tickers)
    if args.use_cache and cache_path.exists():
        cached = json.loads(cache_path.read_text())
        reused = 0
        rem = []
        for t in tickers:
            if t in cached and len(cached[t]) >= min_hist:
                df = pd.DataFrame(cached[t])
                df["date"] = pd.to_datetime(df["date"]).dt.date
                dfs[t] = df
                reused += 1
            else:
                rem.append(t)
        to_fetch = rem
        print(f"Reused {reused} cached OHLCV histories; fetching {len(to_fetch)} remaining...")

    if to_fetch:
        print(f"Fetching live 1Y daily OHLCV for {len(to_fetch)} equities (pooled 20-thread session)...")
        sess = make_session()
        failed = []
        with ThreadPoolExecutor(max_workers=20) as ex:
            for t, df in ex.map(lambda tk: fetch_yf(sess, tk), to_fetch):
                if df is not None and len(df) >= min_hist:
                    dfs[t] = df
                else:
                    failed.append(t)
        if failed:
            print(f"  Skipped {len(failed)} tickers (insufficient <{min_hist}d history or fetch error): {failed[:12]}")

    asof = str(max(df["date"].iloc[-1] for df in dfs.values()))
    print(f"Loaded {len(dfs)}/{len(tickers)} stocks cleanly (Latest Market Close: {asof}) in {time.time() - t0:.2f}s.")

    # Compute per-ticker stats & save compact OHLCV cache
    cache, stats = {}, {}
    adj_series = {}
    for t, df in dfs.items():
        stats[t] = ticker_stats(df)
        adj_series[t] = df.set_index("date")["adjclose"].astype(float)
        d2 = df.copy()
        d2["date"] = d2["date"].astype(str)
        for col in ("open", "high", "low", "close", "adjclose"):
            d2[col] = d2[col].astype(float).round(4)
        d2["volume"] = d2["volume"].fillna(0).astype("int64")
        cache[t] = d2.to_dict(orient="records")
    cache_path.write_text(json.dumps(cache, separators=(",", ":")))

    # Vectorized aligned matrix + 126d return correlation matrix (single BLAS call!)
    adj_mat = pd.DataFrame(adj_series).sort_index().ffill(limit=2)
    rets_126 = adj_mat.pct_change(fill_method=None).tail(126)
    corr_mat = rets_126.corr()

    rows = []
    min_corr = float(settings.get("min_sp500_corr", 0.45))
    for a, b, cluster, cat in pairs:
        if a not in dfs or b not in dfs:
            continue
        corr_val = corr_mat.at[a, b]
        if pd.isna(corr_val):
            continue
        corr = round(float(corr_val), 2)

        sa, sb = stats[a], stats[b]
        # Smart orientation: primary by 1M spread; if flat (<3%), orient by 1W (>=4%) or 1Q (>=8%)
        d1w, d1m, d1q = sa["r1w"] - sb["r1w"], sa["r1m"] - sb["r1m"], sa["r1q"] - sb["r1q"]
        if abs(d1m) >= 3.0:
            a_leads = d1m >= 0
        elif abs(d1w) >= 4.0:
            a_leads = d1w >= 0
        elif abs(d1q) >= 8.0:
            a_leads = d1q >= 0
        else:
            a_leads = d1m >= 0

        if a_leads:
            ldr, lag, sl, sg = a, b, sa, sb
        else:
            ldr, lag, sl, sg = b, a, sb, sa

        pair_df = adj_mat[[ldr, lag]].dropna()
        if len(pair_df) < 64:
            continue
        ratio = pair_df[lag] / pair_df[ldr]
        r63, r21 = ratio.iloc[-63:], ratio.iloc[-21:]
        sd63, sd21 = float(r63.std()), float(r21.std())
        z63 = round(float((ratio.iloc[-1] - r63.mean()) / sd63), 2) if sd63 > 0 else 0.0
        z21 = round(float((ratio.iloc[-1] - r21.mean()) / sd21), 2) if sd21 > 0 else 0.0

        s1w = round(sl["r1w"] - sg["r1w"], 2)
        s1m = round(sl["r1m"] - sg["r1m"], 2)
        s1q = round(sl["r1q"] - sg["r1q"], 2)

        # Keep CORE & DYNAMIC unconditionally; filter SP500/EXP by correlation + meaningful stretch
        if cat in ("SP500", "EXP"):
            if corr < min_corr:
                continue
            if not (s1w >= 3.5 or s1m >= 5.0 or s1q >= 8.5 or z63 <= -1.20 or z21 <= -1.45):
                continue

        rec = {
            "cat": cat, "cluster": cluster, "ldr": ldr, "lag": lag, "corr": corr,
            "l_px": sl["px"], "g_px": sg["px"], "l_d52": sl["d52"], "g_d52": sg["d52"],
            "s1w": s1w, "s1m": s1m, "s1q": s1q, "z63": z63, "z21": z21,
            "g_dE20": sg["dE20"], "g_dS50": sg["dS50"], "g_dE50": sg["dE50"],
            "g_rsi": sg["rsi"], "g_c10_50d": sg["c10_50d"],
            "g_e20": sg["e20"], "g_s50": sg["s50"], "g_e50": sg["e50"], "g_atr": sg["atr"],
        }
        a_sc, e_sc = score_pair(rec)
        rec["action_score"] = a_sc
        rec["extreme_score"] = e_sc
        rows.append(rec)

    rows.sort(key=lambda r: r["action_score"], reverse=True)
    shortlist = build_smart_shortlist(rows, settings)
    shortlist_tickers = sorted({t for r in shortlist for t in (r["ldr"], r["lag"])})
    shortlist_laggards = []
    for r in shortlist:
        if r["bucket"] != "QUARANTINE" and r["lag"] not in shortlist_laggards:
            shortlist_laggards.append(r["lag"])

    elapsed = round(time.time() - t0, 2)
    out_payload = {
        "asof": asof,
        "elapsed_sec": elapsed,
        "universe_tickers": len(dfs),
        "universe_pairs": len(pairs),
        "qualified_pairs": len(rows),
        "universe_breakdown": counts,
        "shortlist_count": len(shortlist),
        "shortlist_tickers": shortlist_tickers,
        "shortlist_laggards": shortlist_laggards,
        "shortlist": shortlist,
        "pairs": rows[:250],
        "stats": stats,
    }
    (DATA_DIR / "stock_rv_scan.json").write_text(json.dumps(out_payload, indent=2))

    # Console Summary
    print(f"\n{'='*138}")
    print(f"FUNNEL SHORTLIST ({len(shortlist)} pairs / {len(shortlist_tickers)} unique tickers from {len(pairs)} scanned pairs | {len(rows)} qualified | {elapsed}s)")
    print(f"{'='*138}")
    hdr = f"{'Bucket':<11} {'Src':<7} {'Cluster':<23} {'Pair':<12} {'Corr':>4} | {'1W':>7} {'1M':>7} {'1Q':>7} {'Z63':>6} {'Z21':>6} | {'L_52w':>6} {'G_20E':>6} {'G_50D':>6} {'RSI':>5} {'10d>50':>6} {'Score':>6}"
    print(hdr)
    print("-" * len(hdr))
    for r in shortlist:
        sc = r["extreme_score"] if r["bucket"] == "QUARANTINE" else r["action_score"]
        flag = " [LOW-CORR]" if r["corr"] < min_corr else ""
        print(
            f"{r['bucket']:<11} {r['cat']:<7} {r['cluster'][:23]:<23} {r['ldr']+'>'+r['lag']:<12} {r['corr']:>4.2f} | "
            f"{r['s1w']:+6.2f}% {r['s1m']:+6.2f}% {r['s1q']:+6.2f}% {r['z63']:+6.2f} {r['z21']:+6.2f} | "
            f"{r['l_d52']:+5.1f}% {r['g_dE20']:+5.1f}% {r['g_dS50']:+5.1f}% {r['g_rsi']:>5.1f} {r['g_c10_50d']:>3}/10 {sc:>6.1f}{flag}"
        )
    print(f"\nSaved -> data/stock_rv_scan.json & data/stock_ohlcv_cache.json ({cache_path.stat().st_size/1024/1024:.2f} MB)")


if __name__ == "__main__":
    main()
