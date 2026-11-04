// Optional, opt in logging of quiz answers and thumbs ratings to Supabase (see ../../docs/SUPABASE.md).
// Does nothing unless the site was built with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, and the visitor said yes.
// The anon key is public by design: the database only lets it insert rows (supabase/schema.sql).
const URL = import.meta.env.VITE_SUPABASE_URL, KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const trackingAvailable = Boolean(URL && KEY);

const CONSENT = "sq2_consent", SESSION = "sq2_session";
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
export const getConsent = () => store.get(CONSENT);          // "yes", "no" or null (not asked yet)
export const setConsent = (v) => store.set(CONSENT, v);

// One random id per quiz run. It is not tied to a name, email or device fingerprint.
export function startSession() { const id = crypto.randomUUID(); store.set(SESSION, id); return id; }
const sessionId = () => store.get(SESSION) || startSession();

async function insert(table, row) {
  if (!trackingAvailable || getConsent() !== "yes") return;
  try {
    await fetch(`${URL}/rest/v1/${table}`, {
      method: "POST", keepalive: true,
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
  } catch { /* logging must never break the app */ }
}

export const logSession = (answers) => insert("sessions", { id: sessionId(), answers, app_version: "v2" });

const round = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
export const logRating = (item, label, position, predicted) => insert("ratings", {
  session_id: sessionId(), event_url: item.id, label, position, predicted: Math.round(predicted * 1000) / 1000,
  features: round(item.f),
  event: { title: item.e.title, source: item.e.source, start: item.e.start, price_text: item.e.price_text, venue: item.e.venue },
});
