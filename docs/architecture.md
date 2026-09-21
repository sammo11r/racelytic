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
`backend/ask-engine.js` executes it against the archive.

The intent fallback model is trained at startup from the version-controlled
catalogue. It has no external model API, runtime download or hosted telemetry.
Answers expose their selected tool and evidence count, and missing required
slots produce a clarification.

Conversation context is held in server memory for 30 minutes, is bounded to
twelve turns and is deleted by the New conversation action. It is not written
to the application database.

## Data and generated assets

Versioned CSV files in `data/` are the import source for the supported
championship tables. Compact race replay manifests and Brotli chunks in
`frontend/data/replays/` are deployed static assets and are intentionally
versioned.

Collectors use ignored local cache directories. Review images, downloaded
documents, database backups and temporary audit output belong in `tmp/` and
must not be committed.

## Validation

`npm test` runs behaviour, route, rendering, data-integrity and security
regression tests. `npm run check` validates generated pages, CSS, compact
replays, constructor lineage, JavaScript syntax and local links.
