#!/usr/bin/env python3
"""Fetch Chicago-area events from Luma and Eventbrite into events.json."""
import json, math, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from http.cookiejar import CookieJar
from zoneinfo import ZoneInfo

CHI = ZoneInfo("America/Chicago")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
OUT = "events.json"
NOW = datetime.now(CHI)
CUTOFF = NOW + timedelta(days=30)
MAX_PAGES = 10
CHICAGO = (41.8781, -87.6298)
RADIUS_MI = 40
LUMA_PLACE = "discplace-NdGm35qFD0vaXNF"  # Chicago, from alx1p/luma-cal-mcp fallback list
LUMA_CATS = {"arts": "cat-AzVAf6VmE9JEre4", "food": "cat-fooddrink",
             "wellness": "cat-C1VaNLnt25w9t6c", "fitness": "cat-0Km9ZnuBjFAjwFl"}

jar = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def http(url, data=None, headers=None):
    h = {"User-Agent": UA, "Accept": "application/json, text/html, */*"}
    h.update(headers or {})
    body = json.dumps(data).encode() if data is not None else None
    if body:
        h["Content-Type"] = "application/json"
    time.sleep(1)
    with opener.open(urllib.request.Request(url, body, h), timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def ev(title, start, venue, url, source, desc):
    return {"title": (title or "").strip(), "start": start.astimezone(CHI).isoformat(timespec="minutes"),
            "venue": (venue or "").strip(), "url": url, "source": source,
            "description": re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", desc or "")).strip()[:300]}


def miles(lat, lon):
    p1, p2 = math.radians(CHICAGO[0]), math.radians(lat)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon - CHICAGO[1]) / 2) ** 2
    return 3959 * 2 * math.asin(math.sqrt(a))


def parse_dt(s, tz=CHI):
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=tz)


# ---------- Luma ----------
def luma_pages(params, near_only):
    out, cursor = [], None
    for _ in range(MAX_PAGES):
        q = dict(params, pagination_limit=50)
        if cursor:
            q["pagination_cursor"] = cursor
        d = json.loads(http("https://api.lu.ma/discover/get-paginated-events?" + urllib.parse.urlencode(q)))
        entries = d.get("entries", [])
        starts = []
        for e in entries:
            x = e.get("event") or {}
            if not x.get("start_at") or not x.get("url"):
                continue
            start = parse_dt(x["start_at"])
            starts.append(start)
            c = x.get("coordinate") or {}
            if c.get("latitude") is not None:
                if miles(c["latitude"], c["longitude"]) > RADIUS_MI:
                    continue
            elif near_only:
                continue
            g = x.get("geo_address_info") or {}
            out.append(ev(x.get("name"), start, g.get("full_address") or g.get("address") or g.get("city"),
                          "https://lu.ma/" + x["url"], "luma", x.get("description") or x.get("description_md")))
        if not d.get("has_more") or not d.get("next_cursor") or (starts and min(starts) > CUTOFF):
            break
        cursor = d["next_cursor"]
    return out


def fetch_luma():
    out = luma_pages({"discover_place_api_id": LUMA_PLACE}, near_only=False)
    for name, cid in LUMA_CATS.items():
        try:
            out += luma_pages({"discover_category_api_id": cid, "discover_place_api_id": LUMA_PLACE}, near_only=True)
        except Exception as e:
            print(f"luma category {name} failed: {e}", file=sys.stderr)
    return out


# ---------- Eventbrite ----------
def eb_from_api(x):
    start = parse_dt(f"{x['start_date']}T{x.get('start_time') or '00:00'}", ZoneInfo(x.get("timezone") or "America/Chicago"))
    v = x.get("primary_venue") or {}
    addr = v.get("address") or {}
    venue = ", ".join(p for p in [v.get("name"), addr.get("localized_address_display") if isinstance(addr, dict) else None] if p)
    return ev(x.get("name"), start, venue, x.get("url"), "eventbrite", x.get("summary"))


def eventbrite_api(home):
    token = next((c.value for c in jar if c.name == "csrftoken"), None)
    pm = re.search(r'"placeId":"(\d+)"', http("https://www.eventbrite.com/d/il--chicago/events/"))
    if not token or not pm:
        raise RuntimeError("no csrftoken or placeId")
    out = []
    for page in range(1, MAX_PAGES + 1):
        body = {"browse_surface": "search", "event_search": {"dates": ["current_future"], "places": [pm.group(1)],
                "page": page, "page_size": 20, "dedup": True}, "expand.destination_event": ["primary_venue"]}
        h = {"X-CSRFToken": token, "X-Requested-With": "XMLHttpRequest", "Referer": "https://www.eventbrite.com/"}
        res = json.loads(http("https://www.eventbrite.com/api/v3/destination/search/", body, h))["events"]
        batch = [eb_from_api(x) for x in res.get("results", []) if x.get("start_date") and x.get("url")]
        out += batch
        if not batch or page >= res.get("pagination", {}).get("page_count", page) or \
                min(datetime.fromisoformat(b["start"]) for b in batch) > CUTOFF:
            break
    return out


def eventbrite_html():
    out = []
    for page in range(1, MAX_PAGES + 1):
        html = http(f"https://www.eventbrite.com/d/il--chicago/events/?page={page}")
        batch = []
        for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
            try:
                d = json.loads(m.group(1))
            except ValueError:
                continue
            if d.get("@type") != "ItemList":
                continue
            for it in d.get("itemListElement", []):
                x = it.get("item", it)
                if x.get("@type") != "Event" or not x.get("startDate") or not x.get("url"):
                    continue
                loc = x.get("location") or {}
                a = loc.get("address") or {}
                venue = ", ".join(p for p in [loc.get("name"), a.get("addressLocality") if isinstance(a, dict) else None] if p)
                batch.append(ev(x.get("name"), parse_dt(x["startDate"]), venue, x["url"], "eventbrite", x.get("description")))
        out += batch
        if not batch or min(datetime.fromisoformat(b["start"]) for b in batch) > CUTOFF:
            break
    return out


def fetch_eventbrite():
    try:
        http("https://www.eventbrite.com/")  # sets csrftoken cookie
        out = eventbrite_api(None)
        if out:
            return out
    except Exception as e:
        print(f"eventbrite api failed ({e}); trying browse pages", file=sys.stderr)
    return eventbrite_html()


# ---------- main ----------
def main():
    try:
        old = json.load(open(OUT))["events"]
    except Exception:
        old = []
    sources = {"luma": fetch_luma, "eventbrite": fetch_eventbrite}
    fresh = {}
    for name, fn in sources.items():
        try:
            fresh[name] = fn()
        except Exception as e:
            print(f"{name} failed: {e}", file=sys.stderr)
            fresh[name] = []
        print(f"{name}: {len(fresh[name])} fetched", file=sys.stderr)
    if not any(fresh.values()):
        sys.exit("all sources returned 0 events; leaving events.json untouched")
    events = []
    for name in sources:
        events += fresh[name] or [e for e in old if e["source"] == name]
    seen, merged = set(), []
    for e in sorted(events, key=lambda e: e["start"]):
        key = e["url"].split("?")[0]
        if key in seen or not NOW - timedelta(hours=3) <= datetime.fromisoformat(e["start"]) <= CUTOFF:
            continue
        seen.add(key)
        merged.append(e)
    counts = {n: sum(e["source"] == n for e in merged) for n in sources}
    json.dump({"last_updated": NOW.isoformat(timespec="seconds"), "counts": counts, "events": merged},
              open(OUT, "w"), indent=1)
    print("counts:", counts)


main()
