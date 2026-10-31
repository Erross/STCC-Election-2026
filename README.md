# St. Charles County 2026 Election Tracker

Separate November 3, 2026 tracker: all 50 contests, precinct maps and tables, watchlists, CSV exports and validated result history. The original Election-Map app and fhsd-proxy are separate.

The React/Vite frontend deploys to **GitHub Pages**. A new **Cloudflare Worker and D1 database in the owner's account** supply the live API. No ChatGPT Site or visitor login is required.

## Local development

Use Node 24:

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run worker:build
```

Copy `.env.example` to `.env.local` and set `VITE_RESULTS_API_URL` to the new STCC Worker's URL. `npm run dev` starts the frontend. For a local API, run `npx wrangler d1 migrations apply stcc-election-2026 --local --config wrangler.jsonc`, then `npm run worker:dev`. Use `http://127.0.0.1:8787` as the frontend API URL.

Without an API URL, the app shows the saved county zero report and an explicit backend-unconnected warning. It does not present the seed as live results.

## Deployment

1. Create a separate repository, proposed name `STCC-Election-2026`. Develop on `build/github-pages`, then merge after validation. Enable Pages using **GitHub Actions** as the publishing source.
2. The new STCC D1 database is configured in `wrangler.jsonc` using the owner-provided account and database IDs. Do not reuse the original app's resources.
3. Set repository secret `CLOUDFLARE_API_TOKEN`. Use the Edit Cloudflare Workers token template scoped to the configured account and add D1 Edit for database migrations. The account/database IDs are already in source, so no repository variables are needed for them. Keep credentials out of source and chat. Alternatively use Wrangler login for local deployment without a CI token.
4. Run **Deploy new STCC backend** on main. It applies migrations and deploys `stcc-election-2026-api` with an hourly trigger. Verify the returned Worker's `/api/health` and `/api/results`.
5. Set repository variable `VITE_RESULTS_API_URL` to the new Worker URL. Run **Deploy tracker to GitHub Pages**. The workflow uses Pages' actual base path for assets and map geometry.
6. Verify the Pages app can reach its API and load the map. Only then disable the temporary ChatGPT Site's fallback automation. Do not change the original Election-Map.

For local Worker deployment, authenticate with Wrangler and set the non-secret account/database IDs in environment variables, then run `npm run worker:migrate` and `npm run worker:deploy`. Deployment refuses the placeholder database ID. Generated configuration and local secrets are ignored by Git.

## Collection and data

Starting November 3 at 7 p.m. CST, visible pages check the backend every 30 seconds. A shared database lease limits upstream attempts to once per minute. The hourly Worker trigger is the fallback. At 100% across every contest's own denominator, the validated snapshot is cached, the page stops polling, and further automatic upstream fetches stop. The hourly handler becomes a no-op. Results remain unofficial.

The county's public CSV/XML files need no API key and must reconcile before any new snapshot is stored. Failed or inconsistent fetches retain the last valid report. Congressional and statewide results represent St. Charles County's portion only.

See [operations](docs/OPERATIONS.md), [validation](docs/VALIDATION.md) and [attribution](docs/ATTRIBUTION.md).
