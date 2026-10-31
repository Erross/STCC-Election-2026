# STCC election tracker

This is a separate November 3, 2026 St. Charles County tracker. Do not edit or deploy Erross/Election-Map or fhsd-proxy as part of this project.

- Work on a development branch. The initial branch is `build/github-pages`.
- Read `README.md` and `docs/OPERATIONS.md` before editing ingestion or deployment.
- County election ID is 33. Never infer an ID from the current year.
- XML `TotalVotes` holds published candidate totals; `Votes` is not a substitute.
- Reconcile every precinct candidate sum with XML before publishing a snapshot. Reject ambiguity or missing/duplicate rows. Corrections may decrease counts.
- Keep ABSENTEE, CENTRAL 1, and CENTRAL 2 separate from geographic precincts. Membership and denominators differ by contest. No vote or status may be inferred from a polygon.
- All displayed results are St. Charles County votes. Do not claim full-state/full-district winners or certification.
- Do not infer approval rules. H and O are verified in the FHSD FAQ; use exact rational comparisons. Keep an explicit source with every new rule.
- Keep live content separate from historical viewing. A zero report is not a tie or a failure.
- Start automatic collection at 7 p.m. CST on November 3. Refresh only when the backend is at least a minute old. Once every contest reaches its own reporting denominator, cache that validated snapshot and stop all automatic collection, including the hourly task. Do not restart collection for corrections without an explicit request.
- Run `npm test`, `npm run typecheck`, npm run build and npm run worker:build after material changes. Tests use real April nonzero and November zero report fixtures, plus targeted failure cases.
- Deploy the frontend to a separate GitHub Pages repository, and its new Worker/D1 backend to the owner's Cloudflare account. No Sites runtime. Never put credentials in source.
- The refresh endpoint accepts no external inputs. It only fetches the fixed county URLs and rate-limits through a database lease.
