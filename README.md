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

## Frontend structure

The frontend stays framework-free, but common behavior is generated from a small shared layer:

- `frontend/templates/page-shell.html` owns the common document shell.
- `frontend/js/series-config.js` is the single source for F1, F2, F3, and Academy identity and paths.
- `backend/series-pages.js` maps reusable junior-series templates to public routes.
- `frontend/js/ui-components.js` and `frontend/css/components.css` provide shared loading, error, empty, filter, table, and chart primitives.
- `frontend/js/header.js` is only a compatibility loader; navigation, search, analytics, and privacy live in separate modules.

Run `npm run build:frontend` after changing the shell, series configuration, or series-page mappings. It validates every generated route and refreshes `frontend/generated/page-manifest.json`; do not edit that manifest by hand.

Use `npm run consolidate:css` to remove exact duplicate top-level CSS rules safely. The normal `npm run check` command verifies that both generated output and CSS remain current.

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

## Automatic database updates

Racelytic has one guarded synchronization command:

```bash
npm run sync:data
```

The command checks the official F1DB GitHub release, refreshes the configured junior-series
collectors, backs up the current CSV files, runs the full test suite and CSV integrity audits,
loads every CSV into staging tables, and publishes all staging tables with one atomic MariaDB
`RENAME TABLE` operation. The live site therefore continues to use the old tables until the
entire replacement is ready. An import is rejected if a table unexpectedly loses more than 10%
of its rows. Set `DATA_SYNC_MIN_ROW_RATIO` to adjust that guard.

Only one synchronization can run at once. Every attempt is recorded in
`app_data_sync_runs`; inspect recent attempts with:

```bash
npm run sync:data:status
```

Validate the current CSV files without downloading or publishing anything with:

```bash
npm run sync:data:dry
```

Useful options are:

```bash
# Refresh selected championships only
npm run sync:data -- --series=f1,f2

# Publish already-downloaded CSV files
npm run sync:data -- --skip-fetch

# Re-download an F1DB release even if its version is unchanged
npm run sync:data -- --series=f1 --force
```

The updater keeps five CSV snapshots in `data/.sync-backups` by default and restores the latest
snapshot if source collection or validation fails. Configure the series, backup retention and
row-loss guard in `.env`; see `.env.example`. `GITHUB_TOKEN` is optional and only raises the
GitHub API rate limit. Database credentials should use a dedicated account that can create,
rename, insert into and drop Racelytic data tables.

For the Racelytics Linux VPS, the supplied service uses the `www-data` account,
`/var/www/racelytics` checkout and `/usr/local/bin/node`. If those deployment values change,
update `deploy/systemd/racelytic-data-sync.service` before installing the timer:

```bash
sudo cp deploy/systemd/racelytic-data-sync.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now racelytic-data-sync.timer
systemctl list-timers racelytic-data-sync.timer
```

The timer runs daily at approximately 04:15 server time and catches missed runs after a reboot.
Run `systemctl start racelytic-data-sync.service` for an immediate manual refresh and inspect
failures with `journalctl -u racelytic-data-sync.service`.

## Private traffic monitor

Racelytic includes anonymous first-party monitoring for visits, unique visitors,
timestamps, external referrer hosts, page popularity, and active reading time.
It does not store IP addresses, precise locations, or browser fingerprints, and
it respects the browser's Do Not Track setting.

Set private dashboard credentials in the VPS `.env` file:

```env
MONITOR_USERNAME=admin
MONITOR_PASSWORD=replace-with-a-long-random-password
```

Restart the Node service and open `/monitor`. The browser will request those
credentials using HTTP Basic authentication. The `app_analytics_visits` table
is created automatically on the first tracked visit. Serve the site over HTTPS
so dashboard credentials and traffic data are encrypted in transit.
## Local race replay imports

The race simulator at `/simulate-race` automatically lists replay files imported into
`frontend/data/replays`. Imports are local files: they do not change the Racelytic
database and can be deleted or regenerated independently.

Replay manifests use schema version 2. Coordinates and timestamps are quantized, and
each race is split into a small metadata manifest plus two-minute Brotli timeline chunks.
The browser loads the first chunk before enabling playback and prefetches the next chunk
near the end of the current window. Express serves chunks with immutable one-year caching
and transparently decompresses them for clients that do not advertise Brotli support.

Only Formula 1 coordinate replays from the 2018 season onward are supported.
Install FastF1 once and run:

```sh
python -m pip install -r requirements-replay.txt
npm run import:replay:telemetry -- --year=2024 --round=1
```

New imports are compacted automatically. To migrate or verify an existing replay library:

```sh
npm run compact:replays
npm run check:replays
```

The manifest and chunk URLs are deliberately independent, so chunk files can later move
to object storage or a CDN without changing the replay engine.

The importer rejects earlier seasons. A successful import prints the exact
preview URL.
