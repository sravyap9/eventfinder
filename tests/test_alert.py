import json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import alert


class FakeGh:
    def __init__(self, open_issues=None):
        self.calls, self.open = [], open_issues or []

    def __call__(self, args):
        self.calls.append(args)
        return json.dumps(self.open) if args[:2] == ["issue", "list"] else ""

    def verbs(self):
        return [" ".join(c[:2]) for c in self.calls if c[:2] != ["label", "create"]]


class Alert(unittest.TestCase):
    data = {"streaks": {"Chicago/do312": 2, "Chicago/ra": 1}, "warnings": ["Chicago/do312: returned nothing, kept the previous 80 events"],
            "last_updated": "2026-11-05T10:00:00-06:00"}

    def test_one_bad_run_is_not_an_alert(self):
        g = FakeGh(); alert.sync({"streaks": {"Chicago/ra": 1}, "warnings": []}, g)
        self.assertEqual(g.verbs(), ["issue list"])

    def test_two_in_a_row_opens_an_issue(self):
        g = FakeGh(); self.assertEqual(alert.sync(self.data, g), "opened a new issue")
        self.assertEqual(g.verbs(), ["issue list", "issue create"])
        create = next(c for c in g.calls if c[:2] == ["issue", "create"])
        self.assertIn("Chicago/do312", create[create.index("--title") + 1])
        self.assertNotIn("Chicago/ra", create[create.index("--title") + 1])   # only the source over the threshold

    def test_existing_issue_is_edited_not_duplicated(self):
        g = FakeGh([{"number": 7}]); self.assertEqual(alert.sync(self.data, g), "updated #7")
        self.assertEqual(g.verbs(), ["issue list", "issue edit"])

    def test_closes_when_healthy(self):
        g = FakeGh([{"number": 7}]); self.assertEqual(alert.sync({"streaks": {}, "warnings": []}, g), "closed #7")
        self.assertEqual(g.verbs(), ["issue list", "issue comment", "issue close"])

    def test_healthy_and_nothing_open_does_nothing(self):
        g = FakeGh(); self.assertEqual(alert.sync({}, g), "all sources healthy")
        self.assertEqual(g.verbs(), ["issue list"])

    def test_body_lists_the_warning(self):
        _, body = alert.render(self.data, {"Chicago/do312": 2})
        self.assertIn("returned nothing", body)


if __name__ == "__main__":
    unittest.main()
