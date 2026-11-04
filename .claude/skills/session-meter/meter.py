#!/usr/bin/env python3
"""Session meter: token usage, time, and a new-session recommendation.

Stdlib only. Incremental: caches the transcript byte offset so repeat runs
parse only new lines. Dedupes by message id because one API response is
written as several JSONL lines that repeat the same usage block.
"""
import argparse, json, os, sys, time
from datetime import datetime
from pathlib import Path

# USD per 1M tokens: input, output, cache write 5m, cache write 1h, cache read.
# Source: Anthropic model pricing as of 2026-10. Haiku 5.5 cache read assumed 0.1x input
# (not published in the source); Haiku 5.5 prompts over 100K cost more, not modeled.
PRICES = {
    "sonnet-5-5": (2.00, 10.00, 2.50, 4.00, 0.20),
    "opus-5-5":   (4.00, 20.00, 5.00, 8.00, 0.20),
    "haiku-5-5":  (0.10, 0.50, 0.125, 0.20, 0.01),
    "fable-5-1":  (10.00, 50.00, 12.50, 20.00, 0.25),
    "mythos-5-1": (10.00, 50.00, 12.50, 20.00, 0.25),
    "opus-5":     (5.00, 25.00, 6.25, 10.00, 0.50),
    "sonnet-5":   (2.00, 10.00, 2.50, 4.00, 0.20),
    "opus-4":     (5.00, 25.00, 6.25, 10.00, 0.50),
    "sonnet-4":   (3.00, 15.00, 3.75, 6.00, 0.30),
    "haiku-4":    (1.00, 5.00, 1.25, 2.00, 0.10),
}
CACHE_VER = 2
IDLE_GAP = 600  # seconds; longer gaps are not counted as active time
HOME = Path.home() / ".claude"


def find_transcript(cwd):
    slug = str(Path(cwd).resolve()).replace("/", "-").replace(".", "-")
    d = HOME / "projects" / slug
    files = sorted(d.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True) if d.is_dir() else []
    if not files:
        allf = list((HOME / "projects").glob("*/*.jsonl"))
        files = sorted(allf, key=lambda p: p.stat().st_mtime, reverse=True)
    return files[0] if files else None


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def price_for(model):
    for k in sorted(PRICES, key=len, reverse=True):
        if k in (model or ""):
            return PRICES[k]
    return None


def row_cost(r, model):
    p = price_for(model)
    if not p:
        return None
    i, cc, cr, o, c1h = r[:5]
    c5 = max(0, cc - c1h)
    return (i * p[0] + o * p[1] + c5 * p[2] + c1h * p[3] + cr * p[4]) / 1e6


def load(path):
    cache_dir = HOME / "session-meter-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cp = cache_dir / (path.stem + ".json")
    st = {"offset": 0, "msgs": {}, "first": None, "last": None, "active": 0.0,
          "model": "", "turns": 0, "v": CACHE_VER}
    try:
        st = json.loads(cp.read_text())
        if st.get("v") != CACHE_VER:
            raise ValueError
        if st["offset"] > path.stat().st_size:
            raise ValueError
    except Exception:
        st = {"offset": 0, "msgs": {}, "first": None, "last": None, "active": 0.0,
              "model": "", "turns": 0, "v": CACHE_VER}
    with open(path, "rb") as f:
        f.seek(st["offset"])
        while True:
            line = f.readline()
            if not line or not line.endswith(b"\n"):
                break  # stop at a partial trailing line, pick it up next run
            st["offset"] = f.tell()
            if b'"timestamp"' not in line:
                continue
            try:
                d = json.loads(line)
                t = ts(d["timestamp"])
            except Exception:
                continue
            if d.get("isSidechain"):
                continue
            if st["first"] is None:
                st["first"] = t
            if st["last"] is not None:
                gap = t - st["last"]
                if 0 < gap < IDLE_GAP:
                    st["active"] += gap
            st["last"] = t
            m = d.get("message")
            if d.get("type") == "user" and isinstance(m, dict) and m.get("role") == "user":
                c = m.get("content")
                if isinstance(c, str) or (isinstance(c, list) and any(
                        isinstance(x, dict) and x.get("type") == "text" for x in c)):
                    st["turns"] += 1
            if isinstance(m, dict) and m.get("usage") and m.get("id"):
                u = m["usage"]
                st["msgs"][m["id"]] = [u.get("input_tokens", 0),
                                       u.get("cache_creation_input_tokens", 0),
                                       u.get("cache_read_input_tokens", 0),
                                       u.get("output_tokens", 0),
                                       (u.get("cache_creation") or {}).get("ephemeral_1h_input_tokens", 0),
                                       m.get("model", st["model"])]
                st["model"] = m.get("model", st["model"])
    try:
        cp.write_text(json.dumps(st))
    except OSError:
        pass
    return st


def fmt_n(n):
    return f"{n/1e6:.2f}M" if n >= 1e6 else f"{n/1e3:.1f}k" if n >= 1e3 else str(n)


def fmt_t(s):
    s = int(s)
    h, r = divmod(s, 3600)
    m, sec = divmod(r, 60)
    return f"{h}h {m:02d}m" if h else f"{m}m {sec:02d}s"


def bar(frac, width=30):
    frac = max(0.0, min(1.0, frac))
    n = round(frac * width)
    return "█" * n + "░" * (width - n)


def analyze(st, window):
    rows = list(st["msgs"].values())  # insertion ordered
    if not rows:
        return None
    i, cc, cr, o = rows[-1][:4]
    ctx = i + cc + cr
    fresh_in = sum(r[0] + r[1] for r in rows)
    out = sum(r[3] for r in rows)
    reads = sum(r[2] for r in rows)
    ctxs = [r[0] + r[1] + r[2] for r in rows]
    tail = ctxs[-15:]
    growth = max(0.0, (tail[-1] - tail[0]) / (len(tail) - 1)) if len(tail) > 1 else 0.0
    frac = ctx / window
    left = window - ctx
    turns_left = int(left / growth) if growth > 50 else None
    wall = (st["last"] or 0) - (st["first"] or 0)
    act = st["active"]

    reasons = []
    if frac >= 0.85:
        v, reasons = "NEW SESSION", [f"context {frac:.0%} full, quality and cost degrade near the limit"]
    elif frac >= 0.70:
        v, reasons = "WRAP UP", [f"context {frac:.0%} full, finish the current task then start fresh"]
    elif turns_left is not None and turns_left < 8:
        v, reasons = "WRAP UP", [f"only ~{turns_left} turns of room at the current pace"]
    else:
        v = "CONTINUE"
    if act > 3 * 3600 and v == "CONTINUE":
        v, reasons = "WRAP UP", [f"{fmt_t(act)} active, long sessions drift, consider a fresh start at a natural break"]
    elif act > 3 * 3600:
        reasons.append(f"{fmt_t(act)} active time")
    if v == "CONTINUE":
        reasons = [f"{frac:.0%} of context used" + (f", ~{turns_left} turns of room" if turns_left else "")]
    costs = [row_cost(r, r[5]) for r in rows]
    known = [c for c in costs if c is not None]
    total = sum(known) if known else None
    # What the next call costs at current context if the cache is warm vs a cold restart
    p = price_for(st["model"])
    nxt_warm = ctx * p[4] / 1e6 if p else None
    fresh_restart = ctx * p[2] / 1e6 if p else None
    hours = max(act, 60) / 3600
    return dict(verdict=v, reason="; ".join(reasons), context=ctx, window=window, fill=frac,
                fresh_input=fresh_in, output=out, cache_reads=reads, turns=st["turns"],
                api_calls=len(rows), growth_per_call=int(growth), calls_left=turns_left,
                wall_s=int(wall), active_s=int(act), model=st["model"],
                cost_usd=total, cost_per_hour=(total / hours if total is not None else None),
                cost_per_prompt=(total / st["turns"] if total is not None and st["turns"] else None),
                next_call_warm=nxt_warm, cache_rewrite_cost=fresh_restart,
                unpriced_calls=len(costs) - len(known))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file")
    ap.add_argument("--window", type=int)
    ap.add_argument("--line", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    path = Path(a.file) if a.file else find_transcript(os.getcwd())
    if not path or not path.exists():
        print("No transcript found.", file=sys.stderr)
        return 1
    st = load(path)
    window = a.window or (1_000_000 if "1m" in st["model"].lower() else 200_000)
    r = analyze(st, window)
    if not r:
        print("No usage data yet.")
        return 0

    if a.json:
        print(json.dumps(r, indent=2)); return 0
    icon = {"CONTINUE": "🟢", "WRAP UP": "🟡", "NEW SESSION": "🔴"}[r["verdict"]]
    if a.line:
        print(f"{icon} {bar(r['fill'], 10)} {r['fill']:.0%} ctx · {fmt_n(r['context'])}/{fmt_n(window)} · "
              f"{fmt_t(r['active_s'])} active · "
              + (f"${r['cost_usd']:.2f} · " if r["cost_usd"] is not None else "") + r['verdict'])
        return 0
    print(f"{icon} Session meter  ({r['model'] or 'unknown model'})")
    print(f"  Context  {bar(r['fill'])} {r['fill']:.0%}  {fmt_n(r['context'])} / {fmt_n(window)}")
    print(f"  Tokens   {fmt_n(r['fresh_input'])} in · {fmt_n(r['output'])} out · {fmt_n(r['cache_reads'])} cached reads")
    if r["cost_usd"] is not None:
        extra = f" · ${r['cost_per_hour']:.2f}/hr" + (f" · ${r['cost_per_prompt']:.2f}/prompt" if r["cost_per_prompt"] else "")
        print(f"  Cost     ${r['cost_usd']:.2f} API equivalent{extra}")
        print(f"           next call ~${r['next_call_warm']:.3f} if cache warm, ~${r['cache_rewrite_cost']:.2f} if it expires and rewrites")
    print(f"  Time     {fmt_t(r['active_s'])} active · {fmt_t(r['wall_s'])} wall clock")
    print(f"  Activity {r['turns']} prompts · {r['api_calls']} model calls")
    pace = f"+{fmt_n(r['growth_per_call'])}/call" + (f" · ~{r['calls_left']} calls until full" if r["calls_left"] else "")
    print(f"  Pace     {pace}")
    print(f"  Verdict  {r['verdict']}: {r['reason']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
