# Data maintenance

These commands update the versioned archive and the local database. Run them
from a clean working tree so source changes and generated data remain easy to
review.

## WEC

Refresh, validate and import the official WEC archive with:

```bash
npm run collect:wec
npm run audit:wec
npm run import:wec
```

Use `npm run collect:wec -- --refresh` to bypass the local source cache. The
field contract is stored in `data/wec-data-contract.json`.

The archive covers 2012 through the ongoing 2026 season. It retains available
practice, qualifying, Hyperpole and race classifications, changing class
structures, entry crews and official championship points by round. Prologue
sessions, interim race-hour snapshots, lap analysis, pit-stop logs and weather
feeds are outside its current scope.

## Formula E and junior series

```bash
npm run collect:formula-e:history
npm run audit:formula-e
npm run import:formula-e

npm run collect:f3
npm run audit:f3

npm run collect:academy
npm run audit:academy
```

Formula 2 result and standings collectors can update one season or a specific
session family:

```bash
npm run import:f2-results -- --year=2026
npm run import:f2-results -- --sessions=qualifying
npm run import:f2-standings -- --year=2026
```

Add `--csv-only` to the Formula 2 commands when the database should remain
unchanged. The result collector also accepts `--cache=path/to/results.json`.

## Guarded database synchronisation

`npm run sync:data` collects configured championships, validates the CSV
archive, creates staging tables and publishes them with one atomic MariaDB
`RENAME TABLE` operation. Unexpected row loss fails the run before publication.
Successful publication rebuilds the selected rating tables.

```bash
# Validate current files without downloading or publishing
npm run sync:data:dry

# Show recent sync runs
npm run sync:data:status

# Refresh selected championships
npm run sync:data -- --series=f1,f2,wec

# Publish already downloaded CSV files
npm run sync:data -- --skip-fetch
```

Configure series selection, backup retention and the minimum row ratio in
`.env`. Only one synchronization can run at a time. Local backups are written
under the ignored `data/.sync-backups/` directory.

The production systemd service and timer are in `deploy/systemd/`. Review their
user, checkout path and Node binary before installing them on another host.

## Ratings

`npm run import` automatically rebuilds all published ratings through its
`postimport` lifecycle. A direct low-level call to `backend/import/all.js` skips
that follow-up and should be reserved for debugging.

Useful read-only research commands include:

```bash
npm run audit:ratings -- --strict
npm run audit:rating-identities -- --summary
npm run evaluate:ratings -- --inactivity --summary
npm run evaluate:ratings -- --teammate --summary
```

Evaluation commands only persist output when explicitly given `--save`.

## Formula 1 race replays

Coordinate replays from 2018 onward can be generated from FastF1:

```bash
python -m pip install -r requirements-replay.txt
npm run import:replay:telemetry -- --year=2026 --round=1
```

Imports are compacted into a metadata manifest and two-minute Brotli timeline
chunks. Validate the complete replay library with:

```bash
npm run compact:replays
npm run check:replays
```

Downloaded source caches remain local and are ignored by Git.
