import React, { useMemo, useState } from "react";
import { searchKeys, matchesKeys } from "./ml.js";
import EventCard from "./EventCard.jsx";

const PER = 18;

export default function Browse({ index }) {
  const [q, setQ] = useState(""), [free, setFree] = useState(false), [weekend, setWeekend] = useState(false);
  const [hideSold, setHideSold] = useState(true), [range, setRange] = useState("week"), [shown, setShown] = useState(PER);

  const list = useMemo(() => {
    const now = Date.now(), keys = searchKeys(q), horizon = (range === "week" ? 7 : 40) * 864e5;
    return index.items
      .filter((it) => {
        const t = Date.parse(it.e.start);
        return t + 2 * 36e5 >= now && t <= now + horizon && !(hideSold && it.e.sold_out) && !(free && !it.e.is_free)
          && !(weekend && !it.f["day:weekend"]) && matchesKeys(it, keys);
      })
      .sort((a, b) => Date.parse(a.e.start) - Date.parse(b.e.start));
  }, [index, q, free, weekend, hideSold, range]);

  const reset = (fn) => (v) => { fn(v); setShown(PER); };
  return (
    <section>
      <h2>Browse everything</h2>
      <input className="search" type="search" value={q} placeholder="Search, like painting or trivia" aria-label="Search events"
             onChange={(e) => reset(setQ)(e.target.value)} />
      <div className="options small">
        <button className={"opt" + (range === "week" ? " on" : "")} aria-pressed={range === "week"} onClick={() => reset(setRange)(range === "week" ? "all" : "week")}>
          {range === "week" ? "✓ Next 7 days" : "Next few weeks"}</button>
        <button className={"opt" + (free ? " on" : "")} aria-pressed={free} onClick={() => reset(setFree)(!free)}>{free ? "✓ " : ""}Free only</button>
        <button className={"opt" + (weekend ? " on" : "")} aria-pressed={weekend} onClick={() => reset(setWeekend)(!weekend)}>{weekend ? "✓ " : ""}Weekend</button>
        <button className={"opt" + (hideSold ? " on" : "")} aria-pressed={hideSold} onClick={() => reset(setHideSold)(!hideSold)}>{hideSold ? "✓ " : ""}Hide sold out</button>
      </div>
      <p className="hint">{list.length.toLocaleString()} events{range === "week" ? " in the next 7 days" : ""}.</p>
      {list.length === 0
        ? <p className="note">No matches. Try a broader word or turn off a filter.</p>
        : <ul className="cards">{list.slice(0, shown).map((it) => <EventCard key={it.id} c={{ it }} />)}</ul>}
      {shown < list.length && <div className="nav center"><button className="ghost" onClick={() => setShown(shown + PER)}>Show more</button></div>}
    </section>
  );
}
