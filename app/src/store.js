// What the quiz page remembers between visits (answers, the model, ratings), in localStorage.
// localStorage is not trustworthy: it can be corrupted, come from an older version, or be edited by hand. Anything that does
// not pass validation is dropped and the quiz simply starts over.
import { sanitizeModel, fromQuiz } from "./ml.js";
import { answersFromHash, sanitizeAnswers } from "./quiz.js";

const KEY = "sq2";

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY)) || {};
    const answers = sanitizeAnswers(raw.answers), model = sanitizeModel(raw.model);
    if (!answers || !model) return {};
    const rated = {};
    for (const [url, v] of Object.entries(raw.rated && typeof raw.rated === "object" ? raw.rated : {})) if (v === 0 || v === 1) rated[url] = v;
    const when = ["week", "weekend", "month"].includes(raw.filters && raw.filters.when) ? raw.filters.when : "month";
    return { answers, model, filters: { when, adults: !(raw.filters && raw.filters.adults === false) }, rated };
  } catch { return {}; }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: run without saving */ }
}

// A shared link (#a=...) carries quiz answers: use them once, then clean the address bar so a reload keeps your own ratings.
export function initialState() {
  const shared = answersFromHash(location.hash);
  if (shared) {
    history.replaceState(null, "", location.pathname + location.search);
    const start = fromQuiz(shared);
    return { answers: shared, model: start.model, filters: start.filters, rated: {} };
  }
  return load();
}
