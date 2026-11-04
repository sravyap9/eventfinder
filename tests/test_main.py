"""The safety net around the fetchers: what main() does when a source breaks, returns junk, or quietly loses a field."""
import contextlib, io, json, os, sys, tempfile, unittest
from datetime import timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..")); sys.path.insert(0, os.path.join(HERE, "..", "tools"))
import fetch as f
import alert


def events(source, n, desc="A fine description of the event", venue="Some Venue"):
    city = f.CITIES[0]
    return [f.ev(city, f"{source} event {i}", f.NOW + timedelta(days=1, hours=i), venue, f"https://x.test/{source}/{i}", source, desc) for i in range(n)]


class MainSafetyNet(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.saved = (f.OUT, f.SOURCES)
        f.OUT = os.path.join(self.dir, "events.json")
        f.OLD.clear()

    def tearDown(self):
        f.OUT, f.SOURCES = self.saved
        f.OLD.clear()

    def run_main(self, **fetchers):
        f.SOURCES = {name: (fn, lambda c: True) for name, fn in fetchers.items()}
        f.OLD.clear()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            f.main()
        with open(f.OUT) as fh:
            return json.load(fh)

    def boom(self, city):
        raise RuntimeError("site changed")

    def test_healthy_run_has_no_warnings(self):
        d = self.run_main(a=lambda c: events("a", 40), b=lambda c: events("b", 40))
        self.assertEqual((d["warnings"], d["streaks"]), ([], {}))
        self.assertEqual(d["counts"]["Chicago"], {"a": 40, "b": 40})

    def test_broken_source_keeps_its_previous_events_and_starts_a_streak(self):
        self.run_main(a=lambda c: events("a", 40), b=lambda c: events("b", 40))
        d = self.run_main(a=lambda c: events("a", 40), b=self.boom)
        self.assertEqual(d["counts"]["Chicago"]["b"], 40)               # the page keeps working
        self.assertEqual(d["streaks"], {"Chicago/b": 1})
        self.assertTrue(any("Chicago/b" in w and "returned nothing" in w for w in d["warnings"]))
        self.assertEqual(alert.failing(d), {})                          # one bad run is not an alert yet

    def test_two_bad_runs_in_a_row_become_an_alert_then_recovery_clears_it(self):
        self.run_main(a=lambda c: events("a", 40), b=lambda c: events("b", 40))
        self.run_main(a=lambda c: events("a", 40), b=self.boom)
        d = self.run_main(a=lambda c: events("a", 40), b=self.boom)
        self.assertEqual(alert.failing(d), {"Chicago/b": 2})
        d = self.run_main(a=lambda c: events("a", 40), b=lambda c: events("b", 40))
        self.assertEqual((d["streaks"], alert.failing(d)), ({}, {}))

    def test_a_parser_that_returns_junk_counts_as_broken(self):
        self.run_main(a=lambda c: events("a", 40), b=lambda c: events("b", 40))

        def junk(city):
            out = events("b", 40)
            for e in out[:30]:
                e["title"] = ""                                         # the title selector stopped matching
            return out
        d = self.run_main(a=lambda c: events("a", 40), b=junk)
        self.assertTrue(any("failed basic checks" in w for w in d["warnings"]))
        self.assertEqual(d["counts"]["Chicago"]["b"], 40)               # previous good events kept
        self.assertTrue(all(e["title"] for e in d["events"]))

    def test_a_field_that_silently_goes_empty_is_flagged(self):
        self.run_main(a=lambda c: events("a", 40), b=lambda c: events("b", 40))
        d = self.run_main(a=lambda c: events("a", 40), b=lambda c: events("b", 40, desc=""))   # events arrive, descriptions vanished
        self.assertTrue(any("description filled on 0%" in w for w in d["warnings"]), d["warnings"])
        self.assertEqual(d["streaks"], {"Chicago/b": 1})

    def test_a_big_drop_is_flagged(self):
        self.run_main(a=lambda c: events("a", 100))
        d = self.run_main(a=lambda c: events("a", 40))
        self.assertTrue(any("40 events now vs 100" in w for w in d["warnings"]))

    def test_one_event_on_two_sites_is_merged(self):
        def same(source):
            def fn(city):
                e = f.ev(city, "Jazz Night", f.NOW + timedelta(days=2), "Venue", f"https://{source}.test/jazz", source, "", {"price_text": "$10" if source == "b" else None})
                return [e] + events(source, 30)
            return fn
        d = self.run_main(a=same("a"), b=same("b"))
        jazz = [e for e in d["events"] if e["title"] == "Jazz Night"]
        self.assertEqual(len(jazz), 1)
        self.assertEqual(jazz[0]["price_text"], "$10")                  # the duplicate with a structured price wins


if __name__ == "__main__":
    unittest.main()
