#!/usr/bin/env python3
"""Step 6: Compile the self-contained, zero-dependency dark-mode interactive HTML
Single-Stock Relative-Value & Parity Arbitrage Tearsheet with base64-embedded PNG charts."""
import base64, html, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR, OUT_DIR = ROOT / "data", ROOT / "outputs"
WIN_IDX = {"1W": 0, "1M": 1, "1Q": 2}

def b64_img(p):
    return "data:image/png;base64," + base64.b64encode(Path(p).read_bytes()).decode("ascii")

def badge_tier(t):
    cls = {"Tier 1": "b-t1", "Tier 2": "b-t2", "Tier 3": "b-t3"}[t]
    lbl = {"Tier 1": "TIER 1 · ACTIONABLE", "Tier 2": "TIER 2 · WATCH", "Tier 3": "TIER 3 · QUARANTINE"}[t]
    return f'<span class="badge {cls}">{lbl}</span>'

def badge_win(w):
    cls = {"1W": "b-1w", "1M": "b-1m", "1Q": "b-1q"}[w]
    return f'<span class="badge {cls}">{w}</span>'

def badge_src(c):
    c = (c or "SP500").upper()
    cls = {"CORE": "b-src-core", "DYNAMIC": "b-src-dyn", "SP500": "b-src-sp500", "EXP": "b-src-exp"}.get(c, "b-src-sp500")
    return f'<span class="badge {cls}">{html.escape(c)}</span>'

def fmt_disc(d):
    if d is None: return '<span class="muted">—</span>'
    return f'<span class="{"pos" if d < 0 else "warn"}">{d:+.1f}%</span>'

def main():
    payload = json.loads((DATA_DIR / "final_rv_specs.json").read_text())
    asof = payload["asof"]
    specs = payload["setups"]
    t1 = [r for r in specs if r["tier"] == "Tier 1"]
    t2 = [r for r in specs if r["tier"] == "Tier 2"]
    t3 = [r for r in specs if r["tier"] == "Tier 3"]
    excl = payload.get("special_exclusions", [])

    avg_rr50 = sum(r["rr50_e"] for r in t1) / len(t1) if t1 else 0.0
    avg_rr100 = sum(r["rr100_e"] for r in t1) / len(t1) if t1 else 0.0

    c1 = b64_img(OUT_DIR / "rv_chart1_regime_quadrant.png")
    c2 = b64_img(OUT_DIR / "rv_chart2_tier1_technicals.png")
    c3 = b64_img(OUT_DIR / "rv_chart3_valuation_zscore.png")
    c4 = b64_img(OUT_DIR / "rv_chart4_rebased_parity.png")

    def build_t1_cards(win_code, title, subtitle):
        items = [r for r in t1 if r["win"] == win_code]
        if not items:
            return f'<div class="horizon-block"><div class="hb-title"><h2>{title}</h2><p>No peer pairs cleared strict Tier 1 anti-trap criteria on this horizon today.</p></div></div>'
        cards = []
        for r in items:
            sp_act = r["spread"][WIN_IDX[win_code]]
            e_lo, e_hi = r["entry_rng"]
            pe_str = f'{r["fpe_g"]:.1f}x vs {r["fpe_l"]:.1f}x ({fmt_disc(r["pe_disc"])})' if (r.get("fpe_g") and r.get("fpe_l")) else "—"
            twin_html = f'<div class="twin-pill">{html.escape(r["twin_note"])}</div>' if r.get("twin_note") else ""
            cards.append(f"""
            <div class="setup-card">
              <div class="sc-head">
                <div>
                  <div class="sc-eyebrow">{badge_win(r['win'])} {badge_src(r.get('cat'))} <span class="cluster-tag">{html.escape(r['cluster'])}</span> <span class="corr-tag">Corr {r['corr']:.2f}</span></div>
                  <h3>BUY <span class="hl-buy">{r['lag']}</span> <span class="vs">vs. Leader</span> <span class="hl-ldr">{r['ldr']}</span></h3>
                </div>
                <div class="sc-gap"><div class="gap-val">{sp_act:+.2f}%</div><div class="gap-lbl">{r['win']} Parity Gap</div></div>
              </div>
              {twin_html}
              <div class="sc-metrics">
                <div class="m-box"><div class="m-k">Laggard / Leader</div><div class="m-v">${r['g_px']:.2f} / ${r['l_px']:.2f}</div><div class="m-s">{r['ldr']} {r['l_d52']:+.1f}% vs 52wH</div></div>
                <div class="m-box"><div class="m-k">1W / 1M / 1Q Gap</div><div class="m-v">{r['spread'][0]:+.1f}% / {r['spread'][1]:+.1f}% / {r['spread'][2]:+.1f}%</div><div class="m-s">Z63 {r['z63']:+.2f}σ · Z21 {r['z21']:+.2f}σ</div></div>
                <div class="m-box"><div class="m-k">Forward P/E Parity</div><div class="m-v">{pe_str}</div><div class="m-s">Div Yield {html.escape(str(r['div_g']))} · RSI {r['g_rsi']}</div></div>
                <div class="m-box"><div class="m-k">MA Support Floor</div><div class="m-v">20E ${r['g_e20']:.2f} · 50D ${r['g_s50']:.2f}</div><div class="m-s">{r['g_dE20']:+.1f}% vs 20E · {r['g_dS50']:+.1f}% vs 50D</div></div>
              </div>
              <div class="sc-plan">
                <div class="plan-col entry-col"><div class="p-k">Patient Entry Zone</div><div class="p-v">${e_lo:.2f} – ${e_hi:.2f}</div><div class="p-s">Mid ${r['entry_mid']:.2f} · Next Earn: {html.escape(str(r['earn_g']))}</div></div>
                <div class="plan-col tgt-col"><div class="p-k">50% &amp; 100% Parity Targets</div><div class="p-v">${r['tgt50']:.2f} <span class="pos">({r['up50_c']:+.1f}%)</span> · ${r['tgt100']:.2f} <span class="pos">({r['up100_c']:+.1f}%)</span></div><div class="p-s">Ratio: {r['ratio_now']:.4f} → {r['ratio_50']:.4f} → {r['ratio_100']:.4f}</div></div>
                <div class="plan-col stop-col"><div class="p-k">Invalidation Stop &amp; R:R</div><div class="p-v">${r['stop']:.2f} <span class="neg">({r['risk_e']:+.1f}% from entry)</span></div><div class="p-s">Entry R:R: <strong class="pos">{r['rr50_e']:.2f}x</strong> (50%) / <strong class="pos">{r['rr100_e']:.2f}x</strong> (100%)</div></div>
              </div>
              <div class="sc-fund"><strong>Verified Fundamental Anti-Trap Check:</strong> {html.escape(r['note'])}</div>
            </div>""")
        return f'<div class="horizon-block"><div class="hb-title"><h2>{title}</h2><p>{subtitle}</p></div><div class="card-grid">{"".join(cards)}</div></div>'

    rows = []
    for idx, r in enumerate(specs):
        sp_act = r["spread"][WIN_IDX[r["win"]]]
        t_slug = r["tier"].replace(" ", "").lower()
        d50_cls = "pos" if r["g_dS50"] > 0 else "neg"
        pe_cell = f'{r["fpe_g"]:.1f}x / {r["fpe_l"]:.1f}x<br><small>{fmt_disc(r["pe_disc"])}</small>' if (r.get("fpe_g") and r.get("fpe_l")) else "—"
        rr_cell = f'<strong class="pos">{r["rr50_e"]:.2f}x</strong> / <strong class="pos">{r["rr100_e"]:.2f}x</strong>' if r["tier"] != "Tier 3" else '<span class="neg">REJECT</span>'
        tgt_cell = f'${r["tgt50"]:.2f} <small class="pos">({r["up50_c"]:+.1f}%)</small><br>${r["tgt100"]:.2f} <small class="pos">({r["up100_c"]:+.1f}%)</small>' if r["tier"] != "Tier 3" else '<span class="muted">Quarantined</span>'
        rows.append(f"""
        <tr class="data-row" data-tier="{t_slug}" data-win="{r['win']}" data-search="{html.escape((r['pair']+' '+r['cluster']+' '+r['note']).lower())}" onclick="toggleDetail({idx})">
          <td>{badge_tier(r['tier'])}<br>{badge_win(r['win'])}</td>
          <td><strong>{r['ldr']} &gt; <span class="hl-buy">{r['lag']}</span></strong><br><small class="muted">{html.escape(r['cluster'])} · Corr {r['corr']:.2f}</small></td>
          <td class="num">${r['g_px']:.2f}<br><small class="muted">Ldr ${r['l_px']:.2f}</small></td>
          <td class="num"><strong>{sp_act:+.2f}%</strong> <small>({r['win']})</small><br><small class="muted">{r['spread'][0]:+.1f} / {r['spread'][1]:+.1f} / {r['spread'][2]:+.1f}%</small></td>
          <td class="num">{r['z63']:+.2f}σ<br><small class="muted">Z21 {r['z21']:+.2f}σ</small></td>
          <td class="num">{pe_cell}</td>
          <td class="num"><span class="{d50_cls}">{r['g_dS50']:+.1f}%</span><br><small class="muted">RSI {r['g_rsi']}</small></td>
          <td><strong>{html.escape(r['entry_str'])}</strong><br><small class="muted">Stop ${r['stop']:.2f}</small></td>
          <td class="num">{tgt_cell}</td>
          <td class="num">{rr_cell}<br><small class="muted">Earn {html.escape(str(r['earn_g']))}</small></td>
        </tr>
        <tr class="detail-row" id="det-{idx}" style="display:none;"><td colspan="10"><div class="det-inner">
          <div><strong>Fundamental &amp; Catalyst Audit:</strong> {html.escape(r['note'])}</div>
          <div class="det-meta">
            <span><strong>20-EMA:</strong> ${r['g_e20']:.2f} ({r['g_dE20']:+.2f}%)</span>
            <span><strong>50-DMA:</strong> ${r['g_s50']:.2f} ({r['g_dS50']:+.2f}%)</span>
            <span><strong>50-EMA:</strong> ${r['g_e50']:.2f} ({r['g_dE50']:+.2f}%)</span>
            <span><strong>ATR-14:</strong> ${r['g_atr']:.2f}</span>
            <span><strong>Pairs Ratio:</strong> {r['ratio_now']:.4f} → {r['ratio_50']:.4f} → {r['ratio_100']:.4f}</span>
            <span><strong>Leader Next Earn:</strong> {html.escape(str(r['earn_l']))}</span>
          </div>
        </div></td></tr>""")

    pills_html = "".join(f'<span class="r-pill"><strong>{html.escape(p["label"])}:</strong> {html.escape(p["text"])}</span>' for p in payload.get("regime_pills", []))
    t2_cards = "".join(f'<div class="audit-card t2"><div>{badge_tier(r["tier"])} {badge_win(r["win"])} <span class="cluster-tag">{html.escape(r["cluster"])}</span></div><h4>{r["ldr"]} (${r["l_px"]:.2f}) &gt; {r["lag"]} (${r["g_px"]:.2f}) · Gap {r["spread"][WIN_IDX[r["win"]]]:+.2f}% ({r["win"]})</h4><p>{html.escape(r["note"])}</p><p style="margin-top:8px;font-size:11.5px;color:#94A3B8;"><strong>Fwd P/E:</strong> {r["fpe_g"]}x vs {r["fpe_l"]}x ({r["pe_disc"]}%) · <strong>Z63/Z21:</strong> {r["z63"]:+.2f}σ / {r["z21"]:+.2f}σ · <strong>Next Earn:</strong> {html.escape(str(r["earn_g"]))}</p></div>' for r in t2)
    t3_cards = "".join(f'<div class="audit-card t3"><div>{badge_tier(r["tier"])} {badge_win(r["win"])} <span class="cluster-tag">{html.escape(r["cluster"])}</span></div><h4>{r["ldr"]} (${r["l_px"]:.2f}) &gt; {r["lag"]} (${r["g_px"]:.2f}) · Gap {r["spread"][WIN_IDX[r["win"]]]:+.2f}% ({r["win"]})</h4><p>{html.escape(r["note"])}</p><p style="margin-top:8px;font-size:11.5px;color:#94A3B8;"><strong>vs 50-DMA:</strong> <span class="neg">{r["g_dS50"]:+.1f}%</span> · <strong>RSI-14:</strong> {r["g_rsi"]} · <strong>Next Earn:</strong> {html.escape(str(r["earn_g"]))}</p></div>' for r in t3)
    excl_cards = "".join(f'<div class="audit-card t3"><div><span class="badge b-t3">{html.escape(e["badge"])}</span> <span class="cluster-tag">{html.escape(e["cluster"])}</span></div><h4>{html.escape(e["title"])}</h4><p>{html.escape(e["note"])}</p></div>' for e in excl)

    doc = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Institutional Single-Stock Relative-Value &amp; Parity Arbitrage Report — {asof}</title>
<style>
  :root {{ --bg:#080E1A; --surf:#111827; --surf2:#162033; --border:#24324B; --text:#F1F5F9; --muted:#94A3B8; --dim:#64748B; --green:#10B981; --green-bg:rgba(16,185,129,0.12); --amber:#F59E0B; --amber-bg:rgba(245,158,11,0.12); --red:#EF4444; --red-bg:rgba(239,68,68,0.12); --blue:#38BDF8; }}
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif; background:var(--bg); color:var(--text); line-height:1.5; padding:24px 20px 64px; }}
  .container {{ max-width:1420px; margin:0 auto; }}
  .hero {{ background:linear-gradient(135deg,#0F172A 0%,#111C33 55%,#0D222B 100%); border:1px solid var(--border); border-radius:16px; padding:28px 32px; margin-bottom:24px; box-shadow:0 20px 40px rgba(0,0,0,0.4); }}
  .hero-tag {{ display:inline-block; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--green); background:var(--green-bg); border:1px solid rgba(16,185,129,0.35); padding:4px 10px; border-radius:999px; margin-bottom:10px; }}
  .hero h1 {{ font-size:27px; font-weight:800; letter-spacing:-0.02em; color:#F8FAFC; }}
  .hero-sub {{ color:var(--muted); font-size:14px; margin-top:6px; max-width:860px; }}
  .kpi-row {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px; margin-top:22px; }}
  .kpi {{ background:rgba(15,23,42,0.75); border:1px solid var(--border); border-radius:12px; padding:14px 16px; }}
  .kpi-k {{ font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); font-weight:600; }}
  .kpi-v {{ font-size:22px; font-weight:800; margin-top:4px; color:#F8FAFC; }}
  .kpi-s {{ font-size:11.5px; color:var(--dim); margin-top:2px; }}
  .regime-banner {{ background:var(--surf); border:1px solid var(--border); border-left:4px solid var(--blue); border-radius:12px; padding:18px 22px; margin-bottom:26px; }}
  .regime-banner h2 {{ font-size:15px; font-weight:700; color:var(--blue); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em; }}
  .regime-banner p {{ font-size:13.5px; color:#CBD5E1; }}
  .regime-pills {{ display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }}
  .r-pill {{ font-size:12px; padding:4px 10px; border-radius:6px; background:var(--surf2); border:1px solid var(--border); color:#CBD5E1; }}
  .r-pill strong {{ color:#F8FAFC; }}
  .nav-tabs {{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:12px; }}
  .nav-btn {{ background:var(--surf); color:var(--muted); border:1px solid var(--border); padding:9px 16px; border-radius:9px; cursor:pointer; font-size:13px; font-weight:600; }}
  .nav-btn.active {{ background:#1D4ED8; color:#FFF; border-color:#3B82F6; }}
  .section {{ display:none; }} .section.active {{ display:block; }}
  .horizon-block {{ margin-bottom:28px; }}
  .hb-title {{ margin-bottom:14px; display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; border-bottom:1px solid var(--border); padding-bottom:8px; }}
  .hb-title h2 {{ font-size:19px; font-weight:800; }} .hb-title p {{ font-size:13px; color:var(--muted); }}
  .card-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(560px,1fr)); gap:18px; }}
  .setup-card {{ background:var(--surf); border:1px solid var(--border); border-radius:14px; padding:20px; }}
  .setup-card:hover {{ border-color:rgba(16,185,129,0.55); }}
  .sc-head {{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px; }}
  .sc-eyebrow {{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px; }}
  .cluster-tag {{ font-size:11.5px; color:var(--muted); font-weight:600; }}
  .corr-tag {{ font-size:11px; color:var(--blue); background:rgba(56,189,248,0.12); padding:2px 7px; border-radius:5px; font-weight:700; }}
  .setup-card h3 {{ font-size:20px; font-weight:800; }}
  .hl-buy {{ color:var(--green); }} .hl-ldr {{ color:var(--blue); }} .vs {{ color:var(--dim); font-weight:500; font-size:14px; }}
  .sc-gap {{ text-align:right; background:var(--green-bg); border:1px solid rgba(16,185,129,0.35); border-radius:10px; padding:6px 12px; }}
  .gap-val {{ font-size:20px; font-weight:800; color:#34D399; line-height:1.1; }} .gap-lbl {{ font-size:10.5px; color:#A7F3D0; text-transform:uppercase; }}
  .twin-pill {{ font-size:11.5px; color:#BAE6FD; background:rgba(56,189,248,0.1); border:1px solid rgba(56,189,248,0.28); border-radius:7px; padding:5px 10px; margin-bottom:12px; }}
  .sc-metrics {{ display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:12px; }}
  .m-box {{ background:var(--surf2); border:1px solid var(--border); border-radius:9px; padding:10px 12px; }}
  .m-k {{ font-size:10.5px; color:var(--muted); text-transform:uppercase; font-weight:600; }} .m-v {{ font-size:14px; font-weight:700; margin-top:2px; }} .m-s {{ font-size:11.5px; color:var(--dim); margin-top:2px; }}
  .sc-plan {{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:12px; }}
  .plan-col {{ border-radius:9px; padding:10px 11px; border:1px solid var(--border); }}
  .entry-col {{ background:rgba(56,189,248,0.07); border-color:rgba(56,189,248,0.28); }}
  .tgt-col {{ background:rgba(16,185,129,0.08); border-color:rgba(16,185,129,0.3); }}
  .stop-col {{ background:rgba(239,68,68,0.07); border-color:rgba(239,68,68,0.28); }}
  .p-k {{ font-size:10.5px; text-transform:uppercase; color:var(--muted); font-weight:700; }} .p-v {{ font-size:13.5px; font-weight:800; margin-top:3px; }} .p-s {{ font-size:11px; color:#CBD5E1; margin-top:3px; }}
  .sc-fund {{ font-size:12.5px; color:#CBD5E1; background:rgba(15,23,42,0.8); border-top:1px solid var(--border); padding:10px 12px; border-radius:8px; }}
  .sc-fund strong {{ color:#6EE7B7; }}
  .badge {{ display:inline-block; font-size:10px; font-weight:800; padding:2px 7px; border-radius:5px; letter-spacing:0.04em; }}
  .b-t1 {{ background:var(--green-bg); color:#34D399; border:1px solid rgba(16,185,129,0.4); }}
  .b-t2 {{ background:var(--amber-bg); color:#FBBF24; border:1px solid rgba(245,158,11,0.4); }}
  .b-t3 {{ background:var(--red-bg); color:#F87171; border:1px solid rgba(239,68,68,0.4); }}
  .b-1w {{ background:rgba(168,85,247,0.18); color:#D8B4FE; border:1px solid rgba(168,85,247,0.4); }}
  .b-1m {{ background:rgba(56,189,248,0.18); color:#7DD3FC; border:1px solid rgba(56,189,248,0.4); }}
  .b-1q {{ background:rgba(16,185,129,0.18); color:#6EE7B7; border:1px solid rgba(16,185,129,0.4); }}
  .b-src-core {{ background:rgba(251,191,36,0.15); color:#FDE68A; border:1px solid rgba(251,191,36,0.35); }}
  .b-src-dyn {{ background:rgba(236,72,153,0.18); color:#F9A8D4; border:1px solid rgba(236,72,153,0.4); }}
  .b-src-sp500 {{ background:rgba(148,163,184,0.14); color:#CBD5E1; border:1px solid rgba(148,163,184,0.3); }}
  .b-src-exp {{ background:rgba(99,102,241,0.16); color:#C7D2FE; border:1px solid rgba(99,102,241,0.35); }}
  .pos {{ color:#34D399; font-weight:700; }} .neg {{ color:#F87171; font-weight:700; }} .warn {{ color:#FBBF24; font-weight:700; }} .muted {{ color:var(--muted); }}
  .controls {{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; margin-bottom:14px; }}
  .btn-group {{ display:flex; flex-wrap:wrap; gap:6px; }}
  .f-btn {{ background:var(--surf); color:var(--muted); border:1px solid var(--border); padding:6px 12px; border-radius:7px; font-size:12px; font-weight:600; cursor:pointer; }}
  .f-btn.active {{ background:#0F766E; color:#FFF; border-color:#14B8A6; }}
  .search-in {{ background:var(--surf); color:#F8FAFC; border:1px solid var(--border); padding:7px 12px; border-radius:8px; font-size:12.5px; min-width:230px; }}
  .table-wrap {{ overflow-x:auto; border:1px solid var(--border); border-radius:12px; background:var(--surf); }}
  table {{ width:100%; border-collapse:collapse; font-size:12.5px; }}
  th {{ text-align:left; padding:11px 10px; background:#0F172A; color:var(--muted); font-size:11px; text-transform:uppercase; border-bottom:1px solid var(--border); }}
  th.num, td.num {{ text-align:right; }}
  td {{ padding:11px 10px; border-bottom:1px solid #1E293B; vertical-align:middle; }}
  tr.data-row {{ cursor:pointer; }} tr.data-row:hover {{ background:#182338; }}
  .detail-row td {{ background:#0D1526; padding:12px 16px; }}
  .det-inner {{ font-size:12.5px; color:#CBD5E1; }}
  .det-meta {{ display:flex; flex-wrap:wrap; gap:14px; margin-top:8px; font-size:11.5px; color:#94A3B8; }}
  .chart-card {{ background:var(--surf); border:1px solid var(--border); border-radius:14px; padding:18px; margin-bottom:22px; }}
  .chart-card h3 {{ font-size:16px; font-weight:700; margin-bottom:4px; }} .chart-card p {{ font-size:12.5px; color:var(--muted); margin-bottom:14px; }}
  .chart-card img {{ width:100%; height:auto; border-radius:10px; border:1px solid #1E293B; cursor:zoom-in; display:block; }}
  .audit-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(420px,1fr)); gap:16px; margin-bottom:24px; }}
  .audit-card {{ background:var(--surf); border:1px solid var(--border); border-radius:12px; padding:16px; }}
  .audit-card.t2 {{ border-left:4px solid var(--amber); }} .audit-card.t3 {{ border-left:4px solid var(--red); }}
  .audit-card h4 {{ font-size:15px; font-weight:800; margin:6px 0; }} .audit-card p {{ font-size:12.5px; color:#CBD5E1; }}
  #lightbox {{ display:none; position:fixed; inset:0; background:rgba(2,6,23,0.92); z-index:9999; justify-content:center; align-items:center; padding:24px; cursor:zoom-out; }}
  #lightbox img {{ max-width:96%; max-height:94vh; border-radius:10px; border:1px solid #334155; }}
  footer {{ margin-top:36px; padding-top:16px; border-top:1px solid var(--border); font-size:11.5px; color:var(--dim); }}
</style></head><body><div class="container">
  <div class="hero">
    <div class="hero-tag">Institutional Single-Stock Relative-Value &amp; Statistical Arbitrage Desk</div>
    <h1>Multi-Horizon Stock Parity Divergence Tearsheet</h1>
    <p class="hero-sub">Live US Equity Peer-Pair Audit through <strong>{asof} Close</strong> · Strict Anti-Trap Filter (Broken-Out Leader + Verified 10-Day Candle Support + Live Earnings/Guidance Verification + Forward P/E Parity).</p>
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-k">Universe Audited</div><div class="kpi-v">{payload['universe_tickers']} Stocks / {payload['universe_pairs']:,} Pairs</div><div class="kpi-s">S&amp;P 500 GICS + Core + Dynamic ({payload.get('shortlist_count', len(specs))} Funnel Shortlist)</div></div>
      <div class="kpi"><div class="kpi-k">Tier 1 Actionable</div><div class="kpi-v" style="color:#34D399">{len(t1)} Clean Setups</div><div class="kpi-s">Anti-Trap Verified (1W / 1M / 1Q)</div></div>
      <div class="kpi"><div class="kpi-k">Avg Entry R:R (Tier 1)</div><div class="kpi-v" style="color:#34D399">{avg_rr50:.1f}x / {avg_rr100:.1f}x</div><div class="kpi-s">50% Half-Parity / 100% Full-Parity</div></div>
      <div class="kpi"><div class="kpi-k">Tier 2 Watchlist</div><div class="kpi-v" style="color:#FBBF24">{len(t2)} Pairs</div><div class="kpi-s">Event Risk / Fundamental Caution</div></div>
      <div class="kpi"><div class="kpi-k">Tier 3 Quarantined</div><div class="kpi-v" style="color:#F87171">{len(t3)} Pairs{f' + {len(excl)} Excl' if excl else ''}</div><div class="kpi-s">Broken Trends / Earnings Traps</div></div>
    </div>
  </div>

  <div class="regime-banner">
    <h2>{html.escape(payload['regime_title'])} ({asof})</h2>
    <p>{html.escape(payload['regime_summary'])}</p>
    <div class="regime-pills">{pills_html}</div>
  </div>

  <div class="nav-tabs">
    <button class="nav-btn active" onclick="showTab('tab-t1',this)">Tier 1 Actionable Setups ({len(t1)})</button>
    <button class="nav-btn" onclick="showTab('tab-matrix',this)">Interactive Screener ({len(specs)} Pairs)</button>
    <button class="nav-btn" onclick="showTab('tab-charts',this)">4 Institutional Charts</button>
    <button class="nav-btn" onclick="showTab('tab-audit',this)">Tier 2 Watchlist &amp; Tier 3 Audit</button>
  </div>

  <div id="tab-t1" class="section active">
    {build_t1_cards("1W", "1-Week Horizon (5 Trading Days) — Fast Liquidity & Sympathy Lag", "Post-earnings laggards resting near 20-EMA support while direct leaders surged to highs over the last 5 sessions.")}
    {build_t1_cards("1M", "1-Month Horizon (21 Trading Days) — Swing Parity Stretch (Z < −1.25σ)", "Tightly correlated sector twins stretched over 21 sessions with verified operational beats and clean swing floors.")}
    {build_t1_cards("1Q", "1-Quarter Horizon (63 Trading Days) — Structural Catch-Up Near Support", "Fundamentally intact franchises lagging direct peers over 1Q with multi-month moving average support.")}
  </div>

  <div id="tab-matrix" class="section">
    <div class="controls">
      <div class="btn-group">
        <button class="f-btn active" onclick="setTier('all',this)">All ({len(specs)})</button>
        <button class="f-btn" onclick="setTier('tier1',this)">Tier 1 ({len(t1)})</button>
        <button class="f-btn" onclick="setTier('tier2',this)">Tier 2 ({len(t2)})</button>
        <button class="f-btn" onclick="setTier('tier3',this)">Tier 3 ({len(t3)})</button>
      </div>
      <div class="btn-group">
        <button class="f-btn active" onclick="setWin('all',this)">All Horizons</button>
        <button class="f-btn" onclick="setWin('1W',this)">1W</button>
        <button class="f-btn" onclick="setWin('1M',this)">1M</button>
        <button class="f-btn" onclick="setWin('1Q',this)">1Q</button>
      </div>
      <input class="search-in" id="searchBox" type="text" placeholder="Filter ticker, sector, catalyst..." oninput="applyFilters()">
    </div>
    <div class="table-wrap"><table><thead><tr>
      <th>Tier / Win</th><th>Pair (Leader &gt; Laggard)</th><th class="num">Prices</th>
      <th class="num">Active Gap<br><small>1W / 1M / 1Q</small></th><th class="num">Z-Score<br><small>63d / 21d</small></th>
      <th class="num">Fwd P/E<br><small>Lag / Ldr</small></th><th class="num">vs 50-DMA<br><small>RSI-14</small></th>
      <th>Patient Entry<br><small>Invalidation Stop</small></th><th class="num">50% / 100%<br><small>Targets</small></th><th class="num">Entry R:R<br><small>Next Earn</small></th>
    </tr></thead><tbody>{"".join(rows)}</tbody></table></div>
  </div>

  <div id="tab-charts" class="section">
    <div class="chart-card"><h3>Figure 1 · Single-Stock Parity Regime Map</h3><p>Laggard distance from 50-DMA vs. active spread divergence. Click any chart to zoom.</p><img src="{c1}" onclick="openLightbox(this.src)"></div>
    <div class="chart-card"><h3>Figure 2 · Tier 1 Technical Setup Grid</h3><p>90-day price range, 20-EMA, 50-DMA, Patient Entry Zones, 50%/100% targets, and stops.</p><img src="{c2}" onclick="openLightbox(this.src)"></div>
    <div class="chart-card"><h3>Figure 3 · Statistical Stretch (Z-Score) &amp; Forward P/E Parity</h3><p>63d/21d ratio Z-scores alongside live Forward P/E multiple comparisons.</p><img src="{c3}" onclick="openLightbox(this.src)"></div>
    <div class="chart-card"><h3>Figure 4 · Rebased Total-Return Parity Overlays</h3><p>Dividend-adjusted Leader vs. Laggard performance rebased to 100 with live pairs execution ratios.</p><img src="{c4}" onclick="openLightbox(this.src)"></div>
  </div>

  <div id="tab-audit" class="section">
    <h2 style="font-size:18px;margin-bottom:12px;color:#FBBF24;">Tier 2 · Watchlist ({len(t2)})</h2>
    <div class="audit-grid">{t2_cards or '<p class="muted">No Tier 2 pairs listed.</p>'}</div>
    <h2 style="font-size:18px;margin-bottom:12px;color:#F87171;">Tier 3 · Quarantined Traps &amp; Exclusions ({len(t3) + len(excl)})</h2>
    <div class="audit-grid">{t3_cards}{excl_cards}</div>
  </div>

  <footer><strong>Data Provenance:</strong> Yahoo Finance daily dividend-adjusted closes through {asof}; StockAnalysis live Forward P/E, dividend yields &amp; earnings dates; verified quarterly earnings releases. For institutional research and informational purposes only.</footer>
</div>
<div id="lightbox" onclick="this.style.display='none'"><img id="lb-img" src=""></div>
<script>
  let curTier='all', curWin='all';
  function showTab(id,btn){{ document.querySelectorAll('.section').forEach(s=>s.classList.remove('active')); document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active')); document.getElementById(id).classList.add('active'); btn.classList.add('active'); }}
  function setTier(t,btn){{ curTier=t; btn.parentElement.querySelectorAll('.f-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); applyFilters(); }}
  function setWin(w,btn){{ curWin=w; btn.parentElement.querySelectorAll('.f-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); applyFilters(); }}
  function applyFilters(){{ const q=(document.getElementById('searchBox').value||'').toLowerCase().trim(); document.querySelectorAll('tr.data-row').forEach((row,i)=>{{ const ok=(curTier==='all'||row.dataset.tier===curTier)&&(curWin==='all'||row.dataset.win===curWin)&&(!q||row.dataset.search.includes(q)); row.style.display=ok?'':'none'; const det=document.getElementById('det-'+i); if(!ok&&det) det.style.display='none'; }}); }}
  function toggleDetail(i){{ const det=document.getElementById('det-'+i); if(det) det.style.display=det.style.display==='none'?'':'none'; }}
  function openLightbox(src){{ document.getElementById('lb-img').src=src; document.getElementById('lightbox').style.display='flex'; }}
</script></body></html>"""

    out = OUT_DIR / "relative_value_parity_report.html"
    out.write_text(doc)
    print(f"Built {out} ({out.stat().st_size/1024:.1f} KB)")

if __name__ == "__main__":
    main()
