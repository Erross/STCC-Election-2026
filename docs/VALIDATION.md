# Validation record

## Automated checks implemented

The adapter tests cover:

1. Real November zero report: 50 contests, 115 geographic units, 118 overall units; correct per-contest membership and clean party/candidate labels.
2. Real April completed results: 83 contests and all 220 contest/candidate totals reconcile. Proposition RT totals are asserted independently.
3. CSV BOM, commas, escaped quotes, embedded newlines, and truncated quoted fields.
4. Mismatched precinct/summary totals are rejected.
5. Unknown candidates, missing or duplicate rows, and negative votes are rejected.
6. Corrections at unchanged overall totals and status-only changes produce different hashes; reported-zero differs from unreported.
7. Exact rational thresholds: H at four-sevenths, H below the rounded 57.14% boundary, and O requiring more than half.
8. Wrong election IDs and malformed/truncated XML are rejected.

An additional test checks all 115 election-specific polygon joins. Four policy tests verify the start time, one-minute staleness threshold, completion across all contest-specific denominators, inconsistent reporting rejection, and permanent automatic stop after a saved 100% report. All thirteen tests passed during the completed build. TypeScript and production builds also passed.

## Browser checks performed

- Loaded the real November seed and all 50 contests.
- Verified candidate search for Wagner narrows to U.S. House District 2.
- Selected that race and verified Republican, Democratic, Libertarian and write-in options, county-only scope, and three special units.
- Filtered the precinct table to ABSENTEE and verified a single correct non-map row.
- Verified map polygon/label rendering. Additional interaction checks are recorded in the handoff.

Additional browser checks verified watchlist persistence after reload, keyboard selection of precinct 213, and an actual congressional CSV download (140 candidate rows across 35 reporting units). External basemap tiles were rejected by the provider's usage policy; that dependency was removed. County geometry now renders without external map requests.

Local preview server-side fetching returned a runtime fetch error. The deployed production service was separately tested using the Site's supported service authorization: POST `/api/refresh` returned a healthy state; GET `/api/health` confirmed a successful saved fetch; GET `/api/history` returned the persisted validated revision. Production had no ingestion error in that check. The private browser sign-in gate was verified. Production fetch/storage is therefore verified independently of seed rendering.

## Limits

November data currently contain no votes. April nonzero replay validates schema and totals, but it cannot prove November's future publication cadence. Other approval thresholds require verification before activation. Narrow-screen CSS is provided; only browser dimensions actually observed may be claimed as visually verified.

## GitHub Pages migration validation

The portable version passes all 18 tests and TypeScript checks. Five additional tests execute application SQL against real in-memory SQLite through a D1-shaped adapter and verify cross-origin ETag/preflight, shared rate limiting across page and scheduled requests, last-good retention after source mismatch, persisted completion across all automatic collection paths, and read-only health behavior.

Both a Vite production build using `/STCC-Election-2026/` and a standalone Wrangler Worker dry run passed. The earlier browser and private-host deployment checks above apply to the predecessor. GitHub Pages publication, the new Cloudflare deployment, cross-origin production network access and its scheduled trigger remain unverified until account setup and publication complete.

## Archived comparisons and mobile usability

All 28 tests pass, including complete archived school candidate totals, explicit absentee preservation, 2023 verified slate membership, cross-year comparison direction, same-year exclusion, and labeled two-party general archives. TypeScript, Pages production build and Worker dry-run pass. The historical data builder reconciles both general PDFs, cross-checks all 1,972 geographic 2024 D/R cells, and reconciles the complete 2023 school PDF including write-ins.

Browser QA at 360 px and 390 px phone widths and 768 px tablet width checks election switching, 2025-to-2024 and 2023-to-2024 published comparisons, large controls, bottom navigation, keyboard drawer dismissal, direct precinct selection, expandable precinct cards, and no page-level horizontal overflow. Desktop retains its table and sidebar. Narrow-screen validation uses real iframe viewports; actual iOS/Android hardware was not available. The deliverable is a responsive web app, not a separate native app.

## Combined legislative views

Six chamber tests verify the 11/2/2 race counts, 115/68/115 geographic ID coverage, 31/3/4 multi-district ID counts, separate per-race status/vote references, special reporting blocks, no zero-report winner color, split hatching across every map mode, missing historical comparators, and duplicate-entry rejection. The complete suite now contains 34 tests. Collection, live reconciliation and cached-completion behavior are unchanged.

Browser QA confirms group deep links, 2026 zero-report House/Senate views, split precincts retaining separate district cards, 2024 U.S. House comparisons against the 2022 same office, and blank comparisons for missing historical returns. Phone checks at 360/390 px and tablet at 768 px exercise group switching from the contest drawer, Compare/Map navigation and direct precinct selection. These use responsive browser viewports rather than physical devices.
