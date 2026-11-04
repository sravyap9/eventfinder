# Sidequests

Find things to do in Chicago: one searchable list pulled from several public event sites, plus a quiz that learns your taste.

* **Classic page** (`index.html`): plain HTML, CSS and JavaScript. Search, filters, saved events, calendar export.
* **Quiz version** (`v2/`, source in `app/`): React. Take a six question quiz, get ranked picks with a reason for each, and tap thumbs up or down so the model retrains in your browser. Also has a Browse tab.

Both pages are static files that read the same `events.json`.

## How it works

1. `fetch.py` (Python standard library only) runs on a GitHub Actions schedule, twice a day.
2. It collects upcoming events from Luma, Eventbrite, Partiful, Pie, Do312, Chicago Public Library, Chicago Park District, CourseHorse and Resident Advisor, plus Ticketmaster when an API key is set.
3. It drops kids events, fills in prices, and merges duplicates that appear on several sites.
4. It writes `events.json` and commits it. GitHub Pages serves the result.

Each event records how its price was found in `price_source`:

| Step | Meaning | Shown as |
| --- | --- | --- |
| a | structured price from the source | `$20`, `FREE` |
| b | a source that is always free | `FREE` |
| c | guessed from the description | `~$15`, `~FREE` |
| d | nothing found | `Click for $` |

`events.json` also carries per source counts, how many kids events were dropped, and a `warnings` list. A source that returns nothing, or far fewer events than last time, shows up there and as a warning on the Actions run.

## The recommender

`app/src/ml.js` is a logistic regression over TF-IDF words, interest groups, price, time of day and weekday. The quiz sets starting weights, each thumbs up or down is one step of online gradient descent, and the top results are re-ranked with MMR so near copies do not crowd the list. It runs entirely in the browser. See `app/README.md`.

## Security

Scraped data is treated as hostile: it is cleaned and link checked when it is fetched, escaped again when it is shown, and a strict Content Security Policy blocks inline script as a last line. The optional database accepts anonymous inserts only. See `docs/SECURITY.md` for the full threat model and a short list of GitHub settings only the owner can turn on, `SECURITY.md` for reporting a problem, and `privacy.html` for what visitors are told.

## When a source breaks

Scrapers break when sites change. This repo is built to fail safely: the last good events are kept, junk and silently missing fields are detected, two bad runs in a row open a GitHub issue, and every parser has an offline test against a recorded real response. See `docs/SOURCES.md` for how stable each source is, the repair steps, and how to turn on the official Ticketmaster API.

## Learning from ratings (optional)

The quiz page can log anonymous, opt in ratings to a free Supabase database, and `ml/train.py` trains a shared starting model from them. Setup steps and the privacy model are in `docs/SUPABASE.md`. Nothing is sent until it is configured and a visitor says yes.

## Develop

```
python3 -m unittest discover -s tests     # fetcher, parsers (offline fixtures), alerts, training
python3 fetch.py                          # refresh events.json (about 15 minutes)
cd app && npm install && npm test         # recommender tests
cd app && npm run dev                     # quiz version on localhost
cd app && npm run build                   # writes ../v2, commit it
```

## About the data

This is a personal project. Events come from the public pages and public endpoints of the sites above, with no logins and no paid services. Those sites can change or block access at any time, so any source may stop working. Every event links back to its original page, which is where details, prices and availability are authoritative. Availability and prices here can be out of date. Check the event page before you go.
