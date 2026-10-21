# aiweather

**The live status of every AI, as weather.** aiweather reads the official status pages of 48 AI companies (the model
labs, the clouds that serve their models, coding tools and creative tools) and draws them as one live sky: clear when
everything works, clouds, rain and storms as things break.

Live at **https://aiweather.synteq.app**

![aiweather](web/public/og.jpg)

## What it does

- **One board, live.** Every company's official status, its uptime figure and its last 30 days, updated within a minute
  of the company's own page. Anything degraded or worse floats to the top.
- **Company pages like a weather app.** The 90-day uptime figure, a strip of the last 14 days, 90-day bars, every part
  of the service, the open incident in the company's own words, and its latest official news.
- **The sky is the weather.** A dot-matrix sky drawn from real weather footage follows the board (or the company you
  are looking at): sun when all is clear, rain for an outage, a storm with lightning for a major one.
- **Your board.** Long-press to arrange or remove companies, list or grid; it is saved in your browser.

## Honest by design

- **Official sources only.** Each company's own status page (Atlassian Statuspage, incident.io, Better Stack, Instatus,
  Datadog, Alibaba Cloud, Google Cloud), read with an honest User-Agent. Nothing behind bot protection is bypassed.
- **Nothing made up.** A page that can't be read shows "couldn't check", never "clear". Uptime figures are the ones the
  companies publish; where a page publishes only incident history (Gemini, Grok, Qwen, ElevenLabs), the figure is
  worked out from the official incident times and labelled that way.
- **Only companies with history.** A company whose official page publishes no history at all is left off the board.
- **No accounts, no tracking, no database.** The server keeps live state in memory.

Grok is read in each visitor's browser: xAI's official status JSON (`data.x.ai/status/*.json`) is open to browsers
(CORS) but turns servers away, so `web/src/browser-sources.js` fetches it client-side, the same way status.x.ai does.
If a browser can't reach it, the card falls back to the server's reading of xAI's official incident feed.

See [source coverage](server/SOURCES.md) and [news sources](server/NEWS-SOURCES.md) for every company.

## Run it

Node 22+ and npm workspaces; no API keys or paid services.

```sh
npm install
npm run dev             # server in watch mode, http://localhost:8787
npm test                # offline tests: adapters, state, uptime, news, HTTP and WebSocket
npm run build           # compiles server/ and builds web/ into web/dist
npm start               # the compiled production server
npm run demo            # a scripted storm from recorded data; never polls live sources
```

`PORT` defaults to `8787`; the listener binds `0.0.0.0`. Demo mode is only on with `DEMO=1`, never implicitly.

The site is plain ES modules with no bundler: `web/build.mjs` copies `web/public` and puts the modules (and the
weather icons) under a content-hashed `/s-<hash>/` path, keeping the last few builds so a page left open across a
deploy still finds its files. The server serves `web/dist` with SPA fallback, no-cache HTML, ETags and immutable
hashed assets, and sends JSON and text brotli/gzip-compressed (each compressed body is made once per version).

## Deploy (Synteq)

```sh
npm i -g synteq
synteq login                                        # once, in your own terminal
scripts/release.sh --create aiweather --plan free   # first deploy, from the repo root
scripts/release.sh --app aiweather                  # every deploy after that
```

`scripts/release.sh` ships only the committed app (`server/src`, `web`, `shared` and the root package files), about
9 MB. The server answers on `PORT`, builds with `npm run build` and starts with `npm start` (about 160 MB resident).
Live state is in memory, so a redeploy starts with an empty "Latest changes" list.

## API

- `GET /api/snapshot`: every company's current state (the `Snapshot` type in `shared/types.ts`).
- `GET /api/uptime`, `GET /api/uptime/:id`: official daily history and uptime figures.
- `GET /api/news`, `GET /api/news/:id`: each company's latest official news.
- `GET /api/health`: readiness, uptime, and each source's last success, error and latency. `ok: true` does **not**
  mean every upstream is healthy.
- `GET /ws` (upgrade): a snapshot on connect, then event and company changes; a JSON ping every 25 s, answered with
  `{"t":"pong"}`. Unresponsive or backlogged clients are disconnected.

## Operations

- Each company is polled every 60 s ±10%, four at a time, with a 12 s request timeout and conditional
  ETag/Last-Modified requests. Status pages are asked for plain (uncompressed) replies, and a host's connection is
  replaced after any network failure.
- A failed read is retried after 15 s, backing off to 5 minutes (a source's Retry-After always wins). The last good
  reading is kept for up to 10 minutes, marked with the error, then becomes `unknown`; known incidents are never
  silently resolved.
- Uptime history and news are read on their own request slots, so they never hold up a status check.
- Runtime dependencies: `ws`, `fast-xml-parser`, `cheerio` (official news pages) and `undici`; `tsx` and TypeScript are
  development tooling.

```sh
npm -w server run record                     # refresh the recorded responses the tests use
npm run build
PORT=8788 node server/scripts/live-check.mjs # five minutes of real polling with a memory and health report
```

## License

The code is [MIT](LICENSE). Fonts, company logos, sky footage and recorded test responses keep their own
licenses: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
