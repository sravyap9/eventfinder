// The picks screen: rank every upcoming event with the model, show the top k (diversified), let the person rate them.
import React, { useMemo, useState } from "react";
import { eligible, recommend } from "./ml.js";
import EventCard from "./components/EventCard.jsx";
import PicksHeader from "./components/PicksHeader.jsx";
import ConsentBanner from "./components/ConsentBanner.jsx";
import ModelInspector from "./components/ModelInspector.jsx";

export default function Results({ index, model, filters, rated, answers, canUndo, onRate, onUndo, onRetake }) {
  const [k, setK] = useState(10);
  const cands = useMemo(() => eligible(index.items, filters, Date.now(), rated), [index, filters, rated]);
  const picks = useMemo(() => recommend(model, cands, k), [model, cands, k]);
  return (
    <section className="step-in">
      <PicksHeader answers={answers} fits={cands.length} nRated={Object.keys(rated).length} canUndo={canUndo} onUndo={onUndo} onRetake={onRetake} />
      <ConsentBanner answers={answers} />
      {picks.length === 0
        ? <p className="note">Nothing matches those answers. Retake the quiz with a wider window.</p>
        : <ul className="cards">{picks.map((c, i) => <EventCard key={c.it.id} c={c} position={i} model={model} surface={index.surface} onRate={onRate} />)}</ul>}
      {k < 40 && picks.length === k && <div className="more"><button className="ghost" onClick={() => setK(k + 10)}>Show 10 more</button></div>}
      <ModelInspector model={model} surface={index.surface} />
    </section>
  );
}
