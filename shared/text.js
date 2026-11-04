// Text helpers shared by the classic page and the quiz page. No DOM, so they also run under `node --test`.
// Matching works on stems, so "runners", "running" and "run" are the same word.

const SUFFIXES = ["ing", "ers", "er", "es", "s"];
const memo = new Map();   // the same few thousand words repeat across 3,000 events

export function stem(word) {
  let out = memo.get(word);
  if (out !== undefined) return out;
  let x = word, cut = false;
  for (const suf of SUFFIXES)
    if (x.length > suf.length + 2 && x.endsWith(suf) && !(suf === "s" && x.endsWith("ss"))) {
      x = x.slice(0, -suf.length); cut = suf !== "s" && suf !== "es"; break;
    }
  if (cut && /([^aeioulsz])\1$/.test(x)) x = x.slice(0, -1);      // "running" -> "runn" -> "run"
  if (x.length > 3 && x.endsWith("e")) x = x.slice(0, -1);
  memo.set(word, x);
  return x;
}

export const words = (text) => String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
export const stems = (text) => words(text).map(stem);
export const phraseKey = (text) => stems(text).join(" ");                     // "Paint & Sip" -> "paint sip"
export const normTitle = (text) => words(text).join(" ").replace(/^the /, ""); // for spotting the same title twice
export const hayOf = (text) => " " + stems(text).join(" ") + " ";             // " paint sip ": lets a phrase match whole words only
