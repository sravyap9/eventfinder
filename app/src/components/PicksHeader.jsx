// Title, share and retake on one row, then one line of status. The long explanation shows only until the first rating.
import React, { useState } from "react";
import { share } from "../util.js";
import { answersToHash } from "../quiz.js";

export default function PicksHeader({ answers, fits, nRated, canUndo, onUndo, onRetake }) {
  const [msg, setMsg] = useState("");
  const link = () => location.origin + location.pathname + answersToHash(answers);
  return (
    <>
      <div className="picks-head">
        <h2>Your picks</h2>
        <div className="acts-row">
          <button className="ghost" aria-label="Share my quiz link" onClick={async () => setMsg(await share("My Sidequests picks", link()))}>{msg || "Share"}</button>
          <button className="ghost" aria-label="Retake the quiz" onClick={onRetake}>Retake</button>
        </div>
      </div>
      <p className="hint">
        {nRated === 0
          ? `${fits.toLocaleString()} events fit your filters. Tap 👍 or 👎 and the model retrains on the spot.`
          : `${fits.toLocaleString()} fit your filters · ${nRated} rated`}
        {canUndo && <> · <button className="linklike" onClick={onUndo}>Undo last rating</button></>}
      </p>
    </>
  );
}
