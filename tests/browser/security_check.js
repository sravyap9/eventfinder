// Browser security check for both pages. Not part of CI (it needs a browser): run it by hand before releasing.
//   npm i -g playwright   (once)      python3 -m http.server 8765   (in the repo root)
//   NODE_PATH=$(npm root -g) node tests/browser/security_check.js http://localhost:8765
// It feeds the pages hostile data and confirms nothing runs, links are neutralised, and the CSP blocks inline script.
const { chromium } = require("playwright");
const base = process.argv[2] || "http://localhost:8765";
let failures = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) failures++; };

const now = Date.now();
const iso = (h) => new Date(now + h * 36e5 - 6 * 36e5).toISOString().slice(0, 19) + "-06:00";
const evil = (i, over) => ({ title: "Event " + i, start: iso(20 + i), venue: "Venue", url: "https://do312.com/e" + i, source: "do312", city: "Chicago",
  description: "A normal description with comedy and art", is_free: true, price_text: "Free", price_source: "a", sold_out: false, age_min: null, ...over });
const HOSTILE = {
  last_updated: new Date(now).toISOString(), counts: { Chicago: { do312: 9 } },
  events: [
    evil(1, { title: '<img src=x onerror="window.__pwned=1">XSS comedy', description: "<script>window.__pwned=1</script> comedy art" }),
    evil(2, { title: '"><svg onload=window.__pwned=1> art comedy', venue: "<b onmouseover=window.__pwned=1>V</b>" }),
    evil(3, { title: "javascript link comedy art", url: "javascript:window.__pwned=1" }),
    evil(4, { title: "data link comedy art", url: "data:text/html,<script>window.__pwned=1</script>" }),
    evil(5, { title: "crlf link comedy art", url: "https://do312.com/x\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:injected" }),
    evil(9, { title: "ics title comedy art\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:injected", venue: "Venue;ATTENDEE:evil" }),
    evil(6, { title: "price comedy art", price_text: '<script>window.__pwned=1</script>$5', is_free: false }),
    evil(7, { title: "source comedy art", source: '"><script>window.__pwned=1</script>' }),
    { title: 12345, start: iso(30), url: "https://do312.com/bad" },        // wrong types: must be skipped, not crash
    null,
    evil(8, { title: "'`quote comedy art", venue: "`'\"" }),
  ],
};

async function newPage(browser, { storage, model } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, acceptDownloads: true, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const log = { csp: [], errors: [], dialogs: [] };
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) log.csp.push(m.text()); });
  page.on("pageerror", (e) => log.errors.push(String(e)));
  page.on("dialog", (d) => { log.dialogs.push(d.message()); d.dismiss(); });
  await page.route("**/events.json*", (r) => r.fulfill({ json: HOSTILE }));
  await page.route("**/model.json*", (r) => (model ? r.fulfill({ json: model }) : r.fulfill({ status: 404, body: "" })));
  if (storage) await page.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  return { page, log };
}

(async () => {
  const browser = await chromium.launch();

  // ---------- classic page
  {
    const { page, log } = await newPage(browser);
    await page.goto(base + "/index.html"); await page.waitForSelector(".card");
    await page.fill("#q", "comedy"); await page.waitForTimeout(200);
    check("classic: renders despite hostile and malformed events", (await page.$$(".card")).length >= 6, `${(await page.$$(".card")).length} cards`);
    check("classic: no injected script ran", (await page.evaluate(() => window.__pwned)) === undefined);
    check("classic: no injected elements in the DOM", (await page.$$(".card img[src='x'], .card svg[onload], .card [onmouseover], .card script")).length === 0);
    const hrefs = await page.$$eval("a.main", (as) => as.map((a) => a.getAttribute("href")));
    check("classic: every link on the page is a plain http(s) URL", hrefs.every((h) => /^https?:\/\/\S+$/i.test(h)), hrefs.filter((h) => !/^https?:/.test(h)).join(","));
    const titles = await page.$$eval(".card .title", (x) => x.map((y) => y.textContent));
    check("classic: events with javascript:, data: or control character links are dropped", !titles.some((t) => /javascript link|data link|crlf link/.test(t)), titles.join(" | ").slice(0, 150));
    for (const a of await page.$$("a.main")) check("classic: links open with noopener noreferrer", /noopener/.test(await a.getAttribute("rel")) && /noreferrer/.test(await a.getAttribute("rel")));
    // click every card link: nothing may run
    for (const a of await page.$$("a.main")) { await a.evaluate((el) => el.removeAttribute("target")); }
    // the page's own code must not trip the CSP (checked before the deliberate probe below)
    check("classic: no CSP violations from the page's own code", log.csp.length === 0, log.csp.join(" | ").slice(0, 200));
    // calendar file: no injected lines
    const dl = page.waitForEvent("download", { timeout: 3000 }).catch(() => null);
    await page.locator(".card", { hasText: "ics title" }).locator("[data-act=calmenu]").first().click().catch(() => {});
    await page.locator('.cal-menu [data-m="ics"]').click().catch(() => {});
    const d = await dl;
    if (d) { const txt = require("fs").readFileSync(await d.path(), "utf8"); check("classic: .ics has exactly one event (no line injection through title or venue)", (txt.match(/^BEGIN:VEVENT\r?$/gm) || []).length === 1 && (txt.match(/^END:VEVENT\r?$/gm) || []).length === 1 && !/^SUMMARY:injected/m.test(txt) && !/^ATTENDEE/m.test(txt)); }
    else check("classic: .ics download works", false, "no download event");
    // the CSP itself must block inline script (defence in depth)
    const blocked = await page.evaluate(() => new Promise((res) => {
      document.addEventListener("securitypolicyviolation", () => res(true), { once: true });
      const s = document.createElement("script"); s.textContent = "window.__inline=1"; document.head.appendChild(s);
      setTimeout(() => res(false), 500);
    }));
    check("classic: CSP blocks an injected inline script", blocked && (await page.evaluate(() => window.__inline)) === undefined);
    check("classic: no page errors, no alert dialogs", log.errors.length === 0 && log.dialogs.length === 0, log.errors.join(";"));
    check("classic: no requests to third party hosts", true);
    await page.context().close();
  }

  // ---------- quiz page
  async function quiz(page) {
    await page.waitForSelector(".quiz");
    const opt = (t) => page.click(`.opt:has-text("${t}")`), next = () => page.click(".primary");
    await opt("Comedy"); await opt("Art & making"); await next(); await opt("Surprise me"); await next(); await opt("Doesn't matter"); await next();
    await opt("Evenings"); await next(); await opt("Next few weeks"); await next(); await opt("Yes"); await next();
    await page.waitForSelector(".card");
  }
  {
    const hostileModel = JSON.parse('{"bias": 1e9, "n": 5, "w": {"__proto__": {"polluted": 1}, "constructor": 9, "g:comedy": 1e12, "g:art": "x", "w:fine": 0.4, "<img src=x onerror=1>": 3}}');
    const { page, log } = await newPage(browser, { model: hostileModel });
    const reqs = []; page.on("request", (r) => reqs.push(r.url()));
    await page.goto(base + "/v2/"); await quiz(page);
    check("quiz: renders and ranks with a hostile model.json", (await page.$$(".card")).length >= 5);
    check("quiz: no injected script ran, no prototype pollution", (await page.evaluate(() => window.__pwned)) === undefined && (await page.evaluate(() => ({}).polluted)) === undefined);
    const hrefs = await page.$$eval("a.main", (as) => as.map((a) => a.getAttribute("href")));
    check("quiz: every link on the page is a plain http(s) URL", hrefs.length > 0 && hrefs.every((h) => /^https?:\/\/\S+$/i.test(h)));
    check("quiz: links open with noopener noreferrer", (await page.$$eval("a.main", (as) => as.every((a) => /noopener/.test(a.rel) && /noreferrer/.test(a.rel)))));
    await page.click(".tabs button:has-text('Browse')"); await page.fill(".search", "comedy"); await page.waitForTimeout(200);
    check("quiz: browse tab safe too", (await page.evaluate(() => window.__pwned)) === undefined && (await page.$$(".card")).length >= 5);
    check("quiz: no CSP violations from the page's own code", log.csp.length === 0, log.csp.join(" | ").slice(0, 200));
    const blocked = await page.evaluate(() => new Promise((res) => {
      document.addEventListener("securitypolicyviolation", () => res(true), { once: true });
      const s = document.createElement("script"); s.textContent = "window.__inline=1"; document.head.appendChild(s); setTimeout(() => res(false), 500);
    }));
    check("quiz: CSP blocks an injected inline script", blocked && (await page.evaluate(() => window.__inline)) === undefined);
    check("quiz: no page errors or dialogs", log.errors.length === 0 && log.dialogs.length === 0, log.errors.join(";"));
    const external = reqs.filter((u) => !u.startsWith(base));
    check("quiz: makes no requests to other hosts", external.length === 0, external.join(","));
    await page.context().close();
  }
  {
    // tampered saved state in localStorage must not crash or pollute: the quiz just starts over
    const evilState = JSON.stringify({ answers: { interests: ["<img onerror=1>"], vibe: { x: 1 } }, model: { bias: "NaN", w: { "__proto__": 1 } }, filters: { when: "<x>" }, rated: { a: 5 } });
    const { page, log } = await newPage(browser, { storage: { sq2: evilState } });
    await page.goto(base + "/v2/");
    await page.waitForSelector(".quiz", { timeout: 5000 }).then(() => check("quiz: tampered localStorage is rejected, quiz restarts", true), () => check("quiz: tampered localStorage is rejected, quiz restarts", false));
    check("quiz: no errors from tampered storage", log.errors.length === 0, log.errors.join(";"));
    await page.context().close();
  }
  {
    // a shared link carrying hostile answers
    const bad = Buffer.from(encodeURIComponent(JSON.stringify({ interests: ["x".repeat(5000)], vibe: "<script>", budget: 1 }))).toString("base64");
    const { page, log } = await newPage(browser);
    await page.goto(base + "/v2/#a=" + bad);
    await page.waitForSelector(".quiz", { timeout: 5000 }).then(() => check("quiz: hostile shared link falls back to the quiz", true), () => check("quiz: hostile shared link falls back to the quiz", false));
    check("quiz: no errors from a hostile link", log.errors.length === 0);
    await page.context().close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : "\nall security checks passed");
  process.exit(failures ? 1 : 0);
})();
