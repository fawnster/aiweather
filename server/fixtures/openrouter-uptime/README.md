# OpenRouter official status-page uptime recording

`manifest.json` records official URLs, download times, HTTP results, sizes and
SHA-256 digests. Requests used `aiweather/1.0 (+https://aiweather.synteq.app)`.
`config.json` is the unmodified public response. The official page shell named
app version 35.146178534 and `/src/status-pages-site-CDKF376M.min.js`.

`page-logic.js` contains verbatim expressions/functions extracted from that
bundle, with test-local names assigned to the two anonymous expressions:

- `jz` and its helpers: public config normalizer (incidents → degradations).
- `wE`, `wI`, `wz`, `wO`, `wP`, `wN`, `wj`: status ranks, deleted entries,
  timestamp selection, calendar dates, and coverage.
- `Pg`: daily per-component incident states; `Pb`: maintenance identifier.
- `pageBars`: anonymous expression inside `PZ`, combining incident/maintenance
  notices and sorting worst-first.
- `pageRanges`: anonymous expression inside `PG`, opening/closing outage
  intervals and clipping them to the selected period.
- `wH`, `wF`: interval union and the published uptime formula.

Only function/expression boundaries and local assignments were added; unrelated
UI initialization was omitted. The full UI bundle is not committed. Tests supply
the bundler's object-spread helpers and a fixed Date with UTC calendar methods,
then compare all seven leaves/dates/events/displayed percentages against the
production port. Tests also cover carried status, deleted updates, missing
components, maintenance, fractional coverage age, interval overlap/clipping and
UTC boundaries. The page itself uses the viewer's calendar, not a fixed timezone.

Runtime never downloads or evaluates JavaScript; it reads only ordinary public
`config.json`. These fixtures are offline test inputs, never runtime fallbacks.
No internal endpoint, authentication, feature-flag override, browser or
protection bypass was used.
