import json, os, random, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ml"))
import train as t


def corr(a, b):
    n = len(a); ma, mb = sum(a) / n, sum(b) / n
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    return cov / (sum((x - ma) ** 2 for x in a) ** 0.5 * sum((y - mb) ** 2 for y in b) ** 0.5)


class Metrics(unittest.TestCase):
    def test_auc_perfect_random_and_ties(self):
        self.assertEqual(t.auc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9]), 1.0)
        self.assertEqual(t.auc([1, 1, 0, 0], [0.1, 0.2, 0.8, 0.9]), 0.0)
        self.assertEqual(t.auc([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5]), 0.5)
        self.assertIsNone(t.auc([1, 1], [0.2, 0.9]))

    def test_log_loss(self):
        self.assertAlmostEqual(t.log_loss([1, 0], [0.5, 0.5]), 0.6931, places=3)

    def test_split_never_shares_a_session(self):
        rows = [{"session_id": f"s{i % 40}", "label": i % 2, "features": {"a": 1}} for i in range(400)]
        tr, te = t.split_by_session(rows)
        self.assertFalse({r["session_id"] for r in tr} & {r["session_id"] for r in te})
        self.assertEqual(len(tr) + len(te), 400)


class Training(unittest.TestCase):
    def test_recovers_the_hidden_taste(self):
        rows, truth = t.synthetic(sessions=300, seed=3)
        tr, te = t.split_by_session(rows, seed=3)
        bias, w = t.train(tr, seed=3)
        m = t.evaluate(bias, w, tr, te)
        self.assertGreater(m["auc"], 0.75)
        self.assertLess(m["log_loss"], m["baseline_log_loss"])
        names = sorted(truth)
        self.assertGreater(corr([truth[n] for n in names], [w.get(n, 0) for n in names]), 0.9)

    def test_prune_keeps_the_strongest(self):
        p = t.prune({"a": 0.01, "b": -2.0, "c": 1.0, "d": 0.5}, min_abs=0.05, top=2)
        self.assertEqual(set(p), {"b", "c"})


class Cli(unittest.TestCase):
    def run_main(self, rows, **kw):
        d = tempfile.mkdtemp(); src, out = os.path.join(d, "r.json"), os.path.join(d, "model.json")
        with open(src, "w") as f:
            json.dump(rows, f)
        args = ["--ratings", src, "--out", out]
        for k, v in kw.items():
            args += [f"--{k.replace('_', '-')}", str(v)]
        t.main(args)
        return out

    def test_writes_a_model_when_it_learns_something(self):
        out = self.run_main(t.synthetic(sessions=250, seed=5)[0], min_ratings=500)
        with open(out) as f:
            m = json.load(f)
        self.assertGreater(m["metrics"]["auc"], 0.7)
        self.assertIn("w", m); self.assertIn("bias", m)

    def test_too_little_data_writes_nothing(self):
        out = self.run_main(t.synthetic(sessions=10, per_session=10, seed=1)[0])
        self.assertFalse(os.path.exists(out))

    def test_pure_noise_writes_nothing(self):
        rng = random.Random(0)
        rows = [{"session_id": f"s{i // 10}", "label": rng.randint(0, 1), "features": {f"f{rng.randint(0, 30)}": 1.0}} for i in range(1500)]
        out = self.run_main(rows, min_ratings=500, min_auc=0.65)
        self.assertFalse(os.path.exists(out))


if __name__ == "__main__":
    unittest.main()
