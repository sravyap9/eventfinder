// Handling of events.json on the page. Everything in it was scraped from other sites, so it is untrusted input.
// This is the one place that decides what is safe to show, used by both pages.

export const SOURCE_NAMES = {
  luma: "Luma", eventbrite: "Eventbrite", partiful: "Partiful", pie: "Pie", do312: "Do312", donyc: "DoNYC",
  cpl: "Chicago Public Library", cpd: "Chicago Park District", coursehorse: "CourseHorse", ra: "Resident Advisor", ticketmaster: "Ticketmaster",
};

// Escape before putting a value into HTML text or an attribute (the classic page builds HTML strings).
export const esc = (s) => String(s).replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));

// Only ever link to http(s) addresses: a javascript: link in an href runs when clicked.
export const safeHref = (u) => (/^https?:\/\//i.test(String(u)) ? String(u) : "#");

// An event is usable only if its fields have the right types, the link is a clean http(s) URL (no spaces or line breaks,
// which HTML attributes would silently rewrite and break lookups) and the start time parses.
export const isUsableEvent = (e) =>
  !!e && typeof e.title === "string" && typeof e.url === "string" && /^https?:\/\/\S+$/i.test(e.url) &&
  typeof e.start === "string" && !isNaN(Date.parse(e.start));

export const usableEvents = (data) => (Array.isArray(data && data.events) ? data.events : []).filter(isUsableEvent);
