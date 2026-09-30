# Architecture

Racelytic is a server-rendered Express application with a framework-free
frontend. MariaDB or MySQL stores the imported motorsport archive and
application-owned account, community, analytics and rating data.

## Request flow

1. `backend/server.js` registers public pages, APIs, redirects, robots.txt and
   the sitemap.
2. `backend/page-shell.js` injects the shared header and footer into page
   templates.
3. `backend/seo.js`, `backend/seo-data.js` and `backend/seo-prerender.js` add
   canonical metadata, structured data and visible detail-page content.
4. Browser modules in `frontend/js/` load archive data and enhance the page.

## Shared championship pages

`frontend/js/series-config.js` defines championship identity and base paths.
`backend/series-pages.js` maps reusable templates to public routes, and
`frontend/templates/page-shell.html` owns the common document structure.

Run `npm run build:frontend` after changing the page shell, series
configuration or generated route mappings. The generated manifest at
`frontend/generated/page-manifest.json` should not be edited by hand.

## Archive models

Formula series and Formula E use driver-oriented classifications. WEC uses an
entry-first model:

- one session result per classified car;
- ordered crews in the entry-driver relation;
- separate team, manufacturer, car-model and class identities;
- official championship point cells retained by round;
- analysis and ratings scoped by competition class.

The versioned WEC field contract is `data/wec-data-contract.json`.

## Ask Racelytic

Ask Racelytic is deterministic and runs locally inside the Node.js process.
`backend/routes/ask.js` manages requests and follow-up context,
`backend/ask-tools.js` selects a registered calculation, and
`backend/ask-engine.js` executes Formula 1, Formula 2, Formula 3, F1 Academy and
Formula E calculations against their archives. `backend/ask-wec.js` answers
WEC records, classifications and standings from the entry-first, class-aware
archive.

The intent fallback model is trained at startup from the version-controlled
catalogue. It has no external model API, runtime download or hosted telemetry.
Answers expose their selected tool and evidence count, and missing required
slots produce a clarification.

Conversation context is held in server memory for 30 minutes, is bounded to
twelve turns and is deleted by the New conversation action. The current tab
also keeps the latest answer and conversation in session storage for reloads;
it is restored only within 25 minutes. Ask conversations are not written to
the application database. A follow-up about evidence explains the source and
assumptions of the previous calculation.

## Data and generated assets

Versioned CSV files in `data/` are the import source for the supported
championship tables. Compact race replay manifests and Brotli chunks in
`frontend/data/replays/` are deployed static assets and are intentionally
versioned.

`backend/import/importer.js` reads CSV files, checks row counts against the
published tables, loads staging tables and switches the selected tables with
one `RENAME TABLE` statement. `backend/import/all.js` is the command-line
entry point. `scripts/sync-data.js` adds source collection, validation, local
CSV backups, a run log and per-series ratings rebuilds. Ratings are rebuilt
after archive publication, so a ratings failure needs a retry without rolling
the CSV files back to an older archive. Operational steps are in
[Data maintenance](data-maintenance.md).

Collectors use ignored local cache directories. Review images, downloaded
documents, database backups and temporary audit output belong in `tmp/` and
must not be committed.

## Validation

`npm test` runs behaviour, route, rendering, data-integrity and security
regression tests. `npm run check` validates generated pages, CSS, compact
replays, constructor lineage, JavaScript syntax and local links.

The [Ask question types](ask-question-types.md) document keeps the calculation
catalogue and concrete question inventory together. The separate
[wording variations](ask-question-variations.md) document tracks phrasing and
follow-up evaluation cases.
