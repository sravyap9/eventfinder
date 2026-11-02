import React, { useMemo } from "react";
import { eligible, recommend, why, topWeights } from "./ml.js";

const NAMES = { luma: "Luma", eventbrite: "Eventbrite", partiful: "Partiful", pie: "Pie", do312: "Do312", donyc: "DoNYC",
  cpl: "Chicago Public Library", cpd: "Chicago Park District", coursehorse: "CourseHorse", ra: "Resident Advisor" };

function when(e) {
  const [y, m, d] = e.start.slice(0, 10).split("-").map(Number);
  const day = new Date(y, m - 1, d), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 864e5);
  const h = Number(e.start.slice(11, 13)), mm = e.start.slice(14, 16);
  const clock = `${h % 12 || 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
  const label = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${label} · ${clock}`;
}

function Pill({ e }) {
  if (e.is_free) return <span className="pill free">{e.price_source === "c" ? "~FREE" : "FREE"}</span>;
  if (/click for \$/i.test(e.price_text || "")) return <span className="pill dashed">{e.price_text}</span>;
  return e.price_text ? <span className="pill">{e.price_text}</span> : null;
}

function Card({ c, model, surface, onRate }) {
  const e = c.it.e, reasons = why(model, c.it, surface);
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
          {e.age_min ? <span className="pill age">{e.age_min}+</span> : null}
          {e.few_left ? <span className="pill few">few left</span> : null}
        </div>
      </a>
      <p className="why">{reasons.length ? "Because: " + reasons.join(" · ") : "A wildcard to learn your taste"}
        <span className="match"> {Math.round(c.p * 100)}% match</span></p>
      <div className="rate">
        <button onClick={() => onRate(c.it, 1)} aria-label={"More like " + e.title}>👍 More like this</button>
        <button onClick={() => onRate(c.it, 0)} aria-label={"Less like " + e.title}>👎 Not for me</button>
      </div>
    </li>
  );
}

export default function Results({ index, model, filters, rated, onRate, onRetake, updated }) {
  const cands = useMemo(() => eligible(index.items, filters, Date.now(), rated), [index, filters, rated]);
  const picks = useMemo(() => recommend(model, cands, 10), [model, cands]);
  const tw = useMemo(() => topWeights(model, index.surface), [model, index]);
  const nRated = Object.keys(rated).length;

  return (
    <section>
      <div className="bar">
        <h2>Your picks</h2>
        <button className="ghost" onClick={onRetake}>Retake quiz</button>
      </div>
      <p className="hint">
        {cands.length.toLocaleString()} events fit your filters. Tap 👍 or 👎 and the model retrains on the spot.
        {nRated ? ` ${nRated} rated so far.` : ""}
      </p>
      {picks.length === 0
        ? <p className="note">Nothing matches those answers. Retake the quiz with a wider window.</p>
        : <ul className="cards">{picks.map((c) => <Card key={c.it.id} c={c} model={model} surface={index.surface} onRate={onRate} />)}</ul>}
      <details className="model">
        <summary>What the model has learned about you</summary>
        <div className="cols">
          <div><h3>Pulls toward</h3><ul>{tw.pos.map(([k, v]) => <li key={k}><span>{k}</span><i style={{ width: Math.min(100, v * 40) + "%" }} /></li>)}</ul></div>
          <div><h3>Pushes away</h3><ul>{tw.neg.map(([k, v]) => <li key={k} className="neg"><span>{k}</span><i style={{ width: Math.min(100, -v * 40) + "%" }} /></li>)}</ul></div>
        </div>
        <p className="hint">Logistic regression over TF-IDF words, interest groups, price, time and day. The quiz sets the starting weights; every rating is one SGD step. It runs in your browser and nothing is sent anywhere.</p>
      </details>
      <p className="hint small">Events updated {new Date(updated).toLocaleString()}. Always check the event page before you go.</p>
    </section>
  );
}
