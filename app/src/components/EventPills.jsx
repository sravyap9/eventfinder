// The price and status pills on an event, plus its source badge. One place, used by every card.
import React from "react";
import { SOURCE_NAMES } from "../../../shared/events.js";

function PricePill({ e }) {
  if (e.is_free) return <span className="pill free">{e.price_source === "c" ? "~FREE" : "FREE"}</span>;   // ~ means guessed from the description
  if (/click for \$/i.test(e.price_text || "")) return <span className="pill click">{e.price_text}</span>;
  return e.price_text ? <span className="pill">{e.price_text}</span> : null;
}

export default function EventPills({ e }) {
  return (
    <div className="pills">
      {e.waitlist ? <span className="pill wait">WAITLIST</span> : e.sold_out ? <span className="pill sold">SOLD OUT</span> : null}
      <PricePill e={e} />
      {e.age_min ? <span className="pill age">{e.age_min}+</span> : null}
      {e.few_left && !e.sold_out ? <span className="pill few">few left</span> : null}
      <span className={"badge " + e.source}>{SOURCE_NAMES[e.source] || e.source}</span>
    </div>
  );
}
