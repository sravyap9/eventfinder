// Behaviour regression test for the classic page, on the real events.json. Run by hand (needs a browser):
//   NODE_PATH=$(npm root -g) node tests/browser/classic_flow.js http://localhost:8765
const { chromium } = require("playwright");
const { useFixture } = require("./fixture");
const base = process.argv[2] || "http://localhost:8765";
let failures = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (extra !== "" ? "  " + extra : "")); if (!ok) failures++; };
const count = (s) => Number(s.match(/^([\d,]+)/)[1].replace(/,/g, ""));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, acceptDownloads: true, colorScheme: "dark", reducedMotion: "reduce" });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(String(e))); await p.route(/fonts\.g/, (r) => r.abort());
  await useFixture(p);
  await p.goto(base + "/index.html"); await p.waitForSelector(".card");
  const titles = () => p.$$eval(".card .title", (x) => x.map((y) => y.textContent));
  const status = async () => (await p.textContent("#status")).trim();

  check("loads 20 cards on page 1", (await p.$$(".card")).length === 20);
  check("status line: 'N events · X sources · updated ...'", /^\d[\d,]* events · \d+ sources · updated /.test(await status()), await status());
  check("page stays light under dark colour scheme", (await p.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(246, 241, 231)");
  check("quiz page is linked", (await p.$$('a[href="v2/"]')).length === 1);
  check("privacy page is linked", (await p.$$('a[href="privacy.html"]')).length === 1);

  // status expands to per source counts
  await p.click("#status");
  const srcs = await p.$$eval("#srcs .badge", (x) => x.length);
  check("tap status shows per source counts", srcs >= 5 && (await p.isVisible("#srcs")), srcs + " sources");
  await p.click("#status");
  check("tap again hides them", !(await p.isVisible("#srcs")));

  // search + synonyms
  const total = count(await status());
  await p.fill("#q", "painting"); await p.waitForTimeout(200);
  const nSearch = (await p.$$(".card")).length;
  check("search narrows results", nSearch > 0 && nSearch <= 20 && count(await status()) === total);
  check("synonym hint is shown", /also matching/.test(await p.textContent("#terms")), (await p.textContent("#terms")).slice(0, 60));
  await p.fill("#q", "zzzzqqqq"); await p.waitForTimeout(200);
  check("no match shows the empty state", (await p.$$(".card")).length === 0 && /No matches/.test(await p.textContent("#list")));
  await p.fill("#q", ""); await p.waitForTimeout(100);

  // chips toggle the query
  await p.click('.chip[data-q="comedy"]'); await p.waitForTimeout(150);
  check("chip fills the search box and marks itself on", (await p.inputValue("#q")) === "comedy" && (await p.$eval('.chip[data-q="comedy"]', (e) => e.classList.contains("on"))));
  await p.click('.chip[data-q="comedy"]'); await p.waitForTimeout(100);
  check("chip again clears it", (await p.inputValue("#q")) === "");
  check("classes chip exists", (await p.$$('.chip[data-q="classes"]')).length === 1);

  // quick filter: free only
  await p.click('.qc[data-k="free"]'); await p.waitForTimeout(200);
  const pillText = await p.$$eval(".card", (cs) => cs.map((c) => (c.querySelector(".pills") ? c.querySelector(".pills").textContent : "")));
  check("Free only keeps only free events", pillText.length > 0 && pillText.every((t) => /FREE/.test(t)), pillText.length + " cards");
  await p.click('.qc[data-k="free"]'); await p.waitForTimeout(100);

  // hide sold out: on by default, and turning it off never shrinks the list
  const isOn = () => p.evaluate(() => { const e = document.getElementById("hide"); return typeof e.checked === "boolean" && e.type === "checkbox" ? e.checked : e.getAttribute("aria-pressed") === "true"; });
  check("hide sold out is on by default", (await isOn()) === true);
  const before = count(await status());
  await p.click("#hide"); await p.waitForTimeout(200);
  check("hide sold out can be turned off", (await isOn()) === false);
  await p.click("#hide"); await p.waitForTimeout(100);
  check("and back on", (await isOn()) === true && before > 0);

  // pagination
  await p.click('#pager button[data-d="next"]'); await p.waitForTimeout(300);
  check("pager next goes to page 2", /Page 2 of/.test(await p.textContent("#pager")));
  await p.click('#pager button[data-d="prev"]'); await p.waitForTimeout(300);
  check("pager prev goes back", /Page 1 of/.test(await p.textContent("#pager")));

  // save + saved tab + persistence
  const firstTitle = (await titles())[0];
  await p.click('.card [data-act="save"] >> nth=0');
  check("heart marks the event saved and counts it", (await p.textContent("#sc")) === "1");
  await p.click('.tab[data-t="saved"]'); await p.waitForTimeout(200);
  check("Saved tab lists it", (await titles()).join() === firstTitle);
  await p.reload(); await p.waitForSelector(".card");
  check("saved events survive a reload", (await p.textContent("#sc")) === "1");
  await p.click('.tab[data-t="saved"]'); await p.waitForTimeout(200);
  await p.click('.card [data-act="save"] >> nth=0'); await p.waitForTimeout(200);
  check("unsaving empties the list", /Nothing saved/.test(await p.textContent("#list")));
  await p.click('.tab[data-t="all"]'); await p.waitForTimeout(200);

  // calendar menu: one button per card, two choices
  await p.click('.card [data-act="calmenu"] >> nth=0');
  check("calendar button opens a menu with two choices", (await p.$$eval(".cal-menu button", (x) => x.map((y) => y.textContent.trim()))).join("|") === "Google Calendar|Apple Calendar (.ics)");
  await p.keyboard.press("Escape");
  check("Escape closes the menu", (await p.$$(".cal-menu")).length === 0);
  await p.click('.card [data-act="calmenu"] >> nth=0');
  await p.mouse.click(5, 300);
  check("clicking elsewhere closes it", (await p.$$(".cal-menu")).length === 0);
  const dl = p.waitForEvent("download", { timeout: 4000 }).catch(() => null);
  await p.click('.card [data-act="calmenu"] >> nth=0');
  await p.click('.cal-menu [data-m="ics"]');
  const d = await dl;
  check("calendar file downloads (.ics)", !!d && /\.ics$/.test(d.suggestedFilename()), d ? d.suggestedFilename() : "none");
  check("menu closes after choosing", (await p.$$(".cal-menu")).length === 0);
  const pop = p.waitForEvent("popup", { timeout: 4000 }).catch(() => null);
  await p.click('.card [data-act="calmenu"] >> nth=0');
  await p.click('.cal-menu [data-m="gcal"]');
  const pw = await pop;
  check("Google Calendar opens in a new tab", !!pw, pw ? pw.url().slice(0, 50) : "none");
  if (pw) await pw.close();

  // card structure
  const card = await p.$eval(".card", (c) => ({ link: !!c.querySelector("a.main[href^='http']"), time: !!c.querySelector(".time"), title: !!c.querySelector(".title"), badge: !!c.querySelector(".badge"), acts: c.querySelectorAll(".acts button").length }));
  check("card has link, time, title, source badge and 2 actions (save, calendar)", card.link && card.time && card.title && card.badge && card.acts === 2, JSON.stringify(card));
  check("no page errors", errs.length === 0, errs.join(";"));
  await b.close();
  console.log(failures ? `\n${failures} FAILED` : "\nclassic flow: all checks passed");
  process.exit(failures ? 1 : 0);
})();
