// Sidequests quiz page. This file only wires things together: data (hooks/), saved state (store.js), the model (ml.js)
// and the screens. Flow: no saved model -> the quiz, which shows immediately (it needs no data) -> picks + browse.
import React, { useEffect, useMemo, useState } from "react";
import { fromQuiz, learn } from "./ml.js";
import { initialState, save } from "./store.js";
import { getConsent, logSession, logRating, startSession } from "./track.js";
import { useEvents } from "./hooks/useEvents.js";
import { useIndex } from "./hooks/useIndex.js";
import { useSharedModel } from "./hooks/useSharedModel.js";
import Quiz from "./Quiz.jsx";
import Results from "./Results.jsx";
import Browse from "./Browse.jsx";
import SkeletonCards from "./components/Skeleton.jsx";

const STALE_HOURS = 30;

export default function App() {
  const init = useMemo(initialState, []);
  const { data: events, error } = useEvents();
  const shared = useSharedModel();          // optional model trained on everyone's ratings
  const index = useIndex(events);

  const [answers, setAnswers] = useState(init.answers || null);
  const [model, setModel] = useState(init.model || null);
  const [filters, setFilters] = useState(init.filters || null);
  const [rated, setRated] = useState(init.rated || {});
  const [undo, setUndo] = useState(null);       // the state before the last rating
  const [tab, setTab] = useState("picks");
  useEffect(() => save({ answers, model, filters, rated }), [answers, model, filters, rated]);

  const hoursOld = events ? (Date.now() - Date.parse(events.last_updated)) / 36e5 : 0;

  const finishQuiz = (a) => {
    const start = fromQuiz(a, shared);
    startSession();                                          // a fresh anonymous id per quiz run
    if (getConsent() === "yes") logSession(a);
    setAnswers(a); setModel(start.model); setFilters(start.filters); setRated({}); setUndo(null); setTab("picks");
  };
  const rate = (item, label, meta = {}) => {
    logRating(item, label, meta.position, meta.p ?? 0.5);    // does nothing unless the visitor opted in
    setUndo({ model, rated });
    setModel(learn(model, item, label));
    setRated({ ...rated, [item.id]: label });
  };
  const undoRate = () => { if (undo) { setModel(undo.model); setRated(undo.rated); setUndo(null); } };
  const retake = () => { setAnswers(null); setModel(null); setFilters(null); setRated({}); setUndo(null); };

  const ready = model && index;
  const staleFor = hoursOld > STALE_HOURS ? (hoursOld >= 48 ? Math.round(hoursOld / 24) + " days" : Math.round(hoursOld) + " hours") : null;

  return (
    <>
      <header className="head">
        <div className="wrap">
          <h1>SIDEQUESTS</h1>
          <p className="tag">find your next adventure (and your people)</p>
        </div>
      </header>
      <main className="wrap">
        {ready && (
          <nav className="tabs" aria-label="Views">
            <button className={"tab" + (tab === "picks" ? " on" : "")} aria-pressed={tab === "picks"} onClick={() => setTab("picks")}>For you</button>
            <button className={"tab" + (tab === "browse" ? " on" : "")} aria-pressed={tab === "browse"} onClick={() => setTab("browse")}>Browse</button>
          </nav>
        )}
        {staleFor && <p className="stale" role="status">Heads up: the event list was last refreshed {staleFor} ago, so some events may have changed.</p>}
        {error && <p className="note">Couldn't load events: {error}</p>}
        {!model && <Quiz onDone={finishQuiz} />}
        {model && !index && !error && <SkeletonCards />}
        {ready && tab === "picks" && (
          <Results index={index} model={model} filters={filters} rated={rated} answers={answers} canUndo={!!undo} onRate={rate} onUndo={undoRate} onRetake={retake} />
        )}
        {ready && tab === "browse" && <Browse index={index} />}
        {events && ready && <p className="hint updated">Events updated {new Date(events.last_updated).toLocaleString()}. Always check the event page before you go.</p>}
        <p className="site-foot"><a href="../">← Classic version (no React, no quiz)</a> · <a href="../privacy.html">Privacy</a></p>
      </main>
    </>
  );
}
