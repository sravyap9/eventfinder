import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setGroups, buildIndex, newModel, fromQuiz, learn, score, eligible, recommend, why, sigmoid } from "./ml.js";

setGroups(JSON.parse(readFileSync(new URL("../../synonyms.json", import.meta.url))));

const soon = (h) => new Date(Date.now() + h * 36e5 - 6 * 36e5).toISOString().slice(0, 16) + "-06:00";  // local-looking stamp
const mk = (title, description, extra = {}) => ({
  title, description, url: "https://x/" + title, source: "do312", city: "Chicago", start: soon(30), is_free: false,
  price_text: "$20", sold_out: false, age_min: null, ...extra,
});
const EVENTS = [
  mk("Watercolor painting night", "Paint with friends at a gallery studio, all supplies provided", { is_free: false, price_text: "$30" }),
  mk("Open studio pottery wheel", "Throw clay on the wheel and glaze your own ceramics", { price_text: "$25" }),
  mk("Standup comedy showcase", "Local comedians perform a live comedy set", { price_text: "$15" }),
  mk("Sunday long run club", "Group run along the lakefront, all paces welcome", { is_free: true, price_text: "Free" }),
  mk("Free yoga in the park", "Morning vinyasa yoga flow, bring a mat", { is_free: true, price_text: "Free", start: soon(34) }),
  mk("Jazz at the lounge", "Live jazz trio and cocktails", { price_text: "$10" }),
  mk("Sold out comedy night", "comedy", { sold_out: true }),
  mk("Weekly trivia", "Pub trivia every week", { start: soon(31) }),
  mk("Weekly trivia ", "Pub trivia every week", { start: soon(200) }),
];
const { items } = buildIndex(EVENTS);
const top = (model, filters = { when: "month", adults: true }, k = 3) =>
  recommend(model, eligible(items, filters), k).map((c) => c.it.e.title);

test("quiz interests set the prior: art lover sees art first", () => {
  const { model } = fromQuiz({ interests: ["Art & making"], budget: "any" });
  const t = top(model, undefined, 2);
  assert.ok(t.includes("Watercolor painting night") && t.includes("Open studio pottery wheel"), t.join());
});

test("free only budget puts free events on top", () => {
  const { model } = fromQuiz({ interests: [], budget: "free" });
  assert.ok(top(model, undefined, 2).every((t) => /run|yoga/i.test(t)));
});

test("sold out events and duplicate recurring titles are excluded", () => {
  const ids = eligible(items, { when: "month", adults: true }).map((i) => i.e.title.trim());
  assert.ok(!ids.includes("Sold out comedy night"));
  assert.equal(ids.filter((t) => t === "Weekly trivia").length, 1);
});

test("learn(): a thumbs down lowers the score, a thumbs up raises it", () => {
  const m0 = newModel(), it = items.find((i) => i.e.title.startsWith("Jazz"));
  const down = learn(m0, it, 0), up = learn(m0, it, 1);
  assert.ok(score(down, it) < score(m0, it) && score(up, it) > score(m0, it));
});

test("feedback generalises: liking comedy moves other comedy events up", () => {
  let m = newModel();
  const comedy = items.find((i) => i.e.title === "Standup comedy showcase");
  const other = items.find((i) => i.e.title === "Sold out comedy night");  // shares the comedy group feature
  const before = score(m, other);
  for (let i = 0; i < 3; i++) m = learn(m, comedy, 1);
  assert.ok(score(m, other) > before);
});

test("learned preference can override the prior", () => {
  let { model } = fromQuiz({ interests: ["Art & making"], budget: "any" });
  const art = items.filter((i) => i.f["g:art"] || i.f["g:pottery"] || i.f["g:painting"]);
  for (let r = 0; r < 6; r++) for (const it of art) model = learn(model, it, 0);   // keeps rejecting art
  assert.ok(!top(model, undefined, 1)[0].match(/painting|pottery/i));
});

test("why() explains with readable labels", () => {
  const { model } = fromQuiz({ interests: ["Comedy"], budget: "cheap" });
  const it = items.find((i) => i.e.title === "Standup comedy showcase");
  const w = why(model, it, new Map());
  assert.ok(w.includes("comedy"), w.join());
});

test("sigmoid sanity", () => { assert.equal(sigmoid(0), 0.5); });
