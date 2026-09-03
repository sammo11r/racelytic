# Analysis regression audit

Preview: http://localhost:3002
Checked: 2026-09-03T07:19:12.411Z

## Fixed regressions

- F2 race-analysis links now target /f2/constructor instead of the nonexistent /f2/team route. The previous sweep found 11 broken team links.
- Race analysis clears previous results and shows the loading/error state when a season changes. Junior-series calendar failures previously left stale results visible and hid the error.

## Validation

- 434 automated tests passed, including live F1 and junior Records archive checks.
- npm run check passed: generated routes, CSS consolidation, replay manifests/chunks, JavaScript syntax and frontend dependencies. Modified audit scripts and race-analysis JavaScript were also syntax-checked after the fixes.
- 36 browser routes passed across F1, F2, F3 and F1 Academy.
- 108 desktop tab selections and 74 mobile view selections checked.
- 522 distinct internal links returned successful responses; no broken links remain.
- No browser runtime errors, failed local asset/API responses, or page overflow at 390px were detected.
- 4 simulated race-data failure and recovery scenarios passed. These used browser-local mocked responses; no source data was changed.

## Route results

| Route | Desktop tabs | Mobile views | Result |
|---|---:|---:|---|
| /academy/analysis | 0 | 0 | PASS |
| /academy/circuit-analysis | 4 | 0 | PASS |
| /academy/driver-comparison | 3 | 3 | PASS |
| /academy/driver-form | 4 | 4 | PASS |
| /academy/race-analysis | 4 | 4 | PASS |
| /academy/records | 0 | 0 | PASS |
| /academy/season-analysis | 5 | 5 | PASS |
| /academy/season-comparison | 4 | 4 | PASS |
| /academy/teammate-battles | 3 | 3 | PASS |
| /analysis | 0 | 0 | PASS |
| /circuit-analysis | 4 | 0 | PASS |
| /driver-comparison | 3 | 3 | PASS |
| /driver-form | 4 | 4 | PASS |
| /f2/analysis | 0 | 0 | PASS |
| /f2/circuit-analysis | 4 | 0 | PASS |
| /f2/driver-comparison | 3 | 3 | PASS |
| /f2/driver-form | 4 | 4 | PASS |
| /f2/race-analysis | 4 | 0 | PASS |
| /f2/records | 0 | 0 | PASS |
| /f2/season-analysis | 5 | 0 | PASS |
| /f2/season-comparison | 4 | 4 | PASS |
| /f2/teammate-battles | 3 | 3 | PASS |
| /f3/analysis | 0 | 0 | PASS |
| /f3/circuit-analysis | 4 | 0 | PASS |
| /f3/driver-comparison | 3 | 3 | PASS |
| /f3/driver-form | 4 | 4 | PASS |
| /f3/race-analysis | 4 | 4 | PASS |
| /f3/records | 0 | 0 | PASS |
| /f3/season-analysis | 5 | 0 | PASS |
| /f3/season-comparison | 4 | 4 | PASS |
| /f3/teammate-battles | 3 | 3 | PASS |
| /race-analysis | 4 | 0 | PASS |
| /records | 0 | 0 | PASS |
| /season-analysis | 5 | 5 | PASS |
| /season-comparison | 4 | 4 | PASS |
| /teammate-battles | 3 | 3 | PASS |

## Reproduce

```powershell
$env:F1_RECORDS_DB_TESTS='1'
$env:JUNIOR_RECORDS_DB_TESTS='1'
node --test
npm run check
node scripts/audit-analysis-browser.js
node scripts/audit-analysis-resilience.js
```

The browser scripts use a separate headless Chrome profile and default to localhost:3002. Set ANALYSIS_AUDIT_URL and ANALYSIS_AUDIT_BROWSER to override the server or browser. Screenshots and JSON results are in this directory.

Scope: available archive data, default selections, supported tabs, data-changing controls, shared links, and selected network failure/recovery paths. Authenticated save/publish actions were not exercised, and these checks do not exhaust every possible historical filter combination.
