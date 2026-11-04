// Motion checks for both pages: speed limit, scroll reveal, hover, loading states, reduced motion. Run by hand (needs a browser):
//   NODE_PATH=$(npm root -g) node tests/browser/motion_check.js http://localhost:8765
const { chromium } = require("playwright");
const { useFixture } = require("./fixture");
const base = process.argv[2] || "http://localhost:8765";
let failures = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (extra !== "" ? "  " + extra : "")); if (!ok) failures++; };
const LIMIT_MS = 299;   // the brief: under 300ms. Slowest token 220ms + the 60ms stagger of the last card in a group = 280ms

// Every transition and animation currently defined on the page: the longest "duration + delay" that is not an endless loop.
const longestMotion = (page) => page.evaluate(() => {
  const ms = (v) => Math.max(...String(v).split(",").map((x) => (x.trim().endsWith("ms") ? parseFloat(x) : parseFloat(x) * 1000) || 0));
  let worst = { ms: 0, el: "" };
  for (const e of document.querySelectorAll("*")) {
    const s = getComputedStyle(e);
    const t = ms(s.transitionDuration) + ms(s.transitionDelay);
    const loops = s.animationIterationCount.includes("infinite");
    const a = loops ? 0 : ms(s.animationDuration) + ms(s.animationDelay);
    const m = Math.max(t, a);
    if (m > worst.ms) worst = { ms: Math.round(m), el: e.tagName.toLowerCase() + "." + String(e.className).split(" ")[0] };
  }
  return worst;
});

async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, ...opts });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", (e) => errs.push(String(e))); await page.route(/fonts\.g/, (r) => r.abort());
  return { ctx, page, errs };
}

(async () => {
  const b = await chromium.launch();

  // ---------- classic page ----------
  {
    // loading state: a skeleton is on screen at once, long before slow data arrives
    const { ctx, page } = await open(b);
    const { makeEvents } = require("./fixture"); const now = Date.now();
    await page.route("**/model.json*", (r) => r.fulfill({ status: 404, body: "" }));
    await page.route("**/events.json*", async (r) => { await new Promise((x) => setTimeout(x, 1500)); r.fulfill({ json: { last_updated: new Date(now).toISOString(), counts: { Chicago: {} }, events: makeEvents(60, now) } }); });
    await page.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    check("classic: skeleton cards are visible while data loads", (await page.$$(".skel")).length === 3 && (await page.$$(".card")).length === 0);
    check("classic: the status line says it is loading", /Loading/.test(await page.textContent("#status")));
    await page.waitForSelector(".card", { timeout: 6000 });
    check("classic: skeletons are replaced by real cards", (await page.$$(".skel")).length === 0 && (await page.getAttribute("#list", "aria-busy")) === "false");
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await open(b);
    await useFixture(page, 60);
    await page.goto(base + "/index.html"); await page.waitForSelector(".card");
    await page.waitForTimeout(450);
    const first = await page.$$eval(".day.reveal", (ds) => ds.map((d) => ({ in: d.classList.contains("in"), top: d.getBoundingClientRect().top })));
    check("classic: day sections on screen have revealed", first.filter((d) => d.top < 700).every((d) => d.in) && first.length >= 1);
    // a section below the fold stays hidden until scrolled to
    await page.setViewportSize({ width: 393, height: 500 });
    await page.goto(base + "/index.html"); await page.waitForSelector(".card"); await page.waitForTimeout(450);
    const below = await page.$$eval(".day.reveal", (ds) => ds.filter((d) => d.getBoundingClientRect().top > innerHeight + 20).map((d) => d.classList.contains("in")));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(700);
    const afterScroll = await page.$$eval(".day.reveal", (ds) => ds.every((d) => d.classList.contains("in")));
    check("classic: sections below the fold wait, then reveal on scroll", (below.length === 0 || below.every((x) => x === false)) && afterScroll, `${below.length} below the fold`);
    // typing must not re-trigger the reveal
    await page.evaluate(() => window.scrollTo(0, 0)); await page.fill("#q", "comedy"); await page.waitForTimeout(250);
    check("classic: typing in search renders cards without the reveal (no flicker)", (await page.$$(".day.reveal")).length === 0 && (await page.$$(".card")).length > 0);
    await page.fill("#q", "");
    // page turn does animate
    await page.click('#pager button[data-d="next"]'); await page.waitForTimeout(100);
    check("classic: a page turn does reveal", (await page.$$(".day.reveal")).length > 0);
    check("classic: nothing runs longer than the limit", (await longestMotion(page)).ms <= LIMIT_MS, JSON.stringify(await longestMotion(page)));
    check("classic: no page errors", errs.length === 0, errs.join(";"));
    await ctx.close();
  }
  {
    // hover lift (a device that can hover)
    const { ctx, page } = await open(b, { viewport: { width: 1280, height: 800 } });
    await useFixture(page, 60);
    await page.goto(base + "/index.html"); await page.waitForSelector(".card"); await page.waitForTimeout(500);
    const card = page.locator(".card").first(); const box = await card.boundingBox();
    const before = await card.evaluate((e) => getComputedStyle(e).transform);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(350);
    const hovered = await card.evaluate((e) => ({ t: getComputedStyle(e).transform, s: getComputedStyle(e).boxShadow }));
    check("classic: hovering a card lifts it and shows the retro shadow", before === "none" && /matrix\(1, 0, 0, 1, -2, -2\)/.test(hovered.t) && hovered.s !== "none", hovered.t);
    await ctx.close();
  }
  {
    // reduced motion: nothing hides, nothing moves
    const { ctx, page } = await open(b, { reducedMotion: "reduce" });
    await useFixture(page, 60);
    await page.goto(base + "/index.html"); await page.waitForSelector(".card");
    const m = await page.evaluate(() => { const d = document.querySelector(".day"); const s = getComputedStyle(d); return { op: s.opacity, tf: s.transform }; });
    check("classic: reduced motion shows content immediately, unmoved", m.op === "1" && m.tf === "none", JSON.stringify(m));
    await ctx.close();
  }

  // ---------- quiz page ----------
  {
    // the quiz shows at once, without waiting for events.json
    const { ctx, page } = await open(b);
    const { makeEvents } = require("./fixture"); const now = Date.now();
    await page.route("**/model.json*", (r) => r.fulfill({ status: 404, body: "" }));
    await page.route("**/events.json*", async (r) => { await new Promise((x) => setTimeout(x, 2000)); r.fulfill({ json: { last_updated: new Date(now).toISOString(), counts: {}, events: makeEvents(60, now) } }); });
    await page.goto(base + "/v2/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".quiz", { timeout: 1500 });
    check("quiz: the first question is on screen before events.json arrives", true);
    const opt = (t) => page.click(`.opt:has-text("${t}")`), next = () => page.click(".primary");
    await opt("Comedy"); await next(); await opt("Surprise me"); await next(); await opt("Doesn't matter"); await next(); await opt("Evenings"); await next(); await opt("Next few weeks"); await next(); await opt("Yes"); await next();
    await page.waitForTimeout(150);
    check("quiz: finishing before the data arrives shows skeleton cards, not a blank page", (await page.$$(".skel")).length >= 1);
    await page.waitForSelector(".card", { timeout: 6000 });
    check("quiz: skeletons give way to real picks", (await page.$$(".skel")).length === 0 && (await page.$$(".card")).length === 10);
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await open(b);
    await useFixture(page, 60);
    await page.goto(base + "/v2/"); await page.waitForSelector(".quiz");
    const q1 = await page.textContent(".quiz h2");
    await page.click(".opt:has-text('Comedy')"); await page.click(".primary");
    check("quiz: the next question fades in (step-in animation present)", await page.$eval(".quiz .step-in", (e) => /step-in/.test(getComputedStyle(e).animationName)) && (await page.textContent(".quiz h2")) !== q1);
    await page.click(".opt:has-text('Surprise me')"); await page.click(".primary"); await page.click(".opt:has-text('Doesn')"); await page.click(".primary");
    await page.click(".opt:has-text('Evenings')"); await page.click(".primary"); await page.click(".opt:has-text('Next few weeks')"); await page.click(".primary"); await page.click(".opt:has-text('Yes')"); await page.click(".primary");
    await page.waitForSelector(".card"); await page.waitForTimeout(500);
    check("quiz: picks reveal as they enter", (await page.$$eval("li.reveal", (x) => x.filter((e) => e.getBoundingClientRect().top < innerHeight).every((e) => e.classList.contains("in")))));
    check("quiz: nothing runs longer than the limit", (await longestMotion(page)).ms <= LIMIT_MS, JSON.stringify(await longestMotion(page)));
    await page.click(".tabs button:has-text('Browse')"); await page.waitForSelector(".search"); await page.fill(".search", "pottery"); await page.waitForTimeout(250);
    check("quiz: searching in Browse shows cards without the reveal", (await page.$$("li.reveal")).length === 0 && (await page.$$(".card")).length > 0);
    check("quiz: no page errors", errs.length === 0, errs.join(";"));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(b, { reducedMotion: "reduce" });
    await useFixture(page, 60);
    await page.goto(base + "/v2/"); await page.waitForSelector(".quiz");
    const opt = (t) => page.click(`.opt:has-text("${t}")`), next = () => page.click(".primary");
    await opt("Comedy"); await next(); await opt("Surprise me"); await next(); await opt("Doesn't matter"); await next(); await opt("Evenings"); await next(); await opt("Next few weeks"); await next(); await opt("Yes"); await next();
    await page.waitForSelector(".card");
    const m = await page.$eval("li.reveal", (e) => ({ op: getComputedStyle(e).opacity, tf: getComputedStyle(e).transform }));
    check("quiz: reduced motion shows cards immediately, unmoved", m.op === "1" && m.tf === "none", JSON.stringify(m));
    await ctx.close();
  }

  await b.close();
  console.log(failures ? `\n${failures} FAILED` : "\nmotion: all checks passed");
  process.exit(failures ? 1 : 0);
})();
