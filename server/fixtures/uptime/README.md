# Official uptime recordings

Recorded 2026-10-20 using the normal honest aiweather user agent, ten-second
timeouts, and no keys or challenge bypass. `manifest.json` lists each URL,
recording time, byte count and SHA-256. These are test fixtures, not runtime
fallbacks. Refresh deliberately with `npm -w server run record:uptime -- claude
openai` (omit IDs for the original Statuspage/incident.io pages).

Statuspage recordings include `values`, `timelines` and the source's `components`
SVG/HTML string. Only JSON fields are interpreted; the HTML is never rendered.
Some pages return unrequested child timelines; normalization scopes them back to
the summary components selected by the registry's shared card filters.

`statuspage-units.json` retains public inline tooltip JavaScript excerpts from
Cursor's official page: `day.outages.p` and `.m` are passed as partial and major,
then converted with `hoursFromSeconds` / `minutesFromSeconds`. They are seconds,
not minutes. Group fields are explicitly hidden by the same source code.

Incident.io recordings retain the public widget summary and a rolling 90-day
`component_impacts` request. The request's `end_at` in the manifest is the test
clock; no percentages are reconstructed from intervals. The existing
`../grok.xml` and other feed fixtures cover incident feeds, not a claim that the
company publishes no uptime. Additional providers and blocked published sources
are covered by `../uptime2/README.md` and `server/SOURCES.md`.
