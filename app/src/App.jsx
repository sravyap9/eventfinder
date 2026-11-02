import React, { useEffect, useMemo, useState } from "react";
import { buildIndex, fromQuiz, learn } from "./ml.js";
import Quiz from "./Quiz.jsx";
import Results from "./Results.jsx";

const KEY = "sq2";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: run without saving */ } };
const DATA = import.meta.env.DEV ? "/events.json" : "../events.json";

export default function App() {
  const saved = useMemo(load, []);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [answers, setAnswers] = useState(saved.answers || null);
  const [model, setModel] = useState(saved.model || null);
  const [filters, setFilters] = useState(saved.filters || null);
  const [rated, setRated] = useState(saved.rated || {});

  useEffect(() => {
    fetch(DATA + "?v=" + Date.now()).then((r) => r.json()).then((d) => setEvents(d)).catch((e) => setError(String(e)));
  }, []);
  useEffect(() => save({ answers, model, filters, rated }), [answers, model, filters, rated]);

  const index = useMemo(() => (events ? buildIndex(events.events) : null), [events]);

  const finishQuiz = (a) => {
    const start = fromQuiz(a);
    setAnswers(a); setModel(start.model); setFilters(start.filters); setRated({});
  };
  const rate = (item, label) => {
    setModel((m) => learn(m, item, label));
    setRated((r) => ({ ...r, [item.id]: label }));
  };
  const retake = () => { setAnswers(null); setModel(null); setFilters(null); setRated({}); };

  return (
    <>
      <header>
        <div className="wrap">
          <h1>SIDEQUESTS</h1>
          <p className="tag">find your next adventure (and your people)</p>
        </div>
      </header>
      <main className="wrap">
        {error && <p className="note">Couldn't load events: {error}</p>}
        {!error && !index && <p className="note">Loading events…</p>}
        {index && !model && <Quiz onDone={finishQuiz} />}
        {index && model && (
          <Results index={index} model={model} filters={filters} rated={rated} onRate={rate} onRetake={retake}
                   updated={events.last_updated} />
        )}
        <p className="foot">
          <a href="../">← Classic version (no React, no quiz)</a>
        </p>
      </main>
    </>
  );
}
