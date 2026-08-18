# Racelytic

Racelytic is a Formula 1 data and analytics website using:

- F1DB CSV data
- MySQL/MariaDB
- Node.js
- Express
- Plain HTML, CSS and JavaScript

## Requirements

- Node.js 24+
- MySQL 8 / MariaDB
- The F1DB tables imported into the `racelytics` database

## Setup

1. Copy `.env.example` to `.env`.
2. Set your database credentials.
3. Install dependencies:

```bash
npm install
```

4. Make sure MySQL is running and the F1DB data has been imported.
5. Start Racelytic:

```bash
npm start
```

Open:

http://localhost:3000

## Existing database

This project expects the F1DB table names created by the generic importer, for example:

- `seasons`
- `drivers`
- `constructors`
- `circuits`
- `countries`
- `races`
- `races_driver_standings`
- `races_constructor_standings`
- `races_race_results`

The API is intentionally read-only: the website does not modify the F1DB data.

## Pages

- `/` — landing page
- `/seasons` — season browser
- `/season?year=2025` — season details
- `/drivers` — driver browser
- `/driver?id=max-verstappen` — driver details
- `/circuits` — circuit browser
- `/circuit?id=silverstone` — circuit details
- `/constructors` — constructor browser
- `/constructor?id=red-bull` — constructor details

- `/race?id=2025-01` — race classification

## Quality checks

Run JavaScript syntax and local-link checks with `npm run check`.

Run the automated tests with `npm test`.

Refresh complete Formula 2 practice, qualifying, grid, and race classifications from Motorsport
Stats with `npm run import:f2-results`. Use `-- --year=2025` to refresh one
season, `-- --sessions=practice` to import only practice, or
`-- --sessions=qualifying` to import only qualifying, or
`-- --sessions=race` to import only races. Add `--csv-only` to update the source
CSV without updating MariaDB. The importer also accepts
`-- --cache=path/to/results.json` when direct site access is not available.
If Motorsport Stats returns HTTP 403, the importer automatically switches to
an installed Chrome or Edge browser and keeps one browser window open during
the import. Use `-- --transport=browser` to select it immediately, or set
`MOTORSPORTSTATS_BROWSER` when the browser is installed in a non-standard
location. The optional `--headless` flag hides the window, but some site access
rules may reject headless browsers.

Refresh complete official Formula 2 driver standings, team standings, and
race-by-race awarded points with `npm run import:f2-standings`. Use
`-- --year=2025` for one season or `--csv-only` to update CSV files without
updating MariaDB. Run this after `import:f2-results` so official awarded points
are applied to the latest classifications. The standings importer uses the
last completed round and ignores future scheduled rounds.

If your F1DB export uses a different release/version, the SQL may need small column adjustments.
