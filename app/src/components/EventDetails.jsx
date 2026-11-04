// The expanded part of a card: full description, venue, add to calendar, share.
import React, { useState } from "react";
import { gcalUrl, share } from "../util.js";
import { safeHref } from "../../../shared/events.js";

export default function EventDetails({ e }) {
  const [msg, setMsg] = useState("");
  return (
    <div className="details step-in">
      <p>{e.description || "No description listed. Open the event page for more."}</p>
      {e.venue && <p className="hint">{e.venue}</p>}
      <div className="acts-row">
        <a className="ghost" href={gcalUrl(e)} target="_blank" rel="noopener noreferrer">Add to Google Calendar</a>
        <button className="ghost" onClick={async () => setMsg(await share(e.title, safeHref(e.url)))}>{msg || "Share"}</button>
      </div>
    </div>
  );
}
