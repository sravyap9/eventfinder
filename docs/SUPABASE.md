# Supabase setup (about 10 minutes, free tier)

This adds an optional, anonymous log of quiz answers and thumbs ratings, so a model can be trained on everyone's taste instead of only your own. Until you finish these steps the app works exactly as before and sends nothing.

## How the pieces fit

```
v2 page  ->  Supabase (Postgres)  ->  ml/export.py  ->  ml/train.py  ->  model.json  ->  v2 page
 (anon key, insert only)             (service key)                       (committed)     (loads it as the starting weights)
```

* Visitors are asked once, on the results screen. Nothing is sent until they press "Yes".
* A "session" is a random id per quiz run. No name, email or device id is stored.
* The public (anon) key can only insert rows. It can never read, edit or delete. This was tested against a real Postgres 16.
* `model.json` is a plain static file, so using the trained model costs nothing to run.

## Steps

1. **Create the project.** Sign up at supabase.com, choose New project, pick the free plan and a region near you. Save the database password somewhere safe.
2. **Create the tables.** In the dashboard open SQL Editor, paste all of `supabase/schema.sql`, and press Run.
3. **Copy two values.** Project Settings, API: the Project URL and the `anon public` key.
4. **Point the site at it.**
   ```
   cd app
   cp .env.example .env.local      # then paste the two values in
   npm install
   npm run build                   # writes ../v2 with the values baked in
   ```
   Commit and push `v2/`. The anon key ending up in the page is expected and safe.
5. **Check it works.** Open the page, take the quiz, press "Yes, share anonymously", rate a pick. In Supabase, Table Editor should show a row in `sessions` and `ratings`.
6. **Turn on weekly training (optional).** In the GitHub repo: Settings, Secrets and variables, Actions, New repository secret, and add:
   * `SUPABASE_URL` the Project URL
   * `SUPABASE_SERVICE_KEY` the `service_role` key (Project Settings, API). This one can read everything. Never put it in the website or in `.env.local` of a build you publish.

   The `train-model` workflow then runs on Mondays (or press Run workflow). It exports the ratings, trains, and commits `model.json` only if the model beats a baseline on held out sessions.

## What to expect

* A shared model needs data. Until there are about 500 ratings from 20 or more sessions, `ml/train.py` does nothing, on purpose.
* Questions to ask once data arrives are in `supabase/queries.sql`: like rate by source, whether the model's scores match reality, whether higher ranked picks get liked more.
* Free tier limits change, so check supabase.com/pricing. Free projects can pause after a period of inactivity, which only means logging pauses until you wake it.
* Someone asks you to delete their data: the last query in `supabase/queries.sql` removes one session and its ratings. They would have to give you their session id, which is shown nowhere in the app yet.

## Try the training on made up data

```
python3 ml/train.py --synthetic --out /tmp/model.json
```

## Ideas for later

1. **Compare models on held out ratings.** Prior only quiz model vs shared model vs a blend, using the logged `predicted` score.
2. **Better features.** Sentence embeddings for event text instead of TF-IDF (needs an offline job, since embedding models are too big for the page).
3. **Implicit signals.** Log which picks were opened, not only the thumbs.
4. **Accounts.** Supabase Auth magic links, so saved events and ratings follow you between devices.
5. **Cold start for new events.** Score by similarity to events people liked, not only by feature weights.
