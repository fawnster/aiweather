# Uptime2 official recordings

Recorded 2026-10-20 America/New_York / 2026-10-21 UTC. `manifest.json` contains
source URL, timestamp, byte count and SHA-256 for each unmodified response.

`npm -w server run record:uptime2` records using the runtime HTTP policy and
regenerates `server/UPTIME2-REPORT.md`. It exits nonzero for unavailable companies.

Fixtures are test inputs only, **never runtime fallbacks**. No authenticated or
private-token API is used. Source/period details are in `server/SOURCES.md`.
