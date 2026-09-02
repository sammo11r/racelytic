const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { renderAcademyHtml, renderAcademyScript } = require('../backend/academy-renderer');

const frontend = path.join(__dirname, '../frontend');
const sharedScript = fs.readFileSync(path.join(frontend, 'js/junior-drivers.js'), 'utf8');
const functionsOnly = sharedScript.slice(0, sharedScript.indexOf('async function loadJuniorDrivers()'));
const context = vm.createContext({
    window: { JUNIOR_DRIVER_ARCHIVE: { series: 'f2', shortName: 'F2', root: '/f2', memorials: {} } },
    URLSearchParams,
    Intl,
    location: { pathname: '/f2/drivers', search: '' },
    history: { replaceState() {} },
    document: { getElementById: () => ({}) },
    esc: String,
    fmtNumber: String,
    params: () => new URLSearchParams(),
    pageItems: () => ({}),
    renderPagination() {},
});
vm.runInContext(functionsOnly, context);

test('junior championships use the complete F1 driver archive surface', () => {
    for (const file of ['f2-drivers.html', 'f3-drivers.html']) {
        const html = fs.readFileSync(path.join(frontend, file), 'utf8');
        assert.match(html, /class="container page drivers-page"/);
        assert.match(html, /data-view="current"/);
        assert.match(html, /data-view="all"/);
        assert.match(html, /id="driver-season"/);
        assert.match(html, /id="driver-country"/);
        assert.match(html, /id="driver-achievement"/);
        assert.match(html, /id="driver-letters"/);
        assert.match(html, /class="entity-grid driver-archive-grid"/);
        assert.equal((html.match(/driver-card-skeleton/g) || []).length, 8);
        assert.match(html, /\/js\/junior-drivers\.js/);
    }
});

test('shared junior archive filters current grids and suppresses empty achievements', () => {
    context.fixtureDrivers = [
        { id: 'old', name: 'Old Driver', firstSeason: 2020, lastSeason: 2021, totalStarts: 8 },
        { id: 'new', name: 'New Driver', firstSeason: 2026, lastSeason: 2026, totalRaceWins: 1 },
    ];
    const current = vm.runInContext("allJuniorDrivers = fixtureDrivers; latestJuniorDriverSeason = 2026; juniorDriverView = 'current'; filteredJuniorDrivers()", context);
    assert.deepEqual(Array.from(current, driver => driver.id), ['new']);
    assert.doesNotMatch(context.juniorDriverAchievements({ totalStarts: 8 }), /wins|podiums|titles/);
    assert.match(context.juniorDriverAchievements({ totalRaceWins: 1 }), /1<\/strong> win/);
});

test('F1 Academy inherits the shared archive with Academy identity and API series', () => {
    const sourceHtml = fs.readFileSync(path.join(frontend, 'f3-drivers.html'), 'utf8');
    const sourceConfig = fs.readFileSync(path.join(frontend, 'js/f3-drivers.js'), 'utf8');
    const html = renderAcademyHtml('f3-drivers.html', sourceHtml);
    const config = renderAcademyScript(sourceConfig);
    assert.match(html, /F1 ACADEMY PADDOCK/);
    assert.match(html, /Loading F1 Academy drivers/);
    assert.match(html, /\/js\/junior-drivers\.js/);
    assert.match(config, /series: 'academy'/);
    assert.match(config, /root: '\/academy'/);
    assert.match(config, /shortName: 'F1 Academy'/);
});

test('junior driver details return to the selected archive state', () => {
    for (const series of ['f2', 'f3']) {
        const html = fs.readFileSync(path.join(frontend, `${series}-driver.html`), 'utf8');
        const script = fs.readFileSync(path.join(frontend, `js/${series}-driver.js`), 'utf8');
        assert.match(html, /id="driver-back-link"/);
        assert.ok(script.includes(`root: '/${series}'`));
    }
});

test('junior driver API resolves each latest team in one ranked aggregate', () => {
    const source = fs.readFileSync(path.join(__dirname, '../backend/routes/drivers.js'), 'utf8');
    assert.match(source, /ROW_NUMBER\(\) OVER \(PARTITION BY entry\.driverId ORDER BY entry\.year DESC, entry\.round DESC\) AS entryRank/);
    assert.doesNotMatch(source, /SELECT entry\.constructorId[\s\S]+?WHERE entry\.driverId = d\.id[\s\S]+?LIMIT 1/);
});
