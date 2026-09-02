const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { renderAcademyHtml, renderAcademyScript } = require('../backend/academy-renderer');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const script = read('frontend/js/driver.js').replace(/loadDriver\(\);\s*$/, '');
const backend = read('backend/routes/drivers.js');
function fixture(series = 'f2', query = '') {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', value: '',
            attributes: {}, handlers: {}, setAttribute(key, value) { this.attributes[key] = value; },
            addEventListener(key, fn) { this.handlers[key] = fn; }, scrollIntoView() {} });
        return elements.get(id);
    };
    const context = vm.createContext({
        window: {}, document: { getElementById: element, querySelector: () => null },
        URLSearchParams, Intl, esc: value => String(value ?? ''), fmtNumber: String, fmtDate: String,
        displayRaceName: row => row.name, params: () => new URLSearchParams(query),
        pageItems(items, page, size) { return { page, items: items.slice((page - 1) * size, page * size) }; },
        renderPagination(id, total, page, size, change) { context.pagination = { id, total, page, size, change }; },
        setError(id, message) { element(id).innerHTML = message; }
    });
    let config = series === 'f1' ? '' : read(`frontend/js/${series === 'academy' ? 'f3' : series}-driver.js`);
    if (series === 'academy') config = renderAcademyScript(config);
    vm.runInContext(config + '\n' + script, context);
    return { context, element };
}

test('all junior details share the latest F1 layout and loading placeholders', () => {
    for (const series of ['f2', 'f3', 'academy']) {
        let html = read(`frontend/${series === 'academy' ? 'f3' : series}-driver.html`);
        if (series === 'academy') html = renderAcademyHtml('f3-driver.html', html);
        assert.match(html, /class="container page driver-detail-page"/);
        assert.match(html, /id="driver-seasons" class="driver-timeline-card"/);
        assert.match(html, /class="detail-section driver-plain-section driver-results-section"/);
        assert.match(html, /id="driver-timeline-next"/);
        assert.match(html, /id="driver-result-search"/);
        assert.match(html, /id="driver-result-season"/);
        assert.match(html, /id="driver-result-outcome"/);
        assert.equal((html.match(/driver-stat-skeleton/g) || []).length, 8);
        assert.match(html, /\/js\/driver\.js/);
        assert.doesNotMatch(html, /Latest 300|Career overview|id="driver-career-summary"/);
        assert.ok(html.includes(`href="/${series}/drivers"`));
        if (series === 'academy') {
            assert.match(html, /Complete F1 Academy record/);
            assert.match(html, /\/academy-js\/f3-driver.js/);
            assert.doesNotMatch(html, /Formula 3|\/f3\//);
        }
    }
});

test('junior summaries render the name first, latest constructor, eight stats and unclassified seasons', () => {
    for (const series of ['f2', 'f3', 'academy']) {
        const { context, element } = fixture(series);
        const data = context.normalizeDriverProfile({ driver: { name: 'Test Driver', countryCode: 'nl', currentSeason: 2026, latestNumber: 9, latestConstructorName: 'Current Team' }, standings: [
            { year: 2026, positionNumber: null, starts: 2, wins: 0, podiums: 1, points: 10, constructorName: 'Old Team / Current Team' },
            { year: 2025, positionNumber: 1, championshipWon: '1', starts: 20, wins: 5, podiums: 8, poles: 3, fastestLaps: 2, points: 100, constructorName: 'Old Team' }
        ] });
        context.renderDriverProfile(data);
        assert.match(element('driver-head').innerHTML, /profile-hero-copy">\s*<h1>Test Driver/);
        assert.match(element('driver-head').innerHTML, /Current constructor Current Team/);
        assert.doesNotMatch(element('driver-head').innerHTML, /World champion|FORMULA .* DRIVER|Active in|flag/);
        assert.equal((element('driver-stats').innerHTML.match(/class="detail-stat/g) || []).length, 8);
        assert.match(element('driver-seasons').innerHTML, /Not classified/);
        assert.ok(element('driver-seasons').innerHTML.includes(`href="/${series}/season?year=2025"`));
        assert.equal(data.driver.totalRaceStarts, 22);
        assert.equal(data.driver.totalChampionshipWins, 1);
    }
});

test('complete histories paginate at 25 on desktop and mobile and retain the last result', () => {
    const { context, element } = fixture();
    context.rows = Array.from({ length: 326 }, (_, i) => ({ raceId: i, name: `Event ${i}`, sessionLabel: 'Sprint', year: 2025, positionNumber: i % 20 + 1, constructorId: 'team', constructorName: 'Team', points: i % 5 }));
    vm.runInContext('driverResultRows = rows; renderDriverResults()', context);
    assert.equal((element('driver-results').innerHTML.match(/<tr>/g) || []).length, 26);
    assert.equal((element('driver-results').innerHTML.match(/class="driver-result-card"/g) || []).length, 25);
    assert.equal(context.pagination.total, 326);
    assert.equal(context.pagination.size, 25);
    assert.match(element('driver-results').innerHTML, /href="\/f2\/race\?id=0"/);
    assert.match(element('driver-results').innerHTML, /href="\/f2\/constructor\?id=team"/);
    context.pagination.change(14);
    assert.match(element('driver-results').innerHTML, /Event 325/);
    assert.equal((element('driver-results').innerHTML.match(/class="driver-result-card"/g) || []).length, 1);
});

test('junior filters include race format, season and outcomes, with honest missing movement', () => {
    const { context } = fixture();
    context.rows = [
        { name: 'Monza', sessionLabel: 'Sprint 2', year: 2021, positionNumber: 1, points: 10 },
        { name: 'Monza', sessionLabel: 'Feature', year: 2025, reasonRetired: 'DNF', points: 0 },
        { name: 'Monza', sessionLabel: 'Feature', year: 2025, reasonRetired: 'DSQ', points: 0 }
    ];
    assert.equal(vm.runInContext("driverResultRows = rows; driverResultSearch = 'sprint 2'; filteredDriverResults().length", context), 1);
    assert.equal(vm.runInContext("driverResultSearch = ''; driverResultSeason = '2025'; filteredDriverResults().length", context), 2);
    assert.equal(vm.runInContext("driverResultOutcome = 'retirements'; filteredDriverResults().length", context), 1);
    assert.equal(vm.runInContext("driverResultSeason = ''; driverResultOutcome = 'wins'; filteredDriverResults().length", context), 1);
    assert.equal(context.driverResultMovementText(context.driverResultMovement({})), '—');
    assert.equal(context.driverResultMovementText(context.driverResultMovement({ positionsGained: 0 })), '0');
    assert.equal(context.driverResultMovementText(context.driverResultMovement({ positionsGained: 4 })), '+4');
});

test('grid display preserves pit-lane and non-start codes and identifies inferred positions', () => {
    const { context } = fixture('f1');
    assert.equal(context.driverResultGrid({ gridPositionNumber: null, gridPositionText: 'PL' }), 'Pit lane');
    assert.equal(context.driverResultGrid({ gridPositionNumber: null, positionText: 'DNQ' }), 'DNQ');
    assert.equal(context.driverResultGrid({ gridPositionNumber: null, positionText: 'DNF' }), '—');
    assert.match(context.driverResultGridMarkup({ gridPositionNumber: 4, gridSource: 'derived', gridNote: 'From qualifying' }), />4<\/span>/);
    assert.doesNotMatch(context.driverResultGridMarkup({ gridPositionNumber: 4, gridSource: 'derived' }), /\*/);
    assert.doesNotMatch(context.driverResultGridMarkup({ gridPositionNumber: 4, gridSource: 'official' }), /\*/);
    assert.doesNotMatch(script, /grid penalties or pit-lane changes may not be included/);
    assert.match(backend, /rr.gridPositionText/);
});

test('summary and complete history requests carry the series and preserve safe archive returns', async () => {
    for (const series of ['f2', 'f3', 'academy']) {
        for (const returnPath of [`/${series}/drivers?view=all&season=2025`, '//evil.example', '/f1/drivers', `/${series}/drivers/other`]) {
            const { context, element } = fixture(series, `id=example&return=${encodeURIComponent(returnPath)}`);
            const requests = [];
            context.getJSON = async url => { requests.push(url); return url.includes('/results') ? [] : { driver: { name: 'Example' }, standings: [] }; };
            await context.loadDriver();
            await Promise.resolve();
            assert.deepEqual(requests, [`/api/drivers/example?summary=1&series=${series}`, `/api/drivers/example/results?series=${series}`]);
            assert.equal(element('driver-back-link').href, returnPath.startsWith(`/${series}/drivers?`) ? returnPath : undefined);
        }
    }
});

test('junior results query is uncapped, scoped and normalizes grids, disqualifications and series labels', async () => {
    const seasons = read('backend/routes/seasons.js');
    const context = vm.createContext({ seriesPrefix: series => series === 'academy' ? 'fa_' : `${series}_`,
        ...require('../backend/junior-classification'),
        driverRaceGridContexts: () => new Map([['race1', { gridByDriver: new Map([['example', 4]]), source: 'official' }]]) });
    for (const [start, end] of [['function f2SessionType', 'function f2ResultPoints'], ['function f3SessionType', 'function f3ResultPoints']]) {
        vm.runInContext(seasons.slice(seasons.indexOf(start), seasons.indexOf(end)), context);
    }
    vm.runInContext(backend.slice(backend.indexOf('function juniorRaceSessionLabel'), backend.indexOf('// ============================================================')), context);
    vm.runInContext(backend.slice(backend.indexOf('async function juniorDriverResults'), backend.indexOf('// Entries and race classifications')), context);
    for (const series of ['f2', 'f3', 'academy']) {
        let sql;
        const rows = await context.juniorDriverResults({ query: async (query, args) => {
            assert.deepEqual(Array.from(args), ['example']);
            if (query.includes('SELECT sessions.raceId')) return [];
            sql = query;
            return [
                { sessionId: 'race1', raceId: 'monza-2021', raceName: 'Monza', sessionName: 'Sprint 2', year: 2021, sessionNumber: 6, positionNumber: 1, points: 10 },
                { raceName: 'Monza', sessionName: 'Race 2', year: 2025, sessionNumber: 6, positionNumber: 1, status: 'DSQ', points: 25 },
                { raceName: 'Monza', sessionName: 'Feature Race', year: 2025, sessionNumber: 4, positionNumber: 2, gridPositionNumber: null, points: 18 },
                { sessionId: 'race1', raceName: 'Monza', sessionName: 'Feature Race', positionNumber: 999, status: 'CLA', points: 0 }
            ];
        } }, series, 'example');
        assert.doesNotMatch(sql, /LIMIT/i);
        assert.match(sql, /sessions.cancelled/);
        assert.ok(sql.includes(`FROM ${series === 'academy' ? 'fa' : series}_session_results`));
        assert.equal(rows[0].sessionLabel, 'Sprint 2');
        assert.equal(rows[0].positionsGained, 3);
        assert.equal(rows[1].positionNumber, null);
        assert.equal(rows[1].points, 0);
        assert.equal(rows[2].positionsGained, null);
        assert.equal(rows[2].sessionLabel, series === 'academy' ? 'Feature Race' : 'Feature');
        assert.equal(rows[3].positionNumber, null);
        assert.equal(rows[3].positionText, 'DNF');
        assert.equal(rows[3].status, 'DNF');
        assert.equal(rows[3].reasonRetired, 'DNF');
        assert.equal(rows[3].positionsGained, null);
    }
});

test('driver results never display retirement sentinels or calculate movement from them', () => {
    const { context } = fixture('f2');
    assert.equal(context.driverResultFinish({ positionNumber: 999, positionText: 999, status: 'CLA' }), 'DNF');
    assert.equal(context.driverResultFinish({ positionNumber: 999, status: 'DNS' }), 'DNS');
    assert.equal(context.driverResultFinish({ positionNumber: 1001 }), 'NC');
    assert.equal(context.driverResultMovement({ positionNumber: 999, positionsGained: -990 }), null);
    assert.equal(context.driverResultMovement({ gridPositionNumber: 999, positionsGained: 990 }), null);
    assert.equal(context.driverResultGrid({ gridPositionNumber: 999, gridPositionText: '999' }), '—');
    assert.equal(context.driverResultGrid({ gridPositionNumber: '999' }), '—');
    assert.equal(context.driverResultGrid({ gridPositionNumber: 999, gridPositionText: 'PL' }), 'Pit lane');
});

test('shared renderer preserves F1 requests and clears all loading states on failure', async () => {
    const { context, element } = fixture('f1', 'id=test&return=%2Fdrivers%3Fview%3Dall');
    const requests = [];
    context.getJSON = async url => { requests.push(url); return url.includes('/results') ? [] : { driver: { name: 'Example' }, standings: [] }; };
    await context.loadDriver();
    await Promise.resolve();
    assert.deepEqual(requests, ['/api/drivers/test?summary=1', '/api/drivers/test/results']);
    assert.equal(element('driver-back-link').href, '/drivers?view=all');
    for (const series of ['f2', 'f3', 'academy']) {
        const failed = fixture(series, 'id=missing');
        failed.context.getJSON = async () => { throw new Error('Driver not found'); };
        await failed.context.loadDriver();
        for (const id of ['driver-head', 'driver-stats', 'driver-seasons', 'driver-results']) {
            assert.equal(failed.element(id).attributes['aria-busy'], 'false');
        }
        assert.equal(failed.element('driver-result-count').textContent, 'Race history unavailable');
    }
});

test('junior career coverage includes entries and classifications without inventing championship positions', () => {
    const source = backend.slice(backend.indexOf('async function juniorDriverCareer'), backend.indexOf("router.get('/api/drivers/:id/results'"));
    assert.match(source, /SELECT year FROM \$\{prefix\}entries WHERE driverId = \?/);
    assert.match(source, /UNION SELECT year FROM \$\{prefix\}session_results/);
    assert.match(source, /NULL AS positionNumber/);
    assert.match(backend, /career.filter\(season => !standings.some/);
});
