// Asks once whether anonymous quiz answers and ratings may be saved (see docs/SUPABASE.md). Renders nothing unless the site
// was built with a Supabase project and the visitor has not answered yet.
import React, { useState } from "react";
import { trackingAvailable, getConsent, setConsent, logSession } from "../track.js";

export default function ConsentBanner({ answers }) {
  const [consent, setChoice] = useState(getConsent());
  if (!trackingAvailable || consent !== null) return null;
  const choose = (v) => { setConsent(v); setChoice(v); if (v === "yes") logSession(answers); };
  return (
    <div className="consent step-in" role="region" aria-label="Help improve recommendations">
      <p><strong>Help improve the picks?</strong> If you say yes, your quiz answers and thumbs up or down are saved anonymously
        (no name, no email) and used to train a better model. Saying no changes nothing else. <a href="../privacy.html" target="_blank" rel="noopener">Privacy details</a></p>
      <div className="acts-row">
        <button className="primary" onClick={() => choose("yes")}>Yes, share anonymously</button>
        <button className="ghost" onClick={() => choose("no")}>No thanks</button>
      </div>
    </div>
  );
}
