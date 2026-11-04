import React, { useMemo, useState } from "react";
import { eligible, recommend, topWeights } from "./ml.js";
import { share } from "./util.js";
import { answersToHash } from "./quiz.js";
import EventCard from "./EventCard.jsx";
import { trackingAvailable, getConsent, setConsent, logSession } from "./track.js";

export default function Results({ index, model, filters, rated, answers, canUndo, onRate, onUndo, onRetake }) {
  const [k, setK] = useState(10), [msg, setMsg] = useState(""), [consent, setC] = useState(getConsent());
  const cands = useMemo(() => eligible(index.items, filters, Date.now(), rated), [index, filters, rated]);
  const picks = useMemo(() => recommend(model, cands, k), [model, cands, k]);
  const tw = useMemo(() => topWeights(model, index.surface), [model, index]);
  const nRated = Object.keys(rated).length;
  const link = () => location.origin + location.pathname + answersToHash(answers);

  return (
    <section>
      <div className="bar">
        <h2>Your picks</h2>
        <div className="acts">
          <button className="ghost small" onClick={async () => setMsg(await share("My Sidequests picks", link()))}>{msg || "Share my quiz"}</button>
          <button className="ghost small" onClick={onRetake}>Retake quiz</button>
        </div>
      </div>
      {trackingAvailable && consent === null && (
        <div className="consent" role="region" aria-label="Help improve recommendations">
          <p><strong>Help improve the picks?</strong> If you say yes, your quiz answers and thumbs up or down are saved anonymously
            (no name, no email) and used to train a better model. You can say no and everything still works. <a href="../privacy.html" target="_blank" rel="noopener">Privacy details</a></p>
          <div className="acts">
            <button className="primary small" onClick={() => { setConsent("yes"); setC("yes"); logSession(answers); }}>Yes, share anonymously</button>
            <button className="ghost small" onClick={() => { setConsent("no"); setC("no"); }}>No thanks</button>
          </div>
        </div>
      )}
      <p className="hint">
        {cands.length.toLocaleString()} events fit your filters. Tap 👍 or 👎 and the model retrains on the spot.
        {nRated ? ` ${nRated} rated so far.` : ""}
        {canUndo && <> <button className="linklike" onClick={onUndo}>Undo last rating</button></>}
      </p>
      {picks.length === 0
        ? <p className="note">Nothing matches those answers. Retake the quiz with a wider window.</p>
        : <ul className="cards">{picks.map((c, i) => <EventCard key={c.it.id} c={c} position={i} model={model} surface={index.surface} onRate={onRate} />)}</ul>}
      {k < 40 && picks.length === k && <div className="nav center"><button className="ghost" onClick={() => setK(k + 10)}>Show 10 more</button></div>}
      <details className="model">
        <summary>What the model has learned about you</summary>
        <div className="cols">
          <div><h3>Pulls toward</h3><ul>{tw.pos.map(([n, v]) => <li key={n}><span>{n}</span><i style={{ width: Math.min(100, v * 40) + "%" }} /></li>)}</ul></div>
          <div><h3>Pushes away</h3><ul>{tw.neg.map(([n, v]) => <li key={n} className="neg"><span>{n}</span><i style={{ width: Math.min(100, -v * 40) + "%" }} /></li>)}</ul></div>
        </div>
        <p className="hint">Logistic regression over TF-IDF words, interest groups, price, time and day. The quiz sets the starting weights; every rating is one SGD step. It runs in your browser and nothing is sent anywhere.</p>
      </details>
    </section>
  );
}
