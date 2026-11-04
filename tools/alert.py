#!/usr/bin/env python3
"""Open, update or close ONE GitHub issue depending on whether a source keeps failing.

Reads events.json (written by fetch.py): "streaks" counts consecutive runs a source has had a warning, and "warnings"
holds the messages. A single bad run is usually a blip, so the issue opens at 2 in a row. While sources stay broken the
issue is edited in place (no comment spam). When everything is healthy again it closes itself.

Needs the gh CLI and GH_TOKEN (the workflow provides both). `--dry-run` prints what it would do.
"""
import argparse, json, subprocess, sys

LABEL = "source-broken"


def failing(data, min_streak=2):
    return {k: n for k, n in (data.get("streaks") or {}).items() if n >= min_streak}


def render(data, bad):
    title = "Event sources failing: " + ", ".join(sorted(bad))
    lines = ["These sources have had a warning on consecutive scheduled runs:", ""]
    lines += [f"* `{k}`: {n} runs in a row" for k, n in sorted(bad.items())]
    msgs = [m for m in data.get("warnings", []) if any(m.startswith(k) for k in bad)]
    if msgs:
        lines += ["", "Latest warnings:", ""] + [f"* {m}" for m in msgs]
    lines += ["", f"Last run: {data.get('last_updated', 'unknown')}",
              "The site's previous events are being kept meanwhile, so the page still works, but they will expire.",
              "See `docs/SOURCES.md` for how to diagnose a broken source. This issue updates itself and closes when the source recovers."]
    return title, "\n".join(lines)


def sync(data, gh, min_streak=2):
    """gh(args) -> stdout. Returns a short description of what it did."""
    bad = failing(data, min_streak)
    gh(["label", "create", LABEL, "--color", "D93F0B", "--description", "An event source stopped working", "--force"])
    open_issues = json.loads(gh(["issue", "list", "--label", LABEL, "--state", "open", "--json", "number", "--limit", "1"]) or "[]")
    if not bad:
        if open_issues:
            n = str(open_issues[0]["number"])
            gh(["issue", "comment", n, "--body", "All sources are healthy again. Closing."])
            gh(["issue", "close", n])
            return f"closed #{n}"
        return "all sources healthy"
    title, body = render(data, bad)
    if open_issues:
        n = str(open_issues[0]["number"])
        gh(["issue", "edit", n, "--title", title, "--body", body])
        return f"updated #{n}"
    gh(["issue", "create", "--title", title, "--body", body, "--label", LABEL])
    return "opened a new issue"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--events", default="events.json")
    ap.add_argument("--min-streak", type=int, default=2)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    with open(a.events) as f:
        data = json.load(f)

    def gh(args):
        if a.dry_run:
            print("gh", " ".join(args)[:200])
            return "[]"
        return subprocess.run(["gh"] + args, capture_output=True, text=True, check=True).stdout

    print(sync(data, gh, a.min_streak))
    return 0


if __name__ == "__main__":
    sys.exit(main())
