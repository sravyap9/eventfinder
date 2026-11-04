// "Add to calendar": a Google Calendar link, and an .ics file generated in the browser for Apple Calendar and others.
// Event text is untrusted, so every value is escaped and the link is stripped of line breaks (an .ics is line based,
// and a newline in a title could otherwise start a new property or event).
import { safeHref } from "../shared/events.js";
import { tzOf, parts } from "./time.js";

const VTZ = { "America/Chicago": ["CST", "-0600", "CDT", "-0500"], "America/New_York": ["EST", "-0500", "EDT", "-0400"] };
const EVENT_HOURS = 2;   // listings carry no end time, so every event is assumed to last two hours

const ical = (t) => String(t || "").replace(/[\\;,]/g, "\\$&").replace(/\r?\n/g, "\\n");
const fold = (l) => { let o = ""; while (l.length > 74) { o += l.slice(0, 74) + "\r\n "; l = l.slice(74); } return o + l; };   // RFC 5545 line folding
const stamp = (d, tz) => { const p = parts(d, tz); return p.year + p.month + p.day + "T" + p.hour + p.minute + p.second; };
const hash = (s) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) | 0; return (x >>> 0).toString(36); };

export function gcalUrl(e) {
  const s = new Date(e.start), end = new Date(+s + EVENT_HOURS * 36e5), z = (d) => stamp(d, "UTC") + "Z";
  return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent(e.title) + "&dates=" + z(s) + "/" + z(end) +
    "&details=" + encodeURIComponent(e.url) + "&location=" + encodeURIComponent(e.venue || "");
}

export function icsText(e, now = new Date()) {
  const tz = tzOf(e), [sn, so, dn, dof] = VTZ[tz], s = new Date(e.start), end = new Date(+s + EVENT_HOURS * 36e5);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//sidequests//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE", "TZID:" + tz,
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:" + so, "TZOFFSETTO:" + dof, "TZNAME:" + dn, "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:" + dof, "TZOFFSETTO:" + so, "TZNAME:" + sn, "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
    "END:VTIMEZONE", "BEGIN:VEVENT", "UID:" + hash(e.url) + "@sidequests", "DTSTAMP:" + stamp(now, "UTC") + "Z",
    `DTSTART;TZID=${tz}:${stamp(s, tz)}`, `DTEND;TZID=${tz}:${stamp(end, tz)}`,
    "SUMMARY:" + ical(e.title), "LOCATION:" + ical(e.venue), "URL:" + safeHref(e.url).replace(/[\r\n]/g, ""), "DESCRIPTION:" + ical(e.url),
    "END:VEVENT", "END:VCALENDAR"];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadIcs(e) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([icsText(e)], { type: "text/calendar;charset=utf-8" }));
  a.download = (e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "event") + ".ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
