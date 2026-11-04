#!/usr/bin/env python3
"""Record one real response per source into tests/fixtures/, so parsers can be tested offline (tests/test_sources.py).

  python3 tests/record_fixtures.py            # all sources
  python3 tests/record_fixtures.py cpl ra     # just those

Run it when a site changes and a test fails: the new fixture is the new shape of the site, and `git diff` of the tests
shows what moved. Requests are capped to a handful per source. Ticketmaster is not recorded (it needs a key): its
fixture is written by hand from the API docs.
"""
import gzip, json, os, sys
from datetime import timedelta

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
import fetch as f  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
NAMES = ["luma", "eventbrite", "partiful", "pie", "do312", "cpl", "cpd", "coursehorse", "ra"]


def key(url, data=None):
    return url if data is None else url + "|" + json.dumps(data, sort_keys=True)


def minimal_caps(city):
    f.DO_DAYS, f.DETAIL_CAP, f.CPL_PAGES, f.CPD_PAGES, f.MAX_PAGES, f.LUMA_CALENDARS = 1, 2, 1, 1, 1, 2
    city["ch_pages"] = 1


def trim(name, url, body):
    """Keep fixtures small without changing their shape."""
    try:
        if url == "https://www.eventbrite.com/":
            return ""                                           # only used to get a cookie
        if name == "ra" and "graphql" in url:
            d = json.loads(body); L = d["data"]["eventListings"]
            L["data"] = L["data"][:20]; L["totalResults"] = len(L["data"])
            return json.dumps(d)
        if name == "cpl":
            d = json.loads(body); ids = d["events"]["items"][:12]
            d["events"]["items"] = ids; d["events"]["pagination"]["pages"] = 1
            d["entities"]["events"] = {i: d["entities"]["events"][i] for i in ids}
            return json.dumps(d)
        if name == "luma" and "get-paginated-events" in url:
            d = json.loads(body); d["entries"] = d["entries"][:6]; d["has_more"] = False
            return json.dumps(d)
        if name == "eventbrite" and "destination/search" in url:
            d = json.loads(body); r = d["events"]
            r["results"] = r["results"][:10]; r["pagination"]["page_count"] = 1
            return json.dumps(d)
        if name == "pie" and "v1/plans" in url:
            return json.dumps(json.loads(body)[:2])
    except Exception as e:
        print(f"  (could not trim {url[:60]}: {e})")
    return body


def main(names):
    city = f.CITIES[0]
    for name in names or NAMES:
        fn = {"luma": f.fetch_luma, "eventbrite": f.fetch_eventbrite, "partiful": f.fetch_partiful, "pie": f.fetch_pie,
              "do312": f.fetch_dostuff, "cpl": f.fetch_cpl, "cpd": f.fetch_cpd, "coursehorse": f.fetch_coursehorse, "ra": f.fetch_ra}[name]
        minimal_caps(city)
        f.OLD.clear()
        real, rec = f.http, {}

        def wrapped(url, data=None, headers=None, _real=real, _rec=rec, _name=name):
            body = trim(_name, url, _real(url, data, headers))
            _rec[key(url, data)] = body      # the parser sees the trimmed body too, so replay behaves exactly like recording
            return body
        f.http = wrapped
        try:
            events = fn(city)
        finally:
            f.http = real
        print(f"{name}: {len(events)} events from {len(rec)} responses")
        if not events:
            print("  nothing parsed, not saving"); continue
        with gzip.open(os.path.join(OUT, name + ".json.gz"), "wt") as fh:
            json.dump({"now": f.NOW.isoformat(), "responses": rec}, fh)


if __name__ == "__main__":
    main(sys.argv[1:])
