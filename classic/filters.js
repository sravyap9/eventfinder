// The "Tonight / This weekend / Free only" quick filters. Pure, so the date logic can be tested without a browser.
import { dayNum, dow, parts, tzOf, live } from "./time.js";

// quick: { tonight, weekend, free } booleans. Tonight is 5pm or later today; the weekend is Friday 5pm to Sunday night.
export function matchesQuick(e, quick, now = new Date()) {
  if (quick.free && !e.is_free) return false;
  if (!quick.tonight && !quick.weekend) return true;
  if (!live(e, +now)) return false;
  const tz = tzOf(e), d = new Date(e.start);
  const day = dayNum(d, tz), today = dayNum(now, tz), h = +parts(d, tz).hour;
  if (quick.tonight && !(day === today && h >= 17)) return false;
  if (quick.weekend) {
    const w = dow(today), fri = w === 0 ? today - 2 : w === 6 ? today - 1 : w === 5 ? today : today + (5 - w);
    if (!(day >= fri && day <= fri + 2 && (day > fri || h >= 17))) return false;
  }
  return true;
}
