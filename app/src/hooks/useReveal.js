// Scroll reveal for one element: attach the returned ref and give the element class "reveal" (see ui/components.css).
import { useEffect, useRef } from "react";
import { watch } from "../../../ui/reveal.js";

export function useReveal(enabled = true) {
  const ref = useRef(null);
  useEffect(() => { if (enabled) watch(ref.current); }, [enabled]);
  return ref;
}
