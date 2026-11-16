#!/usr/bin/env python3
"""Step 5: Generate 4 publication-grade 200-DPI dark-navy institutional PNG charts
from data/final_rv_specs.json and data/stock_ohlcv_cache.json with dynamic anti-overlap layout."""
import json, math
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.ticker import FormatStrFormatter

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR, OUT_DIR = ROOT / "data", ROOT / "outputs"
OUT_DIR.mkdir(exist_ok=True)

plt.rcParams.update({
    "figure.facecolor": "#0B1120", "axes.facecolor": "#111827", "axes.edgecolor": "#26334D",
    "axes.labelcolor": "#CBD5E1", "xtick.color": "#94A3B8", "ytick.color": "#94A3B8",
    "text.color": "#F1F5F9", "grid.color": "#1E293B", "grid.linestyle": "--", "grid.alpha": 0.7,
    "font.family": "DejaVu Sans", "axes.titleweight": "bold",
})

TIER_COL = {"Tier 1": "#10B981", "Tier 2": "#F59E0B", "Tier 3": "#EF4444"}
WIN_IDX = {"1W": 0, "1M": 1, "1Q": 2}

def auto_callout_positions(items, xmin, xmax, ymin, ymax):
    """Deterministic zero-overlap label placement using sorted vertical lanes on left & right."""
    left = sorted([it for it in items if it["x"] < 0], key=lambda d: d["y"], reverse=True)
    right = sorted([it for it in items if it["x"] >= 0], key=lambda d: d["y"], reverse=True)
    pos = {}
    top_y = ymin + (ymax - ymin) * 0.80
    bot_y = ymin + (ymax - ymin) * 0.08

    if left:
        ys = np.linspace(top_y, bot_y, len(left)) if len(left) > 1 else [min(top_y, max(bot_y, left[0]["y"]))]
        for it, ty in zip(left, ys):
            pos[it["key"]] = (xmin + (0 - xmin) * 0.03, float(ty), "left")
    if right:
        ys = np.linspace(top_y, bot_y, len(right)) if len(right) > 1 else [min(top_y, max(bot_y, right[0]["y"]))]
        x_lane = xmax - (xmax - 0) * 0.025
        for it, ty in zip(right, ys):
            pos[it["key"]] = (float(x_lane), float(ty), "right")
    return pos

def main():
    payload = json.loads((DATA_DIR / "final_rv_specs.json").read_text())
    cache = json.loads((DATA_DIR / "stock_ohlcv_cache.json").read_text())
    asof = payload["asof"]
    specs = payload["setups"]
    t1 = [r for r in specs if r["tier"] == "Tier 1"]
    t12 = [r for r in specs if r["tier"] in ("Tier 1", "Tier 2")]

    # =========================================================================
    # CHART 1: REGIME QUADRANT MAP
    # =========================================================================
    fig, ax = plt.subplots(figsize=(14.8, 8.2), dpi=200)
    xs = [r["g_dS50"] for r in specs]
    ys = [r["spread"][WIN_IDX[r["win"]]] for r in specs]
    xmin = min(-10.0, min(xs) - 6.0)
    xmax = max(16.0, max(xs) + 12.0)
    ymin = min(-4.0, min(ys) - 4.0)
    ymax = max(25.0, max(ys) * 1.24 + 4.0)

    ax.axvspan(xmin, 0, color="#EF4444", alpha=0.075, zorder=0)
    ax.axvspan(0, xmax, color="#10B981", alpha=0.075, zorder=0)
    ax.axvline(0, color="#64748B", lw=1.4, ls="--", zorder=1)
    ax.axhline(3.0, color="#334155", lw=1.0, ls=":", zorder=1)

    ax.text(xmin + (xmax - xmin) * 0.015, ymax * 0.97,
            "QUARANTINE / FALLING-KNIFE TRAP ZONE\n(Laggard Broken Below 50-DMA — Reject Catch-Up)",
            fontsize=9.2, fontweight="bold", color="#FCA5A5", va="top",
            bbox=dict(boxstyle="round,pad=0.35", fc="#450A0A", ec="#EF4444", alpha=0.65))
    ax.text(xmax - (xmax - xmin) * 0.015, ymax * 0.97,
            "ANTI-TRAP PARITY CATCH-UP ZONE\n(Leader Broken Out · Laggard Holding Support > 50-DMA)",
            fontsize=9.2, fontweight="bold", color="#6EE7B7", ha="right", va="top",
            bbox=dict(boxstyle="round,pad=0.35", fc="#064E3B", ec="#10B981", alpha=0.65))

    pts = [{"key": r["pair"], "x": r["g_dS50"], "y": r["spread"][WIN_IDX[r["win"]]], "r": r} for r in specs]
    pos = auto_callout_positions(pts, xmin, xmax, ymin, ymax)

    for p in pts:
        r = p["r"]
        c = TIER_COL[r["tier"]]
        sz = 140 + max(0.25, r["corr"]) * 240
        ax.scatter(p["x"], p["y"], s=sz, c=c,
                   edgecolors="#FFFFFF" if r["tier"] == "Tier 1" else "#1E293B",
                   linewidths=1.9 if r["tier"] == "Tier 1" else 1.1, alpha=0.92, zorder=4)
        tx, ty, ha = pos[p["key"]]
        tag = f" · {r['short_tag']}" if r.get("short_tag") else ""
        if r["tier"] == "Tier 1":
            lbl, col, wt, bg, ec = f"{r['pair']} ({r['win']}: {p['y']:+.1f}%)", "#ECFDF5", "bold", "#064E3B", "#10B981"
        elif r["tier"] == "Tier 2":
            lbl, col, wt, bg, ec = f"{r['pair']} ({p['y']:+.1f}%{tag or ' · Watch'})", "#FEF3C7", "normal", "#451A03", "#F59E0B"
        else:
            lbl, col, wt, bg, ec = f"{r['pair']} ({p['y']:+.1f}%{tag or ' · Trap'})", "#FECACA", "normal", "#450A0A", "#EF4444"
        ax.annotate(
            lbl, xy=(p["x"], p["y"]), xytext=(tx, ty), textcoords="data", ha=ha, va="center",
            fontsize=8.3 if r["tier"] == "Tier 1" else 7.9, fontweight=wt, color=col,
            bbox=dict(boxstyle="round,pad=0.22", fc=bg, ec=ec, alpha=0.84, lw=0.8),
            arrowprops=dict(arrowstyle="-", color=ec, lw=0.85, alpha=0.72, shrinkA=2, shrinkB=6), zorder=5
        )

    ax.set_xlim(xmin, xmax)
    ax.set_ylim(ymin, ymax)
    ax.set_xlabel("Laggard Distance from 50-Day Moving Average (% vs. 50-DMA) — Support Floor = 0.0%", fontsize=10.3, fontweight="bold", labelpad=8)
    ax.set_ylabel("Active Horizon Divergence Spread (Leader − Laggard Total Return %)", fontsize=10.3, fontweight="bold", labelpad=8)
    ax.set_title(f"Single-Stock Parity Regime Map — Anti-Trap Support vs. Spread Divergence ({asof} Close)", fontsize=13.5, pad=14)
    ax.grid(True, zorder=0)
    handles = [
        mpatches.Patch(color="#10B981", label=f"Tier 1: Actionable Setups ({len(t1)} Verified Anti-Trap Winners)"),
        mpatches.Patch(color="#F59E0B", label="Tier 2: Watchlist (Earnings Risk / Guidance Caution)"),
        mpatches.Patch(color="#EF4444", label="Tier 3: Quarantined Traps & Broken Trends"),
    ]
    ax.legend(handles=handles, loc="upper center", bbox_to_anchor=(0.5, -0.095), ncol=3, frameon=True, facecolor="#111827", edgecolor="#334155", fontsize=9)
    fig.text(0.01, 0.008, f"Source: Yahoo Finance live dividend-adjusted close through {asof} & earnings/guidance audit. Bubble size scaled by 126-day return correlation.", fontsize=8, color="#64748B")
    plt.tight_layout(rect=[0, 0.055, 1, 1])
    plt.savefig(OUT_DIR / "rv_chart1_regime_quadrant.png", dpi=200)
    plt.close()

    # =========================================================================
    # CHART 2: TIER 1 TECHNICAL SETUP GRID (Dynamic 1..6 Panels)
    # =========================================================================
    n_t1 = max(1, len(t1))
    ncols = min(3, n_t1)
    nrows = math.ceil(n_t1 / ncols)
    fig, axes = plt.subplots(nrows, ncols, figsize=(5.5 * ncols, 4.8 * nrows + 0.6), dpi=200, squeeze=False)
    fig.suptitle(f"Tier 1 Actionable Parity Setups — 90-Day Technical Structure, Entry Zones & Targets ({asof})",
                 fontsize=14.0, fontweight="bold", y=0.975)

    for idx, ax in enumerate(axes.flat):
        if idx >= len(t1):
            ax.axis("off")
            continue
        r = t1[idx]
        df = pd.DataFrame(cache[r["lag"]])
        df["dt"] = pd.to_datetime(df["date"])
        df["e20"] = df["close"].ewm(span=20, adjust=False).mean()
        df["s50"] = df["close"].rolling(50).mean()
        sub = df.tail(65).reset_index(drop=True)
        x = np.arange(len(sub))
        x_end = len(sub) - 0.3

        ax.vlines(x, sub["low"], sub["high"], color="#475569", lw=1.1, alpha=0.85, zorder=2)
        ax.plot(x, sub["close"], color="#F8FAFC", lw=2.0, zorder=4)
        ax.plot(x, sub["e20"], color="#38BDF8", lw=1.35, zorder=3)
        ax.plot(x, sub["s50"], color="#FB923C", lw=1.35, ls="--", zorder=3)

        if r["entry_rng"]:
            e_lo, e_hi = r["entry_rng"]
            ax.fill_between([0, x_end], e_lo, e_hi, color="#10B981", alpha=0.14, zorder=1)
            ax.text(1.0, (e_lo + e_hi) / 2.0, f"Entry: ${e_lo:.1f}–${e_hi:.1f}", fontsize=7.4, color="#A7F3D0",
                    va="center", bbox=dict(boxstyle="round,pad=0.16", fc="#064E3B", ec="#10B981", alpha=0.72, lw=0.6))

        ax.hlines(r["tgt50"],  0, x_end, colors="#34D399", lw=1.2, ls=":", zorder=3)
        ax.hlines(r["tgt100"], 0, x_end, colors="#10B981", lw=1.4, ls="-.", zorder=3)
        ax.hlines(r["stop"],   0, x_end, colors="#EF4444", lw=1.4, ls="--", zorder=3)

        ax.text(len(sub) + 1.0, r["tgt100"], f"100%: ${r['tgt100']:.2f}", fontsize=7.8, color="#34D399", fontweight="bold", va="center")
        ax.text(len(sub) + 1.0, r["tgt50"],  f"50%: ${r['tgt50']:.2f}",  fontsize=7.8, color="#6EE7B7", va="center")
        ax.text(len(sub) + 1.0, r["g_px"],   f"Now: ${r['g_px']:.2f}",   fontsize=7.9, color="#FFFFFF", fontweight="bold", va="center",
                bbox=dict(boxstyle="round,pad=0.16", fc="#1E293B", ec="#64748B", lw=0.75))
        ax.text(len(sub) + 1.0, r["stop"],   f"Stop: ${r['stop']:.2f}",  fontsize=7.8, color="#FCA5A5", fontweight="bold", va="center")

        ymin_p = min(sub["low"].min(), r["stop"]) * 0.985
        ymax_p = max(sub["high"].max(), r["tgt100"]) * 1.022
        ax.set_ylim(ymin_p, ymax_p)
        ax.set_xlim(-1, len(sub) + 18.5)
        tidx = [0, 21, 42, len(sub) - 1]
        ax.set_xticks(tidx)
        ax.set_xticklabels([sub["dt"].iloc[i].strftime("%b %d") for i in tidx], fontsize=8)
        ax.yaxis.set_major_formatter(FormatStrFormatter("$%.0f"))
        ax.grid(True, alpha=0.45)

        win_sp = r["spread"][WIN_IDX[r["win"]]]
        disc_txt = f"P/E {r['pe_disc']:+.1f}%" if r.get("pe_disc") is not None else "P/E n/a"
        ax.set_title(f"[{r['win']}] BUY {r['lag']} vs {r['ldr']}  |  {win_sp:+.2f}% Lag  |  R:R {r['rr50_e']:.1f}x / {r['rr100_e']:.1f}x", fontsize=9.8, pad=8)
        ax.text(0.015, 0.945, f"RSI {r['g_rsi']} · Z63 {r['z63']:+.2f}σ · {disc_txt}", transform=ax.transAxes,
                fontsize=7.7, color="#CBD5E1", va="top", bbox=dict(boxstyle="round,pad=0.22", fc="#0F172A", ec="#334155", alpha=0.88))

    leg_h = [
        plt.Line2D([0], [0], color="#F8FAFC", lw=2, label="Daily Close (H/L Range)"),
        plt.Line2D([0], [0], color="#38BDF8", lw=1.4, label="20-EMA"),
        plt.Line2D([0], [0], color="#FB923C", lw=1.4, ls="--", label="50-DMA"),
        mpatches.Patch(color="#10B981", alpha=0.25, label="Patient Entry Zone"),
        plt.Line2D([0], [0], color="#34D399", lw=1.3, ls=":", label="50% Parity Target"),
        plt.Line2D([0], [0], color="#10B981", lw=1.4, ls="-.", label="100% Parity Target"),
        plt.Line2D([0], [0], color="#EF4444", lw=1.4, ls="--", label="Invalidation Stop"),
    ]
    fig.legend(handles=leg_h, loc="lower center", bbox_to_anchor=(0.5, 0.012), ncol=4, frameon=True, facecolor="#111827", edgecolor="#334155", fontsize=8.6)
    plt.tight_layout(rect=[0, 0.065, 1, 0.945])
    plt.savefig(OUT_DIR / "rv_chart2_tier1_technicals.png", dpi=200)
    plt.close()

    # =========================================================================
    # CHART 3: 2-PANEL RATIO Z-SCORE & FORWARD P/E DISCOUNT DASHBOARD
    # =========================================================================
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15.8, max(6.2, 0.65 * len(t12) + 1.8)), dpi=200)
    fig.suptitle(f"Statistical Stretch (Ratio Z-Score) & Fundamental Multiple Support (Forward P/E Discount) — {asof}",
                 fontsize=13.5, fontweight="bold", y=0.975)

    labels = [f"{r['pair']} [{r['win']}]" + (" *" if r["tier"] == "Tier 2" else "") for r in t12]
    y_pos = np.arange(len(t12))
    z63_vals = [r["z63"] for r in t12]
    z21_vals = [r["z21"] for r in t12]
    h = 0.36

    ax1.barh(y_pos - h/2, z63_vals, height=h, color=["#10B981" if r["tier"]=="Tier 1" else "#F59E0B" for r in t12], alpha=0.92, label="63-Day Ratio Z-Score (Green=T1 / Amber=T2)")
    ax1.barh(y_pos + h/2, z21_vals, height=h, color="#38BDF8", alpha=0.82, label="21-Day Ratio Z-Score (1M)")
    ax1.axvline(-1.25, color="#EF4444", lw=1.5, ls="--", label="-1.25σ Institutional Stretch Trigger")
    ax1.axvline(0, color="#64748B", lw=1.0)
    ax1.invert_yaxis()
    ax1.set_yticks(y_pos)
    ax1.set_yticklabels(labels, fontsize=9, fontweight="bold")
    zmin = min(-2.3, min(z63_vals + z21_vals) - 0.45)
    zmax = max(0.65, max(z63_vals + z21_vals) + 0.4)
    ax1.set_xlim(zmin, zmax)
    ax1.set_xlabel("Laggard / Leader Total-Return Ratio Z-Score (σ)", fontsize=9.5, fontweight="bold")
    ax1.set_title("Pair Ratio Z-Scores (More Negative = Deeper Relative Lag)", fontsize=10.8, pad=10)
    ax1.grid(True, axis="x", alpha=0.5)
    for i, (z6, z2) in enumerate(zip(z63_vals, z21_vals)):
        ax1.text(z6 - 0.05 if z6 < 0 else z6 + 0.05, i - h/2, f"{z6:+.2f}σ", va="center", ha="right" if z6 < 0 else "left", fontsize=7.8, fontweight="bold")
        ax1.text(z2 - 0.05 if z2 < 0 else z2 + 0.05, i + h/2, f"{z2:+.2f}σ", va="center", ha="right" if z2 < 0 else "left", fontsize=7.5, color="#BAE6FD")
    ax1.legend(loc="upper center", bbox_to_anchor=(0.5, -0.12), ncol=2, fontsize=8.0, facecolor="#0F172A", edgecolor="#334155")

    fpe_l = [r["fpe_l"] or 0.0 for r in t12]
    fpe_g = [r["fpe_g"] or 0.0 for r in t12]
    ax2.barh(y_pos - h/2, fpe_l, height=h, color="#64748B", alpha=0.85, label="Leader Forward P/E")
    ax2.barh(y_pos + h/2, fpe_g, height=h,
             color=["#10B981" if (r.get("pe_disc") is not None and r["pe_disc"] < 0) else "#F59E0B" for r in t12],
             alpha=0.92, label="Laggard Forward P/E (Green = Discount / Amber = Premium)")
    ax2.invert_yaxis()
    ax2.set_yticks(y_pos)
    ax2.set_yticklabels([f"{r['ldr']} vs {r['lag']}" for r in t12], fontsize=9, fontweight="bold")
    mx_pe = max(max(fpe_l + fpe_g, default=30.0) * 1.38, 40.0)
    ax2.set_xlim(0, mx_pe)
    ax2.set_xlabel("Forward Price / Earnings Multiple (x)", fontsize=9.5, fontweight="bold")
    ax2.set_title("Forward P/E Valuation Parity (Laggard Discount vs. Leader)", fontsize=10.8, pad=10)
    ax2.grid(True, axis="x", alpha=0.5)
    for i, r in enumerate(t12):
        if r.get("fpe_l") and r.get("fpe_g"):
            mx = max(r["fpe_l"], r["fpe_g"])
            d = r["pe_disc"]
            ax2.text(mx + mx_pe * 0.015, i, f"{r['fpe_g']:.1f}x vs {r['fpe_l']:.1f}x ({d:+.1f}%)",
                     va="center", fontsize=8.0, fontweight="bold", color="#34D399" if d < 0 else "#FBBF24")
    ax2.legend(loc="upper center", bbox_to_anchor=(0.5, -0.12), ncol=2, fontsize=8.0, facecolor="#0F172A", edgecolor="#334155")

    fig.text(0.01, 0.008, f"* Denotes Tier 2 Watchlist. Valuation source: StockAnalysis live Forward P/E ({asof}).", fontsize=8, color="#64748B")
    plt.tight_layout(rect=[0, 0.095, 1, 0.935])
    plt.savefig(OUT_DIR / "rv_chart3_valuation_zscore.png", dpi=200)
    plt.close()

    # =========================================================================
    # CHART 4: REBASED TOTAL-RETURN PARITY OVERLAYS (Tier 1)
    # =========================================================================
    fig, axes = plt.subplots(nrows, ncols, figsize=(5.5 * ncols, 4.6 * nrows + 0.6), dpi=200, squeeze=False)
    fig.suptitle(f"Tier 1 Rebased Total-Return Parity Overlays — Leader Breakout vs. Laggard Catch-Up Gap ({asof})",
                 fontsize=14.0, fontweight="bold", y=0.975)

    for idx, ax in enumerate(axes.flat):
        if idx >= len(t1):
            ax.axis("off")
            continue
        r = t1[idx]
        win_len = 22 if (r["win"] == "1M" and r["spread"][2] < 0) else 64
        dl = pd.DataFrame(cache[r["ldr"]]).tail(win_len).reset_index(drop=True)
        dg = pd.DataFrame(cache[r["lag"]]).tail(win_len).reset_index(drop=True)
        m = pd.merge(dl[["date", "adjclose"]], dg[["date", "adjclose"]], on="date", suffixes=("_l", "_g"))
        m["dt"] = pd.to_datetime(m["date"])

        re_l = m["adjclose_l"] / m["adjclose_l"].iloc[0] * 100.0
        re_g = m["adjclose_g"] / m["adjclose_g"].iloc[0] * 100.0
        x = np.arange(len(m))

        ax.plot(x, re_l, color="#38BDF8", lw=2.3)
        ax.plot(x, re_g, color="#F59E0B", lw=2.3)
        ax.fill_between(x, re_g, re_l, where=(re_l >= re_g), color="#10B981", alpha=0.16, interpolate=True)
        ax.fill_between(x, re_g, re_l, where=(re_l < re_g),  color="#64748B", alpha=0.09, interpolate=True)

        ymin_d = min(re_l.min(), re_g.min())
        if r["win"] == "1W" and len(m) > 8:
            ax.axvline(len(m) - 6, color="#A855F7", lw=1.15, ls="--", alpha=0.85)
            ax.text(len(m) - 6.6, ymin_d + 0.5, "1W Start", color="#D8B4FE", fontsize=7.5, ha="right", rotation=90)
        elif r["win"] == "1M" and win_len == 64:
            ax.axvline(len(m) - 22, color="#A855F7", lw=1.15, ls="--", alpha=0.85)
            ax.text(len(m) - 22.6, ymin_d + 0.5, "1M Start", color="#D8B4FE", fontsize=7.5, ha="right", rotation=90)

        ax.scatter([x[-1], x[-1]], [re_l.iloc[-1], re_g.iloc[-1]], color=["#38BDF8", "#F59E0B"], s=36, zorder=5)
        pad_x = max(0.7, len(m) * 0.025)
        ax.text(x[-1] + pad_x, re_l.iloc[-1], f"{r['ldr']}\n{re_l.iloc[-1]-100:+.1f}%", fontsize=7.8, color="#38BDF8", fontweight="bold", va="center")
        ax.text(x[-1] + pad_x, re_g.iloc[-1], f"{r['lag']}\n{re_g.iloc[-1]-100:+.1f}%", fontsize=7.8, color="#FBBF24", fontweight="bold", va="center")
        ax.axhline(100, color="#475569", lw=0.9, ls=":")
        ax.set_xlim(-0.8, len(m) + max(3.8, len(m) * 0.16))
        tidx = [0, len(m)//3, (2*len(m))//3, len(m) - 1]
        ax.set_xticks(tidx)
        ax.set_xticklabels([m["dt"].iloc[i].strftime("%b %d") for i in tidx], fontsize=8)
        ax.grid(True, alpha=0.45)

        win_sp = r["spread"][WIN_IDX[r["win"]]]
        span_lbl = "21d / 1M View" if win_len == 22 else "63d / 1Q View"
        ax.set_title(f"[{r['win']}] {r['ldr']} vs. {r['lag']} ({r['cluster']}) | Corr {r['corr']:.2f}", fontsize=9.5, pad=8)
        ax.text(0.02, 0.945, f"{span_lbl} · Active {r['win']} Gap: {win_sp:+.2f}%\nPairs Ratio: {r['ratio_now']:.4f} → 50%: {r['ratio_50']:.4f} → 100%: {r['ratio_100']:.4f}",
                transform=ax.transAxes, fontsize=7.4, color="#E2E8F0", va="top", bbox=dict(boxstyle="round,pad=0.25", fc="#0F172A", ec="#334155", alpha=0.88))

    leg_h = [
        plt.Line2D([0], [0], color="#38BDF8", lw=2.3, label="Outperforming Sector Leader (Rebased = 100)"),
        plt.Line2D([0], [0], color="#F59E0B", lw=2.3, label="Catch-Up Laggard Candidate (Rebased = 100)"),
        mpatches.Patch(color="#10B981", alpha=0.25, label="Mean-Reversion Parity Gap"),
        plt.Line2D([0], [0], color="#A855F7", lw=1.2, ls="--", label="Active Horizon Anchor (1W / 1M)"),
    ]
    fig.legend(handles=leg_h, loc="lower center", bbox_to_anchor=(0.5, 0.014), ncol=4, frameon=True, facecolor="#111827", edgecolor="#334155", fontsize=8.6)
    plt.tight_layout(rect=[0, 0.06, 1, 0.945])
    plt.savefig(OUT_DIR / "rv_chart4_rebased_parity.png", dpi=200)
    plt.close()
    print("Generated all 4 Stock RV charts in outputs/.")

if __name__ == "__main__":
    main()
