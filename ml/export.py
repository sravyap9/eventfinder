#!/usr/bin/env python3
"""Download the logged ratings from Supabase into ratings.json, ready for train.py.

Needs the SERVICE key (it can read the data, so keep it secret: a local environment variable or a GitHub secret,
never in the website):
  SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=... python3 ml/export.py
"""
import json, os, sys, urllib.request

url, key = os.environ.get("SUPABASE_URL", "").rstrip("/"), os.environ.get("SUPABASE_SERVICE_KEY", "")
out = sys.argv[1] if len(sys.argv) > 1 else "ratings.json"
if not url or not key:
    sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY")

rows, offset, page = [], 0, 1000
while True:
    req = urllib.request.Request(f"{url}/rest/v1/ratings?select=session_id,label,features,predicted,position,created_at&order=id&offset={offset}&limit={page}",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.load(r)
    rows += batch
    if len(batch) < page:
        break
    offset += page
with open(out, "w") as f:
    json.dump(rows, f)
print(f"exported {len(rows)} ratings to {out}")
