// The recommender. Plain JS, no DOM, so it runs in the browser and in `node --test`.
//
// Every event becomes a sparse feature vector:
//   w:<stem>    TF-IDF weight of a word in the title + description
//   g:<group>   the event matches one of the synonym groups (art, comedy, yoga ...)
//   price:, time:, day:, age:, src:   structured features, value 1
// A logistic regression scores an event: p = sigmoid(bias + sum(weight[f] * x[f])).
//
// Cold start: the quiz answers set a PRIOR on the weights (you said you like comedy, so g:comedy starts positive).
// Then every thumbs up/down is one step of online SGD on the log loss, so the model moves from the
// prior toward what this person actually taps. Results are re-ranked with MMR so ten near copies of
// one recurring event don't fill the list.
// ---------- text ----------
const STOP = new Set(("the and for with you your our are this that from will have has not but all can who what when where how " +
  "more about join come get new one two out its per via any").split(" "));

export function stem(w) {
  let x = w, cut = false;
  for (const suf of ["ing", "ers", "er", "es", "s"])
    if (x.length > suf.length + 2 && x.endsWith(suf) && !(suf === "s" && x.endsWith("ss"))) {
      x = x.slice(0, -suf.length); cut = suf !== "s" && suf !== "es"; break;
    }
  if (cut && /([^aeioulsz])\1$/.test(x)) x = x.slice(0, -1);
  if (x.length > 3 && x.endsWith("e")) x = x.slice(0, -1);
  return x;
}
const words = (t) => String(t || "").toLowerCase().match(/[a-z0-9]+/g) || [];
const stems = (t) => words(t).map(stem);
const phraseKey = (t) => stems(t).join(" ");
export const normTitle = (t) => words(t).join(" ").replace(/^the /, "");

// ---------- interest groups (reuse synonyms.json; "kids" is not a taste) ----------
export let GROUPS = [];
export function setGroups(syn) { GROUPS = syn.filter((g) => g[0] !== "kids").map((g) => ({ name: g[0], keys: g.map(phraseKey) })); }

// quiz chip -> the synonym groups it switches on
export const INTERESTS = {
  "Art & making": ["art", "painting", "pottery", "crafts", "photography"],
  "Live music": ["music", "jazz", "dj"],
  "Dance": ["dance"],
  "Comedy": ["comedy"],
  "Food & drink": ["food", "cooking", "wine", "beer", "cocktail", "coffee", "market"],
  "Move your body": ["running", "fitness", "yoga", "cycling", "hiking", "paddling", "climbing", "sports", "martial arts"],
  "Games & nerdy": ["games", "tech", "science"],
  "Books & words": ["books", "writing", "language"],
  "Film & theater": ["film", "theater"],
  "Learn something": ["classes", "history", "science", "language", "tech"],
  "Meet people": ["networking", "volunteer", "singles"],
  "Seasonal & festivals": ["halloween", "festival"],
};

// quiz vibe -> words that signal it
export const VIBES = {
  social: ["mixer", "meetup", "social", "community", "game night", "networking", "club", "trivia"],
  chill: ["gallery", "reading", "tea", "museum", "acoustic", "jazz", "book", "tour", "workshop"],
  energy: ["dance", "dj", "party", "workout", "run", "festival", "live music", "concert"],
};

// ---------- features ----------
const localDate = (e) => { const [y, m, d] = e.start.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const localHour = (e) => Number(e.start.slice(11, 13));

export function priceBucket(e) {
  if (e.is_free) return "free";
  const m = /\$\s?(\d+(?:\.\d+)?)/.exec(e.price_text || "");
  if (!m) return "unknown";
  const n = Number(m[1]);
  return n <= 25 ? "low" : n <= 60 ? "mid" : "high";
}

export function timeBucket(h) { return h < 5 ? "late" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "late"; }

export function isWeekend(e) {
  const d = localDate(e).getDay(), h = localHour(e);
  return d === 6 || d === 0 || (d === 5 && h >= 17);
}

// Build the index once per events.json: per event a TF-IDF vector plus the structured features.
export function buildIndex(events) {
  const docs = events.map((e) => {
    const tt = stems(e.title).filter((s) => s.length > 2 && !STOP.has(s));
    const dt = stems(e.description).filter((s) => s.length > 2 && !STOP.has(s));
    const counts = new Map();
    for (const s of [...tt, ...tt, ...dt]) counts.set(s, (counts.get(s) || 0) + 1);  // title counts double
    return { e, counts, hay: " " + stems(e.title + " " + e.description).join(" ") + " " };
  });
  const df = new Map();
  for (const d of docs) for (const s of d.counts.keys()) df.set(s, (df.get(s) || 0) + 1);
  const N = docs.length;
  const surface = new Map();  // stem -> a readable word, for the "why" line
  for (const e of events) for (const w of words(e.title)) if (!surface.has(stem(w))) surface.set(stem(w), w);

  const items = docs.map(({ e, counts, hay }) => {
    const vec = new Map();
    let norm = 0;
    for (const [s, c] of counts) {
      if (df.get(s) < 2 || df.get(s) > N * 0.4 || /^\d+$/.test(s)) continue;
      const w = (1 + Math.log(c)) * Math.log(N / df.get(s));
      vec.set(s, w); norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [s, w] of vec) vec.set(s, w / norm);  // unit length, so cosine = dot product

    const f = {};
    for (const [s, w] of vec) f["w:" + s] = w * 2;  // scaled so words can move the score as much as the structured features
    for (const g of GROUPS) if (g.keys.some((k) => hay.includes(" " + k + " "))) f["g:" + g.name] = 1;
    f["price:" + priceBucket(e)] = 1;
    f["time:" + timeBucket(localHour(e))] = 1;
    f[isWeekend(e) ? "day:weekend" : "day:weekday"] = 1;
    if (e.age_min) f["age:" + e.age_min] = 1;
    f["src:" + e.source] = 1;
    return { id: e.url, e, f, vec, tkey: normTitle(e.title) };
  });
  return { items, surface };
}

// ---------- the model ----------
export const sigmoid = (z) => 1 / (1 + Math.exp(-z));
export const newModel = () => ({ bias: -1, w: {}, n: 0 });

export function score(model, item) {
  let z = model.bias;
  for (const k in item.f) z += (model.w[k] || 0) * item.f[k];
  return z;
}

// One step of online logistic regression (SGD with a little L2 pull toward zero).
export function learn(model, item, label, lr = 0.6, l2 = 0.002) {
  const err = label - sigmoid(score(model, item));
  const w = { ...model.w };
  for (const k in item.f) w[k] = (w[k] || 0) + lr * err * item.f[k] - lr * l2 * (w[k] || 0);
  return { bias: model.bias + lr * err * 0.3, w, n: model.n + 1 };
}

// Turn quiz answers into a starting model (the prior) and hard filters.
export function fromQuiz(a) {
  const w = {};
  const add = (k, v) => { w[k] = (w[k] || 0) + v; };
  for (const label of a.interests || []) for (const g of INTERESTS[label] || []) add("g:" + g, 1.4);
  for (const word of VIBES[a.vibe] || []) add("w:" + stem(word.split(" ")[0]), 0.7);
  const budgets = {
    free: { free: 2.5, low: 0.2, mid: -1.2, high: -2.2, unknown: -0.6 },
    cheap: { free: 1.4, low: 1.2, mid: 0, high: -2, unknown: -0.2 },
    any: { free: 0.3, low: 0, mid: 0, high: 0, unknown: 0 },
  };
  for (const [b, v] of Object.entries(budgets[a.budget || "any"])) add("price:" + b, v);
  for (const t of a.times || []) add("time:" + t, 0.9);
  if (a.adults === "no") { add("age:21", -3); }
  return { model: { bias: -1, w, n: 0 }, filters: { when: a.when || "month", adults: a.adults !== "no" } };
}

// ---------- ranking ----------
const dot = (a, b) => { if (a.size > b.size) [a, b] = [b, a]; let s = 0; for (const [k, v] of a) { const o = b.get(k); if (o) s += v * o; } return s; };

export function eligible(items, filters, now = Date.now(), rated = {}) {
  const horizon = { week: 7, weekend: 14, month: 40 }[filters.when || "month"];
  const seen = new Set();
  return items
    .filter((it) => {
      const t = Date.parse(it.e.start);
      if (rated[it.id] !== undefined) return false;
      if (it.e.sold_out || t + 2 * 36e5 < now || t > now + horizon * 864e5) return false;
      if (filters.when === "weekend" && !it.f["day:weekend"]) return false;
      if (!filters.adults && it.e.age_min === 21) return false;
      return true;
    })
    .sort((a, b) => Date.parse(a.e.start) - Date.parse(b.e.start))
    .filter((it) => (seen.has(it.tkey) ? false : (seen.add(it.tkey), true)));  // keep the next date of a recurring event only
}

// MMR: pick the best score, but penalise items too similar to what is already chosen.
export function recommend(model, items, k = 10, lambda = 0.72) {
  const scored = items.map((it) => ({ it, p: sigmoid(score(model, it)) })).sort((a, b) => b.p - a.p).slice(0, 80);
  const picked = [], srcCount = {};
  while (picked.length < k && scored.length) {
    let best = -1, bestV = -Infinity;
    scored.forEach((c, i) => {
      const sim = picked.reduce((m, p) => Math.max(m, dot(c.it.vec, p.it.vec)), 0);
      const v = lambda * c.p - (1 - lambda) * sim - 0.04 * (srcCount[c.it.e.source] || 0);
      if (v > bestV) { bestV = v; best = i; }
    });
    const [c] = scored.splice(best, 1);
    srcCount[c.it.e.source] = (srcCount[c.it.e.source] || 0) + 1;
    picked.push(c);
  }
  return picked;
}

// ---------- explanations ----------
const LABELS = {
  "price:free": "free", "price:low": "under $25", "price:mid": "mid priced", "price:high": "splurge",
  "time:morning": "morning", "time:afternoon": "afternoon", "time:evening": "evening", "time:late": "late night",
  "day:weekend": "weekend", "day:weekday": "weekday", "age:21": "21+", "age:18": "18+",
};
export function label(feature, surface) {
  if (LABELS[feature]) return LABELS[feature];
  if (feature.startsWith("g:")) return feature.slice(2);
  if (feature.startsWith("w:")) return surface.get(feature.slice(2)) || feature.slice(2);
  if (feature.startsWith("src:")) return "on " + feature.slice(4);
  return feature;
}

export function why(model, item, surface, n = 3) {
  const parts = Object.keys(item.f).map((k) => [k, (model.w[k] || 0) * item.f[k]]).filter(([, c]) => c > 0.15)
    .sort((a, b) => b[1] - a[1]);
  const out = [];
  for (const [k] of parts) { const l = label(k, surface); if (!out.includes(l)) out.push(l); if (out.length === n) break; }
  return out;
}

// the strongest learned weights, for the "what the model thinks of you" panel
export function topWeights(model, surface, n = 6) {
  const all = Object.entries(model.w).filter(([k]) => !k.startsWith("src:") && Math.abs(model.w[k]) > 0.1);
  const pos = all.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
  const neg = all.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, n);
  return { pos: pos.map(([k, v]) => [label(k, surface), v]), neg: neg.map(([k, v]) => [label(k, surface), v]) };
}
