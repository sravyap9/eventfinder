"""What happens when a source (or someone who has taken one over) feeds the fetcher hostile data."""
import io, json, os, sys, unittest, urllib.error
from datetime import timedelta
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import fetch as f

CITY = f.CITIES[0]


def make(url="https://do312.com/events/x", source="do312", title="Show", desc="", venue="V"):
    return f.ev(CITY, title, f.NOW + timedelta(days=1), venue, url, source, desc)


class Links(unittest.TestCase):
    def test_dangerous_or_foreign_links_are_rejected(self):
        for bad in ("javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x",
                    "//evil.test/x", "/relative/path", "https://evil.test/", "https://do312.com.evil.test/x",
                    "https://do312.com@evil.test/x", "https://user:pw@do312.com/x", "https://do312.com/a b", "https://do312.com/x\ny",
                    "ftp://do312.com/x", "", None, "https://do312.com/" + "a" * 600):
            self.assertEqual(make(url=bad)["url"], "", repr(bad))
            self.assertFalse(f.valid(make(url=bad)), repr(bad))

    def test_real_links_are_kept(self):
        for ok in ("https://do312.com/events/2026/11/4/show-tickets", "https://www.do312.com/events/x", "http://do312.com/x"):
            self.assertEqual(make(url=ok)["url"], ok)

    def test_eventbrite_country_domains_are_allowed_but_lookalikes_are_not(self):
        for ok in ("https://www.eventbrite.com/e/x-1", "https://www.eventbrite.co.uk/e/x-1", "https://www.eventbrite.ca/e/x-1"):
            self.assertEqual(make(url=ok, source="eventbrite")["url"], ok)
        for bad in ("https://eventbrite.ru/e/x", "https://eventbrite.com.evil.test/e/x", "https://www.eventbrite.xx.yy/e/x", "https://noteventbrite.com/e/x"):
            self.assertEqual(make(url=bad, source="eventbrite")["url"], "", bad)

    def test_every_real_url_in_the_current_data_passes(self):
        """Guards against an allowlist that quietly drops real events (this caught the Eventbrite country domains)."""
        path = os.path.join(HERE, "..", "events.json")
        with open(path) as fh:
            events = json.load(fh)["events"]
        bad = [(e["source"], e["url"]) for e in events if f.safe_url(e["url"], e["source"]) != e["url"]]
        self.assertEqual(bad, [], bad[:3])

    def test_each_source_only_links_to_its_own_site(self):
        self.assertEqual(make(url="https://ra.co/events/1", source="ra")["url"], "https://ra.co/events/1")
        self.assertEqual(make(url="https://do312.com/x", source="ra")["url"], "")
        self.assertEqual(make(url="https://lu.ma/abc", source="luma")["url"], "https://lu.ma/abc")
        self.assertEqual(make(url="https://x.test/a", source="unlisted")["url"], "https://x.test/a")   # unknown source: scheme check only

    def test_ids_from_scraped_data_must_look_like_ids(self):
        for bad in ("../../admin", "a b", "x@evil.test", "ab", "a/b", "?x=1", ""):
            self.assertIsNone(f.ID_RE.fullmatch(bad), bad)
        self.assertIsNotNone(f.ID_RE.fullmatch("bd2e648a-b5b3-4901-8652-254a3d619733"))


class Text(unittest.TestCase):
    def test_markup_is_stripped_to_text(self):
        e = make(title='<img src=x onerror=alert(1)>Jazz <b>Night</b>', desc='<script>alert(1)</script>Hello')
        self.assertNotIn("<", e["title"] + e["description"])
        self.assertEqual(e["title"], "Jazz Night")

    def test_encoded_markup_is_decoded_here_so_the_page_must_still_escape(self):
        # &lt;script&gt; decodes to a literal "<script>" string: harmless as text, dangerous only if a page used innerHTML unescaped.
        self.assertEqual(make(title="&lt;script&gt;x&lt;/script&gt;")["title"], "<script>x</script>")

    def test_oversized_and_control_characters(self):
        e = make(title="T" * 5000 + "\x00\x07\x1b[31m", venue="V" * 5000, desc="d" * 100000)
        self.assertLessEqual(len(e["title"]), 200)
        self.assertLessEqual(len(e["venue"]), 200)
        self.assertLessEqual(len(e["description"]), 300)
        self.assertLessEqual(len(e["_d"]), 5000)
        self.assertNotRegex(make(title="a\x00b\x07c\x1bd")["title"], r"[\x00-\x08\x1b]")

    def test_emails_and_phone_numbers_are_not_published(self):
        e = make(desc="Questions? Email jane.doe+events@gmail.com or call (312) 555-0187, or 773-555-0100, +1 312.555.0199.")
        for secret in ("jane.doe", "555-0187", "555-0100", "555.0199"):
            self.assertNotIn(secret, e["description"])
        self.assertIn("[email]", e["description"]); self.assertIn("[phone]", e["description"])
        self.assertIn("jane.doe", e["_d"])    # the in memory text used for price and age detection is untouched

    def test_normal_text_and_prices_survive(self):
        self.assertEqual(make(desc="Doors at 7:30. Tickets $15-20. Ages 21+")["description"], "Doors at 7:30. Tickets $15-20. Ages 21+")


class Requests(unittest.TestCase):
    def test_only_https_is_fetched(self):
        for u in ("http://do312.com/", "file:///etc/passwd", "ftp://x.test/", "//x.test/", "javascript:1"):
            with self.assertRaises(ValueError):
                f.http(u)

    def test_oversized_responses_are_refused(self):
        class Big(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): return False
        with mock.patch.object(f.time, "sleep"), mock.patch.object(f.opener, "open", return_value=Big(b"x" * (f.MAX_BYTES + 10))):
            with self.assertRaises(ValueError):
                f.http("https://do312.com/")

    def test_redirect_to_plain_http_is_refused(self):
        h = f.HttpsOnly()
        req = mock.Mock(full_url="https://do312.com/")
        with self.assertRaises(urllib.error.URLError):
            h.redirect_request(req, None, 302, "Found", {}, "http://do312.com/downgrade")

    def test_a_hostile_permalink_never_causes_a_request_to_another_host(self):
        """The old URL building was f"https://{host}{permalink}": a permalink of "@evil.test/x" would change the host."""
        seen = []
        good = {"title": "Good", "permalink": "/events/2026/11/4/good", "tz_adjusted_begin_time": (f.NOW + timedelta(days=1)).isoformat(), "venue": {}}
        evil = [dict(good, title=t, permalink=p) for t, p in (("Evil1", "@evil.test/x"), ("Evil2", ".evil.test/x"), ("Evil3", "//evil.test/x"))]
        page = {"browse": {"data": [{"events": evil + [good]}], "_meta": {"has_next": False}}}

        def fake_nodes(url):
            seen.append(url)
            yield page
        with mock.patch.object(f, "sveltekit_nodes", fake_nodes), mock.patch.object(f, "dostuff_details", lambda e, h: None), \
                mock.patch.object(f, "DO_DAYS", 1):
            out = f.fetch_dostuff(CITY)
        self.assertEqual([e["title"] for e in out if f.valid(e)], ["Good"])
        self.assertTrue(all("evil.test" not in u for u in seen))


class Secrets(unittest.TestCase):
    def test_scrub_hides_secret_values_but_not_ordinary_text(self):
        with mock.patch.dict(os.environ, {"TICKETMASTER_API_KEY": "abcd1234secret"}):
            self.assertEqual(f.scrub("GET https://x/?apikey=abcd1234secret failed"), "GET https://x/?apikey=*** failed")
            self.assertEqual(f.scrub(RuntimeError("bad abcd1234secret")), "bad ***")
            self.assertEqual(f.scrub("nothing to hide"), "nothing to hide")

    def test_short_or_empty_values_are_not_scrubbed(self):
        with mock.patch.dict(os.environ, {"TICKETMASTER_API_KEY": ""}):
            self.assertEqual(f.scrub("a b c"), "a b c")


if __name__ == "__main__":
    unittest.main()
