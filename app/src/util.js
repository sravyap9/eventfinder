export const NAMES = { luma: "Luma", eventbrite: "Eventbrite", partiful: "Partiful", pie: "Pie", do312: "Do312", donyc: "DoNYC",
  cpl: "Chicago Public Library", cpd: "Chicago Park District", coursehorse: "CourseHorse", ra: "Resident Advisor", ticketmaster: "Ticketmaster" };

// Event links come from scraped sites, so treat them as untrusted: a javascript: URL in an href runs when clicked.
export const safeHref = (u) => (/^https?:\/\//i.test(String(u)) ? String(u) : "#");

// start strings look like 2026-11-04T19:30-06:00: the date and clock in them are already the event's local time
export function when(e) {
  const [y, m, d] = e.start.slice(0, 10).split("-").map(Number);
  const day = new Date(y, m - 1, d), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 864e5);
  const h = Number(e.start.slice(11, 13)), mm = e.start.slice(14, 16);
  const clock = `${h % 12 || 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
  const label = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${label} · ${clock}`;
}

export function gcalUrl(e) {
  const s = new Date(e.start), end = new Date(+s + 2 * 36e5), z = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(e.title) +
    "&dates=" + z(s) + "/" + z(end) + "&details=" + encodeURIComponent(safeHref(e.url)) + "&location=" + encodeURIComponent(e.venue || "");
}

// Share sheet on phones, clipboard on laptops. Resolves to a short message to show.
export async function share(title, url) {
  try {
    if (navigator.share) { await navigator.share({ title, url }); return "Shared"; }
    await navigator.clipboard.writeText(url);
    return "Link copied";
  } catch { return window.prompt("Copy this link:", url) === null ? "" : "Link ready"; }
}
