const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.join(__dirname, '../frontend');
const script = fs.readFileSync(path.join(frontend, 'js/drivers.js'), 'utf8');
const functionsOnly = script.slice(0, script.indexOf('async function loadDrivers()'));
const context = vm.createContext({
    URLSearchParams,
    location: { pathname: '/drivers', search: '' },
    history: { replaceState() {} },
    document: { getElementById: () => ({}) },
    esc: String,
    fmtNumber: String,
    params: () => new URLSearchParams(),
    pageItems: () => ({}),
    renderPagination() {},
});
vm.runInContext(functionsOnly, context);

test('F1 driver archive leads with current and all-time discovery views', () => {
    const html = fs.readFileSync(path.join(frontend, 'drivers.html'), 'utf8');
    assert.match(html, /class="container page drivers-page"/);
    assert.match(html, /data-view="current"/);
    assert.match(html, /data-view="all"/);
    assert.match(html, /id="driver-season"/);
    assert.match(html, /id="driver-country"/);
    assert.match(html, /id="driver-achievement"/);
    assert.match(html, /id="driver-letters"[^>]+aria-label=/);
    assert.match(html, /id="drivers"[^>]+aria-busy="true"/);
});

test('driver search indexes archive context beyond names and abbreviations', () => {
    const text = context.driverSearchText({
        name: 'Example Driver', abbreviation: 'EXA', permanentNumber: 27,
        nationalityCountryId: 'united-kingdom',
        firstYear: 2010, lastYear: 2020,
    });
    assert.match(text, /united kingdom/);
    assert.match(text, /27/);
    assert.match(text, /2010 2020/);
});

test('driver cards suppress meaningless zero achievements and retain useful context', () => {
    assert.equal(context.driverCareer({ firstYear: 2001, lastYear: 2001 }), '2001 season');
    assert.equal(context.driverCareer({ firstYear: 2001, lastYear: 2008 }), '2001–2008');
    assert.doesNotMatch(context.driverAchievements({ totalRaceStarts: 4 }), /wins|podiums|titles/);
    assert.match(context.driverAchievements({ totalChampionshipWins: 2, totalRaceWins: 10 }), /2<\/strong> titles/);
});

test('driver archive controls are shareable and include a helpful empty state', () => {
    assert.match(script, /history\.replaceState\(null, '', `\/drivers/);
    assert.match(script, /class="driver-empty-state"/);
    assert.match(script, /id="driver-empty-clear"/);
    assert.match(script, /return: `\$\{location\.pathname\}\$\{location\.search\}`/);
    const detail = fs.readFileSync(path.join(frontend, 'js/driver.js'), 'utf8');
    assert.match(detail, /const archivePath = `\$\{driverDetail.root\}\/drivers`/);
    assert.match(detail, /returnPath === archivePath/);
    assert.match(detail, /driver-back-link/);
});

test('F1 driver API supplies career and start-count card context', () => {
    const source = fs.readFileSync(path.join(__dirname, '../backend/routes/drivers.js'), 'utf8');
    assert.match(source, /totalRaceStarts/);
    assert.match(source, /SELECT\s+driverId,\s+MIN\(year\) AS firstYear,\s+MAX\(year\) AS lastYear,\s+MIN\(positionNumber\) AS bestChampionshipPosition\s+FROM seasons_driver_standings\s+GROUP BY driverId/s);
    assert.doesNotMatch(source, /SELECT MAX\(year\) FROM seasons_driver_standings standings WHERE standings\.driverId = drivers\.id/);
});

test('driver archive reserves its card layout while data loads', () => {
    const html = fs.readFileSync(path.join(frontend, 'drivers.html'), 'utf8');
    const skeletons = html.match(/class="f1-driver-archive-card driver-card-skeleton"/g) || [];
    assert.equal(skeletons.length, 8);
    assert.match(html, /aria-label="Loading Formula 1 drivers"/);
    const css = fs.readFileSync(path.join(frontend, 'css/polish.css'), 'utf8');
    assert.match(css, /@keyframes driver-card-loading/);
    assert.match(css, /prefers-reduced-motion: reduce/);
});

test('driver archive cards use a compact layout without forced internal whitespace', () => {
    const css = fs.readFileSync(path.join(frontend, 'css/polish.css'), 'utf8');
    assert.match(css, /\.f1-driver-archive-card \{[^}]*min-height: 126px;[^}]*padding: 15px 16px;/);
    assert.match(css, /\.f1-driver-archive-card \.f2-driver-card-record \{ margin-top: 8px; padding-top: 0; \}/);
    assert.doesNotMatch(css, /\.f1-driver-archive-card \.f2-driver-card-record \{[^}]*margin-top: auto/);
    assert.match(css, /\.driver-archive-grid \{ grid-template-columns: repeat\(4,minmax\(0,1fr\)\)/);
    assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.driver-archive-grid \{ grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
});
