# Official source inventory

Inventory updated: **2026-10-21 UTC**. **48 companies: 46 live, 2 incident-feed, 0 none/no-page**. Writer, Replit, Anyscale, Midjourney and Deepgram were removed because their readable official sources cannot supply published uptime and daily history. Their unused adapters, tests and recordings were removed. Six verified Atlassian Statuspages replace them; see the live gate below. Per-row dates retain the original verification times.
All requests use exactly `aiweather/1.0 (+https://aiweather.synteq.app)`. No UA rotation, API keys, CAPTCHA solving, challenge bypass or headless browsers.
`live` means a current machine-readable status surface, not that the company is operational. `incident-feed` has a feed coverage caveat (absence of open incidents means operational only within that official feed).

| ID | Official source URL(s) | Kind | Level derivation | UA / access notes | Last verified |
|---|---|---|---|---|---|
| `claude` | [statuspage](https://status.claude.com/api/v2/summary.json) | live | Worst summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `openai` | [statuspage](https://status.openai.com/api/v2/summary.json)<br>[statuspage-incidents](https://status.openai.com/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `kimi` | [statuspage](https://status.moonshot.cn/api/v2/summary.json) | live | Only Kimi, Open API, API Service, Kimi Code; ignore website rows and whole-page indicator. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `minimax` | [statuspage](https://status.minimax.io/api/v2/summary.json)<br>[statuspage](https://status.minimaxi.com/api/v2/summary.json) | live | Worst of global + China; regional component/incident identities remain distinct. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `perplexity` | [statuspage](https://status.perplexity.com/api/v2/summary.json)<br>[statuspage-incidents](https://status.perplexity.com/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `cohere` | [statuspage](https://status.cohere.com/api/v2/summary.json)<br>[statuspage-incidents](https://status.cohere.com/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `manus` | [statuspage](https://status.manus.im/api/v2/summary.json) | live | Worst summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `elevenlabs` | [statuspage](https://status.elevenlabs.io/api/v2/summary.json)<br>[statuspage-incidents](https://status.elevenlabs.io/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `stability` | [statuspage](https://status.stability.ai/api/v2/summary.json)<br>[statuspage-incidents](https://status.stability.ai/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `ideogram` | [statuspage](https://status.ideogram.ai/api/v2/summary.json) | live | Worst summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `runway` | [statuspage](https://status.runwayml.com/api/v2/summary.json) | live | Worst summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `heygen` | [statuspage](https://status.heygen.com/api/v2/summary.json)<br>[statuspage-incidents](https://status.heygen.com/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `gamma` | [statuspage](https://status.gamma.app/api/v2/summary.json) | live | Compact page.status: UP operational, DEGRADED degraded, DOWN major, MAINTENANCE maintenance. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `cartesia` | [statuspage](https://status.cartesia.ai/api/v2/summary.json)<br>[statuspage-incidents](https://status.cartesia.ai/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `groq` | [statuspage](https://groqstatus.com/api/v2/summary.json)<br>[statuspage-incidents](https://groqstatus.com/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `cerebras` | [statuspage](https://status.cerebras.ai/api/v2/summary.json) | live | Worst summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `fireworks` | [statuspage](https://status.fireworks.ai/api/v2/summary.json)<br>[statuspage-incidents](https://status.fireworks.ai/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `lambda` | [statuspage](https://status.lambda.ai/api/v2/summary.json)<br>[statuspage-incidents](https://status.lambda.ai/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `openrouter` | [datadog](https://status.openrouter.ai/config.json) | live | Worst current component status, open incidents and in-progress maintenance; all seven component leaves remain separate. | 200 with required UA; no keys or bypass. | 2026-10-21 |
| `poe` | [statuspage](https://status.poe.com/api/v2/summary.json)<br>[statuspage-incidents](https://status.poe.com/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `cursor` | [statuspage](https://status.cursor.com/api/v2/summary.json) | live | Worst summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `copilot` | [statuspage](https://www.githubstatus.com/api/v2/summary.json) | live | Copilot component and related incidents only; all other GitHub components ignored. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `windsurf` | [statuspage](https://status.windsurf.com/api/v2/summary.json) | live | Worst summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `amp` | [statuspage](https://ampcodestatus.com/api/v2/summary.json)<br>[statuspage-incidents](https://ampcodestatus.com/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `factory` | [statuspage](https://status.factory.ai/api/v2/summary.json) | live | Worst summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `devin` | [statuspage](https://devinstatus.com/api/v2/summary.json) | live | Worst summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `lovable` | [statuspage](https://status.lovable.dev/api/v2/summary.json)<br>[statuspage-incidents](https://status.lovable.dev/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `bolt` | [statuspage](https://status.bolt.new/api/v2/summary.json)<br>[statuspage-incidents](https://status.bolt.new/api/v2/incidents.json) (≥5min) | live | Current summary indicator/components; supplemental incident details do not override current level. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `v0` | [statuspage](https://www.vercel-status.com/api/v2/summary.json) | live | v0 component exists in the recording and is used; otherwise use the whole page. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `zed` | [statuspage](https://status.zed.dev/api/v2/summary.json) | live | Compact page.status (UP/DEGRADED/DOWN/MAINTENANCE). | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `synteq` | [statuspage](https://status.synteq.com/api/v2/summary.json) | live | Compact page.status plus in-progress activeMaintenances; future NOTSTARTEDYET maintenance excluded. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `grok` | [rss](https://status.x.ai/feed.xml) | incident-feed | Explicit Status and Severity: outage major, disruption partial, degraded degraded; newest timestamped update. | Feed 200; HTML/JSON candidates 403 challenge. | 2026-10-20 |
| `deepseek` | [rss](https://status.deepseek.com/history.rss) | incident-feed | Explicit Status; English parenthesized titles; open impact only when readable from official incident text. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `qwen` | [qwen-live](https://status.alibabacloud.com/api/status/listCurrentProductStatus?regionId=non-regional)<br>[qwen](https://status.alibabacloud.com/api/status/listHistoryEvent?pageNumber=1&pageSize=50) | live | Live non-regional productStatus.sfm joined to eventDetails; also Model Studio/Bailian/Qwen history. ALARM partial, NORMAL operational; recovered requires endTime and Recovered title. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `together` | [betterstack](https://status.together.ai/index.json) | live | Worst current resource status, aggregate_state and open reports; JSON:API resource/report/update joins. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `huggingface` | [betterstack](https://status.huggingface.co/index.json) | live | Worst current resource status, aggregate_state and open reports; JSON:API resource/report/update joins. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `luma` | [betterstack](https://status.lumalabs.ai/index.json) | live | Worst current resource status, aggregate_state and open reports; JSON:API resource/report/update joins. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `novita` | [betterstack](https://status.novita.ai/index.json) | live | Worst current resource status, aggregate_state and open reports; JSON:API resource/report/update joins. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `modal` | [betterstack](https://status.modal.com/index.json) | live | Worst current resource status, aggregate_state and open reports; JSON:API resource/report/update joins. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `udio` | [betterstack](https://status.udio.com/index.json) | live | Worst current resource status, aggregate_state and open reports; JSON:API resource/report/update joins. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |
| `higgsfield` | [betterstack](https://status.higgsfield.ai/index.json) | live | Worst current resource status, aggregate_state and open reports; JSON:API resource/report/update joins. | 200 with required UA; no alternate UA attempted. | 2026-10-20 |

| `ai21` | [statuspage](https://status.ai21.com/api/v2/summary.json) | live | Summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no bypass. | 2026-10-21 |
| `augment` | [statuspage](https://status.augmentcode.com/api/v2/summary.json) | live | Summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no bypass. | 2026-10-21 |
| `warp` | [statuspage](https://status.warp.dev/api/v2/summary.json) | live | Summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no bypass. | 2026-10-21 |
| `baseten` | [statuspage](https://status.baseten.co/api/v2/summary.json) | live | Summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no bypass. | 2026-10-21 |
| `tavus` | [statuspage](https://status.tavus.io/api/v2/summary.json) | live | Summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no bypass. | 2026-10-21 |
| `assemblyai` | [statuspage](https://status.assemblyai.com/api/v2/summary.json) | live | Summary indicator, components, open incidents and in-progress maintenance. | 200 with required UA; no bypass. | 2026-10-21 |
| `gemini` | [gcp](https://status.cloud.google.com/incidents.json) | live | Gemini-specific Google Cloud incidents; unrelated products excluded. | 200 with required UA; no bypass. | 2026-10-21 |

## Normalization and polling

- Known severity ordering: major > partial > degraded > maintenance > operational. An unreadable configured source becomes unknown with an error, not an assumed severity. Unknown schemas/values fail closed.
- Statuspage indicator none/minor/major/critical maps to operational/degraded/partial/major. Component statuses operational/degraded_performance/partial_outage/major_outage/under_maintenance map directly to the contract. Scheduled maintenance affects current weather only when in progress.
- Fourteen incident.io compatibility summaries omit incident lists in the recordings. Their working `/api/v2/incidents.json` endpoints supplement incidents at most every 5min; `/incidents/unresolved.json` was tried and returned 404, so is not used. These incident changes can lag the 60s summary level by up to roughly 6min. Other Statuspage sources do not make optional history requests; recently resolved incidents seen since boot are kept for 24h.
- Better Stack `/index.json` works for Together, Hugging Face, Luma, Novita, Modal, Udio, and Higgsfield; it is preferred over RSS. Their Statuspage-looking `/api/v2/summary.json` URLs return HTML, not status JSON. Live resource operational/degraded/downtime/partial_outage/maintenance/unavailable maps to operational/degraded/major/partial/maintenance/major; report resolved is closed.
- RSS incident IDs use the stable incident link (fragment removed), rather than per-update GUIDs. Grok has explicit severity. Other feeds use explicit outage/disruption/degradation/latency language in the official title when available; an open incident lacking readable impact is unknown rather than guessed. Resolved items need no current impact. Feed timestamps and feed retention limit what can be known; they are not component telemetry.
- Every company is scheduled at 60s ±10%, four workers, 10s per request, conditional requests where validators exist, and exponential error backoff plus Retry-After. MiniMax and Qwen have two endpoints and require both to read successfully. No per-source failures are masked by another source.

## Discovery evidence and limitations

### Qwen / Alibaba Model Studio

The public page bundle `https://g.alicdn.com/aliyun-next/status/0.0.19/index.js` exposed unauthenticated `status/listCurrentProductStatus` and `status/listProductForAllTypeInRegion` calls with `regionId`. The non-regional catalogue at `https://status.alibabacloud.com/api/status/listProductForAllTypeInRegion?regionId=non-regional` identifies Model Studio / 百炼 as product ID `sfm`. Both catalogue and live current response are recorded. The live endpoint returns `eventDetails` and `productStatus`; current `sfm` entries reference events by `eventId` and have `impactLevel` ALARM/NORMAL. History uses only relevant named products and the specified conservative recovery rule. A guessed region-list endpoint returned an application error and is not used.

### Board coverage (2026-10-21 UTC)

The registry contains 48 companies, including Gemini. Grok retains its official incident feed; the six additions below use the existing `page()` helper and Statuspage uptime parser. No missing dates or percentages are synthesized.

### Six Statuspage additions — live release gate (2026-10-21 UTC)

Run `cd server && npx tsx scripts/check-statuspage-additions.ts`. It calls the real `UptimeService` through the normal HTTP policy, not fixture reads. All six returned published `pct90` and 90 **known** daily entries spanning **2026-07-24..2026-10-21**. Status summary and uptime showcase responses are recorded in `fixtures/manifest.json` and `fixtures/uptime/manifest.json`; news evidence is in `fixtures/news/manifest.json`.

| Company | Selected headline | Live published pct90 | Real component names inspected |
| --- | --- | --- | --- |
| ai21 | AI21 Gateway | 99.99% | Studio Platform; Maestro; Model Requests; Jamba Models; Maestro Websearch; Compressors; Maestro Filesearch; Analytics; Dashboard; jamba-mini; jamba-large; Maestro; AI21 Gateway |
| augment | API | 99.84% | Cosmos; Customer Dashboard; API |
| warp | Warp Client | 100% | warp.dev; Account, team, and data services; Live sessions and agent control; Cloud agent execution; Warp agent harness; Automations and integrations; Web app; Warp Client; Downloads and updates |
| baseten | Dedicated Inference | 99.99% | Dedicated Inference; Model APIs; Training; Model Management API; Web Application; Homepage and Docs |
| tavus | Conversational Video Interface | 99.98% | Conversational Video Interface; API; Replica Training Service; Replica Video Service; Customer Portal; Background Video Service; Bulk Request Service; Video Conferencing; AWS eks-us-east-1; AWS ecs-us-east-1; AWS elb-us-east-1; AWS lambda-us-east-1; AWS route53; AWS sqs-us-east-1; Google Cloud Platform Google Cloud SQL; Google Cloud Platform Google Cloud Pub/Sub; Google Cloud Platform Google Compute Engine; Google Cloud Platform Google Kubernetes Engine; Google Cloud Platform Identity & Access Management; Slack integration; Cartesia |
| assemblyai | Asynchronous API | 99.94% | APIs; Asynchronous API; Transcription Queue; Container Registry; Web; Website; Streaming API; Compute Instances; Playground; Billing; Container Control Plane; AWS Cloud; Dashboard; LLM Gateway; Load Balancers; Database; Usage Statistics Database; Object Storage; Usage Statistics Bus |

AI21 Model Requests has 11 unknown days, so the established API gateway is the headline. Several newer Warp components have 75 unknown days; Warp Client has complete history. The release gate rejects unknown headline days, missing percentages or incomplete histories. These caveats do not imply complete history for every secondary component.

### OpenRouter / Datadog (2026-10-21 UTC)

`https://status.openrouter.ai/config.json` is the single public JSON payload used by the official Datadog-hosted page. Its component groups are flattened without merging Chat, Video, Image, TTS, STT, Embeddings, or Web & Application Services. Verified status values are operational/degraded/partial_outage/major_outage/maintenance. Only `in_progress` maintenance is current; scheduled/completed/canceled work is excluded. Open incidents use their current affected-component snapshot, not their worst historical update. Resolved incident history never drives current weather. Unreadable schemas/statuses fail closed.

The official page shell loads
[`status-pages-site-CDKF376M.min.js`](https://status.openrouter.ai/src/status-pages-site-CDKF376M.min.js),
app version **35.146178534**. `config.json` has no ready-made daily array, but
its own app reproduces the bars from incident/maintenance timelines (`Pg`,
wrapped by `PZ`) and displays percentages (`PG`, `wH`, `wF`, `PV`). We now port
those exact rules, not a new estimate. `/api/uptime/openrouter` exposes all seven
component leaves with 90 oldest-to-newest **UTC** dates and the existing generic
`source: 'statuspage'` discriminator. Chat is the registry-selected primary.

- Order updates by valid `startedAt` (year > 1), falling back to `createdAt`.
  Ignore deleted timeline entries. The daily bar is the worst of the carried
  state and every change that day; carry only the day's last state forward.
  A previously affected component omitted from a snapshot becomes operational.
  Seed the retained window from older timeline entries, rather than painting
  old open incidents green. The resolved date is included even at midnight:
  these are daily-notice bars, not duration-only bars.
- Maintenance: skip scheduled entries, filter deleted updates, force affected
  statuses to maintenance, start at the valid scheduled start when supplied,
  and end completed notices at completion. The historical app also includes
  canceled notices through today; the port preserves this behavior. This is
  distinct from **current weather**, where only in-progress work applies.
- Coverage (`wj`) starts at the earlier of page creation and any valid timeline
  timestamp, including deleted updates and scheduled maintenance. Earlier dates
  are unknown, not assumed operational. The page uses the viewer's calendar;
  the API uses the same rules with UTC calendar methods as requested.
- Percentages appear because `visualizationType` is
  `bars_and_uptime_percentage`. For each 30/90-day page viewport, the page caps
  the period to positive elapsed coverage age. For each leaf it opens intervals
  only for `partial_outage`/`major_outage`, closes them when a subsequent snapshot
  no longer contains that outage, extends open intervals to now, unions overlaps,
  and clips to the page's selected start/end. Maintenance and degraded status
  do **not** reduce uptime. Its formula is
  `100 * clamp((periodDays * 86400000 - unionDowntimeMs) / (periodDays * 86400000), 0, 1)`.
  Preserve the app's fractional-age `Date.setDate` clipping semantics, using UTC;
  display rounding is exactly `.toFixed(2)`. The slots carry those displayed
  30/90-viewport values, **coverage-capped**, not a claim of full 90-day coverage.
  The app can also use a 60-day viewport, which this contract cannot represent.
  `bars_only` omits both percentage fields. No company-wide average, invented
  duration, or percentage derived from the bar colors is supplied.

The unmodified config recording, URL/time/hash provenance, and minimal verbatim
first-party logic excerpts are in `fixtures/openrouter-uptime/`. Offline tests
execute those excerpts with a fixed UTC clock as an independent parity oracle
for the recording and edge cases. The full UI bundle is not committed; no
internal/authenticated endpoint, feature-flag override, browser, or bypass is
used. Runtime fetches only the ordinary public `config.json`.

The official blog advertises `https://openrouter.ai/blog/feed.xml` in its RSS alternate link. It returned 200 with the required UA and is wired for news; the status page itself has RSS disabled. See `NEWS-SOURCES.md`.

## Recordings

`fixtures/manifest.json` preserves URL, response status, content type, validators, verification time, latency, byte count and SHA-256 when a response was received. Each production endpoint has an unmodified JSON/XML response used by adapter tests; disabled sources and failed discovery candidates retain HTTP/error metadata. Discovery HTML/JS bodies are omitted to keep fixtures small and avoid committing public bootstrap keys or challenge material. Tests are offline and use each recording time, rather than treating historical recordings as current live data.

Component-scoped Kimi, Copilot and v0 levels come only from the selected live components, even when a related incident has a higher severity. Supplemental incident-list severities remain attached to incidents for events, but cannot keep a recovered live summary artificially degraded.

## Uptime follow-up: Better Stack, Instatus, FlashDuty, Alibaba (2026-10-20)

These providers use the unchanged `CompanyUptime` contract. `source: 'statuspage'`
means an official status-page source here, not necessarily Atlassian's software;
`note` identifies the actual provider. `pct30`/`pct90` are **published values
for that exact period** for these providers. OpenRouter is the documented
exception above: its displayed page formula is reproduced exactly. See
[`UPTIME2-REPORT.md`](UPTIME2-REPORT.md) for the live results and access failures.

| Provider | Companies | Official uptime source |
| --- | --- | --- |
| Better Stack | huggingface, luma, modal, novita, higgsfield, together, udio | Each registry official status origin + `/index.json` |
| Instatus | gamma, zed, synteq | `https://status.gamma.app`, `https://status.zed.dev`, `https://status.synteq.com` SSR embedded JSON |
| FlashDuty | deepseek | `https://status.deepseek.com/api/status-page/6410630422455/summary/active` and `/summary/structure?start_at_from_seconds=<90d-ago>&start_at_to_seconds=<now>` |
| Alibaba Cloud | qwen | `https://status.alibabacloud.com/api/status/listProductStatusInPeriodInternational?regionId=non-regional&endTime=<ms>&numOfDay=1000` |

### Better Stack

JSON:API `included` contains `status_page_resource` rows, joined using
`data.relationships.resources.data`; `public_name` is the component label.
`availability` is the source-published 90-day availability ratio. Convert to a
percentage and truncate to three decimals, matching the page (e.g. Hugging Face
`0.999899` → `99.989%`), **not** a percentage calculated from incident durations.
`status_history` publishes `day`, `status`, `downtime_duration`, and
`maintenance_duration` (seconds). Keep the most recent 90 source date labels;
`downMinutes` is published downtime seconds / 60, excluding maintenance.
`not_monitored`/`unknown` stays unknown with no fabricated zero minutes.
`recovered` histories with published downtime preserve outage severity and
minutes instead of erasing the earlier outage. No 30-day percentage is inferred.

### Instatus

Checked Instatus's linked `/en/public-api` documentation on Gamma. Public `/v3/summary.json`,
`/v3/components.json` (also `/v2/components.json`) provide current status, **not
uptime**, and document no public uptime endpoint. Do not use private-token API
routes. The fallback is structured JSON already in server-rendered HTML:
JSON-decode `self.__next_f.push([1, "..."])` chunks, concatenate the Next Flight
stream, then JSON-decode the records containing `site` and `componentsUptime`.
Never evaluate JavaScript. Join component IDs to `site.components`; copy
`componentsUptime[id].uptime`, and use `site.maxUptimeDays` to select `pct90`
(Gamma/Zed) or `pct30` (Synteq). The numeric monthly keys are **not** a rolling
30-day percentage. Respect visible `showUptime`/archived components.

Daily buckets use the published `startDate`/`endDate`, component availability,
and `outages` intervals. UTC labels, partial/major interval unions for minutes;
maintenance/degraded aren't counted as downtime. Dates before availability are
unknown. Notice titles come from the embedded notice map; no permalink is
invented. A 30-day window can display 31 calendar buckets; retain source history
up to 90 days, independently of the percentage's period.

### DeepSeek / FlashDuty

The `structure` response itself publishes
`data.component_uptimes[].uptime` and `data.section_uptimes[].uptime` for the
requested 90-day interval; **copy these numbers**, joined by
`component_id`/`section_id` to `/summary/active` metadata. No client-side uptime
formula needs replication. This was independently confirmed in the page's
first-party JS:

- `https://static.flashcat.cloud/status-page/_next/static/chunks/3125-101d2119e7600c8d.js`
  fetches `/summary/active` and `/summary/structure` with the selected interval.
- `https://static.flashcat.cloud/status-page/_next/static/chunks/3447-e1746043aa070026.js`
  finds the matching row in `component_uptimes` / `section_uptimes` and displays
  its `.uptime`. The client has a missing-value fallback of 100; **we do not copy
  that fallback** or fabricate a missing percentage.

`component_impacts`/`section_impacts` provide daily levels and unioned
partial/full-outage minutes, not percentages. Seconds are converted to UTC
buckets, clipped to the selected window; pre-availability dates stay unknown.
`linked_changes` supplies event titles. No 30-day percentage is invented.

### Qwen / Alibaba Cloud Model Studio

The official non-regional product catalogue identifies `sfm` as Alibaba Cloud
Model Studio / 百炼. Read only each daily row's
`productStatusDetail.productStatus.sfm`, joining `eventId` to `eventDetails`.
Empty product-status lists mean no listed incidents for that product, not
missing percentages. Use the existing Alibaba impact mapping (`ALARM` partial,
`NORMAL` operational); preserve official event links. Label source daily
timestamps in UTC, sort, retain at most 90 dates. **No percentage or downtime
minutes are published by this endpoint**, so neither is calculated.

Requests for `numOfDay=90`, `91`, `365`, and **1000** all succeeded with exactly
that many rows; **10000** timed out after 25 seconds. No documented finite
maximum was found in the official page bundle
`https://g.alicdn.com/aliyun-next/status/0.0.19/index.js`. The runtime therefore
uses **1000**, the largest fully verified response within the bounded HTTP/memory
policy, not a claimed API-enforced maximum. A mathematically largest accepted
value has not been established; do not present an unbounded/timeout-limited
probe as one.

### Published but blocked inventory — no bypass

Per the 2026-10-20 manual/server inventory, retain these as **published, blocked
(403)**, not "does not publish uptime", and do not wire around protection:

| Company | Published source | Status |
| --- | --- | --- |
| grok | `https://data.x.ai/status/uptime.json` | published, blocked (403), Cloudflare |

Access is variable: initial urllib verification at 2026-10-21 01:50 UTC, using
only the same honest UA and no cookies, returned 200 for Grok (and the now-removed Mistral/Replit URLs).
That observation is not evidence that the runtime can reliably access them,
and is not used as a transport workaround. No protection bypass was attempted;
Grok's server-side uptime source remains unwired; its frontend daily history is retained.

### Runtime bounds and recordings

All reads retain `aiweather/1.0 (+https://aiweather.synteq.app)`, the 10-second
request timeout, 4 MiB response bound, and challenge rejection (including 200
challenge HTML). Only uptime reads explicitly opt into ordinary HTML for SSR.
Successful normalized results cache for 30 minutes; existing failure backoff,
in-flight coalescing, two-company concurrency, 2 MiB/company and 8 MiB total
normalized cache limits remain. Raw HTML/JSON is not retained by runtime caches.

Run `npm -w server run record:uptime2` to record through runtime adapters and
regenerate the live report (nonzero exit if a company is unavailable). The raw
fixtures in `server/fixtures/uptime2` have URL, recording time, byte count and
SHA-256 in `manifest.json`.
Tests replay fixtures only; they never serve as live-data substitutes.
