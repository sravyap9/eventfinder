// The optional model trained on everyone's ratings (../model.json). Validated before use: it is a committed file, but
// anything that feeds scoring is treated as untrusted. A missing or empty file is fine: the quiz alone sets the prior.
import { useEffect, useState } from "react";
import { sanitizeModel } from "../ml.js";

const MODEL = import.meta.env.DEV ? "/model.json" : "../model.json";

export function useSharedModel() {
  const [model, setModel] = useState(null);
  useEffect(() => {
    fetch(MODEL + "?v=" + Date.now())
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { const ok = sanitizeModel(m); if (ok) setModel(ok); })
      .catch(() => {});
  }, []);
  return model;
}
