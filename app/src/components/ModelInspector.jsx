// "What the model has learned about you": the strongest positive and negative weights, as bars.
import React, { useMemo } from "react";
import { topWeights } from "../ml.js";

const Bars = ({ rows, sign, className }) => (
  <ul>{rows.map(([name, v]) => <li key={name} className={className}><span>{name}</span><i style={{ width: Math.min(100, sign * v * 40) + "%" }} /></li>)}</ul>
);

export default function ModelInspector({ model, surface }) {
  const tw = useMemo(() => topWeights(model, surface), [model, surface]);
  return (
    <details className="model">
      <summary>What the model has learned about you</summary>
      <div className="cols">
        <div><h3>Pulls toward</h3><Bars rows={tw.pos} sign={1} /></div>
        <div><h3>Pushes away</h3><Bars rows={tw.neg} sign={-1} className="neg" /></div>
      </div>
      <p className="hint">Logistic regression over TF-IDF words, interest groups, price, time and day. The quiz sets the starting weights; every rating is one SGD step. It runs in your browser and nothing is sent anywhere.</p>
    </details>
  );
}
