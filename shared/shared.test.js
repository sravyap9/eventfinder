import test from "node:test";
import assert from "node:assert/strict";
import { stem, stems, phraseKey, normTitle, hayOf } from "./text.js";
import { buildGroups, expandQuery, matchesAny } from "./search.js";
import { esc, safeHref, isUsableEvent, usableEvents, SOURCE_NAMES } from "./events.js";

test("stem: inflections of one word share a stem", () => {
  assert.equal(stem("running"), stem("run"));
  assert.equal(stem("runners"), stem("run"));
  assert.equal(stem("paints"), stem("painting"));
  assert.equal(stem("class"), "class");                          // does not strip the s of "ss"
  assert.equal(stem("running"), stem("running"));                 // memoised result is stable
});

test("phraseKey and hayOf", () => {
  assert.equal(phraseKey("Paint & Sip!"), "paint sip");
  assert.equal(hayOf("Pottery Wheel"), " potteri wheel ".replace("potteri", stem("pottery")));
  assert.equal(normTitle("The Comedy  Night!"), "comedy night");
});

test("search: a word matches its whole synonym group, on whole words only", () => {
  const groups = buildGroups([["painting", "paint", "watercolor"], ["pottery", "ceramics", "wheel throwing"]]);
  const { keys, shown } = expandQuery(groups, "paint");
  assert.ok(keys.includes(stem("watercolor")) && shown.includes("watercolor"));
  assert.deepEqual(expandQuery(groups, "").keys, []);
  assert.deepEqual(expandQuery(groups, "zzz").keys, [phraseKey("zzz")]);   // unknown word: matches itself only
  const hay = hayOf("Watercolor night for everyone");
  assert.ok(matchesAny(hay, keys));
  assert.ok(!matchesAny(hayOf("Paintball arena"), [stem("paint")]));       // "paintball" is not "paint"
  assert.ok(matchesAny(hay, []));                                          // empty query matches everything
});

test("esc neutralises markup in text and attributes", () => {
  assert.equal(esc(`<img src=x onerror="a('b')">`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;");
  assert.equal(esc("`x`"), "&#96;x&#96;");
});

test("safeHref only passes http(s)", () => {
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:1", "data:text/html,x", "//evil.test", "/relative", "", null, undefined]) assert.equal(safeHref(bad), "#", String(bad));
  assert.equal(safeHref("https://do312.com/x"), "https://do312.com/x");
  assert.equal(safeHref("http://x.test/"), "http://x.test/");
});

test("isUsableEvent: right types, clean link, parseable time", () => {
  const ok = { title: "T", url: "https://x.test/a", start: "2026-11-04T19:00-06:00" };
  assert.ok(isUsableEvent(ok));
  for (const bad of [null, {}, { ...ok, title: 5 }, { ...ok, url: "javascript:1" }, { ...ok, url: "https://x.test/a b" }, { ...ok, url: "https://x.test/a\nb" },
                     { ...ok, start: "garbage" }, { ...ok, start: 5 }]) assert.ok(!isUsableEvent(bad), JSON.stringify(bad));
});

test("usableEvents tolerates a malformed file", () => {
  assert.deepEqual(usableEvents(null), []);
  assert.deepEqual(usableEvents({ events: "x" }), []);
  assert.equal(usableEvents({ events: [null, { title: "T", url: "https://x.test/", start: "2026-11-04T19:00-06:00" }, 7] }).length, 1);
});

test("every source has a display name", () => {
  for (const s of ["luma", "eventbrite", "partiful", "pie", "do312", "cpl", "cpd", "coursehorse", "ra", "ticketmaster"]) assert.ok(SOURCE_NAMES[s], s);
});
