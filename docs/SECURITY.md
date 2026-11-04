# Security: threat model, what is done, what only you can do

## The shape of the thing

A static website (no server code of its own), a scheduled Python job that scrapes other websites, and an optional database that only accepts anonymous inserts. There are no user accounts, no passwords, no cookies and no payments, which removes whole categories of risk. What remains is mostly: **untrusted data from scraped sites reaching visitors**, **secrets and supply chain**, and **abuse of the public database key**.

## Checklist: the usual website risks, and where this project stands

| Risk | Status | How |
| --- | --- | --- |
| **Cross site scripting (XSS)**: scraped text running as code in a visitor's browser | Defended in layers | (1) `fetch.py` strips tags and drops events whose link is not a plain `https` link to the source's own site. (2) The classic page escapes every value before it goes into HTML; React escapes by default. (3) Both pages only link to `http(s)` URLs. (4) A strict Content Security Policy forbids inline scripts, so even an escaping bug could not run injected code. A browser test proves each layer (`tests/browser/security_check.js`). |
| **Malicious links** (`javascript:`, `data:`) | Defended | Rejected at ingestion and again in each page. Events with a link that is not a clean `http(s)` URL are dropped, not shown. |
| **Injection into files you generate** (the `.ics` calendar download) | Defended | Title, venue and link are escaped or stripped of line breaks. Tested. |
| **SQL injection** | Not applicable to the code you wrote | The browser only calls Supabase's REST API, which uses parameterized queries. There is no raw SQL in the site. The schema's checks and policies are tested against a real Postgres. |
| **Broken access control** | Defended | Row level security on both tables. The public key can only insert. It cannot read, update or delete. Tested as the `anon` role. |
| **Abuse and denial of service on the public key** | Mitigated | Size and shape checks on every row, 300 ratings per session, 5,000 rows an hour, 2,000 sessions an hour. A determined attacker can still fill the quota slowly. See "Residual risks". |
| **CSRF** | Not applicable | No cookies or sessions. The one write API takes its key in a header and the key can only insert anonymous rows. |
| **Secrets in the code** | Clean | Scanned. The only key in the website is Supabase's `anon` key, which is public by design. The `service_role` key and the Ticketmaster key live only in GitHub Secrets. `fetch.py` scrubs secret values out of its log messages. |
| **Dependency vulnerabilities** | Clean today, monitored | `npm audit` reports 0. CI fails on high severity advisories. Dependabot proposes updates weekly. |
| **CI supply chain** | Hardened | Actions are pinned to commit hashes (a changed tag cannot swap the code), each workflow declares least privilege permissions, the fetch job cannot run twice at once, the test job leaves no token on disk. |
| **Third party content** | None | Fonts are self hosted, so no request leaves for a font service and no visitor IP goes to one. The CSP blocks everything not from this site. |
| **SSRF** (the scraper being steered to other hosts) | Defended | Every link must belong to its source's own domain. Ids taken from scraped data must look like ids. URLs built from scraped fields are validated first. Redirects to plain `http` are refused. Responses are size capped. Tested with hostile fixtures. |
| **Untrusted model or saved state** | Defended | `model.json` and anything read from localStorage are validated (shape, key names, finite bounded numbers, size) before use. Tested with a hostile model. |
| **Privacy and personal data** | Handled | Logging is opt in, anonymous, and deletable. Emails and phone numbers in scraped descriptions are removed. `privacy.html` explains it. |
| **Transport security** | Provided by GitHub Pages | HTTPS. Turn on "Enforce HTTPS" (below). |
| **Clickjacking** (someone framing the site) | Not fully defendable here | `frame-ancestors` and `X-Frame-Options` need real HTTP headers, which GitHub Pages cannot send and a `<meta>` tag cannot do. The site has nothing to hijack (no logins or payments), so the impact is low. Putting free Cloudflare in front would allow it. |
| **ReDoS** (a hostile page making a regex run forever) | Reduced | Responses are capped at 15 MB and the patterns are non nested. Not eliminated: Python's `re` has no timeout. |

## Things only you can do (GitHub settings)

These cannot be set from code. Each is a few clicks in the repository on github.com.

1. **Turn on two factor authentication** on your GitHub account. This matters more than anything else on this page: whoever controls your account controls the site.
2. **Settings, Code security**: enable **Dependabot alerts**, **Dependabot security updates**, **Secret scanning** and **Push protection** (all free for public repositories).
3. **Settings, Pages**: tick **Enforce HTTPS**.
4. **Settings, Actions, General**: set Workflow permissions to **Read repository contents** by default (the workflows ask for more where they need it), and under pull requests from outside collaborators choose **Require approval for all outside collaborators**.
5. **Settings, Rules (or Branches)**: protect `main` so it requires pull requests, but allow `github-actions` to bypass so the scheduled data commits still work. Skip this if it gets in the way of the daily run.
6. **Settings, Security**: enable **Private vulnerability reporting** so `SECURITY.md` works.
7. **Supabase**: the `service_role` key must never be put in the website or in `app/.env.local`. If it ever leaks, rotate it in Project Settings, API. In Authentication settings, turn off sign ups you are not using.
8. **A custom domain**, if you add one later: keep DNS records pointing at GitHub pointing at it (a dangling record can be taken over by someone else).

## Residual risks (what this does not and cannot cover)

* **A source gets compromised and serves convincing but false events.** The checks stop code and foreign links, not lies. The mitigation is the outbound link: every event opens the original page.
* **Slow abuse of the database.** The caps limit speed, not total volume over weeks. Delete old rows now and then (see `docs/SUPABASE.md`), and watch the dashboard's storage meter.
* **The scraping itself.** These sites may forbid automated access in their terms. The project is polite (random delays, request caps, no logins, and it does not try to get past bot walls: sources behind one, like NYPL, were dropped). But its requests present a normal browser `User-Agent` rather than naming the project, and some sites' terms discourage that. It is your call whether that is acceptable, especially if the site becomes popular. Prefer an official API where one exists (see `docs/SOURCES.md`).
* **Cloud provider outages or account loss.** The repository is the backup of everything but the Supabase data. Export that occasionally.

## Keeping it maintainable

* Security checks live in ordinary tests. `python3 -m unittest discover -s tests` (hostile data into the fetcher) and `npm test` in `app/` run in CI on every push.
* One command checks the browser side: see the header of `tests/browser/security_check.js`.
* When you add a source, add its domain to `ALLOWED_HOSTS` in `fetch.py`. Without it the source's links are not restricted to its own site (only the `http(s)` check applies), and a test in `tests/test_security.py` checks that real current URLs still pass.
