// Search shared by both pages: typing any word of a synonym group (see synonyms.json) matches the whole group.
import { phraseKey } from "./text.js";

// raw: the array of arrays in synonyms.json. Each group keeps its readable words and a Set of their stemmed keys.
export function buildGroups(raw) {
  return raw.map((g) => ({ name: g[0], words: g, keys: new Set(g.map(phraseKey)) }));
}

// What a typed query should match: its own key plus every other word of any group it belongs to.
// shown lists the extra words in readable form ("also matching: watercolor, acrylic ...").
export function expandQuery(groups, query) {
  const k = phraseKey(query);
  if (!k) return { keys: [], shown: [] };
  const keys = new Set([k]), shown = [];
  for (const g of groups)
    if (g.keys.has(k))
      g.words.forEach((w) => { const wk = phraseKey(w); if (wk !== k && !keys.has(wk)) { keys.add(wk); shown.push(w); } });
  return { keys: [...keys], shown };
}

// hay is hayOf(title + " " + description): stems with a space on both sides, so keys match whole words only.
export const matchesAny = (hay, keys) => !keys.length || keys.some((k) => hay.includes(" " + k + " "));
