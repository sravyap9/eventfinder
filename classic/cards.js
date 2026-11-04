// HTML builders for the event list. They return strings (the page renders with innerHTML), so EVERY value that came from
// events.json goes through esc(), and every link through safeHref(). Nothing else in this file may touch event data.
import { esc, safeHref, SOURCE_NAMES } from "../shared/events.js";
import { tzOf, clock, dayHeader } from "./time.js";

const ICONS = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.4-9.3-9C1 8.6 3 5 6.5 5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3C21 5 23 8.6 21.3 12 19 16.6 12 21 12 21z"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5"/></svg>',
};
const DAY_COLORS = ["blush", "blue", "peri", "mustard"];   // the tint behind each day block, in turn

const venueName = (s) => ((s || "").split(",").map((p) => p.trim()).filter(Boolean))[0] || "";
const kilo = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : n);

export function pillsHtml(e, isNew) {
  const p = [];
  if (isNew) p.push('<span class="pill new">NEW</span>');
  if (e.waitlist) p.push('<span class="pill wait">WAITLIST</span>');
  else if (e.sold_out) p.push('<span class="pill sold">SOLD OUT</span>');
  if (e.is_free) p.push(`<span class="pill free">${e.price_source === "c" ? "~FREE" : "FREE"}</span>`);
  else if (/click for \$/i.test(e.price_text || "")) p.push(`<span class="pill click">${esc(e.price_text)}</span>`);
  else if (e.price_text) p.push(`<span class="pill">${esc(e.price_text)}</span>`);
  if (e.original_price_text) p.push(`<span class="pill"><s>${esc(e.original_price_text)}</s></span>`);
  if (e.age_min) p.push(`<span class="pill age">${esc(e.age_min)}+</span>`);
  if (e.few_left && !e.sold_out) p.push('<span class="pill few">few left</span>');
  if (e.interested_count > 0) p.push(`<span class="pill">🔥 ${kilo(e.interested_count)}</span>`);
  return p.join("");
}

export function cardHtml(e, { saved, isNew }) {
  const d = new Date(e.start), tz = tzOf(e), vn = venueName(e.venue);
  const act = (name, label, icon, on) => `<button class="ic${on ? " on" : ""}" data-act="${name}" aria-label="${label}" title="${label}">${icon}</button>`;
  return `<div class="card${e.sold_out ? " soldout" : ""}" data-u="${esc(e.url)}">` +
    `<a class="main" href="${esc(safeHref(e.url))}" target="_blank" rel="noopener noreferrer">` +
      `<div class="meta"><span class="time">${clock(d, tz)}</span>${vn ? `<span class="venue">${esc(vn)}</span>` : ""}</div>` +
      `<div class="title">${esc(e.title)}</div>` +
      `<div class="pills">${pillsHtml(e, isNew)}<span class="badge ${esc(e.source)}">${esc(SOURCE_NAMES[e.source] || e.source)}</span></div>` +
    `</a><div class="acts">${act("save", "Save event", ICONS.heart, saved)}${act("calmenu", "Add to calendar", ICONS.cal)}</div></div>`;
}

// The list for one page: events grouped under day headings. animate adds the scroll reveal (first load and page turns,
// not every keystroke, so typing in the search box never makes the list flicker).
export function listHtml(events, { saved, fresh, animate }) {
  let html = "", last = "", n = -1;
  for (const e of events) {
    const d = new Date(e.start), tz = tzOf(e), hd = dayHeader(d, tz);
    if (hd !== last) {
      if (last) html += "</section>";
      n++; last = hd;
      html += `<section class="day${animate ? " reveal" : ""}" style="--c:var(--${DAY_COLORS[n % DAY_COLORS.length]});--d:${(n % 3) * 30}ms"><h2>${esc(hd)}</h2>`;
    }
    html += cardHtml(e, { saved: saved.has(e.url), isNew: fresh.has(e.url) });
  }
  return html + "</section>";
}
