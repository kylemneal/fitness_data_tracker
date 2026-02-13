# Fitness Data Tracker

Local-first dashboard for Apple Health exports.

## What it does
- Scans `raw_exports/` recursively for Apple Health `export.xml` files.
- Ingests selected metrics into DuckDB with fingerprint deduplication.
- Aggregates daily values for:
  - `weight`
  - `steps`
  - `resting_hr`
  - `walking_hr`
  - `exercise_minutes`
- Serves a responsive single-page dashboard with:
  - date presets/custom range
  - period-over-period comparison
  - 7-day rolling average
  - goal lines
  - import status and data-quality warnings

## Local run (native)
1. Install dependencies:
```bash
npm install
```
2. Start development server:
```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```
3. Open:
- `http://localhost:3000`
- optionally from mobile on same LAN: `http://<your-machine-ip>:3000`

## Local run (Docker)
```bash
docker compose up --build
```

The dashboard runs on `http://localhost:3000` and binds to LAN (`0.0.0.0`) for trusted local-network access.

## Environment
Copy `.env.example` to `.env.local` (optional):

- `RAW_EXPORTS_DIR` default: `./raw_exports`
- `DUCKDB_PATH` default: `./.data/fitness_data.duckdb`
- `ROLLING_WINDOW_DAYS` default: `7`

## API endpoints
- `GET /api/health`
- `GET /api/import/status`
- `POST /api/import/rescan`
- `GET /api/dashboard/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&compare=true`
- `GET /api/metrics/:metric?from=YYYY-MM-DD&to=YYYY-MM-DD&window=7&compare=true`
- `GET /api/goals`
- `PUT /api/goals/:metric` body: `{ "targetValue": number }`
- `GET /api/data-quality?runId=<optional>&limit=200`

## Testing
```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```

## Notes
- Import is incremental at file level (by `path + sha256`) and record level (fingerprint dedupe).
- Parsing uses streaming XML (`sax`) to handle large exports.
- The app is single-user, local-only, and intentionally has no authentication in v1.
- Keep LAN access limited to trusted private networks.
