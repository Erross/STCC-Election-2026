# Operations and API

Election key `2026-11-03`; county source ID `33`; display timezone `America/Chicago`.

## Hosting

Static React/Vite on GitHub Pages; a separate Cloudflare Worker and new D1 database in the owner's account. This tree has no Sites runtime dependency.

The public API origin comes from `VITE_RESULTS_API_URL`. GitHub's configure-pages action supplies the repository base path. Worker CORS permits `https://erross.github.io` and local development origins, including ETag conditional requests. CORS is not authentication: all API data is public election information, and the refresh endpoint accepts only fixed-source collection with a shared database lease.

## Lifecycle

1. Page load reads `/api/results`, including before polls close. The backend serves cached data until November 4 at 01:00 UTC (November 3 at 7 p.m. CST).
2. During collection, visible pages check every 30 seconds. A shared D1 lease permits one upstream attempt per minute. Hourly Worker invocations provide unattended fallback.
3. Fetch fixed county CSV/XML files with timeouts and size limits. Validate election ID, contest coverage, integer votes, unique joins and every precinct/candidate total. Optional HTML unit statuses never replace summary reporting counts.
4. Save each validated revision atomically with current state. The hash includes candidate counts and reporting metadata, detecting equal-total corrections. Errors retain last-good data and expose stale status.
5. At 100% across every contest's own denominator, cache the validated snapshot and stop upstream requests. The browser stops polling; the hourly handler returns without fetching county files. Do not resume collection for corrections without an explicit request.

## Routes

| Method and path | Behavior |
| --- | --- |
| GET `/api/results` | `{snapshot, health}`; refresh if due; ETag/304 |
| GET `/api/health` | Phase, hash, timestamps, collection policy and errors; no ingestion |
| POST `/api/refresh` | Fixed-source, policy-gated, rate-limited refresh; no external input |
| GET `/api/history` | Latest 200 validated revision metadata records |
| GET `/api/history/:hash` | A stored validated snapshot |

No vote editing, arbitrary imports, arbitrary upstream URLs or database administration routes. Schema migrations run at deployment, not from request handlers.

## Cutover verification

- Confirm the new Worker's health, storage and county network access.
- Confirm Pages geometry, assets, home link and deep links use the actual repository path.
- Verify cross-origin API requests and conditional ETag preflight.
- Disable the temporary ChatGPT Site automation only after successful cutover.
- Verify county election ID 33 before election night and inspect the first nonzero November report.
- Verify additional passage thresholds before adding labels.

Keep `Erross/Election-Map` and its legacy `fhsd-proxy` intact.
