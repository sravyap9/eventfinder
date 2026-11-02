import React, { useState } from "react";
import { QUESTIONS } from "./quiz.js";

export default function Quiz({ onDone }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState({ interests: [], times: [] });
  const q = QUESTIONS[step];
  const picked = a[q.id];
  const isOn = (v) => (q.kind === "multi" ? (picked || []).includes(v) : picked === v);

  const pick = (v) => {
    if (q.kind === "multi") setA({ ...a, [q.id]: isOn(v) ? picked.filter((x) => x !== v) : [...picked, v] });
    else setA({ ...a, [q.id]: v });
  };
  const next = () => (step + 1 < QUESTIONS.length ? setStep(step + 1) : onDone(a));
  const ready = q.kind === "multi" || picked;

  return (
    <section className="quiz" aria-live="polite">
      <div className="progress" aria-label={`Question ${step + 1} of ${QUESTIONS.length}`}>
        {QUESTIONS.map((_, i) => <span key={i} className={i <= step ? "on" : ""} />)}
      </div>
      <h2>{q.title}</h2>
      {q.hint && <p className="hint">{q.hint}</p>}
      <div className="options">
        {q.options.map((o) => (
          <button key={o.value} className={"opt" + (isOn(o.value) ? " on" : "")} aria-pressed={isOn(o.value)} onClick={() => pick(o.value)}>
            {isOn(o.value) ? "✓ " : ""}{o.label}
          </button>
        ))}
      </div>
      <div className="nav">
        <button className="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        <button className="primary" disabled={!ready} onClick={next}>{step + 1 < QUESTIONS.length ? "Next" : "Show my picks"}</button>
      </div>
    </section>
  );
}
