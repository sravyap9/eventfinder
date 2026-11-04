import React, { useEffect, useMemo, useState } from "react";
import { buildIndex, fromQuiz, learn } from "./ml.js";
import { answersFromHash } from "./quiz.js";
import Quiz from "./Quiz.jsx";
import Results from "./Results.jsx";
import Browse from "./Browse.jsx";
import { getConsent, logSession, logRating, startSession } from "./track.js";

const KEY = "sq2";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: run without saving */ } };
const DATA = import.meta.env.DEV ? "/events.json" : "../events.json";
const MODEL = import.meta.env.DEV ? "/model.json" : "../model.json";

// A shared link (#a=...) carries quiz answers; use them once, then clean the address bar so reloads keep your own ratings.
function initialState() {
  const shared = answersFromHash(location.hash);
  if (shared) {
    history.replaceState(null, "", location.pathname + location.search);
    const s = fromQuiz(shared);
    return { answers: shared, model: s.model, filters: s.filters, rated: {} };
  }
  return load();
}

export default function App() {
  const init = useMemo(initialState, []);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [answers, setAnswers] = useState(init.answers || null);
  const [model, setModel] = useState(init.model || null);
  const [filters, setFilters] = useState(init.filters || null);
  const [rated, setRated] = useState(init.rated || {});
  const [undo, setUndo] = useState(null);
  const [tab, setTab] = useState("picks");
  const [shared, setShared] = useState(null);  // optional model trained on everyone's ratings, committed as ../model.json

  useEffect(() => {
    fetch(DATA + "?v=" + Date.now()).then((r) => r.json()).then(setEvents).catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    fetch(MODEL + "?v=" + Date.now()).then((r) => (r.ok ? r.json() : null)).then((m) => m && m.w && setShared(m)).catch(() => {});
  }, []);
  useEffect(() => save({ answers, model, filters, rated }), [answers, model, filters, rated]);

  const index = useMemo(() => (events ? buildIndex(events.events) : null), [events]);
  const hoursOld = events ? (Date.now() - Date.parse(events.last_updated)) / 36e5 : 0;

  const finishQuiz = (a) => {
    const s = fromQuiz(a, shared);
    startSession();
    if (getConsent() === "yes") logSession(a);
    setAnswers(a); setModel(s.model); setFilters(s.filters); setRated({}); setUndo(null); setTab("picks");
  };
  const rate = (item, label, meta = {}) => {
    logRating(item, label, meta.position, meta.p ?? 0.5);
    setUndo({ model, rated });
    setModel(learn(model, item, label));
    setRated({ ...rated, [item.id]: label });
  };
  const undoRate = () => { if (undo) { setModel(undo.model); setRated(undo.rated); setUndo(null); } };
  const retake = () => { setAnswers(null); setModel(null); setFilters(null); setRated({}); setUndo(null); };

  return (
    <>
      <header>
        <div className="wrap">
          <h1>SIDEQUESTS</h1>
          <p className="tag">find your next adventure (and your people)</p>
        </div>
      </header>
      <main className="wrap">
        {index && model && (
          <nav className="tabs" aria-label="Views">
            <button className={tab === "picks" ? "on" : ""} aria-pressed={tab === "picks"} onClick={() => setTab("picks")}>For you</button>
            <button className={tab === "browse" ? "on" : ""} aria-pressed={tab === "browse"} onClick={() => setTab("browse")}>Browse</button>
          </nav>
        )}
        {hoursOld > 30 && <p className="stale" role="status">Heads up: the event list was last refreshed {Math.round(hoursOld / 24 * 10) / 10 >= 1 ? Math.round(hoursOld / 24) + " days" : Math.round(hoursOld) + " hours"} ago, so some events may have changed.</p>}
        {error && <p className="note">Couldn't load events: {error}</p>}
        {!error && !index && <p className="note">Loading events…</p>}
        {index && !model && <Quiz onDone={finishQuiz} />}
        {index && model && tab === "picks" && (
          <Results index={index} model={model} filters={filters} rated={rated} answers={answers} canUndo={!!undo}
                   onRate={rate} onUndo={undoRate} onRetake={retake} />
        )}
        {index && model && tab === "browse" && <Browse index={index} />}
        {events && <p className="hint small">Events updated {new Date(events.last_updated).toLocaleString()}. Always check the event page before you go.</p>}
        <p className="foot"><a href="../">← Classic version (no React, no quiz)</a></p>
      </main>
    </>
  );
}
