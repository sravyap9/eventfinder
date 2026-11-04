// Loads events.json. The quiz does not wait for it: it is on screen immediately and this fills in behind it.
import { useEffect, useState } from "react";
import { usableEvents } from "../../../shared/events.js";

const DATA = import.meta.env.DEV ? "/events.json" : "../events.json";

export function useEvents() {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let alive = true;
    fetch(DATA + "?v=" + Date.now())
      .then((r) => r.json())
      // events.json is scraped, so untrusted: usableEvents keeps only well formed records with clean http(s) links
      .then((d) => alive && setState({ data: { ...d, events: usableEvents(d) }, error: null }))
      .catch((e) => alive && setState({ data: null, error: String(e) }));
    return () => { alive = false; };
  }, []);
  return state;
}
