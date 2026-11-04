// Browse everything: search, four filters, and a list that grows with "Show more". Newest first is never assumed: soonest first.
import React, { useMemo, useState } from "react";
import { searchKeys, matchesKeys } from "./ml.js";
import EventCard from "./components/EventCard.jsx";

const PER = 18;
const DAY = 864e5;

function Toggle({ on, onClick, children, checkmark = true }) {
  return <button className={"opt" + (on ? " on" : "")} aria-pressed={on} onClick={onClick}>{on && checkmark ? "✓ " : ""}{children}</button>;
}

export default function Browse({ index }) {
  const [q, setQ] = useState(""), [free, setFree] = useState(false), [weekend, setWeekend] = useState(false);
  const [hideSold, setHideSold] = useState(true), [range, setRange] = useState("week"), [shown, setShown] = useState(PER);
  const reset = (fn) => (v) => { fn(v); setShown(PER); };     // any filter change starts the list over

  const list = useMemo(() => {
    const now = Date.now(), keys = searchKeys(q), horizon = (range === "week" ? 7 : 40) * DAY;
    return index.items
      .filter((it) => {
        const t = Date.parse(it.e.start);
        return t + 2 * 36e5 >= now && t <= now + horizon && !(hideSold && it.e.sold_out) && !(free && !it.e.is_free)
          && !(weekend && !it.f["day:weekend"]) && matchesKeys(it, keys);
      })
      .sort((a, b) => Date.parse(a.e.start) - Date.parse(b.e.start));
  }, [index, q, free, weekend, hideSold, range]);

  return (
    <section className="step-in">
      <h2>Browse everything</h2>
      <input className="search" type="search" value={q} placeholder="Search, like painting or trivia" aria-label="Search events" onChange={(e) => reset(setQ)(e.target.value)} />
      <div className="options compact">
        <Toggle on={range === "week"} onClick={() => reset(setRange)(range === "week" ? "all" : "week")}>{range === "week" ? "Next 7 days" : "Next few weeks"}</Toggle>
        <Toggle on={free} onClick={() => reset(setFree)(!free)}>Free only</Toggle>
        <Toggle on={weekend} onClick={() => reset(setWeekend)(!weekend)}>Weekend</Toggle>
        <Toggle on={hideSold} onClick={() => reset(setHideSold)(!hideSold)}>Hide sold out</Toggle>
      </div>
      <p className="hint">{list.length.toLocaleString()} events{range === "week" ? " in the next 7 days" : ""}.</p>
      {list.length === 0
        ? <p className="note">No matches. Try a broader word or turn off a filter.</p>
        // Typing in the search box swaps the whole list on every keystroke, so cards only animate when not searching.
        : <ul className="cards">{list.slice(0, shown).map((it, i) => <EventCard key={it.id} c={{ it }} position={i} animate={!q} />)}</ul>}
      {shown < list.length && <div className="more"><button className="ghost" onClick={() => setShown(shown + PER)}>Show more</button></div>}
    </section>
  );
}
