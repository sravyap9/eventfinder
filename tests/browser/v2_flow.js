// Behaviour regression test for the quiz page (/v2/), on a fixed set of events. Run by hand (needs a browser):
//   NODE_PATH=$(npm root -g) node tests/browser/v2_flow.js http://localhost:8765
const { chromium } = require("playwright");
const { useFixture } = require("./fixture");
const base = process.argv[2] || "http://localhost:8765";
let failures = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (extra !== "" ? "  " + extra : "")); if (!ok) failures++; };

async function open(browser, url, { w = 393, h = 852, mobile = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, colorScheme: "dark", reducedMotion: "reduce" });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", (e) => errs.push(String(e))); await page.route(/fonts\.g/, (r) => r.abort());
  await useFixture(page);
  await page.goto(url);
  return { page, errs, ctx };
}
const takeQuiz = async (page, { interests = ["Comedy", "Art & making"], budget = "Doesn't matter" } = {}) => {
  await page.waitForSelector(".quiz");
  const opt = (t) => page.click(`.opt:has-text("${t}")`), next = () => page.click(".primary");
  for (const i of interests) await opt(i);
  await next(); await opt("Surprise me"); await next(); await opt(budget); await next();
  await opt("Evenings"); await next(); await opt("Next few weeks"); await next(); await opt("Yes"); await next();
  await page.waitForSelector(".card");
};
const titles = (page) => page.$$eval(".card .title", (x) => x.map((y) => y.textContent));

(async () => {
  const b = await chromium.launch();
  {
    const { page, errs, ctx } = await open(b, base + "/v2/");
    await page.waitForSelector(".quiz");
    check("quiz shows first, with a progress bar", (await page.$$(".progress span")).length === 6 && (await page.$$(".opt")).length === 12);
    await page.click(".opt:has-text('Comedy')"); await page.click(".primary");
    check("moves to question 2", /vibe/i.test(await page.textContent(".quiz h2")));
    check("Next is disabled before a single choice answer", await page.$eval(".primary", (b) => b.disabled));
    await page.click(".ghost"); check("Back returns to question 1", /sounds fun/i.test(await page.textContent(".quiz h2")));
    await page.click(".primary");
    for (const t of ["Surprise me"]) await page.click(`.opt:has-text("${t}")`); await page.click(".primary");
    await page.click(".opt:has-text('Under about')"); await page.click(".primary");
    await page.click(".opt:has-text('Evenings')"); await page.click(".primary");
    await page.click(".opt:has-text('Next few weeks')"); await page.click(".primary");
    await page.click(".opt:has-text('Yes')");
    check("last button says 'Show my picks'", /Show my picks/.test(await page.textContent(".primary")));
    await page.click(".primary"); await page.waitForSelector(".card");

    check("10 picks, each with a 'because' line and a match percentage", (await page.$$(".card")).length === 10 && (await page.$$eval(".card .why", (x) => x.every((y) => /Because:|wildcard/.test(y.textContent) && /% match/.test(y.textContent)))));
    check("tabs: For you / Browse", JSON.stringify(await page.$$eval(".tabs button", (x) => x.map((y) => y.textContent))) === '["For you","Browse"]');
    check("page stays light under dark colour scheme", (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(246, 241, 231)");
    check("sold out events are excluded from picks", !(await titles(page)).some((t) => /\s(0|11|22|33|44|55)$/.test(t)));

    // details
    await page.click(".card >> nth=0 >> [aria-label^='Show details']");
    check("Details opens description, calendar and share", /for everyone/.test(await page.textContent(".card >> nth=0")) && (await page.$$(".card >> nth=0 >> a[href*='calendar.google.com']")).length === 1);
    // rating + undo
    const t0 = await titles(page);
    await page.click(".card >> nth=0 >> text=Not for me"); await page.waitForTimeout(150);
    const t1 = await titles(page);
    check("thumbs down replaces the pick", t1[0] !== t0[0] && !t1.includes(t0[0]) && t1.length === 10);
    check("rating count shows and undo appears", /1 rated/.test(await page.textContent(".hint")) && (await page.isVisible(".linklike")));
    await page.click(".linklike"); await page.waitForTimeout(150);
    check("undo restores the exact list", JSON.stringify(await titles(page)) === JSON.stringify(t0));
    // show more
    await page.click("button:has-text('Show 10 more')"); await page.waitForTimeout(150);
    check("show 10 more gives 20", (await page.$$(".card")).length === 20);
    // model inspector
    await page.click("summary"); check("model panel opens with learned weights", (await page.$$(".cols li")).length >= 2);
    // state persists
    await page.reload(); await page.waitForSelector(".card");
    check("state survives a reload (picks, not the quiz)", (await page.$$(".quiz")).length === 0 && (await page.$$(".card")).length >= 10);

    // browse
    await page.click(".tabs button:has-text('Browse')"); await page.waitForSelector(".search");
    const n0 = Number((await page.textContent(".hint")).match(/^([\d,]+)/)[1].replace(/,/g, ""));
    await page.fill(".search", "pottery"); await page.waitForTimeout(150);
    const n1 = Number((await page.textContent(".hint")).match(/^([\d,]+)/)[1].replace(/,/g, ""));
    check("browse search narrows results", n1 > 0 && n1 < n0, `${n0} -> ${n1}`);
    check("results match the search word", (await titles(page)).every((t) => /pottery|clay|ceramic/i.test(t)));
    await page.fill(".search", ""); await page.click(".opt:has-text('Free only')"); await page.waitForTimeout(150);
    check("Free only shows only free", (await page.$$eval(".card", (cs) => cs.every((c) => /FREE/.test(c.textContent)))) && (await page.$$(".card")).length > 0);
    await page.click(".opt:has-text('Free only')");
    await page.click(".opt:has-text('✓ Next 7 days')"); await page.waitForTimeout(150);
    check("window can be widened", /^\d/.test(await page.textContent(".hint")));
    check("no page errors", errs.length === 0, errs.join(";"));
    await ctx.close();
  }
  {
    // shared link restores answers; bad link starts the quiz
    const answers = { interests: ["Comedy"], vibe: "any", budget: "free", times: ["evening"], when: "month", adults: "yes" };
    const hash = "#a=" + Buffer.from(encodeURIComponent(JSON.stringify(answers)).replace(/%([0-9A-F]{2})/g, (_, x) => String.fromCharCode("0x" + x)), "binary").toString("base64");
    const { page, ctx } = await open(b, base + "/v2/" + hash);
    await page.waitForSelector(".card");
    check("shared link opens straight to picks", (await page.$$(".card")).length === 10 && (await page.evaluate(() => location.hash)) === "");
    await ctx.close();
    const bad = await open(b, base + "/v2/#a=garbage");
    await bad.page.waitForSelector(".quiz"); check("bad shared link falls back to the quiz", true); await bad.ctx.close();
  }
  {
    // the free only quiz really prefers free events
    const { page, ctx } = await open(b, base + "/v2/");
    await takeQuiz(page, { interests: ["Comedy"], budget: "Free only" });
    const free = await page.$$eval(".card", (cs) => cs.filter((c) => /FREE/.test(c.textContent)).length);
    check("a free only quiz ranks free events first", free >= 5, `${free} of 10 are free`);
    // retake
    await page.click("button:has-text('Retake')"); await page.waitForSelector(".quiz"); check("retake starts the quiz again", true);
    await ctx.close();
  }
  {
    const { page, ctx } = await open(b, base + "/v2/", { w: 1440, h: 900, mobile: false });
    await takeQuiz(page);
    check("laptop: cards use more than one column", (await page.$eval(".cards", (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length)) >= 2);
    await ctx.close();
  }
  await b.close();
  console.log(failures ? `\n${failures} FAILED` : "\nv2 flow: all checks passed");
  process.exit(failures ? 1 : 0);
})();
