// The six question quiz. One question per screen; the question and its options fade in on each step, while the progress
// bar and the Back / Next buttons stay mounted (so keyboard focus is not lost between steps).
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
  const last = step + 1 === QUESTIONS.length;
  const next = () => (last ? onDone(a) : setStep(step + 1));
  const ready = q.kind === "multi" || picked;

  return (
    <section className="quiz" aria-live="polite">
      <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={QUESTIONS.length} aria-valuenow={step + 1} aria-label={`Question ${step + 1} of ${QUESTIONS.length}`}>
        {QUESTIONS.map((_, i) => <span key={i} className={i <= step ? "on" : ""} />)}
      </div>
      <div key={step} className="step-in">
        <h2>{q.title}</h2>
        {q.hint && <p className="hint">{q.hint}</p>}
        <div className="options">
          {q.options.map((o) => (
            <button key={o.value} className={"opt" + (isOn(o.value) ? " on" : "")} aria-pressed={isOn(o.value)} onClick={() => pick(o.value)}>
              {isOn(o.value) ? "✓ " : ""}{o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="nav">
        <button className="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        <button className="primary" disabled={!ready} onClick={next}>{last ? "Show my picks" : "Next"}</button>
      </div>
    </section>
  );
}
