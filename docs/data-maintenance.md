# Data maintenance

These commands update the versioned archive and the local database. Run them
from a clean working tree so source changes and generated data remain easy to
review.

The normal path is **collect → validate → publish → rebuild ratings**. The
collector commands update CSV files; `npm run import` or a series-specific
import publishes them to the database. The `sync:data` command runs those
stages together for the selected championships.

To bring in the latest races, run `npm run sync:data`. `npm run import`
publishes only the CSV files already on disk; it does not fetch new results.

## WEC

Refresh, validate and import the official WEC archive with:

```bash
npm run collect:wec
npm run audit:wec
npm run import:wec
```

The WEC import command rebuilds WEC ratings after publication.

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

The Formula E import command rebuilds Formula E ratings after publication.
The F3 and F1 Academy commands above collect and audit CSV files; use
`npm run import` or `npm run sync:data -- --skip-fetch --series=f3,academy`
to publish them.

Formula 2 result and standings collectors can update one season or a specific
session family:

```bash
npm run import:f2-results -- --year=2026
npm run import:f2-results -- --sessions=qualifying
npm run import:f2-standings -- --year=2026
```

Add `--csv-only` to the Formula 2 commands when the database should remain
unchanged. The result collector also accepts `--cache=path/to/results.json`.
Without `--csv-only`, these collectors update their own tables directly; run
`npm run rebuild:ratings -- --series=f2` afterward. For a guarded publish,
collect with `--csv-only` and use `npm run sync:data -- --skip-fetch --series=f2`.
The 2026 FIA collector used by `sync:data` skips rounds already complete in
the archive. Pass `--refresh-round=11,12` to
`node scripts/import-f2-2026-fia.js --csv-only` when official results for
those rounds are corrected.

## Guarded database synchronisation

`npm run sync:data` collects configured championships, validates the CSV
archive, creates staging tables and publishes them with one atomic MariaDB
`RENAME TABLE` operation. Unexpected row loss fails the run before publication.
Successful publication rebuilds the selected rating tables. A dry run skips
collection and archive publication, but records its validation status in
`app_data_sync_runs`.

```bash
# Validate current files without downloading or publishing
npm run sync:data:dry

# Show recent sync runs
npm run sync:data:status

# Refresh selected championships
npm run sync:data -- --series=f1,f2,f3,wec

# Publish already downloaded CSV files
npm run sync:data -- --skip-fetch
```

Configure series selection, backup retention and the minimum row ratio in
`.env`. Only one synchronization can run at a time. Local backups are written
under the ignored `data/.sync-backups/` directory.

If collection, validation or publication fails, the sync restores its CSV
backup. If ratings rebuilding fails after publication, it keeps the newly
published CSV files so they still match the archive tables. Check
`npm run sync:data:status`, fix the cause, and rerun the affected
`npm run rebuild:ratings -- --series=<series>` command. The archive tables
remain published while ratings are being repaired.

The production systemd service and timer are in `deploy/systemd/`. Review their
user, checkout path and Node binary before installing them on another host.

## Ratings

`npm run import` automatically rebuilds all published ratings through its
`postimport` lifecycle. The series-specific Formula E and WEC commands rebuild
only their own ratings. A direct low-level call to `backend/import/all.js`
skips that follow-up and should be reserved for debugging.

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
