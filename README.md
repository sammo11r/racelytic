# Racelytic

[![CI](https://github.com/sammo11r/racelytic/actions/workflows/ci.yml/badge.svg)](https://github.com/sammo11r/racelytic/actions/workflows/ci.yml)

Racelytic is an independent motorsport archive for exploring results, careers,
championships, ratings, simulations and racing history.

[Open Racelytic](https://racelytic.com) · [Data sources and licences](https://racelytic.com/data-sources) · [Report an issue](https://github.com/sammo11r/racelytic/issues)

![Racelytic social preview](frontend/assets/social-card.png)

## Championships

Racelytic currently covers:

- Formula 1
- Formula 2
- Formula 3
- F1 Academy
- Formula E
- FIA World Endurance Championship, from 2012 through the ongoing 2026 season

WEC uses an endurance-specific data model. Each classification belongs to a car
entry and links to its event crew, class, team, manufacturer and car model.

## What is included

- Connected season, event, session, driver, team, manufacturer, car and circuit archives
- Class-aware WEC results and championship standings
- Search across every supported championship
- Historical analysis, comparisons, records and Racelytic Ratings
- Season simulators, scenario calculators and custom championship builders
- Archive-backed quizzes and racing games
- Deterministic Ask Racelytic answers with visible evidence
- Server-rendered metadata, canonical URLs, structured data and dynamic sitemaps

## Technology

- Node.js 24 and Express 5
- MySQL 8 or MariaDB
- Plain HTML, CSS and JavaScript
- D3 for data visualisation
- Node's built-in test runner and axe-core accessibility checks

The frontend stays framework-free. Shared page shells and series configuration
generate consistent public routes while each championship can retain its own
formats and data model.

## Local setup

### Requirements

- Node.js 24 or newer
- MySQL 8 or MariaDB
- Git

### Install

```bash
git clone https://github.com/sammo11r/racelytic.git
cd racelytic
npm ci
```

Copy `.env.example` to `.env`, then set the database credentials for a local
database. The database itself must exist before the first import.

```sql
CREATE DATABASE racelytics CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Import the versioned CSV archive and build the ratings tables:

```bash
npm run import
```

Start the application:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Account, rating and analytics tables are created from the schemas in
`database/` when their features are first used. Use a dedicated database user
with the permissions needed to create and update Racelytic tables.

## Environment

The full development template is in [`.env.example`](.env.example).

| Variable | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | MariaDB or MySQL connection |
| `DB_USER`, `DB_PASSWORD` | Dedicated application credentials |
| `PORT` | Local HTTP port, default `3000` |
| `SITE_URL` | Public origin used for canonical URLs and sitemaps |
| `MONITOR_USERNAME`, `MONITOR_PASSWORD` | Optional private traffic dashboard credentials |
| `DATA_SYNC_*` | Guardrails for scheduled archive refreshes |
| `GITHUB_TOKEN` | Optional higher GitHub API allowance for F1DB release checks |

Never commit `.env` or production credentials.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm start` | Run the production-style server |
| `npm run dev` | Run the server with Node watch mode |
| `npm test` | Run the complete automated test suite |
| `npm run check` | Validate generated routes, CSS, replays, links and JavaScript |
| `npm run build:frontend` | Refresh and validate generated series pages |
| `npm run audit:wec` | Validate WEC archive integrity |
| `npm run sync:data:dry` | Validate local data without publishing it |

See [Data maintenance](docs/data-maintenance.md) for collectors, guarded
database publishing, ratings rebuilds and race replay imports.

## Project structure

```text
backend/      Express routes, archive queries, SEO and calculations
data/         Versioned championship data and data contracts
database/     Application-owned SQL schemas
deploy/       Production service and timer definitions
docs/         Maintainer documentation
frontend/     Pages, shared components, scripts, styles and static assets
scripts/      Import, validation, generation and maintenance tools
test/         Unit, integration, data integrity, SEO and rendering tests
```

The most useful implementation notes are in [Architecture](docs/architecture.md).

## Quality checks

Before opening a pull request, run:

```bash
npm test
npm run check
```

The suite covers application behaviour, archive integrity, responsive page
contracts, search, SEO, structured data and WEC's entry-first result model.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change. Report
security issues privately using the process in [SECURITY.md](SECURITY.md).

## Data rights and independence

Racelytic is unofficial and is not affiliated with the championships,
governing bodies, rights holders, teams, manufacturers or drivers represented
in the archive. Championship names and related marks belong to their owners.

Source material has its own attribution and reuse terms. Review the public
[Data Sources & Licences](https://racelytic.com/data-sources) page and the
attribution files stored beside applicable assets before reusing data or media.

No open-source licence is currently granted for Racelytic's original software,
design or writing. Their presence in this public repository does not by itself
grant reuse rights.
