// Building the feature index for ~3,000 events takes a couple of hundred milliseconds. Do it right after the first paint, so
// the quiz (which does not need it) shows up immediately and the index is ready long before anyone finishes six questions.
import { useEffect, useState } from "react";
import { buildIndex } from "../ml.js";

export function useIndex(events) {
  const [index, setIndex] = useState(null);
  useEffect(() => {
    if (!events) return undefined;
    const id = setTimeout(() => setIndex(buildIndex(events.events)), 0);
    return () => clearTimeout(id);
  }, [events]);
  return index;
}
