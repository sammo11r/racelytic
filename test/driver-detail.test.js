const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.join(__dirname, '../frontend');
const html = fs.readFileSync(path.join(frontend, 'driver.html'), 'utf8');
const script = fs.readFileSync(path.join(frontend, 'js/driver.js'), 'utf8');
const css = fs.readFileSync(path.join(frontend, 'css/polish.css'), 'utf8');
const functionsOnly = script.slice(0, script.indexOf('async function loadDriverResults'));
const context = vm.createContext({
    window: {}, document: { getElementById: () => ({}) }, location: { pathname: '/driver', search: '' },
    URLSearchParams, Intl, esc: String, fmtNumber: String, fmtDate: String,
    displayRaceName: result => result.name, pageItems: () => ({}), renderPagination() {}, params: () => new URLSearchParams(),
});
vm.runInContext(functionsOnly, context);

test('F1 driver detail reserves every major region while loading', () => {
    assert.match(html, /id="driver-head" aria-busy="true"/);
    assert.match(html, /class="detail-hero profile-hero driver-profile-hero driver-detail-skeleton"/);
    assert.doesNotMatch(html, /id="driver-career-summary"/);
    assert.match(html, /id="driver-stats"[^>]+driver-stat-grid[^>]+aria-busy="true"/);
    assert.match(html, /id="driver-seasons"[^>]+aria-busy="true"/);
    assert.match(html, /id="driver-results"[^>]+aria-busy="true"/);
});

test('driver profile starts directly with the name and adds useful career context', () => {
    assert.doesNotMatch(script, /driver-profile-flag/);
    assert.doesNotMatch(script, /FORMULA 1 DRIVER/);
    assert.match(script, /<h1>\$\{esc\(driver\.name\)\}<\/h1>/);
    assert.match(script, /World champion/);
    assert.match(script, /Current' : 'Latest'\} constructor/);
    assert.match(script, /detailStat\('Race starts'/);
    assert.match(script, /detailStat\('Win rate'/);
    assert.match(script, /dateOfDeath/);
});

test('season timeline includes performance records and accessible scroll controls', () => {
    assert.match(html, /id="driver-timeline-previous"[^>]+aria-label="Earlier seasons"/);
    assert.match(html, /id="driver-timeline-next"[^>]+aria-label="Later seasons"/);
    assert.match(script, /season\.totalRaceWins/);
    assert.match(script, /season\.totalPodiums/);
    assert.match(script, /season\.totalPolePositions/);
    assert.match(script, /'Not classified'/);
    assert.match(script, /scrollBy\(/);
});

test('race history supports filtering, richer results and mobile cards', () => {
    assert.match(html, /id="driver-result-search"/);
    assert.match(html, /id="driver-result-season"/);
    assert.match(html, /id="driver-result-outcome"/);
    assert.match(html, /Complete F1 record/);
    assert.match(script, /positionsGained/);
    assert.match(script, /reasonRetired/);
    assert.match(script, /fastestLap/);
    assert.match(script, /class="driver-result-card"/);
    assert.match(script, /pageItems\(visible, driverResultPage, 25\)/);
    assert.match(script, /renderPagination\('driver-results', visible\.length, driverResultPage, 25/);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.driver-results-section table \{ display: none; \}[\s\S]*?\.driver-result-cards \{ display: grid/);
});

test('profile is removed and only the timeline itself keeps a card surface', () => {
    assert.doesNotMatch(html, /Career overview/);
    assert.match(html, /class="detail-section driver-plain-section driver-timeline-section"/);
    assert.match(html, /id="driver-seasons" class="driver-timeline-card"/);
    assert.match(html, /class="detail-section driver-plain-section driver-results-section"/);
    assert.match(css, /\.driver-timeline-card \{[^}]*border: 1px solid var\(--border\);[^}]*background: #fff;/);
    assert.match(css, /\.driver-plain-section \{ padding: 0; border: 0; background: transparent; box-shadow: none; \}/);
});

test('profile summary and race history use separate endpoints', () => {
    assert.match(script, /\/api\/drivers\/\$\{encodeURIComponent\(id\)\}\?summary=1/);
    assert.match(script, /\/api\/drivers\/\$\{encodeURIComponent\(id\)\}\/results/);
    const backend = fs.readFileSync(path.join(__dirname, '../backend/routes/drivers.js'), 'utf8');
    assert.match(backend, /router\.get\('\/api\/drivers\/:id\/results'/);
    assert.match(backend, /summaryOnly \? Promise\.resolve\(\[\]\)/);
    assert.match(backend, /LEFT JOIN seasons_drivers seasonStats/);
    assert.match(backend, /SELECT year, driverId FROM seasons_drivers WHERE driverId = \?[\s\S]*UNION[\s\S]*SELECT year, driverId FROM races_race_results WHERE driverId = \?/);
    assert.match(backend, /LEFT JOIN seasons_driver_standings s/);
    assert.match(backend, /raceStats\.totalRaceStarts/);
    assert.doesNotMatch(backend, /F1_DRIVER_RESULTS_SQL[\s\S]*?LIMIT 200[\s\S]*?`;/);
});

test('result retirement classification ignores normal finishes', () => {
    assert.equal(context.driverResultIsRetirement({ reasonRetired: 'Finished' }), false);
    assert.equal(context.driverResultIsRetirement({ reasonRetired: 'Engine' }), true);
    assert.equal(context.driverResultIsRetirement({ reasonRetired: '' }), false);
});
