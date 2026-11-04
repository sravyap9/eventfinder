// Sidequests classic page: state, event handlers and the render loop. Plain JavaScript, no framework.
// The pieces live next to this file: time.js, filters.js, calendar.js (pure), cards.js (HTML builders).
// events.json is untrusted input (scraped from other sites): only usableEvents() may admit records, and only cards.js
// may turn them into HTML.
import { esc, usableEvents, SOURCE_NAMES } from "../shared/events.js";
import { hayOf } from "../shared/text.js";
import { buildGroups, expandQuery, matchesAny } from "../shared/search.js";
import { revealAll } from "../ui/reveal.js";
import { TZS, live, ago } from "./time.js";
import { matchesQuick } from "./filters.js";
import { gcalUrl, downloadIcs } from "./calendar.js";
import { listHtml } from "./cards.js";

const $ = (id) => document.getElementById(id);
const PER = 20;                                                   // events per page
const CHIPS = ["art", "classes", "run club", "comedy", "food", "music", "networking", "wellness", "books"];
const CHIP_COLORS = ["blush", "blue", "peri", "mustard", "apricot"];
const QUICK = [["tonight", "Tonight"], ["weekend", "This weekend"], ["free", "Free only"]];

// ---------- storage (every access guarded: it throws in private windows and when site data is blocked) ----------
const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* run without saving */ } },
};

// ---------- state ----------
let events = [], byUrl = new Map(), groups = [], counts = {}, updated = null;
let city = "Chicago", tab = "all", page = 1, hideSold = true, animate = true;
const quick = { tonight: false, weekend: false, free: false };
const saved = new Set((a => (Array.isArray(a) ? a : []))(store.get("saved", [])));
let fresh = new Set();
try { const c = localStorage.getItem("city"); if (TZS[c]) city = c; } catch { /* default city */ }

// NEW pills: compare with the list stored at the previous visit. A visit within 30 minutes of the stored one keeps that
// baseline, so the pills survive a reload.
function markNew() {
  const s = store.get("visit", null), now = Date.now(), cur = events.map((e) => e.url);
  if (s && Array.isArray(s.urls)) {
    if (now - s.t < 30 * 6e4) { fresh = new Set(s.fresh || []); return; }
    const prev = new Set(s.urls);
    fresh = new Set(cur.filter((u) => !prev.has(u)));
  }
  store.set("visit", { t: now, urls: cur, fresh: [...fresh] });
}

// ---------- loading ----------
const v = Date.now();
Promise.all([fetch("events.json?v=" + v).then((r) => r.json()), fetch("synonyms.json?v=" + v).then((r) => r.json())]).then(([d, syn]) => {
  events = usableEvents(d);                                       // keeps only well formed records with clean links
  groups = buildGroups(syn);
  counts = d.counts || {}; updated = new Date(d.last_updated);
  byUrl = new Map(events.map((e) => [e.url, e]));
  markNew(); buildCities(); render();
}).catch((e) => { $("status").textContent = "Failed to load events: " + e; $("list").setAttribute("aria-busy", "false"); });

// ---------- controls ----------
$("chips").innerHTML = CHIPS.map((c, i) => `<button class="chip" data-q="${c}" style="background:var(--${CHIP_COLORS[i % CHIP_COLORS.length]})">${c}</button>`).join("");
$("quick").innerHTML = QUICK.map(([k, l]) => `<button class="qc" data-k="${k}" aria-pressed="false">${l}</button>`).join("");

$("chips").addEventListener("click", (e) => {
  const b = e.target.closest(".chip"); if (!b) return;
  $("q").value = $("q").value.trim().toLowerCase() === b.dataset.q ? "" : b.dataset.q;
  page = 1; render();
});
$("quick").addEventListener("click", (e) => {
  const b = e.target.closest(".qc"); if (!b) return;
  quick[b.dataset.k] = !quick[b.dataset.k]; page = 1; render();
});
document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab"); if (!b) return;
  tab = b.dataset.t; page = 1; animate = true; render();
});
$("hide").addEventListener("click", () => { hideSold = !hideSold; page = 1; render(); });
$("q").addEventListener("input", () => { page = 1; render(); });
$("status").addEventListener("click", () => { const open = $("srcs").hidden; $("srcs").hidden = !open; $("status").setAttribute("aria-expanded", open); });
$("pager").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  page += b.dataset.d === "next" ? 1 : -1; animate = true; render();
  $("list").scrollIntoView({ behavior: "smooth", block: "start" });
});

function buildCities() {                                          // the city switch only shows when more than one city has data
  const list = Object.keys(counts).filter((c) => TZS[c]);
  if (!list.includes(city)) city = list[0] || "Chicago";
  $("cities").hidden = list.length < 2;
  $("cities").innerHTML = list.map((c) => `<button class="city" data-c="${c}" aria-pressed="false">${c}</button>`).join("");
}
$("cities").addEventListener("click", (e) => {
  const b = e.target.closest(".city"); if (!b) return;
  city = b.dataset.c; try { localStorage.setItem("city", city); } catch { /* not saved */ }
  page = 1; animate = true; render();
});

// save / calendar buttons on each card
$("list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const ev = byUrl.get(b.closest(".card").dataset.u); if (!ev) return;
  if (b.dataset.act === "calmenu") return openCalendarMenu(b, ev);
  saved.has(ev.url) ? saved.delete(ev.url) : saved.add(ev.url);
  store.set("saved", [...saved]);
  if (tab === "saved") return render();
  b.classList.toggle("on", saved.has(ev.url));
  if (saved.has(ev.url)) { b.classList.add("pop"); setTimeout(() => b.classList.remove("pop"), 260); }   // a small heart bounce
  updateSavedCount();
});

// ---------- calendar menu: one small popover shared by every card ----------
let menu = null, menuOwner = null, menuScrollY = 0;
function closeCalendarMenu(returnFocus) {
  if (!menu) return;
  menu.parentNode.removeChild(menu); menu = null;
  document.removeEventListener("click", outsideClick, true); document.removeEventListener("keydown", menuKeys, true); window.removeEventListener("scroll", closeOnScroll, true);
  if (returnFocus && menuOwner) menuOwner.focus({ preventScroll: true });
  menuOwner = null;
}
// A click outside closes the menu. The button that opened it is excluded: its own handler toggles the menu, and ignoring it
// here means this listener can be attached immediately (no timer, so no race with a fast second click).
const outsideClick = (e) => { if (menu && !menu.contains(e.target) && !(menuOwner && menuOwner.contains(e.target))) closeCalendarMenu(false); };
// The menu is fixed to the screen, so it must close when the page really scrolls away from the button. But a browser can
// deliver a scroll event late (the end of the scroll that brought the card into view), after the menu has opened. Only
// close if the page has moved since it opened.
const closeOnScroll = () => { if (Math.abs(scrollY - menuScrollY) > 16) closeCalendarMenu(false); };
const menuKeys = (e) => {
  if (e.key === "Escape") return closeCalendarMenu(true);
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const items = [...menu.querySelectorAll("button")], i = items.indexOf(document.activeElement);
  items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); e.preventDefault();
};
function openCalendarMenu(btn, ev) {
  const reopen = menuOwner !== btn;                                           // tapping the same button again just closes it
  closeCalendarMenu(false);
  if (!reopen) return;
  menu = document.createElement("div"); menuOwner = btn;
  menu.className = "cal-menu"; menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "Add to calendar");
  menu.innerHTML = '<button role="menuitem" data-m="gcal">Google Calendar</button><button role="menuitem" data-m="ics">Apple Calendar (.ics)</button>';
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.top = Math.max(8, r.bottom + h + 8 > innerHeight ? r.top - h - 4 : r.bottom + 4) + "px";   // below the button, or above when it would run off screen
  menu.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + "px";
  menu.addEventListener("click", (e) => {
    const m = e.target.closest("[data-m]"); if (!m) return;
    closeCalendarMenu(true);
    m.dataset.m === "gcal" ? window.open(gcalUrl(ev), "_blank", "noopener,noreferrer") : downloadIcs(ev);
  });
  // preventScroll matters: without it the browser scrolls the focused item into view, and with smooth scrolling on that
  // became a long animated page jump the moment the menu opened (which then closed the menu via the scroll listener).
  menu.querySelector("button").focus({ preventScroll: true });
  menuScrollY = scrollY;
  document.addEventListener("click", outsideClick, true); document.addEventListener("keydown", menuKeys, true); window.addEventListener("scroll", closeOnScroll, true);
}

// ---------- rendering ----------
const savedList = () => events.filter((e) => saved.has(e.url) && live(e));
const updateSavedCount = () => { $("sc").textContent = savedList().length; };
const hayCache = new WeakMap();                                                // stemmed text per event, built on first search
const hay = (e) => hayCache.get(e) || (hayCache.set(e, hayOf(e.title + " " + e.description)), hayCache.get(e));

function renderStatus() {
  const per = {};
  for (const e of events) if (e.city === city) per[e.source] = (per[e.source] || 0) + 1;
  const srcs = Object.entries(per).sort((a, b) => b[1] - a[1]), total = srcs.reduce((n, [, c]) => n + c, 0);
  const minutes = updated ? (Date.now() - updated) / 6e4 : 0;
  $("status").textContent = `${total} events · ${srcs.length} sources · updated ${ago(minutes)}`;
  $("srcs").innerHTML = srcs.map(([k, c]) => `<span class="badge ${esc(k)}">${esc(SOURCE_NAMES[k] || k)} ${c}</span>`).join("");
}

function render() {
  const q = $("q").value, { keys, shown } = expandQuery(groups, q);
  // control states
  document.querySelectorAll(".city").forEach((c) => { const on = c.dataset.c === city; c.classList.toggle("on", on); c.setAttribute("aria-pressed", on); c.textContent = (on ? "✓ " : "") + c.dataset.c; });
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.t === tab));
  document.querySelectorAll(".qc").forEach((c) => { c.classList.toggle("on", quick[c.dataset.k]); c.setAttribute("aria-pressed", !!quick[c.dataset.k]); });
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c.dataset.q === q.trim().toLowerCase()));
  $("hide").classList.toggle("on", hideSold); $("hide").setAttribute("aria-pressed", hideSold);
  updateSavedCount(); renderStatus();
  $("terms").textContent = tab === "all" && shown.length ? "also matching: " + shown.join(", ") : "";

  // the list: events that have not ended, in this city, passing every filter, soonest first
  const list = (tab === "saved" ? savedList()
    : events.filter((e) => e.city === city && live(e) && !(hideSold && e.sold_out) && matchesQuick(e, quick) && matchesAny(hay(e), keys)))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  const pages = Math.max(1, Math.ceil(list.length / PER)); page = Math.min(page, pages);
  $("pager").hidden = pages < 2;
  $("pager").innerHTML = `<button data-d="prev"${page < 2 ? " disabled" : ""}>Prev</button><span>Page ${page} of ${pages}</span><button data-d="next"${page >= pages ? " disabled" : ""}>Next</button>`;

  $("list").setAttribute("aria-busy", "false");
  const doAnimate = animate; animate = false;                                  // only the first load and page, tab or city changes animate
  if (!list.length) {
    $("list").innerHTML = '<div class="empty">' + (tab === "saved" ? "Nothing saved yet. Tap the heart on an event." : "No matches. Try a broader word.") + "</div>";
    return;
  }
  $("list").innerHTML = listHtml(list.slice((page - 1) * PER, page * PER), { saved, fresh, animate: doAnimate });
  if (doAnimate) revealAll($("list"));
}
