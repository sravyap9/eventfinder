// Placeholder cards shown while data loads, so the page has its final shape from the first paint.
import React from "react";

export default function SkeletonCards({ n = 3 }) {
  return (
    <ul className="cards" aria-busy="true" aria-label="Loading events">
      {Array.from({ length: n }, (_, i) => <li key={i}><div className="skel" aria-hidden="true"><i /><i /><i /></div></li>)}
    </ul>
  );
}
