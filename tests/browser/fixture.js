// A fixed set of future events for the browser tests, so they do not depend on how fresh the real events.json is.
const SRC = ["do312", "cpl", "eventbrite", "luma", "coursehorse", "ra"];
const WORDS = ["Comedy night", "Painting class", "Pottery wheel", "Jazz set", "Trivia", "Yoga flow"];

function makeEvents(n = 60, now = Date.now()) {
  return Array.from({ length: n }, (_, i) => ({
    title: `${WORDS[i % 6]} ${i}`,
    start: new Date(now + (i + 1) * 3 * 36e5 - 6 * 36e5).toISOString().slice(0, 16) + "-06:00",   // reads as Chicago local time
    venue: "Venue " + i, url: `https://x.test/${SRC[i % 6]}/e${i}`, source: SRC[i % 6], city: "Chicago",
    description: `A ${WORDS[i % 6].toLowerCase()} for everyone to enjoy`,
    is_free: i % 4 === 0, price_text: i % 4 === 0 ? "Free" : "$" + (10 + i), price_source: "a",
    sold_out: i % 11 === 0 ? true : null, age_min: i % 9 === 0 ? 21 : null,
  }));
}

// Serve the fixture instead of events.json (and no model.json) on a Playwright page.
async function useFixture(page, n = 60) {
  const now = Date.now();
  await page.route("**/events.json*", (r) => r.fulfill({ json: { last_updated: new Date(now).toISOString(), counts: { Chicago: {} }, events: makeEvents(n, now) } }));
  await page.route("**/model.json*", (r) => r.fulfill({ status: 404, body: "" }));
}

module.exports = { makeEvents, useFixture, SRC, WORDS };
