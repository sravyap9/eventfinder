"""Offline contract tests: each source's real parser, run against a recorded real response (tests/fixtures/).

If one fails after a site change, run tests/record_fixtures.py <source> to capture the new shape, then fix the parser.
If one fails and you did NOT change the parser, the fixture or the shared code (ev, settle_price, ...) was changed.
"""
import gzip, json, os, sys, unittest
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import fetch as f

FIX = os.path.join(HERE, "fixtures")


def key(url, data=None):
    return url if data is None else url + "|" + json.dumps(data, sort_keys=True)


class FakeCookie:
    name, value = "csrftoken", "test"


def load(name):
    with gzip.open(os.path.join(FIX, name + ".json.gz"), "rt") as fh:
        return json.load(fh)


class Replay:
    """Patch fetch.http to answer from a recording, freeze the clock it was recorded at, and cap requests like the recorder did."""

    def __init__(self, name):
        self.name = name
        self.fix = load(name)

    def __enter__(self):
        self.saved = (f.http, f.NOW, f.CUTOFF, f.DO_DAYS, f.DETAIL_CAP, f.CPL_PAGES, f.CPD_PAGES, f.MAX_PAGES, f.LUMA_CALENDARS, f.jar, f.CITIES[0].get("ch_pages"))
        f.NOW = datetime.fromisoformat(self.fix["now"]); f.CUTOFF = f.NOW + timedelta(days=30)
        f.DO_DAYS, f.DETAIL_CAP, f.CPL_PAGES, f.CPD_PAGES, f.MAX_PAGES, f.LUMA_CALENDARS = 1, 2, 1, 1, 1, 2
        f.CITIES[0]["ch_pages"] = 1
        f.jar = [FakeCookie()]                                  # so Eventbrite takes its API path
        f.OLD.clear()
        responses = self.fix["responses"]

        def http(url, data=None, headers=None):
            k = key(url, data)
            if k not in responses:
                raise RuntimeError("no recorded response for " + k[:150] + "  (re-record: tests/record_fixtures.py " + self.name + ")")
            return responses[k]
        f.http = http
        return f.CITIES[0]

    def __exit__(self, *a):
        (f.http, f.NOW, f.CUTOFF, f.DO_DAYS, f.DETAIL_CAP, f.CPL_PAGES, f.CPD_PAGES, f.MAX_PAGES, f.LUMA_CALENDARS, f.jar, ch) = self.saved
        f.CITIES[0]["ch_pages"] = ch


def run(name, fn):
    with Replay(name) as city:
        return fn(city)


class Contract(unittest.TestCase):
    def check_basics(self, events, source, minimum):
        self.assertGreaterEqual(len(events), minimum, f"{source} returned {len(events)} events")
        for e in events:
            self.assertTrue(f.valid(e), (source, e["title"], e["url"], e["start"]))
            self.assertEqual(e["source"], source)
            self.assertEqual(e["city"], "Chicago")
            self.assertIn(e["start"][-6:], ("-05:00", "-06:00"))  # a real Chicago timestamp (daylight saving or not)
            datetime.fromisoformat(e["start"])
        urls = [e["url"] for e in events]
        self.assertEqual(len(urls), len(set(urls)), f"{source} produced duplicate urls")

    def test_luma(self):
        ev = run("luma", f.fetch_luma); self.check_basics(ev, "luma", 3)
        self.assertTrue(all(e["url"].startswith("https://lu.ma/") for e in ev))
        self.assertTrue(any(e["price_text"] or e["is_free"] is not None for e in ev))

    def test_eventbrite(self):
        ev = run("eventbrite", f.fetch_eventbrite); self.check_basics(ev, "eventbrite", 5)
        self.assertTrue(any(e["price_text"] or e["is_free"] for e in ev))

    def test_partiful(self):
        ev = run("partiful", f.fetch_partiful); self.check_basics(ev, "partiful", 5)
        self.assertTrue(all(e["url"].startswith("https://partiful.com/e/") for e in ev))
        self.assertTrue(any(e["interested_count"] is not None for e in ev))

    def test_pie(self):
        ev = run("pie", f.fetch_pie); self.check_basics(ev, "pie", 1)

    def test_do312(self):
        ev = run("do312", f.fetch_dostuff); self.check_basics(ev, "do312", 20)
        self.assertTrue(all(e["url"].startswith("https://do312.com/events/") for e in ev))
        self.assertGreater(sum(bool(e["venue"]) for e in ev), len(ev) * 0.8)
        self.assertTrue(any(e.get("detail_checked") for e in ev), "the detail pass found no price or description page")

    def test_cpl(self):
        ev = run("cpl", f.fetch_cpl); self.check_basics(ev, "cpl", 5)
        self.assertTrue(all(e["is_free"] and e["price_source"] == "b" for e in ev), "library events are always free")
        self.assertTrue(all("library" in e["venue"].lower() for e in ev))

    def test_cpd(self):
        ev = run("cpd", f.fetch_cpd); self.check_basics(ev, "cpd", 3)
        self.assertTrue(all("#" in e["url"] for e in ev), "each date gets its own link")

    def test_coursehorse(self):
        ev = run("coursehorse", f.fetch_coursehorse); self.check_basics(ev, "coursehorse", 10)
        self.assertTrue(all(e["price_text"] and e["price_text"].startswith("$") for e in ev if not e["is_free"]))
        self.assertTrue(any(e["few_left"] for e in ev) or all(e["few_left"] is not None for e in ev))

    def test_ra(self):
        ev = run("ra", f.fetch_ra); self.check_basics(ev, "ra", 10)
        self.assertTrue(all(e["url"].startswith("https://ra.co/events/") for e in ev))


class TicketmasterFixture(unittest.TestCase):
    """The key based official API. Hand written fixture, so this checks our reading of the documented shape."""

    def fetch(self):
        with open(os.path.join(FIX, "ticketmaster.json")) as fh:
            page = json.load(fh)
        empty = json.dumps({"page": {"totalPages": 0}})
        seen = []

        def http(url, data=None, headers=None):
            seen.append(url)
            return json.dumps(page) if len(seen) == 1 else empty
        old = (f.http, os.environ.get("TICKETMASTER_API_KEY"))
        f.http, os.environ["TICKETMASTER_API_KEY"] = http, "test-key"
        try:
            return f.fetch_ticketmaster(f.CITIES[0]), seen
        finally:
            f.http = old[0]
            if old[1] is None:
                os.environ.pop("TICKETMASTER_API_KEY")
            else:
                os.environ["TICKETMASTER_API_KEY"] = old[1]

    def test_parses_the_documented_shape(self):
        ev, seen = self.fetch()
        by = {e["title"]: e for e in ev}
        self.assertNotIn("Cancelled Comedy Night", by)
        bulls = by["Chicago Bulls vs. Boston Celtics"]
        self.assertEqual((bulls["price_text"], bulls["is_free"], bulls["sold_out"]), ("From $42", False, False))
        self.assertTrue(bulls["venue"].startswith("United Center"))
        self.assertTrue(by["Sold Out Rock Show"]["sold_out"])
        self.assertEqual(by["Sold Out Rock Show"]["price_text"], "$55")
        self.assertTrue(by["Open Mic Free Night"]["is_free"])
        self.assertTrue(f.is_kids(by["Disney On Ice"]), "family genre should be filtered as kids")
        self.assertTrue(all(e["source"] == "ticketmaster" for e in ev))

    def test_request_is_well_formed(self):
        _, seen = self.fetch()
        self.assertTrue(seen[0].startswith(f.TM_URL))
        for part in ("apikey=test-key", "unit=miles", "size=200", "sort=date%2Casc"):
            self.assertIn(part, seen[0])

    def test_key_never_ends_up_in_an_event(self):
        ev, _ = self.fetch()
        self.assertNotIn("test-key", json.dumps(ev))

    def test_only_runs_with_a_key(self):
        old = os.environ.pop("TICKETMASTER_API_KEY", None)
        try:
            self.assertFalse(f.SOURCES["ticketmaster"][1](f.CITIES[0]))
            os.environ["TICKETMASTER_API_KEY"] = ""
            self.assertFalse(f.SOURCES["ticketmaster"][1](f.CITIES[0]), "an empty secret counts as no key")
            os.environ["TICKETMASTER_API_KEY"] = "x"
            self.assertTrue(f.SOURCES["ticketmaster"][1](f.CITIES[0]))
        finally:
            os.environ.pop("TICKETMASTER_API_KEY", None)
            if old is not None:
                os.environ["TICKETMASTER_API_KEY"] = old


if __name__ == "__main__":
    unittest.main()
