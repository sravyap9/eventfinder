// Layout metrics for both pages at phone and laptop sizes. Run by hand (needs a browser), like security_check.js:
//   NODE_PATH=$(npm root -g) node tests/browser/ui_metrics.js http://localhost:8765 [label]
// Reports how much of the first screen is chrome (everything above the first event), vertical rhythm, tap targets and type.
const { chromium } = require("playwright");
const base = process.argv[2] || "http://localhost:8765", label = process.argv[3] || "run";
const SIZES = [["iphone 393x852", 393, 852, true], ["laptop 1440x900", 1440, 900, false]];

async function metrics(page, sel) {
  return page.evaluate((sel) => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top + scrollY), h: Math.round(b.height) }; };
    const first = r(sel.card);
    const sizes = {}; document.querySelectorAll("body *").forEach((e) => { if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return; const s = getComputedStyle(e); const k = s.fontSize + " / " + s.lineHeight; sizes[k] = (sizes[k] || 0) + 1; });
    const gaps = []; const cards = [...document.querySelectorAll(sel.card)].slice(0, 6);
    for (let i = 1; i < cards.length; i++) { const a = cards[i - 1].getBoundingClientRect(), b = cards[i].getBoundingClientRect(); if (b.top > a.bottom) gaps.push(Math.round(b.top - a.bottom)); }
    const small = [...document.querySelectorAll("button, a.ghost, input, select, summary")].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.height < 44) && getComputedStyle(e).visibility !== "hidden"; }).map((e) => (e.className || e.tagName) + ":" + Math.round(e.getBoundingClientRect().height));
    return { firstCardTop: first && first.top, firstCardH: first && first.h, vh: innerHeight, chromePct: first ? Math.round(first.top / innerHeight * 100) : null,
      docH: document.documentElement.scrollHeight, cardGaps: gaps, distinctTypeStyles: Object.keys(sizes).length, typeStyles: Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, n]) => `${k} x${n}`),
      smallTargets: [...new Set(small)], overflowX: document.documentElement.scrollWidth > innerWidth,
      parts: Object.fromEntries(Object.entries(sel.parts).map(([k, s]) => [k, r(s)])) };
  }, sel);
}

(async () => {
  const b = await chromium.launch(); const out = {};
  for (const [name, w, h, mobile] of SIZES) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    const page = await ctx.newPage(); await page.route(/fonts\.g/, (r) => r.abort());
    await page.goto(base + "/index.html"); await page.waitForSelector(".card");
    out[name + " classic"] = await metrics(page, { card: ".card", parts: { header: "header", band: ".band", sticky: ".sticky", filters: ".filters", tabs: ".bar", firstDayHeading: ".day h2" } });
    const p2 = await ctx.newPage(); await p2.route(/fonts\.g/, (r) => r.abort()); await p2.goto(base + "/v2/"); await p2.waitForSelector(".quiz");
    out[name + " quiz step 1"] = await metrics(p2, { card: ".opt", parts: { header: "header", quiz: ".quiz", question: ".quiz h2", options: ".options", nav: ".nav" } });
    const opt = (t) => p2.click(`.opt:has-text("${t}")`), next = () => p2.click(".primary");
    await opt("Comedy"); await next(); await opt("Surprise me"); await next(); await opt("Doesn't matter"); await next(); await opt("Evenings"); await next(); await opt("Next few weeks"); await next(); await opt("Yes"); await next();
    await p2.waitForSelector(".card");
    out[name + " v2 picks"] = await metrics(p2, { card: ".card", parts: { header: "header", tabs: ".tabs", picksHead: ".picks-head", consent: ".consent", hint: ".hint" } });
    await ctx.close();
  }
  await b.close();
  require("fs").writeFileSync(`ui_metrics_${label}.json`, JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) {
    console.log(`\n== ${k}`);
    console.log(`   first card top: ${v.firstCardTop}px of ${v.vh}px viewport = ${v.chromePct}% of the first screen is chrome | doc height ${v.docH}px | overflowX ${v.overflowX}`);
    console.log(`   gaps between cards: ${JSON.stringify(v.cardGaps)} | distinct font size/line height pairs on page: ${v.distinctTypeStyles}`);
    console.log(`   parts (top,height): ${JSON.stringify(v.parts)}`);
    console.log(`   targets under 44px: ${JSON.stringify(v.smallTargets)}`);
  }
})();
