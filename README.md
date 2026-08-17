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

If your F1DB export uses a different release/version, the SQL may need small column adjustments.
