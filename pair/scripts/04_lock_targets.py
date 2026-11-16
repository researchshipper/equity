#!/usr/bin/env python3
"""Step 4: Deterministically lock dividend-adjusted 50% & 100% catch-up price/ratio
targets, Entry Midpoint R:R, Forward P/E discounts & earnings dates from data/selected_setups.json."""
import json
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

def parse_float(s):
    try:
        return float(str(s).replace(",", ""))
    except Exception:
        return None

def main():
    sel_path = DATA_DIR / "selected_setups.json"
    if not sel_path.exists():
        raise FileNotFoundError(f"Missing {sel_path}. Copy config/selected_setups.example.json to data/selected_setups.json and populate it first.")

    sel = json.loads(sel_path.read_text())
    cache = json.loads((DATA_DIR / "stock_ohlcv_cache.json").read_text())
    vals = json.loads((DATA_DIR / "stock_valuations.json").read_text()) if (DATA_DIR / "stock_valuations.json").exists() else {}
    scan = json.loads((DATA_DIR / "stock_rv_scan.json").read_text()) if (DATA_DIR / "stock_rv_scan.json").exists() else {}

    idx_map = {"1W": -6, "1M": -22, "1Q": -64}
    locked = []
    asof = scan.get("asof", "")

    print(f"{'Tier':<6} {'Win':<3} {'Pair':<11} {'Corr':>4} | {'1W':>7} {'1M':>7} {'1Q':>7} {'Z63':>6} {'Z21':>6} | {'PE(L/G)':<11} {'Disc':>6} | {'Close':>7} {'Tgt50':>7} {'Tgt100':>7} {'Stop':>7} | {'RR50(E)':>7} {'RR100(E)':>8}")
    print("-" * 160)

    for item in sel["setups"]:
        ldr, lag, tier, win = item["ldr"].upper(), item["lag"].upper(), item["tier"], item["win"]
        dl, dg = pd.DataFrame(cache[ldr]), pd.DataFrame(cache[lag])
        m = pd.merge(dl[["date", "close", "adjclose", "high", "low"]], dg[["date", "close", "adjclose", "high", "low"]], on="date", suffixes=("_l", "_g"))
        if not asof:
            asof = str(m["date"].iloc[-1])

        cl, acl, hl = m["close_l"], m["adjclose_l"], m["high_l"]
        cg, acg, hg, lg = m["close_g"], m["adjclose_g"], m["high_g"], m["low_g"]

        corr = round(float(acl.pct_change().dropna().tail(126).corr(acg.pct_change().dropna().tail(126))), 2)
        l1w, l1m, l1q = (acl.iloc[-1]/acl.iloc[-6]-1)*100, (acl.iloc[-1]/acl.iloc[-22]-1)*100, (acl.iloc[-1]/acl.iloc[-64]-1)*100
        g1w, g1m, g1q = (acg.iloc[-1]/acg.iloc[-6]-1)*100, (acg.iloc[-1]/acg.iloc[-22]-1)*100, (acg.iloc[-1]/acg.iloc[-64]-1)*100
        s1w, s1m, s1q = round(l1w-g1w, 2), round(l1m-g1m, 2), round(l1q-g1q, 2)

        l_p, g_p = float(cl.iloc[-1]), float(cg.iloc[-1])
        g_e20 = float(cg.ewm(span=20, adjust=False).mean().iloc[-1])
        g_s50 = float(cg.rolling(50).mean().iloc[-1])
        g_e50 = float(cg.ewm(span=50, adjust=False).mean().iloc[-1])

        delta = cg.diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean()
        g_rsi = round(float((100 - 100 / (1 + gain / loss.replace(0, float("nan")))).iloc[-1]), 1)
        tr = pd.concat([hg - lg, (hg - cg.shift(1)).abs(), (lg - cg.shift(1)).abs()], axis=1).max(axis=1)
        g_atr = round(float(tr.rolling(14).mean().iloc[-1]), 2)

        ratio_tr, ratio_px = acg / acl, cg / cl
        r_tr_now, r_px_now = float(ratio_tr.iloc[-1]), float(ratio_px.iloc[-1])
        z63 = round(float((r_tr_now - ratio_tr.iloc[-63:].mean()) / ratio_tr.iloc[-63:].std()), 2)
        z21 = round(float((r_tr_now - ratio_tr.iloc[-21:].mean()) / ratio_tr.iloc[-21:].std()), 2)

        idx0 = idx_map[win]
        r_tr_0, r_px_0 = float(ratio_tr.iloc[idx0]), float(ratio_px.iloc[idx0])
        r_tr_50 = r_tr_now + 0.5 * (r_tr_0 - r_tr_now)
        up50_c  = round((r_tr_50 / r_tr_now - 1) * 100, 2)
        up100_c = round((r_tr_0 / r_tr_now - 1) * 100, 2)
        tgt50   = round(g_p * (1 + up50_c / 100), 2)
        tgt100  = round(g_p * (1 + up100_c / 100), 2)
        r_px_50, r_px_100 = round(r_px_now + 0.5 * (r_px_0 - r_px_now), 4), round(r_px_0, 4)

        stop_px = float(item["stop"])
        entry_rng = item.get("entry_rng")
        risk_c = round((stop_px / g_p - 1) * 100, 2)
        if entry_rng:
            e_lo, e_hi = float(entry_rng[0]), float(entry_rng[1])
            e_mid = round((e_lo + e_hi) / 2.0, 2)
            risk_e = round((stop_px / e_mid - 1) * 100, 2)
            up50_e = round((tgt50 / e_mid - 1) * 100, 2)
            up100_e = round((tgt100 / e_mid - 1) * 100, 2)
            rr50_e = round(up50_e / abs(risk_e), 2) if risk_e < 0 else 0.0
            rr100_e = round(up100_e / abs(risk_e), 2) if risk_e < 0 else 0.0
            entry_str = f"${e_lo:.2f}–${e_hi:.2f}"
        else:
            e_mid, risk_e, up50_e, up100_e = g_p, risk_c, up50_c, up100_c
            rr50_e = round(up50_c / abs(risk_c), 2) if risk_c < 0 else 0.0
            rr100_e = round(up100_c / abs(risk_c), 2) if risk_c < 0 else 0.0
            entry_str = "WAIT / QUARANTINE"

        vl, vg = vals.get(ldr, {}), vals.get(lag, {})
        fpe_l, fpe_g = parse_float(vl.get("fpe")), parse_float(vg.get("fpe"))
        pe_disc = round((fpe_g / fpe_l - 1) * 100, 1) if (fpe_l and fpe_g) else None

        rec = {
            "tier": tier, "win": win, "cat": item.get("cat", "EXP"), "cluster": item["cluster"],
            "pair": f"{ldr} > {lag}", "ldr": ldr, "lag": lag, "corr": corr,
            "l_px": round(l_p, 2), "g_px": round(g_p, 2), "l_d52": round((l_p / float(hl.max()) - 1) * 100, 2),
            "spread": [s1w, s1m, s1q], "z63": z63, "z21": z21,
            "g_e20": round(g_e20, 2), "g_s50": round(g_s50, 2), "g_e50": round(g_e50, 2),
            "g_dE20": round((g_p/g_e20 - 1)*100, 2), "g_dS50": round((g_p/g_s50 - 1)*100, 2), "g_dE50": round((g_p/g_e50 - 1)*100, 2),
            "g_rsi": g_rsi, "g_atr": g_atr,
            "fpe_l": fpe_l, "fpe_g": fpe_g, "pe_disc": pe_disc,
            "div_g": vg.get("div_yld", "—"), "earn_l": vl.get("earn_dt", "—"), "earn_g": vg.get("earn_dt", "—"),
            "entry_rng": entry_rng, "entry_str": entry_str, "entry_mid": e_mid,
            "ratio_now": round(r_px_now, 4), "ratio_50": r_px_50, "ratio_100": r_px_100,
            "tgt50": tgt50, "up50_c": up50_c, "up50_e": up50_e,
            "tgt100": tgt100, "up100_c": up100_c, "up100_e": up100_e,
            "stop": stop_px, "risk_c": risk_c, "risk_e": risk_e, "rr50_e": rr50_e, "rr100_e": rr100_e,
            "short_tag": item.get("short_tag", ""), "twin_note": item.get("twin_note", ""), "note": item["note"],
        }
        locked.append(rec)
        pe_s = f"{fpe_l:.1f}/{fpe_g:.1f}" if (fpe_l and fpe_g) else "n/a"
        disc_s = f"{pe_disc:+5.1f}%" if pe_disc is not None else "  n/a"
        print(f"{tier:<6} {win:<3} {ldr+'>'+lag:<11} {corr:>4.2f} | {s1w:+6.2f}% {s1m:+6.2f}% {s1q:+6.2f}% {z63:+6.2f} {z21:+6.2f} | {pe_s:<11} {disc_s} | {g_p:7.2f} {tgt50:7.2f} {tgt100:7.2f} {stop_px:7.2f} | {rr50_e:6.2f}x {rr100_e:7.2f}x")

    payload = {
        "asof": asof,
        "universe_tickers": scan.get("universe_tickers", len(cache)),
        "universe_pairs": scan.get("universe_pairs", len(locked)),
        "regime_title": sel["regime_title"],
        "regime_summary": sel["regime_summary"],
        "regime_pills": sel.get("regime_pills", []),
        "special_exclusions": sel.get("special_exclusions", []),
        "setups": locked,
    }
    (DATA_DIR / "final_rv_specs.json").write_text(json.dumps(payload, indent=2))
    print(f"\nLocked {len(locked)} setups -> data/final_rv_specs.json (As-Of: {asof})")

if __name__ == "__main__":
    main()
