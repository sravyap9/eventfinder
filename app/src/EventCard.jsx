import React, { useState } from "react";
import { why } from "./ml.js";
import { NAMES, when, gcalUrl, share } from "./util.js";

function Pill({ e }) {
  if (e.waitlist) return <span className="pill wait">WAITLIST</span>;
  if (e.is_free) return <span className="pill free">{e.price_source === "c" ? "~FREE" : "FREE"}</span>;
  if (/click for \$/i.test(e.price_text || "")) return <span className="pill dashed">{e.price_text}</span>;
  return e.price_text ? <span className="pill">{e.price_text}</span> : null;
}

// c = { it, p }. Pass model + surface + onRate to show the "because" line and the thumbs.
export default function EventCard({ c, model, surface, onRate, position }) {
  const e = c.it.e, [open, setOpen] = useState(false), [msg, setMsg] = useState("");
  const reasons = model ? why(model, c.it, surface) : [];
  return (
    <li className="card">
      <a className="main" href={e.url} target="_blank" rel="noopener">
        <div className="when">{when(e)}</div>
        <div className="title">{e.title}</div>
        <div className="row">
          <span className="venue">{(e.venue || "").split(",")[0]}</span>
          <span className={"badge " + e.source}>{NAMES[e.source] || e.source}</span>
        </div>
        <div className="pills">
          <Pill e={e} />
          {e.sold_out && !e.waitlist ? <span className="pill sold">SOLD OUT</span> : null}
          {e.age_min ? <span className="pill age">{e.age_min}+</span> : null}
          {e.few_left && !e.sold_out ? <span className="pill few">few left</span> : null}
        </div>
      </a>
      {model && (
        <p className="why">{reasons.length ? "Because: " + reasons.join(" · ") : "A wildcard to learn your taste"}
          <span className="match"> {Math.round(c.p * 100)}% match</span></p>
      )}
      <button className="more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide details" : "Details"}</button>
      {open && (
        <div className="details">
          <p>{e.description || "No description listed. Open the event page for more."}</p>
          {e.venue && <p className="hint">{e.venue}</p>}
          <div className="acts">
            <a className="ghost small" href={gcalUrl(e)} target="_blank" rel="noopener">Add to Google Calendar</a>
            <button className="ghost small" onClick={async () => setMsg(await share(e.title, e.url))}>{msg || "Share"}</button>
          </div>
        </div>
      )}
      {onRate && (
        <div className="rate">
          <button onClick={() => onRate(c.it, 1, { position, p: c.p })} aria-label={"More like " + e.title}>👍 More like this</button>
          <button onClick={() => onRate(c.it, 0, { position, p: c.p })} aria-label={"Less like " + e.title}>👎 Not for me</button>
        </div>
      )}
    </li>
  );
}
