#!/usr/bin/env python3
"""Fetch Chicago and NYC events from several public sources into events.json."""
import html as htmllib, json, math, random, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from http.cookiejar import CookieJar
from zoneinfo import ZoneInfo

CHI = ZoneInfo("America/Chicago")
CITIES = [
    {"name": "Chicago", "tz": "America/Chicago", "lat": 41.8781, "lon": -87.6298, "radius": 40,
     "luma_place": "discplace-NdGm35qFD0vaXNF", "eb_place": "85940195", "eb_slug": "il--chicago", "partiful": "chi", "pie_market": "Chicago",
     "dostuff": ("do312", "do312.com"), "ra_area": 17, "ch": "chicago", "ch_pages": 25, "cpl": True, "cpd": True},
    {"name": "NYC", "tz": "America/New_York", "lat": 40.7128, "lon": -74.0060, "radius": 25,
     "luma_place": "discplace-Izx1rQVSh8njYpP", "eb_place": "85977539", "eb_slug": "ny--new-york", "partiful": "nyc", "pie_market": "New York",
     "dostuff": ("donyc", "donyc.com"), "ra_area": 8, "ch": "nyc", "ch_pages": 40},
]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
OUT = "events.json"
NOW = datetime.now(CHI)
CUTOFF = NOW + timedelta(days=30)
MAX_PAGES = 10
FEW_LEFT = 10
DO_DAYS = 14        # Do312 / DoNYC only paginate one day at a time
CPL_PAGES = 30
CPD_PAGES = 45
LUMA_CALENDARS = 60  # host calendars followed per city
DETAIL_CAP = 60      # detail page requests per source per run

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


def clean(s):
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def ev(city, title, start, venue, url, source, desc, price=None, always_free=False, kids=None, age_text=""):
    """kids: True/False when the source's own audience or age field decides it, None to use keywords.
    The full description and age text are kept in _d / _age until main() has used them."""
    full = clean(desc)
    e = {"title": clean(title), "start": start.astimezone(ZoneInfo(city["tz"])).isoformat(timespec="minutes"),
         "venue": clean(venue), "url": url, "source": source, "city": city["name"], "description": full[:300],
         "is_free": None, "price_text": None, "original_price_text": None, "price_source": None,
         "sold_out": None, "waitlist": None, "few_left": None, "interested_count": None, "age_min": None,
         "_d": full, "_kids": kids, "_age": age_text}
    e.update(price or {})
    if always_free:
        e.update(is_free=True, price_text="Free", price_source="b")
    return e


def money(cents):
    return "$%d" % (cents // 100) if cents % 100 == 0 else "$%.2f" % (cents / 100)


def dollars(x):
    return money(round(x * 100))


# ---------- prices, kids, age ----------
FREE_RE = re.compile(r"\b(no cover|no charge|free (?:admission|entry|event|to attend|to join|of charge|rsvp)|"
                     r"(?:admission|entry|event) is free|is free to|100% free|completely free)\b", re.I)
AMT_RE = re.compile(r"\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{2})?(?!\d)(?!\s*(?:off|discount|credit|gift|prize))", re.I)
DONATION_RE = re.compile(r"\b(donations?|pay what you (?:can|wish|want))\b", re.I)


def settle_price(e, text):
    """Fill price_text / price_source: a structured, b always free (set by ev), c description, d click for $."""
    if e.get("price_source"):
        return
    if e.get("price_text"):
        e["price_source"] = "a"
    elif e.get("is_free"):
        e.update(price_text="Free", price_source="a")
    elif FREE_RE.search(text):
        e.update(is_free=True, price_text="~Free", price_source="c")
    else:
        amts = [float(m.group(1).replace(",", "") + (m.group(2) or "")) for m in AMT_RE.finditer(text)]
        amts = [x for x in amts if 0 < x < 1000]
        if amts:
            e.update(price_text="~" + dollars(min(amts)), price_source="c")
        elif DONATION_RE.search(text):
            e.update(price_text="~Donation", price_source="c")
        else:
            e.update(price_text="Click for $", price_source="d")


KIDS_RE = re.compile(r"\b(kids?|children|toddlers?|babies|baby|famil(?:y|ies)|teens?|teenagers?|tweens?|story ?time|"
                     r"homework help|grades?|ages? (?:[2-9]|1[0-7])\s*(?:-|to|through|and under)\s*\d+)\b", re.I)
AGE_RE = re.compile(r"\b(21|18)\s*\+|\b(21|18)\s*(?:and|&)\s*(?:over|up|older|above)\b|\bages? (21|18)\b|\bmust be (21|18)\b", re.I)


def is_kids(e):
    k = e.get("_kids")
    if k is not None:
        return k
    return bool(KIDS_RE.search(e["title"] + " " + e.get("_d", e["description"]) + " " + e.get("_age", "")))


def age_min(e):
    ages = [int(g) for m in AGE_RE.finditer(e["title"] + " " + e.get("_d", e["description"]) + " " + e.get("_age", ""))
            for g in m.groups() if g]
    return max(ages) if ages else None


def miles(city, lat, lon):
    p1, p2 = math.radians(city["lat"]), math.radians(lat)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon - city["lon"]) / 2) ** 2
    return 3959 * 2 * math.asin(math.sqrt(a))


def parse_dt(s, tz=CHI):
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=tz)


# ---------- Luma ----------
def luma_price(e):
    t = e.get("ticket_info")
    if not t:
        return {}
    avail = e.get("registration_availability")
    wait = avail == "waitlist" or bool(e.get("waitlist_active"))
    sold = bool(t.get("is_sold_out")) or avail == "sold-out" or wait
    out = {"is_free": t.get("is_free"), "sold_out": sold, "waitlist": wait}
    p = t.get("price") or {}
    if not t.get("is_free") and p.get("cents") is not None:
        lowest = p.get("min_cents") if p.get("is_flexible") and p.get("min_cents") is not None else p["cents"]
        top = (t.get("max_price") or {}).get("cents")
        out["price_text"] = ("From " if (top and top > lowest) or lowest != p["cents"] else "") + money(lowest)
    left = t.get("spots_remaining")
    if not sold:
        out["few_left"] = bool(t.get("is_near_capacity") or (left is not None and 0 < left <= FEW_LEFT))
    return out


def luma_event(city, e, need_coord):
    x = e.get("event") or {}
    if not x.get("start_at") or not x.get("url"):
        return None
    c = x.get("coordinate") or {}
    if c.get("latitude") is None:
        if need_coord:
            return None  # host calendars list online events too; only keep ones with a place
    elif miles(city, c["latitude"], c["longitude"]) > city["radius"]:
        return None
    g = x.get("geo_address_info") or {}
    return ev(city, x.get("name"), parse_dt(x["start_at"]), g.get("full_address") or g.get("address") or g.get("city"),
              "https://lu.ma/" + x["url"], "luma", x.get("description") or x.get("description_md"), luma_price(e))


def luma_pages(url, query, city, need_coord, seen_cals=None):
    """Page one Luma listing until its cursor runs out or it reaches events past the cutoff."""
    out, cursor = [], None
    for _ in range(MAX_PAGES):
        q = dict(query, pagination_limit=50)
        if cursor:
            q["pagination_cursor"] = cursor
        d = json.loads(http(url + "?" + urllib.parse.urlencode(q)))
        starts = []
        for e in d.get("entries", []):
            if seen_cals is not None and (e.get("calendar") or {}).get("api_id"):
                seen_cals.add(e["calendar"]["api_id"])
            if e.get("event", {}).get("start_at"):
                starts.append(parse_dt(e["event"]["start_at"]))
            x = luma_event(city, e, need_coord)
            if x:
                out.append(x)
        if not d.get("has_more") or not d.get("next_cursor") or (starts and min(starts) > CUTOFF):
            break
        cursor = d["next_cursor"]
    return out


def fetch_luma(city):
    """The discover feed for the city, plus every upcoming event on the host calendars seen in it
    (api.lu.ma/calendar/get-items), merged by url."""
    cals = set()
    out = luma_pages("https://api.lu.ma/discover/get-paginated-events", {"discover_place_api_id": city["luma_place"]},
                     city, False, cals)
    seen, fails = {e["url"] for e in out}, 0
    for cal in sorted(cals)[:LUMA_CALENDARS]:
        try:
            more = luma_pages("https://api.lu.ma/calendar/get-items", {"calendar_api_id": cal, "period": "future"}, city, True)
        except Exception as e:
            fails += 1
            print(f"luma calendar {cal} failed: {e}", file=sys.stderr)
            if fails >= 3:
                break
            continue
        out += [e for e in more if e["url"] not in seen and not seen.add(e["url"])]
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
    partiful_details(out)
    return out


PF_FIELDS = ("is_free", "price_text", "price_source", "sold_out", "few_left", "detail_checked")


def partiful_detail(url):
    """Ticketing and capacity live only on the event page (__NEXT_DATA__ props.pageProps.event)."""
    html = http(url)
    x = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S).group(1))["props"]["pageProps"]["event"]
    out = {"detail_checked": True, "sold_out": bool(x.get("atCapacity"))}
    t = x.get("ticketing")
    if t and t.get("price") is not None:
        out.update(is_free=t["price"] == 0, price_text="Free" if t["price"] == 0 else dollars(t["price"]), price_source="a")
    elif t:  # Stripe tickets: the amount is not in the page data
        out.update(is_free=False, price_text="Paid \u00b7 click for $", price_source="d")
    left = x.get("remainingCapacity")
    if not out["sold_out"] and left is not None:
        out["few_left"] = 0 < left <= FEW_LEFT
    return out


def partiful_details(events):
    """At most DETAIL_CAP page requests per run: events never checked first (soonest first), then the
    oldest checks. Everything else reuses what the previous events.json already knew."""
    for e in events:
        old = OLD.get(e["url"], {})
        if old.get("detail_checked"):
            e.update({k: old[k] for k in PF_FIELDS if k in old})
    todo = sorted(events, key=lambda e: (bool(e.get("detail_checked")), e["start"]))[:DETAIL_CAP]
    fails = 0
    for e in todo:
        try:
            e.update(partiful_detail(e["url"]))
        except Exception as ex:
            fails += 1
            print(f"partiful detail {e['url']} failed: {ex}", file=sys.stderr)
            if fails >= 3:
                break


# ---------- Pie ----------
PIE_API = "https://plans-service.getpie.app/api/public/"
OLD = {}  # url -> event from the previous events.json


def pie_price(d):
    price = d.get("priceString") or None
    free = price is not None and price.upper() == "FREE"
    return {"is_free": True if free else None, "price_text": None if free else price,
            "sold_out": (d.get("analytics") or {}).get("metadata", {}).get("at_capacity")}


def fetch_pie(city):
    """The public list only has a date; the exact start time, description and price come from the
    per-plan details call, so plans already in the previous events.json are reused, not re-requested."""
    plans = json.loads(http(PIE_API + "v1/plans?" + urllib.parse.urlencode({"limit": 100, "market": city["pie_market"]})))
    out, fails = [], 0
    for p in plans:
        url = "https://getpie.app/plans/" + p["planId"]
        if OLD.get(url, {}).get("source") == "pie":
            out.append(OLD[url])
            continue
        if fails >= 3:
            break
        try:
            d = json.loads(http(PIE_API + "v2/plans/details/" + p["planId"]))
        except Exception as e:
            fails += 1
            print(f"pie details {p['planId']} failed: {e}", file=sys.stderr)
            continue
        if d.get("isCanceled") or not d.get("startAt"):
            continue
        out.append(ev(city, d.get("planTitle") or p["title"], parse_dt(d["startAt"]), d.get("venue") or p.get("venue") or city["name"],
                      url, "pie", d.get("description"),
                      pie_price(d)))
    return out


# ---------- Do312 / DoNYC ----------
def dostuff_price(x):
    ti = x.get("ticket_info") or ""
    amts = [float(a) for a in re.findall(r"\$(\d+(?:\.\d+)?)", ti)]
    if amts and max(amts) == 0 or not amts and (re.search(r"\bfree\b", ti, re.I) or x.get("is_free")):
        return {"is_free": True}
    if amts:
        return {"is_free": False, "price_text": ("From " if max(amts) > min(amts) else "") + dollars(min(amts))}
    return {}


def fetch_dostuff(city):
    """The sites' own JSON feeds, one day at a time (the only way they page): /events/Y/M/D.json?page=N."""
    source, host = city["dostuff"]
    out, seen, fails = [], set(), 0
    for i in range(DO_DAYS):
        day = (NOW + timedelta(days=i)).date()
        for page in range(1, 16):
            try:
                d = json.loads(http(f"https://{host}/events/{day.year}/{day.month}/{day.day}.json?page={page}"))
            except Exception as e:
                fails += 1
                print(f"{host} {day} p{page} failed: {e}", file=sys.stderr)
                if fails >= 3:
                    return out
                break
            for x in d.get("events", []):
                k = (x["permalink"], x["begin_time"])
                if k in seen:
                    continue
                seen.add(k)
                v = x.get("venue") or {}
                p = dostuff_price(x)
                p["sold_out"] = bool(x.get("sold_out"))
                out.append(ev(city, x["title"], parse_dt(x["begin_time"]), ", ".join(s for s in [v.get("title"), v.get("full_address")] if s),
                              f"https://{host}{x['permalink']}", source, x.get("description") or x.get("excerpt"), p,
                              age_text=(x.get("ticket_info") or "") + " " + (x.get("category") or "")))
            if page >= d.get("paging", {}).get("total_pages", page):
                break
    return out


# ---------- Chicago Public Library (BiblioCommons gateway) ----------
def fetch_cpl(city):
    out, cancelled = [], 0
    for page in range(1, CPL_PAGES + 1):
        q = {"locale": "en-US", "startDate": NOW.date().isoformat(), "endDate": CUTOFF.date().isoformat(), "limit": 50, "page": page}
        d = json.loads(http("https://gateway.bibliocommons.com/v2/libraries/chipublib/events?" + urllib.parse.urlencode(q)))
        ents = d.get("entities", {})
        for id_ in d["events"]["items"]:
            x = ents["events"][id_]
            df = x["definition"]
            if df.get("isCancelled"):
                cancelled += 1
                continue
            names = [ents["eventAudiences"][a]["name"] for a in df.get("audienceIds", []) if a in ents.get("eventAudiences", {})]
            kids = None if not names else not any(n.startswith(("Adults", "Seniors")) for n in names)
            loc = (ents.get("locations", {}).get(df.get("branchLocationId")) or {}).get("name") or "Chicago Public Library"
            venue = loc if "library" in loc.lower() else loc + " Library"
            e = ev(city, df["title"], parse_dt(df["start"]), venue, "https://chipublib.bibliocommons.com/events/" + id_,
                   "cpl", df.get("description"), {"sold_out": bool(x.get("isFull"))}, always_free=True, kids=kids)
            out.append(e)
        if page >= d["events"]["pagination"]["pages"]:
            break
    print(f"cpl: {cancelled} cancelled events skipped", file=sys.stderr)
    return out


# ---------- Chicago Park District (list pages only) ----------
MONTHS = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def nearest_date(mon, day, tz):
    """The list pages show no year: pick the one that puts the date nearest to (not long before) today."""
    today = datetime.now(tz).date()
    d = datetime(today.year, mon, day).date()
    return d.replace(year=d.year + 1) if (today - d).days > 60 else d


def clock(s):
    m = re.search(r"(\d{1,2}):(\d{2})\s*(AM|PM)", s, re.I)
    return (int(m.group(1)) % 12 + (12 if m.group(3).upper() == "PM" else 0), int(m.group(2))) if m else None


def fetch_cpd(city):
    tz = ZoneInfo(city["tz"])
    out, fails = [], 0
    for page in range(CPD_PAGES):
        try:
            html = http(f"https://www.chicagoparkdistrict.com/events?page={page}")
        except Exception as e:
            fails += 1
            print(f"cpd page {page} failed: {e}", file=sys.stderr)
            if fails >= 3:
                break
            continue
        rows = html.split('<div class="views-row">')[1:]
        if not rows:
            break
        for r in rows:
            t = re.search(r'event--title">\s*<a href="([^"]+)"[^>]*>(.*?)</a>', r, re.S)
            dt = re.search(r'class="event--date[^"]*">(.*?)</div>', r, re.S)
            du = re.search(r'class="[^"]*event--duration[^"]*">(.*?)</div>', r, re.S)
            loc = re.search(r'event--location">.*?<a[^>]*>(.*?)</a>', r, re.S)
            if not (t and dt and du):
                continue
            m = re.match(r"\s*([A-Za-z]{3})\s*(?:</br>|<br\s*/?>)\s*(\d{1,2})\s*$", dt.group(1))
            hm = clock(re.sub(r"<[^>]+>", " ", du.group(1)))
            if not (m and hm):
                continue  # multi-day runs ("Apr 25 - Oct 31") and events without a start time
            d = nearest_date(MONTHS[m.group(1).lower()], int(m.group(2)), tz)
            title = clean(t.group(2))
            place = title.rsplit(" at ", 1)[1] if " at " in title else ""
            venue = ", ".join(p for p in [place, clean(loc.group(1)) if loc else ""] if p)
            out.append(ev(city, title, datetime(d.year, d.month, d.day, hm[0], hm[1], tzinfo=tz), venue or "Chicago Park District",
                          "https://www.chicagoparkdistrict.com" + t.group(1) + "#" + d.isoformat(), "cpd", ""))
    return out


# ---------- CourseHorse ----------
def meridiem_time(s, mer_default=None):
    m = re.match(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", s.strip(), re.I)
    return int(m.group(1)), int(m.group(2) or 0), (m.group(3) or mer_default or "").lower()


def ch_start(span):
    """'10:30am–12:30pm CT' or '6:30–9:30pm CT' -> (hour, minute) of the start."""
    a, _, b = span.replace("\u2013", "-").partition("-")
    eh, em, emer = meridiem_time(b.split()[0] if b.split() else b)
    sh, sm, smer = meridiem_time(a, emer)
    h24 = lambda h, mer: h % 12 + (12 if mer == "pm" else 0)
    h = h24(sh, smer)
    if not re.search(r"am|pm", a, re.I) and (h, sm) > (h24(eh, emer), em):
        h = h24(sh, "am")  # '11:30-1:30pm' starts in the morning
    return h, sm


def ch_kids(age):
    m = re.search(r"(\d+) and older", age)
    if m and int(m.group(1)) <= 15:
        return True
    m = re.search(r"Ages? (\d+)(?:\s*-\s*(\d+))?", age)
    return True if m and int(m.group(2) or m.group(1)) <= 17 else None


def fetch_coursehorse(city):
    """Browse listing pages /<city>/classes?page=N. Each class card carries its upcoming sessions with
    date, time, price and seats left. Only listing pages are requested; /schedule paths and
    ?schedule= links (disallowed in robots.txt) are never fetched."""
    tz = ZoneInfo(city["tz"])
    out, fails = [], 0
    for page in range(1, city["ch_pages"] + 1):
        try:
            html = http(f"https://coursehorse.com/{city['ch']}/classes?page={page}")
        except Exception as e:
            fails += 1
            print(f"coursehorse page {page} failed: {e}", file=sys.stderr)
            if fails >= 3:
                break
            continue
        cards = html.split('data-discovery-id="course:')[1:]
        found = 0
        for c in cards:
            t = re.search(r'data-js="go-to-course">\s*<span>\s*(.*?)\s*</span>', c, re.S)
            path = re.search(r'data-discovery-destination="([^"]+)"', c)
            if not (t and path):
                continue
            school = re.search(r'class="school"[^>]*>\s*(.*?)\s*</a>', c, re.S)
            addr = re.search(r"</span>\s*@ <span>\s*(.*?)\s*</span>", c, re.S)
            desc = re.search(r'class="truncated-description">(.*?)</p>', c, re.S)
            info = re.search(r'course-key-info-on-listing">(.*?)</div>', c, re.S)
            age = clean(" ".join(re.findall(r"<span>([^<]*(?:and older|Ages?[^<]*))</span>", info.group(1)))) if info else ""
            venue = ", ".join(clean(p.group(1)) for p in (school, addr) if p)
            for s in re.finditer(r'course-date-card js-track-action-click[^>]*data-section-id="(\d+)".*?section-date">([A-Za-z]{3})[a-z]* (\d+)[a-z]*</p>\s*<p>([^<]+)</p>'
                                 r'.*?section-price">\s*([^<]*?)\s*</div>\s*<div>\s*([^<]*?)\s*</div>', c, re.S):
                sid, mon, day, span, price, seats = s.groups()
                found += 1
                d = nearest_date(MONTHS[mon.lower()], int(day), tz)
                h, mi = ch_start(span)
                n = re.search(r"(\d+) Seats? Left", seats)
                p = {"sold_out": bool(re.search(r"sold out|full|waitlist", seats, re.I)) or None,
                     "few_left": bool(n and int(n.group(1)) <= FEW_LEFT)}
                if re.fullmatch(r"\$[\d.,]+", price):
                    p.update(is_free=float(price[1:].replace(",", "")) == 0, price_text=price)
                out.append(ev(city, t.group(1), datetime(d.year, d.month, d.day, h, mi, tzinfo=tz), venue,
                              "https://coursehorse.com" + path.group(1) + "#" + sid, "coursehorse", desc.group(1) if desc else "", p,
                              kids=ch_kids(age), age_text=age))
        if not cards or not found and page > 1:
            break
    return out


# ---------- Resident Advisor (GraphQL) ----------
RA_QUERY = """query($f: FilterInputDtoInput, $page: Int, $size: Int){ eventListings(filters:$f, pageSize:$size, page:$page,
sort:{listingDate:{priority:1, order:ASCENDING}}){ totalResults data{ event{ id title startTime cost isTicketed minimumAge
content contentUrl venue{ name address } } } } }"""


def ra_price(cost):
    c = (cost or "").strip()
    if not c:
        return {}
    if re.fullmatch(r"\$?0+(\.0+)?", c) or re.fullmatch(r"free", c, re.I):
        return {"is_free": True}
    if re.fullmatch(r"[\d$.,\s\-+\u2013/]+", c):  # plain numbers only; "Free before 11" etc. is left to the description
        nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", c)]
        if nums:
            return {"is_free": False, "price_text": ("From " if len(nums) > 1 or "+" in c else "") + dollars(min(nums))}
    return {}


def fetch_ra(city):
    out, seen = [], set()
    flt = {"areas": {"eq": city["ra_area"]}, "listingDate": {"gte": NOW.date().isoformat() + "T00:00:00.000Z",
                                                            "lte": CUTOFF.date().isoformat() + "T23:59:59.000Z"}}
    for page in range(1, 16):
        d = json.loads(http("https://ra.co/graphql", {"query": RA_QUERY, "variables": {"f": flt, "page": page, "size": 100}},
                            {"Referer": "https://ra.co/events"}))
        if "errors" in d:
            raise RuntimeError(d["errors"][0]["message"])
        L = d["data"]["eventListings"]
        for it in L["data"]:
            x = it["event"]
            if x["id"] in seen or not x.get("startTime"):
                continue
            seen.add(x["id"])
            v = x.get("venue") or {}
            out.append(ev(city, x["title"], parse_dt(x["startTime"], ZoneInfo(city["tz"])), ", ".join(p for p in [v.get("name"), v.get("address")] if p),
                          "https://ra.co" + x["contentUrl"], "ra", x.get("content"), ra_price(x.get("cost")),
                          age_text=f"{x['minimumAge']}+" if x.get("minimumAge") else ""))
        if page * 100 >= L["totalResults"] or not L["data"]:
            break
    return out


# ---------- main ----------
SOURCES = {  # name -> (fetch function, applies to city); order is also the tie-break when merging duplicates
    "luma": (fetch_luma, lambda c: True),
    "eventbrite": (fetch_eventbrite, lambda c: True),
    "partiful": (fetch_partiful, lambda c: True),
    "pie": (fetch_pie, lambda c: True),
    "do312": (fetch_dostuff, lambda c: c["dostuff"][0] == "do312"),
    "donyc": (fetch_dostuff, lambda c: c["dostuff"][0] == "donyc"),
    "cpl": (fetch_cpl, lambda c: c.get("cpl")),
    "cpd": (fetch_cpd, lambda c: c.get("cpd")),
    "coursehorse": (fetch_coursehorse, lambda c: True),
    "ra": (fetch_ra, lambda c: True),
}
RANK = {"a": 0, "b": 1, "c": 2, "d": 3}


def norm_title(t):
    return re.sub(r"^the ", "", re.sub(r"[^a-z0-9]+", " ", t.lower()).strip())


def main():
    try:
        old = json.load(open(OUT))["events"]
    except Exception:
        old = []
    OLD.update({e["url"]: e for e in old})
    events, any_fresh = [], False
    for city in CITIES:
        for name, (fn, applies) in SOURCES.items():
            if not applies(city):
                continue
            try:
                got = fn(city)
            except Exception as e:
                print(f"{city['name']} {name} failed: {e}", file=sys.stderr)
                got = []
            prev = [e for e in old if e["source"] == name and e.get("city", "Chicago") == city["name"]]
            print(f"{city['name']} / {name}: {len(got)} fetched", file=sys.stderr)
            any_fresh |= bool(got)
            # a failed or suspiciously small fetch keeps this city+source's previous events
            if not got or (len(prev) >= 20 and len(got) < len(prev) * 0.25):
                if got:
                    print(f"{city['name']} / {name}: only {len(got)} vs {len(prev)} before, keeping previous", file=sys.stderr)
                got = prev
            events += got
    if not any_fresh:
        sys.exit("all sources returned 0 events; leaving events.json untouched")

    # adults only, then prices and age pills, using the full text the sources gave us
    dropped, kept = {}, []
    for e in events:
        if is_kids(e):
            k = (e["city"], e["source"])
            dropped[k] = dropped.get(k, 0) + 1
            continue
        text = e.get("_d", e["description"])
        e["age_min"] = e.get("age_min") or age_min(e)
        settle_price(e, text)
        for k in ("_d", "_kids", "_age"):
            e.pop(k, None)
        kept.append(e)

    # one event listed on several sites: same normalized title and start. Keep the best price (earliest step).
    order = list(SOURCES)
    best = {}
    for e in sorted(kept, key=lambda e: (RANK.get(e["price_source"], 9), order.index(e["source"]))):
        if not NOW - timedelta(hours=3) <= datetime.fromisoformat(e["start"]) <= CUTOFF:
            continue
        keys = [(e["city"], norm_title(e["title"]), e["start"]), ("url", e["url"].split("?")[0])]
        if not any(k in best for k in keys):
            best.update({k: e for k in keys})
    merged = sorted({id(e): e for e in best.values()}.values(), key=lambda e: e["start"])

    cities = {c["name"]: c for c in CITIES}
    counts = {n: {s: sum(e["source"] == s and e["city"] == n for e in merged) for s, (_, ap) in SOURCES.items() if ap(c)}
              for n, c in cities.items()}
    drops = {n: {s: dropped.get((n, s), 0) for s in counts[n]} for n in cities}
    steps = {n: {s: {k: sum(e["source"] == s and e["city"] == n and e["price_source"] == k for e in merged) for k in "abcd"}
                 for s in counts[n]} for n in cities}
    json.dump({"last_updated": NOW.isoformat(timespec="seconds"), "counts": counts, "kids_dropped": drops, "price_steps": steps,
               "events": merged}, open(OUT, "w"), indent=1)
    print("counts:", json.dumps(counts))
    print("kids dropped:", json.dumps(drops))
    print("price steps:", json.dumps(steps))


if __name__ == "__main__":
    main()
