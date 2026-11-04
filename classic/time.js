// Time helpers for the classic page. Pure functions (no DOM), so they run under `node --test` too.
// Event times are stored as ISO strings with an offset; everything is displayed in the event's own city timezone.

export const TZS = { Chicago: "America/Chicago", NYC: "America/New_York" };
export const tzOf = (e) => TZS[e.city] || TZS.Chicago;

// An event stays in the list until 2 hours after it starts.
export const live = (e, now = Date.now()) => +new Date(e.start) + 2 * 36e5 >= now;

export function parts(d, tz) {
  const o = {};
  for (const p of new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d)) o[p.type] = p.value;
  return o;
}
export const dayKey = (d, tz) => d.toLocaleDateString("en-CA", { timeZone: tz });
export const dayNum = (d, tz) => { const p = parts(d, tz); return Date.UTC(p.year, p.month - 1, p.day) / 864e5; };
export const dow = (n) => new Date(n * 864e5).getUTCDay();

export const clock = (d, tz) => d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });

// "Today", "Tomorrow", or "Wed, Nov 4"
export function dayHeader(d, tz, now = new Date()) {
  const k = dayKey(d, tz);
  if (k === dayKey(now, tz)) return "Today";
  if (k === dayKey(new Date(+now + 864e5), tz)) return "Tomorrow";
  return d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
}

// "just now", "25m ago", "3h ago", "2d ago"
export function ago(minutes) {
  const m = Math.max(0, Math.round(minutes));
  return m < 60 ? (m < 1 ? "just now" : m + "m ago") : m < 1440 ? Math.round(m / 60) + "h ago" : Math.round(m / 1440) + "d ago";
}
