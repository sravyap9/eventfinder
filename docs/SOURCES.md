# Event sources: how stable each one is, and what to do when one breaks

## Stability, from most to least dependable

| Source | How we read it | Kind | Notes |
| --- | --- | --- | --- |
| Ticketmaster | Discovery API | **Official, free key** | Versioned and documented. Off until `TICKETMASTER_API_KEY` is set. |
| Chicago Public Library | BiblioCommons gateway JSON | Public JSON the library's own site uses | Stable in practice, not a promise. |
| Luma | `api.lu.ma` discover and calendar feeds | Internal JSON | Luma's official API only covers your own calendars. |
| Eventbrite | Internal search API, then JSON-LD in the HTML | Internal JSON with a fallback | Eventbrite removed its public search API years ago. |
| Resident Advisor | GraphQL endpoint | Internal JSON | The website itself is behind a bot wall; this is the API it calls. |
| Do312 | SvelteKit `__data.json` | Internal JSON | **Broke once already** (Nov 2026 redesign). |
| Partiful, Pie | Embedded page data, internal JSON | Internal | |
| CourseHorse, Chicago Park District | Parsing HTML | Most fragile | A redesign changes class names. |

None of the unofficial ones carry any promise. The goal is not "never breaks", it is "breaks loudly, safely, and is quick to fix".

## What protects you

1. **Last good data is kept.** If a source returns nothing, junk, or less than a quarter of its usual events, its previous events stay on the page.
2. **Basic checks.** An event needs a title, a link and a start time. If over 40% of a source's events fail that, the parser is treated as broken.
3. **Drift detection.** If events still arrive but the description or venue is suddenly filled on far fewer of them, that is flagged (the site probably changed its markup).
4. **Streaks and an issue.** Every warning is recorded in `events.json` under `streaks` as consecutive runs. At 2 runs in a row `tools/alert.py` opens one GitHub issue labelled `source-broken`, edits it while the problem lasts, and closes it when the source recovers. One-off blips do not open anything.
5. **Offline contract tests.** `tests/fixtures/` holds a recorded real response per source. `python3 -m unittest discover -s tests` runs every parser against them, so a code change cannot quietly break a parser.

## When a source breaks (the issue opened, or a warning in the Actions log)

1. Open the failing run: the warning names the source and what went wrong.
2. Look at the live response by hand (a browser or `curl`) and compare it with what the parser expects.
3. Re-record that source: `python3 tests/record_fixtures.py <source>`. The `git diff` of the new fixture shows what changed.
4. Fix the parser until `python3 -m unittest discover -s tests` passes with the new fixture.
5. Push. The next scheduled run recovers, and the issue closes itself.

## Turning on Ticketmaster (the official API)

1. Register at developer.ticketmaster.com, then My Apps, Add New App, and copy the Consumer Key. It is free; the default limit is 5,000 calls a day.
2. In the GitHub repo: Settings, Secrets and variables, Actions, New repository secret, name `TICKETMASTER_API_KEY`.
3. The next run adds a `ticketmaster` source. Locally: `TICKETMASTER_API_KEY=... python3 fetch.py`.
4. Optional: replace `tests/fixtures/ticketmaster.json` (hand written from the docs) with a real response so the test covers reality:
   `curl 'https://app.ticketmaster.com/discovery/v2/events.json?apikey=KEY&latlong=41.88,-87.63&radius=40&unit=miles&size=5'`

It adds events (concerts, sports, theater), so check the totals after the first run. If it pushes the page over what you want, lower the radius or number of weeks in `fetch_ticketmaster`.

## Sources I did not add

* **Meetup**: its API access terms and schema could not be confirmed from here, and paid access may be required. Not worth shipping unverified code. Revisit with a token in hand.
* **Official open data portals** (Chicago Data Portal, NYC Open Data) might publish park events, but the network allowlist here blocks `api.us.socrata.com`, `data.cityofchicago.org` and `data.cityofnewyork.us`, so I could not check. If you allowlist those, it is worth a look for the Park District.
