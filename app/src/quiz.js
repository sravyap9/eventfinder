import { INTERESTS } from "./ml.js";

// One question per screen. kind: "multi" picks several, "single" picks one.
export const QUESTIONS = [
  { id: "interests", kind: "multi", title: "What sounds fun?", hint: "Pick as many as you like.",
    options: Object.keys(INTERESTS).map((o) => ({ value: o, label: o })) },
  { id: "vibe", kind: "single", title: "What's your vibe right now?",
    options: [{ value: "social", label: "Meet people" }, { value: "chill", label: "Low key and cozy" },
              { value: "energy", label: "High energy" }, { value: "any", label: "Surprise me" }] },
  { id: "budget", kind: "single", title: "What's the budget?",
    options: [{ value: "free", label: "Free only" }, { value: "cheap", label: "Under about $25" }, { value: "any", label: "Doesn't matter" }] },
  { id: "times", kind: "multi", title: "When are you free?", hint: "Pick any that work.",
    options: [{ value: "morning", label: "Mornings" }, { value: "afternoon", label: "Afternoons" },
              { value: "evening", label: "Evenings" }, { value: "late", label: "Late night" }] },
  { id: "when", kind: "single", title: "How far ahead?",
    options: [{ value: "week", label: "This week" }, { value: "weekend", label: "This weekend" }, { value: "month", label: "Next few weeks" }] },
  { id: "adults", kind: "single", title: "Are 21+ events okay?",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No, keep it all ages" }] },
];

// Quiz answers can arrive in a shared link, so only accept values the quiz itself offers.
export function sanitizeAnswers(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const qn of QUESTIONS) {
    const allowed = new Set(qn.options.map((o) => o.value)), v = raw[qn.id];
    if (qn.kind === "multi") out[qn.id] = Array.isArray(v) ? v.filter((x) => allowed.has(x)) : [];
    else if (allowed.has(v)) out[qn.id] = v;
    else return null;
  }
  return out;
}
export const answersToHash = (a) => "#a=" + btoa(unescape(encodeURIComponent(JSON.stringify(a))));
export function answersFromHash(h) {
  try { return sanitizeAnswers(JSON.parse(decodeURIComponent(escape(atob((h || "").replace(/^#a=/, "")))))); } catch { return null; }
}
