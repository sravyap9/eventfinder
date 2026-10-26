#!/usr/bin/env python3
"""Fetch Chicago-area events from Luma and Eventbrite into events.json."""
import json, math, random, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from http.cookiejar import CookieJar
from zoneinfo import ZoneInfo

CHI = ZoneInfo("America/Chicago")
CITIES = [
    {"name": "Chicago", "tz": "America/Chicago", "lat": 41.8781, "lon": -87.6298, "radius": 40,
     "luma_place": "discplace-NdGm35qFD0vaXNF", "eb_place": "85940195", "eb_slug": "il--chicago", "partiful": "chi"},
    {"name": "NYC", "tz": "America/New_York", "lat": 40.7128, "lon": -74.0060, "radius": 25,
     "luma_place": "discplace-Izx1rQVSh8njYpP", "eb_place": "85977539", "eb_slug": "ny--new-york", "partiful": "nyc"},
]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
OUT = "events.json"
NOW = datetime.now(CHI)
CUTOFF = NOW + timedelta(days=30)
MAX_PAGES = 10
FEW_LEFT = 10

jar = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def http(url, data=None, headers=None):
    h = {"User-Agent": UA, "Accept": "application/json, text/html, */*"}
    h.update(headers or {})
    body = json.dumps(data).encode() if data is not None else None
    if body:
        h["Content-Type"] = "application/json"
    time.sleep(random.uniform(1, 3))
    with opener.open(urllib.request.Request(url, body, h), timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def ev(city, title, start, venue, url, source, desc, price=None):
    e = {"title": (title or "").strip(), "start": start.astimezone(ZoneInfo(city["tz"])).isoformat(timespec="minutes"),
         "venue": (venue or "").strip(), "url": url, "source": source, "city": city["name"],
         "description": re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", desc or "")).strip()[:300],
         "is_free": None, "price_text": None, "original_price_text": None, "sold_out": None, "few_left": None,
         "interested_count": None}
    e.update(price or {})
    return e


def money(cents):
    return "$%d" % (cents // 100) if cents % 100 == 0 else "$%.2f" % (cents / 100)


def miles(city, lat, lon):
    p1, p2 = math.radians(city["lat"]), math.radians(lat)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon - city["lon"]) / 2) ** 2
    return 3959 * 2 * math.asin(math.sqrt(a))


def parse_dt(s, tz=CHI):
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=tz)


# ---------- Luma ----------
def luma_price(t):
    if not t:
        return {}
    out = {"is_free": t.get("is_free"), "sold_out": t.get("is_sold_out")}
    p = t.get("price") or {}
    if not t.get("is_free") and p.get("cents") is not None:
        lowest = p.get("min_cents") if p.get("is_flexible") and p.get("min_cents") is not None else p["cents"]
        top = (t.get("max_price") or {}).get("cents")
        out["price_text"] = ("From " if (top and top > lowest) or lowest != p["cents"] else "") + money(lowest)
    left = t.get("spots_remaining")
    if not t.get("is_sold_out"):
        out["few_left"] = bool(t.get("is_near_capacity") or (left is not None and 0 < left <= FEW_LEFT))
    return out


def fetch_luma(city):
    out, cursor = [], None
    for _ in range(MAX_PAGES):
        q = {"discover_place_api_id": city["luma_place"], "pagination_limit": 50}
        if cursor:
            q["pagination_cursor"] = cursor
        d = json.loads(http("https://api.lu.ma/discover/get-paginated-events?" + urllib.parse.urlencode(q)))
        starts = []
        for e in d.get("entries", []):
            x = e.get("event") or {}
            if not x.get("start_at") or not x.get("url"):
                continue
            start = parse_dt(x["start_at"])
            starts.append(start)
            c = x.get("coordinate") or {}
            if c.get("latitude") is not None and miles(city, c["latitude"], c["longitude"]) > city["radius"]:
                continue
            g = x.get("geo_address_info") or {}
            out.append(ev(city, x.get("name"), start, g.get("full_address") or g.get("address") or g.get("city"),
                          "https://lu.ma/" + x["url"], "luma", x.get("description") or x.get("description_md"),
                          luma_price(e.get("ticket_info"))))
        if not d.get("has_more") or not d.get("next_cursor") or (starts and min(starts) > CUTOFF):
            break
        cursor = d["next_cursor"]
    return out


# ---------- Eventbrite ----------
def eb_price(ta):
    if not ta:
        return {}
    out = {"is_free": ta.get("is_free"), "sold_out": ta.get("is_sold_out")}
    lo, hi = (ta.get("minimum_ticket_price") or {}), (ta.get("maximum_ticket_price") or {})
    if lo.get("value") == 0 and hi.get("value", 0) == 0:
        out["is_free"] = True  # the API's is_free flag is False for some $0 events
    if not out["is_free"] and lo.get("value") is not None:
        cur = lo.get("currency", "USD")
        pre = "$" if cur == "USD" else cur + " "
        a, b = lo["value"], hi.get("value", lo["value"])
        m = lambda c: pre + money(c)[1:]
        out["price_text"] = f"Free to {m(b)}" if a == 0 and b > 0 else (f"From {m(a)}" if b > a else m(a))
    return out


def eb_from_api(city, x):
    start = parse_dt(f"{x['start_date']}T{x.get('start_time') or '00:00'}", ZoneInfo(x.get("timezone") or city["tz"]))
    v = x.get("primary_venue") or {}
    addr = v.get("address") or {}
    venue = ", ".join(p for p in [v.get("name"), addr.get("localized_address_display") if isinstance(addr, dict) else None] if p)
    return ev(city, x.get("name"), start, venue, x.get("url"), "eventbrite", x.get("summary"),
              eb_price(x.get("ticket_availability")))


def eventbrite_api(city):
    token = next((c.value for c in jar if c.name == "csrftoken"), None)
    if not token:
        raise RuntimeError("no csrftoken")
    out = []
    for page in range(1, MAX_PAGES + 1):
        body = {"browse_surface": "search", "event_search": {"dates": ["current_future"], "places": [city["eb_place"]],
                "page": page, "page_size": 20, "dedup": True},
                "expand.destination_event": ["primary_venue", "ticket_availability"]}
        h = {"X-CSRFToken": token, "X-Requested-With": "XMLHttpRequest", "Referer": "https://www.eventbrite.com/"}
        res = json.loads(http("https://www.eventbrite.com/api/v3/destination/search/", body, h))["events"]
        batch = [eb_from_api(city, x) for x in res.get("results", []) if x.get("start_date") and x.get("url")]
        out += batch
        if not batch or page >= res.get("pagination", {}).get("page_count", page) or \
                min(datetime.fromisoformat(b["start"]) for b in batch) > CUTOFF:
            break
    return out


def eventbrite_html(city):
    out = []
    for page in range(1, MAX_PAGES + 1):
        html = http(f"https://www.eventbrite.com/d/{city['eb_slug']}/events/?page={page}")
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
                batch.append(ev(city, x.get("name"), parse_dt(x["startDate"], ZoneInfo(city["tz"])), venue, x["url"],
                                "eventbrite", x.get("description")))
        out += batch
        if not batch or min(datetime.fromisoformat(b["start"]) for b in batch) > CUTOFF:
            break
    return out


def fetch_eventbrite(city):
    try:
        if not any(c.name == "csrftoken" for c in jar):
            http("https://www.eventbrite.com/")  # sets csrftoken cookie
        out = eventbrite_api(city)
        if out:
            return out
    except Exception as e:
        print(f"eventbrite api failed for {city['name']} ({e}); trying browse pages", file=sys.stderr)
    return eventbrite_html(city)


# ---------- Partiful ----------
def partiful_events(o):
    """Collect every event dict (has id, title, startDate) from the page's embedded JSON."""
    if isinstance(o, dict):
        if o.get("startDate") and o.get("title") and o.get("id"):
            yield o
        else:
            for v in o.values():
                yield from partiful_events(v)
    elif isinstance(o, list):
        for v in o:
            yield from partiful_events(v)


def fetch_partiful(city):
    out, seen = [], set()
    for path in (f"explore/{city['partiful']}", f"explore/l/{city['partiful']}/events"):
        try:
            html = http(f"https://partiful.com/{path}")
            data = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S).group(1))
        except Exception as e:
            print(f"partiful {path} failed: {e}", file=sys.stderr)
            continue
        for x in partiful_events(data["props"]["pageProps"]):
            if x["id"] in seen or x.get("status", "PUBLISHED") != "PUBLISHED":
                continue
            seen.add(x["id"])
            e = ev(city, x["title"], parse_dt(x["startDate"]), ((x.get("locationInfo") or {}).get("mapsInfo") or {}).get("name") or city["name"],
                   "https://partiful.com/e/" + x["id"], "partiful", x.get("description"))
            e["interested_count"] = x.get("interestedGuestCount")
            out.append(e)
    return out


# ---------- main ----------
def main():
    try:
        old = json.load(open(OUT))["events"]
    except Exception:
        old = []
    sources = {"luma": fetch_luma, "eventbrite": fetch_eventbrite, "partiful": fetch_partiful}
    events, any_fresh = [], False
    for city in CITIES:
        for name, fn in sources.items():
            try:
                got = fn(city)
            except Exception as e:
                print(f"{city['name']} {name} failed: {e}", file=sys.stderr)
                got = []
            print(f"{city['name']} / {name}: {len(got)} fetched", file=sys.stderr)
            any_fresh |= bool(got)
            # keep this city+source's previous events if it came back empty
            events += got or [e for e in old if e["source"] == name and e.get("city", "Chicago") == city["name"]]
    if not any_fresh:
        sys.exit("all sources returned 0 events; leaving events.json untouched")
    seen, merged = set(), []
    for e in sorted(events, key=lambda e: e["start"]):
        key = e["url"].split("?")[0]
        if key in seen or not NOW - timedelta(hours=3) <= datetime.fromisoformat(e["start"]) <= CUTOFF:
            continue
        seen.add(key)
        merged.append(e)
    counts = {c["name"]: {n: sum(e["source"] == n and e["city"] == c["name"] for e in merged) for n in sources} for c in CITIES}
    json.dump({"last_updated": NOW.isoformat(timespec="seconds"), "counts": counts, "events": merged},
              open(OUT, "w"), indent=1)
    print("counts:", json.dumps(counts))


main()
