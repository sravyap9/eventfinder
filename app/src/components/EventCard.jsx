// One event. Layout: [ meta, title, pills ][ details toggle ] / why / rating row / details.
// Pass model + surface + onRate for the "because" line and thumbs (the picks); leave them out for a plain card (browse).
import React, { useState } from "react";
import { why } from "../ml.js";
import { when } from "../util.js";
import { safeHref } from "../../../shared/events.js";
import { useReveal } from "../hooks/useReveal.js";
import EventPills from "./EventPills.jsx";
import EventDetails from "./EventDetails.jsx";

export default function EventCard({ c, model, surface, onRate, position = 0, animate = true }) {
  const e = c.it.e, [open, setOpen] = useState(false);
  const ref = useReveal(animate);
  const reasons = model ? why(model, c.it, surface) : [];
  const [day, clock] = when(e).split(" · ");
  return (
    <li ref={ref} className={animate ? "reveal" : undefined} style={{ "--d": (position % 3) * 30 + "ms" }}>
      <article className="card">
        <a className="main" href={safeHref(e.url)} target="_blank" rel="noopener noreferrer">
          <div className="meta"><span className="when">{day} · {clock}</span>{e.venue && <span className="venue">{e.venue.split(",")[0]}</span>}</div>
          <h3 className="title">{e.title}</h3>
          <EventPills e={e} />
        </a>
        <button className={"ic chevron" + (open ? " open" : "")} aria-expanded={open} aria-label={(open ? "Hide" : "Show") + " details for " + e.title} onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {model && (
          <p className="why">{reasons.length ? "Because: " + reasons.join(" · ") : "A wildcard to learn your taste"}
            <span className="match"> {Math.round(c.p * 100)}% match</span></p>
        )}
        {onRate && (
          <div className="rate">
            <button onClick={() => onRate(c.it, 1, { position, p: c.p })} aria-label={"More like " + e.title}>👍 More like this</button>
            <button onClick={() => onRate(c.it, 0, { position, p: c.p })} aria-label={"Less like " + e.title}>👎 Not for me</button>
          </div>
        )}
        {open && <EventDetails e={e} />}
      </article>
    </li>
  );
}
