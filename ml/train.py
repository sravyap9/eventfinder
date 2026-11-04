#!/usr/bin/env python3
"""Train a shared starting model for the recommender from logged thumbs ratings.

Input: a JSON list of ratings, each {"session_id", "label" (0 or 1), "features": {name: value}}. The browser logs the
exact feature vector the model saw, so nothing here has to re-implement the JavaScript feature code.
Model: the same logistic regression the app uses (bias + sum of weight * feature), trained with SGD and L2.
Evaluation: sessions are split into train and test, so a person's ratings never sit on both sides.
Output: model.json (loaded by the app as a prior), written only if the model beats a constant baseline on the test set.

  python3 ml/train.py --ratings ratings.json --out model.json
  python3 ml/train.py --synthetic            # try the whole pipeline on made up data
"""
import argparse, json, math, random, sys
from collections import defaultdict


def sigmoid(z):
    return 1 / (1 + math.exp(-z)) if z >= 0 else math.exp(z) / (1 + math.exp(z))


def score(bias, w, feats):
    return bias + sum(w.get(k, 0.0) * v for k, v in feats.items())


def split_by_session(rows, test_frac=0.25, seed=0):
    sessions = sorted({r["session_id"] for r in rows})
    random.Random(seed).shuffle(sessions)
    test = set(sessions[: max(1, int(len(sessions) * test_frac))])
    return [r for r in rows if r["session_id"] not in test], [r for r in rows if r["session_id"] in test]


def train(rows, epochs=25, lr=0.15, l2=1e-3, seed=0):
    rng = random.Random(seed)
    w, bias = defaultdict(float), 0.0
    order = list(rows)
    for epoch in range(epochs):
        rng.shuffle(order)
        step = lr / (1 + 0.1 * epoch)                     # slowly shrinking step size
        for r in order:
            err = r["label"] - sigmoid(score(bias, w, r["features"]))
            for k, v in r["features"].items():
                w[k] += step * (err * v - l2 * w[k])
            bias += step * err
    return bias, dict(w)


def log_loss(labels, probs):
    return -sum(math.log(max(1e-9, p if y else 1 - p)) for y, p in zip(labels, probs)) / len(labels)


def auc(labels, scores):
    """Probability that a random liked item scores above a random disliked one (ties count half)."""
    pos = [s for y, s in zip(labels, scores) if y]
    neg = [s for y, s in zip(labels, scores) if not y]
    if not pos or not neg:
        return None
    ranked = sorted(range(len(scores)), key=lambda i: scores[i])
    ranks, i = [0.0] * len(scores), 0
    while i < len(ranked):
        j = i
        while j + 1 < len(ranked) and scores[ranked[j + 1]] == scores[ranked[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[ranked[k]] = (i + j) / 2 + 1
        i = j + 1
    rank_sum = sum(ranks[i] for i, y in enumerate(labels) if y)
    return (rank_sum - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))


def evaluate(bias, w, train_rows, test_rows):
    y = [r["label"] for r in test_rows]
    p = [sigmoid(score(bias, w, r["features"])) for r in test_rows]
    base = sum(r["label"] for r in train_rows) / len(train_rows)   # constant baseline: always predict the train like rate
    return {"n_test": len(y), "auc": auc(y, p), "log_loss": log_loss(y, p), "baseline_log_loss": log_loss(y, [base] * len(y)),
            "accuracy": sum((pi > 0.5) == bool(yi) for pi, yi in zip(p, y)) / len(y), "like_rate": sum(y) / len(y)}


def prune(w, min_abs=0.05, top=800):
    keep = sorted((kv for kv in w.items() if abs(kv[1]) >= min_abs), key=lambda kv: -abs(kv[1]))[:top]
    return {k: round(v, 4) for k, v in keep}


def synthetic(sessions=300, per_session=14, seed=0):
    """Made up ratings from a hidden 'true' taste, to check the pipeline can recover it."""
    rng = random.Random(seed)
    names = [f"g:{n}" for n in ("art", "comedy", "music", "food", "running", "books", "film", "games")] + \
            [f"w:{n}" for n in ("pottery", "standup", "jazz", "trivia", "gallery", "5k", "wine", "poetry", "improv", "dance")] + \
            ["price:free", "price:low", "price:high", "time:evening", "time:morning", "day:weekend"]
    truth = {n: rng.gauss(0, 1.2) for n in names}
    rows = []
    for s in range(sessions):
        mood = rng.gauss(0, 0.4)                                  # each person leans a little differently
        for _ in range(per_session):
            feats = {n: 1.0 for n in rng.sample(names, rng.randint(3, 6))}
            z = -0.3 + mood + sum(truth[n] for n in feats)
            rows.append({"session_id": f"s{s}", "label": int(rng.random() < sigmoid(z)), "features": feats})
    return rows, truth


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ratings", help="JSON file exported by ml/export.py")
    ap.add_argument("--synthetic", action="store_true", help="use made up data instead")
    ap.add_argument("--out", default="model.json")
    ap.add_argument("--min-ratings", type=int, default=500, help="do nothing below this many ratings")
    ap.add_argument("--min-auc", type=float, default=0.55)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args(argv)

    if a.synthetic:
        rows = synthetic(seed=a.seed)[0]
    else:
        with open(a.ratings) as f:
            rows = json.load(f)
    rows = [r for r in rows if r.get("label") in (0, 1) and r.get("features")]
    sessions = len({r["session_id"] for r in rows})
    print(f"{len(rows)} ratings from {sessions} sessions")
    if len(rows) < a.min_ratings or sessions < 20:
        print(f"Not enough data yet (need {a.min_ratings} ratings and 20 sessions). model.json left alone.")
        return 0

    tr, te = split_by_session(rows, seed=a.seed)
    bias, w = train(tr, seed=a.seed)
    m = evaluate(bias, w, tr, te)
    print(json.dumps({k: (round(v, 4) if isinstance(v, float) else v) for k, v in m.items()}))
    if m["auc"] is None or m["auc"] < a.min_auc or m["log_loss"] >= m["baseline_log_loss"]:
        print("The model does not beat the baseline on held out sessions. model.json left alone.")
        return 0

    bias, w = train(rows, seed=a.seed)                            # final model uses every rating
    out = {"version": 1, "n_ratings": len(rows), "n_sessions": sessions, "metrics": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in m.items()},
           "bias": round(bias, 4), "w": prune(w)}
    with open(a.out, "w") as f:
        json.dump(out, f, indent=1)
    print(f"wrote {a.out} with {len(out['w'])} weights")
    return 0


if __name__ == "__main__":
    sys.exit(main())
