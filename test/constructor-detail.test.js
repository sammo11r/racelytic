const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { resourceUrl, resourceIdFrom } = require('./frontend-resource-routes');
const { buildConstructorDetail, constructorDetail, constructorResults, juniorConstructorDetail, juniorConstructorResults } = require('../backend/constructor-detail');
const { clearConstructorLineageCache, constructorLineage, normalizeConstructorLineage, optionalConstructorLineage, scopeConstructorLineage } = require('../backend/constructor-lineage');
const { auditConstructorChronology, canonicalizeConstructorChronology } = require('../backend/constructor-lineage-data');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const profile = () => buildConstructorDetail({ id: 'team', name: 'Team', fullName: 'Team', countryName: 'France', currentSeason: 2026, totalChampionshipWins: 2, totalRaceStarts: 100, totalRaceWins: 20, totalPodiums: 30, totalPolePositions: 5, totalPoints: 500 }, [
    { year: 2026, positionNumber: 2, points: 0, championshipWon: 'false', drivers: 'Alpha||Béta', chassis: 'Car 26' },
    { year: 2024, positionNumber: 1, points: 500, championshipWon: 'true', drivers: 'Alpha', chassis: 'Car 24' },
    { year: 1954, positionNumber: null, points: null, championshipWon: 0, drivers: 'Historic', chassis: '' }
], [
    { driverId: 'alpha', driverName: 'Alpha', firstYear: 2024, lastYear: 2026, seasonYears: '2026,2024', starts: 30, wins: 10, podiums: 15, points: 200 },
    { driverId: 'beta', driverName: 'Béta', firstYear: 2026, lastYear: 2026, seasonYears: '2026', starts: 10, wins: 0, podiums: 0, points: 100 },
    { driverId: 'old', driverName: 'Historic', firstYear: 1954, lastYear: 1954, seasonYears: '1954', starts: 50, wins: 5, podiums: 7, points: 200 }
], [
    { chassisId: 'car', chassisName: 'Car', chassisFullName: 'Team Car', firstYear: 2024, lastYear: 2026, seasonYears: '2026,2024', engines: 'Engine A||Engine B', engineManufacturers: 'Manufacturer' }
]);
const results = () => Array.from({ length: 160 }, (_, i) => ['alpha', 'beta'].map((driverId, index) => ({
    raceId: `race-${i}`, year: i < 80 ? 2026 : 2024, round: i % 80 + 1, name: `Grand Prix ${i}`, circuitName: 'Circuit', date: '2026-06-01', driverId,
    driverName: driverId === 'alpha' ? 'Alpha' : 'Béta', gridPositionNumber: index + 1, positionNumber: index + 1, positionText: String(index + 1), points: 25 - index * 7
}))).flat();
function fixture(query = 'id=team', series = 'f1') {
    const nodes = new Map(), storage = new Map(), events = {}, pagination = new Map();
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', value: '', attrs: {}, events: {}, offsetLeft: 150,
            firstElementChild: { scrollTo(options) { this.scroll = options; } },
            setAttribute(key, value) { this.attrs[key] = value; }, addEventListener(key, fn) { this.events[key] = fn; }, scrollIntoView() {} });
        return nodes.get(id);
    };
    let search = query;
    const entity = ['f3', 'academy'].includes(series) ? 'team' : 'constructor';
    const context = vm.createContext({ document: { getElementById: node }, window: { location: { hash: '', pathname: series === 'f1' ? '/constructor' : `/${series}/${entity}`, reload() {} }, addEventListener(key, fn) { events[key] = fn; } },
        URLSearchParams, Date, params: () => new URLSearchParams(search), activeSeriesKey: () => series,
        resourceUrl, resourceId: resourceIdFrom(() => search), esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
        fmtNumber: String, fmtDate: String, displayRaceName: row => row.name,
        history: { replaceState(a, b, url) { context.url = url; search = url.split('?')[1]; } },
        sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        pageItems(items, page, size) { page = Math.min(Math.max(1, page), Math.max(1, Math.ceil(items.length / size))); return { page, items: items.slice((page - 1) * size, page * size) }; },
        renderPagination(id, total, page, size, change) { pagination.set(id, { total, page, size, change }); }
    });
    const source = read('frontend/js/constructor.js');
    vm.runInContext(source.slice(0, source.lastIndexOf('\nreadConstructorDetailState();')), context);
    context.readConstructorDetailState(); context.bindConstructorDetail();
    return { context, node, storage, events, pagination };
}

test('constructor detail normalizes booleans and preserves participation-only seasons and exact gaps', () => {
    const data = profile();
    assert.equal(data.standings[0].championshipWon, false);
    assert.equal(data.standings[1].championshipWon, true);
    assert.equal(data.standings[2].points, null);
    assert.equal(data.constructor.firstYear, 1954);
    assert.deepEqual(data.constructor.currentDrivers.map(row => row.id), ['alpha', 'beta']);
    assert.deepEqual(data.chassis[0].seasons, [2026, 2024]);
    assert.deepEqual(data.chassis[0].engines, ['Engine A', 'Engine B']);
});

test('constructor queries cover participation and expose uncapped results independently of the profile', async () => {
    const queries = [];
    const connection = { async query(sql, parameters) { queries.push({ sql, parameters }); return sql.includes('SELECT k.*') ? [{ id: 'team' }] : []; } };
    assert.ok(await constructorDetail(connection, 'team', true));
    assert.equal(queries.length, 5);
    assert.ok(queries.every(query => query.parameters.every(value => value === 'team')));
    assert.match(queries[1].sql, /UNION SELECT constructorId, year FROM races_race_results/);
    assert.match(queries[1].sql, /FROM seasons_entrants_constructors/);
    assert.match(queries[1].sql, /SUM\(points\)/);
    queries.length = 0;
    await constructorResults(connection, 'team');
    assert.equal(queries.length, 1); assert.doesNotMatch(queries[0].sql, /LIMIT/i);
    assert.match(queries[0].sql, /gridPositionText, rr.reasonRetired/);
    queries.length = 0; await constructorDetail(connection, 'team'); assert.equal(queries.length, 6);
});

test('constructor lineage keeps identities separate and highlights the viewed constructor', () => {
    const lineage = normalizeConstructorLineage('brawn', [
        { positionDisplayOrder: 1, constructorId: 'honda', name: 'Honda', fullName: 'Honda Racing F1 Team', yearFrom: 2006, yearTo: 2008 },
        { positionDisplayOrder: 2, constructorId: 'brawn', name: 'Brawn', fullName: 'Brawn GP', yearFrom: 2009, yearTo: 2009 },
        { positionDisplayOrder: 3, constructorId: 'mercedes', name: 'Mercedes', fullName: 'Mercedes-AMG', yearFrom: 2010, yearTo: null }
    ]);
    assert.deepEqual(lineage.segments.map(segment => segment.constructorId), ['honda', 'brawn', 'mercedes']);
    assert.equal(lineage.segments.filter(segment => segment.current)[0].constructorId, 'brawn');
    const data = profile(); data.lineage = { ...lineage, identityScope: { note: 'This constructor identifier also contains results from a separate historical use of the same name.' } };
    const { context, node } = fixture(); context.renderConstructorProfile(data);
    assert.equal(node('constructor-lineage').hidden, false);
    assert.equal(node('constructor-lineage-link').hidden, false);
    assert.match(node('constructor-lineage-timeline').innerHTML, /\/constructors\/honda/);
    assert.match(node('constructor-lineage-timeline').innerHTML, /aria-current="page"/);
    assert.match(node('constructor-lineage-timeline').innerHTML, /constructor-lineage-bar/);
    assert.match(node('constructor-lineage-timeline').innerHTML, /constructor-lineage-years">2009/);
    assert.match(node('constructor-lineage-timeline').innerHTML, /--lineage-weight:1/);
    assert.match(node('constructor-lineage-timeline').innerHTML, /constructor-lineage-scope/);
    assert.match(node('constructor-lineage-timeline').innerHTML, /separate historical use/);
    assert.doesNotMatch(node('constructor-lineage-timeline').innerHTML, /Chronology source|How Racelytic defines|Same name, separate operation/);
});

test('constructor lineage handles identities reused in separate periods accessibly', () => {
    const rows = [
        { positionDisplayOrder: 1, constructorId: 'toleman', name: 'Toleman', yearFrom: 1981, yearTo: 1985 },
        { positionDisplayOrder: 2, constructorId: 'renault', name: 'Renault', yearFrom: 2002, yearTo: 2011 },
        { positionDisplayOrder: 3, constructorId: 'lotus-f1', name: 'Lotus F1', yearFrom: 2012, yearTo: 2015 },
        { positionDisplayOrder: 4, constructorId: 'renault', name: 'Renault', yearFrom: 2016, yearTo: 2020 },
        { positionDisplayOrder: 5, constructorId: 'alpine', name: 'Alpine', yearFrom: 2021, yearTo: null }
    ];
    const lineage = normalizeConstructorLineage('renault', rows);
    assert.equal(lineage.repeatedIdentity, true);
    assert.equal(lineage.segments.filter(segment => segment.sameIdentity).length, 2);
    assert.equal(lineage.segments.filter(segment => segment.current).length, 1);
    assert.equal(lineage.segments.find(segment => segment.current).fromYear, 2016);
    const data = profile(); data.lineage = lineage;
    const { context, node } = fixture(); context.renderConstructorProfile(data);
    assert.equal((node('constructor-lineage-timeline').innerHTML.match(/aria-current="page"/g) || []).length, 1);
    assert.doesNotMatch(node('constructor-lineage-timeline').innerHTML, /Same constructor identity|more than one period/);
});

test('constructor chronology normalizes duplicate chains and audits malformed ranges', () => {
    const rows = [
        { parentConstructorId: 'old', positionDisplayOrder: 1, constructorId: 'old', yearFrom: '2000', yearTo: '2004' },
        { parentConstructorId: 'old', positionDisplayOrder: 2, constructorId: 'new', yearFrom: '2005', yearTo: '' },
        { parentConstructorId: 'new', positionDisplayOrder: 1, constructorId: 'old', yearFrom: '2000', yearTo: '2004' },
        { parentConstructorId: 'new', positionDisplayOrder: 2, constructorId: 'new', yearFrom: '2005', yearTo: '' }
    ];
    const canonical = canonicalizeConstructorChronology(rows);
    assert.equal(canonical.length, 2);
    assert.equal(new Set(canonical.map(row => row.lineageId)).size, 1);
    assert.deepEqual(auditConstructorChronology(rows, ['old', 'new']), { errors: [], warnings: [] });
    const invalid = rows.map(row => ({ ...row })); invalid[1].yearFrom = '2004';
    assert.match(auditConstructorChronology(invalid).errors.join(' '), /overlapping|conflicting/);
});

test('optional constructor lineage cannot take down the constructor profile', async () => {
    const warnings = [];
    const connection = { query: async () => { throw Object.assign(Error('database unavailable'), { code: 'ER_CONNECTION_LOST' }); } };
    assert.equal(await optionalConstructorLineage(connection, 'team', { warn: message => warnings.push(message) }), null);
    assert.match(warnings[0], /Constructor lineage unavailable/);
});

test('lineage scope separates older same-name participation and caches positive lookups', async () => {
    const lineage = normalizeConstructorLineage('mercedes', [
        { positionDisplayOrder: 1, constructorId: 'brawn', name: 'Brawn', yearFrom: 2009, yearTo: 2009 },
        { positionDisplayOrder: 2, constructorId: 'mercedes', name: 'Mercedes', yearFrom: 2010, yearTo: null }
    ]);
    const scoped = scopeConstructorLineage(lineage, 'mercedes', [1954, 1955, 2010, 2026]);
    assert.deepEqual(scoped.identityScope.outsideYears, [1954, 1955]);
    assert.match(scoped.identityScope.note, /separate historical use/);
    clearConstructorLineageCache();
    let calls = 0;
    const connection = { query: async () => { calls += 1; return [
        { lineageId: 'mercedes', positionDisplayOrder: 1, constructorId: 'brawn', name: 'Brawn', yearFrom: 2009, yearTo: 2009 },
        { lineageId: 'mercedes', positionDisplayOrder: 2, constructorId: 'mercedes', name: 'Mercedes', yearFrom: 2010, yearTo: null }
    ]; } };
    assert.ok(await constructorLineage(connection, 'mercedes'));
    assert.ok(await constructorLineage(connection, 'mercedes'));
    assert.equal(calls, 1);
    clearConstructorLineageCache();
});

test('constructor hero is compact with current drivers, title badge and separate career totals', () => {
    const { context, node } = fixture(); context.renderConstructorProfile(profile());
    const html = node('constructor-head').innerHTML;
    assert.match(html, /<h1>Team<\/h1>/); assert.match(html, /2× Constructors’ champion/);
    assert.match(html, /P2 · 0 points/); assert.match(html, /href="\/drivers\/alpha"/);
    assert.doesNotMatch(html, /profile-monogram|Active in|>CONSTRUCTOR</);
    assert.match(node('constructor-stats').innerHTML, /Race starts/);
    assert.match(node('constructor-seasons').innerHTML, /Before constructors’ championship/);
    assert.doesNotMatch(node('constructor-seasons').innerHTML, /Championship P—/);
    assert.equal((node('constructor-seasons').innerHTML.match(/class="career-timeline-item champion"/g) || []).length, 1);
    const historical = profile(); historical.constructor.currentSeason = 2027;
    context.renderConstructorProfile(historical); assert.doesNotMatch(node('constructor-head').innerHTML, /constructor-current-season/);
});

test('driver and chassis filters use exact seasons with name, starts and win sorting', () => {
    const { context, node } = fixture(); context.renderConstructorProfile(profile());
    node('constructor-driver-search').events.input({ target: { value: 'beta' } });
    assert.deepEqual(Array.from(context.filteredConstructorDrivers(), driver => driver.driverId), ['beta']);
    node('constructor-driver-clear').events.click();
    for (const [sort, first] of [['wins', 'alpha'], ['starts', 'old'], ['name', 'alpha']]) {
        node('constructor-driver-sort').events.change({ target: { value: sort } });
        assert.equal(context.filteredConstructorDrivers()[0].driverId, first);
    }
    node('constructor-driver-season').events.change({ target: { value: '2025' } });
    assert.equal(context.filteredConstructorDrivers().length, 0);
    node('constructor-chassis-season').events.change({ target: { value: '2025' } });
    assert.match(node('constructor-chassis').innerHTML, /No chassis recorded/);
    node('constructor-chassis-season').events.change({ target: { value: '2024' } });
    assert.match(node('constructor-chassis').innerHTML, /href="\/chassis\?search=Team%20Car"/);
});

test('race history retains more than 250 entries and paginates by 25 complete races', () => {
    const { context, node, pagination } = fixture(); context.applyConstructorResults(results());
    assert.equal(context.groupedConstructorResults().length, 160);
    assert.equal(pagination.get('constructor-results').size, 25);
    assert.equal((node('constructor-results').innerHTML.match(/class="constructor-race-results"/g) || []).length, 25);
    assert.equal((node('constructor-results').innerHTML.match(/class="constructor-race-result"/g) || []).length, 50);
    pagination.get('constructor-results').change(7);
    assert.equal((node('constructor-results').innerHTML.match(/class="constructor-race-results"/g) || []).length, 10);
    node('constructor-result-season').events.change({ target: { value: '2024' } });
    assert.equal(context.groupedConstructorResults().length, 80);
    node('constructor-result-driver').events.change({ target: { value: 'beta' } });
    assert.ok(context.groupedConstructorResults().every(race => race.entries.length === 1));
    node('constructor-result-search').events.input({ target: { value: 'missing' } });
    assert.match(node('constructor-results').innerHTML, /No races match/);
    node('constructor-result-clear').events.click(); assert.equal(context.groupedConstructorResults().length, 160);
});

test('constructor result labels handle retirement sentinels, pit lane, DNS and classified retirements', () => {
    const { context } = fixture();
    for (const [input, expected] of [
        [{ positionNumber: 999, positionText: '999', reasonRetired: 'Engine' }, 'DNF'],
        [{ positionNumber: 999, positionText: 'DNS' }, 'DNS'], [{ positionNumber: 1000 }, 'NC'],
        [{ positionNumber: 1, positionText: 'DSQ' }, 'DSQ'], [{ positionNumber: 15, positionText: '15', reasonRetired: 'Engine' }, '15']
    ]) assert.equal(context.constructorResultFinish(input), expected);
    for (const [input, expected] of [[{ gridPositionNumber: 999 }, '—'], [{ gridPositionText: '999' }, '—'], [{ gridPositionText: 'PL' }, 'Pit lane'], [{ positionText: 'DNS' }, 'DNS'], [{ gridPositionNumber: 2 }, '2']]) assert.equal(context.constructorResultGrid(input), expected);
});

test('constructor filters, race pagination and safe archive return links survive URL state', () => {
    const { context, node, pagination } = fixture('id=team&return=%2Fconstructors%3Fview%3Dall&season=2024&page=2&driver=alpha&timeline=1954');
    context.renderConstructorProfile(profile()); context.applyConstructorResults(results());
    assert.equal(context.constructorReturnPath(), '/constructors?view=all');
    assert.equal(pagination.get('constructor-results').page, 2);
    assert.match(context.url, /season=2024/); assert.match(context.url, /return=%2Fconstructors%3Fview%3Dall/);
    assert.equal(node('constructor-timeline-year').value, '1954');
    node('constructor-timeline-latest').events.click(); assert.equal(node('constructor-timeline-year').value, '');
    assert.doesNotMatch(context.url, /timeline=/);
    assert.equal(fixture('id=team&return=https://example.com').context.constructorReturnPath(), '/constructors');
    assert.equal(fixture('id=team&return=/constructors-evil').context.constructorReturnPath(), '/constructors');
});

test('cached profile appears immediately while uncached history loads independently and retries', async () => {
    const { context, node, storage } = fixture();
    storage.set('racelytic:f1:constructor:team:v2', JSON.stringify({ savedAt: Date.now(), data: profile() }));
    const pending = new Map(); context.getJSON = url => new Promise((resolve, reject) => pending.set(url, { resolve, reject }));
    const loading = context.loadConstructor();
    assert.match(node('constructor-head').innerHTML, /<h1>Team/);
    assert.equal(pending.size, 2);
    pending.get('/api/constructors/team?summary=1').reject(Error('Offline'));
    pending.get('/api/constructors/team?results=1').reject(Error('History unavailable'));
    await loading;
    assert.match(node('constructor-load-status').innerHTML, /Showing saved constructor/);
    assert.match(node('constructor-results-status').innerHTML, /constructor-results-retry/);
    context.getJSON = async () => results(); await node('constructor-results-retry').events.click();
    assert.match(node('constructor-results').innerHTML, /constructor-history-table/);
});

test('constructor loading tolerates disabled storage, empty history and missing ID', async () => {
    const { context, node } = fixture();
    context.sessionStorage.getItem = () => { throw Error('Disabled'); };
    context.sessionStorage.setItem = () => { throw Error('Full'); };
    context.getJSON = async url => url.includes('summary=1') ? profile() : [];
    await context.loadConstructor();
    assert.match(node('constructor-head').innerHTML, /<h1>Team/);
    assert.match(node('constructor-results').innerHTML, /No races match/);
    const missing = fixture(''); missing.context.getJSON = () => { throw Error('Must not fetch'); };
    await missing.context.loadConstructor(); assert.match(missing.node('constructor-load-status').textContent, /Choose a constructor/);
    assert.equal(missing.node('constructor-head').attrs['aria-busy'], 'false');
});

test('constructor detail has scoped compact styling, section links and selective surfaces', () => {
    const html = read('frontend/constructor.html'), css = read('frontend/css/polish.css');
    assert.match(html, /constructor-section-nav/); assert.match(html, /aria-busy="true"/);
    assert.doesNotMatch(html, /CAREER RECORD|At a glance/); assert.match(html, /<div class="eyebrow">TIMELINE<\/div>/);
    assert.doesNotMatch(html, /Latest 250|Recent races|table-wrap detail-results/);
    assert.match(css, /\.constructor-detail-page \.constructor-driver-grid \{ grid-template-columns: repeat\(4,/);
    assert.match(css, /\.constructor-detail-page \.constructor-driver-card \{ min-height: 0/);
    assert.match(css, /prefers-reduced-motion: reduce.*constructor-detail-page/);
    assert.match(css, /\.constructor-race-results \{ display: grid; grid-template-columns: repeat\(2,/);
    assert.match(html, /<details class="mobile-detail-disclosure" open>/);
    assert.match(css, /\.mobile-detail-disclosure:not\(\[open\]\) > \.mobile-detail-disclosure-content \{ display: none; \}/);
    assert.match(css, /\.constructor-section-nav \{[^}]*margin-right: -14px; margin-left: -14px; padding: 12px 14px;/);
});

for (const series of ['f2', 'f3', 'academy']) {
    test(`${series} shares the compact profile, exact filters and efficient race history without chassis`, async () => {
        const { context, node, pagination } = fixture('id=team', series);
        const data = profile(); data.chassis = []; data.constructor.abbreviation = 'TEAM';
        context.renderConstructorProfile(data);
        assert.match(node('constructor-head').innerHTML, /Teams’ champion/);
        assert.match(node('constructor-head').innerHTML, new RegExp(`href="/${series}/drivers/alpha`));
        assert.match(node('constructor-seasons').innerHTML, new RegExp(`href="/${series}/seasons/2026`));
        assert.doesNotMatch(node('constructor-seasons').innerHTML, /timeline-context|Before constructors/);
        const juniorResults = results().slice(0, 12).map((row, index) => ({ ...row, sessionId: `session-${Math.floor(index / 2)}`, sessionName: index < 6 ? 'Sprint Race' : 'Feature Race' }));
        context.applyConstructorResults(juniorResults);
        assert.equal(context.groupedConstructorResults().length, 6);
        assert.equal(pagination.get('constructor-results').size, 25);
        assert.match(node('constructor-results').innerHTML, new RegExp(`href="/${series}/races/race-0/grand-prix-0\\?session=session-0`));
        assert.match(node('constructor-results').innerHTML, /Grand Prix 0 · Sprint Race/);
        context.getJSON = async url => {
            if (url.includes('summary=1')) { assert.equal(url, `/api/constructors/team?summary=1&series=${series}`); return data; }
            assert.equal(url, `/api/constructors/team?results=1&series=${series}`); return juniorResults;
        };
        await context.loadConstructor();
        assert.match(context.url, new RegExp(`^/${series}/${['f3', 'academy'].includes(series) ? 'teams' : 'constructors'}/team(?:\\?|$)`));
    });
}

test('junior constructor data uses participation years and uncapped non-cancelled race sessions', async () => {
    const calls = [];
    const connection = { async query(sql, parameters) {
        calls.push({ sql, parameters });
        if (sql.includes('FROM f2_constructors constructors')) return [{ id: 'team', currentSeason: 2026, countryCode: 'fr' }];
        return [];
    } };
    const detail = await juniorConstructorDetail(connection, 'f2_', 'f2', 'team');
    assert.ok(detail); assert.deepEqual(detail.chassis, []); assert.equal(detail.constructor.countryName, 'France');
    assert.equal(calls.length, 3);
    assert.match(calls[1].sql, /UNION SELECT constructorId, year FROM f2_session_results/);
    assert.match(calls[2].sql, /GROUP_CONCAT\(DISTINCT career.year/);
    calls.length = 0;
    connection.query = async (sql, parameters) => {
        calls.push({ sql, parameters });
        if (sql.includes('FROM f2_session_results results')) return [{ sessionId: 'race-session', raceId: 'weekend', year: 2026, round: 1, driverId: 'driver', driverName: 'Driver', positionNumber: 999, status: 'CLA', points: 0 }];
        return [];
    };
    const raceRows = await juniorConstructorResults(connection, 'f2_', 'f2', 'team');
    assert.equal(raceRows[0].positionNumber, null); assert.equal(raceRows[0].positionText, 'DNF');
    assert.equal(calls.length, 2); assert.doesNotMatch(calls[0].sql, /LIMIT/i);
    assert.match(calls[0].sql, /sessions.cancelled IS NULL/);
    assert.match(calls[1].sql, /sessions.raceId IN \(\?\)/);
});
