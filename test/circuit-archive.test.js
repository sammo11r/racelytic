const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('frontend/js/circuits.js');
const functions = source.slice(0, source.lastIndexOf('\nreadCircuitState();'));
function fixture(query = '', series = 'f1') {
    const nodes = new Map(), storage = new Map();
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', value: '', attributes: {}, events: {},
            setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(key, fn) { this.events[key] = fn; },
            querySelectorAll() { return []; }, scrollIntoView() {} });
        return nodes.get(id);
    };
    const context = vm.createContext({
        document: { getElementById: node, querySelectorAll: () => [] }, window: { location: { pathname: series === 'f1' ? '/circuits' : `/${series}/circuits` }, addEventListener() {} },
        params: () => new URLSearchParams(query), URLSearchParams, Date,
        esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'), fmtNumber: String,
        history: { replaceState(_a, _b, url) { context.url = url; } },
        sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        pageItems(items, page, size) { const bounded = Math.min(Math.max(1, page), Math.max(1, Math.ceil(items.length / size))); return { page: bounded, items: items.slice((bounded - 1) * size, bounded * size) }; },
        renderPagination(id, total, page, size, change) { context.pagination = { id, total, page, size, change }; }
    });
    vm.runInContext(functions, context);
    context.readCircuitState();
    return { context, node, storage };
}

const circuits = [
    { id: 'a', name: 'Official Alpha Circuit', shortName: 'Alpha', previousNames: 'Old Speedway', countryId: 'uk', countryName: 'United Kingdom', type: 'RACE', seasons: [1950, 2026], firstYear: 1950, lastYear: 2026, currentSeason: 2026, totalRacesHeld: 2, firstHeldYear: 1950, lastHeldYear: 2026, length: 5.891, turns: 18 },
    { id: 'b', name: 'Bravo', countryId: 'fr', countryName: 'France', type: 'ROAD', seasons: [2000, 2001], firstYear: 2000, lastYear: 2001, currentSeason: 2026, totalRacesHeld: 30 },
    { id: 'c', name: 'São Paulo', countryId: 'br', countryName: 'Brazil', type: 'STREET', seasons: [2001, 2026], firstYear: 2001, lastYear: 2026, currentSeason: 2026, totalRacesHeld: 10 }
];

test('circuit archive reserves eight cards and provides current/all, season, country and type controls', () => {
    const html = read('frontend/circuits.html'), css = read('frontend/css/polish.css');
    assert.equal((html.match(/circuit-card-skeleton/g) || []).length, 8);
    assert.match(html, /data-circuit-view="current"/);
    assert.match(html, /data-circuit-view="all"/);
    for (const id of ['circuit-season', 'circuit-country', 'circuit-type', 'circuit-sort']) assert.ok(html.includes(`id="${id}"`));
    assert.match(html, /aria-busy="true"/);
    assert.match(css, /\.circuits-page \.circuit-archive-grid \{ grid-template-columns: repeat\(4,/);
    assert.match(css, /prefers-reduced-motion: reduce.*circuit-card-skeleton/);
});

test('current calendar uses actual appearances, not an unbroken first-to-last-year range', () => {
    const { context } = fixture();
    context.applyCircuitData(circuits);
    assert.deepEqual(Array.from(context.filteredCircuits(), row => row.id), ['a', 'c']);
    vm.runInContext("circuitView = 'all'; circuitSeason = '2001'", context);
    assert.deepEqual(Array.from(context.filteredCircuits(), row => row.id), ['b', 'c']);
    vm.runInContext("circuitSeason = '1960'", context);
    assert.equal(context.filteredCircuits().length, 0);
});

test('search covers short, official, former and accent-insensitive names and countries', () => {
    const { context } = fixture('view=all');
    context.applyCircuitData(circuits);
    for (const [q, expected] of [['Old Speedway', 'a'], ['Official Alpha', 'a'], ['sao paulo', 'c'], ['France', 'b']]) {
        context.queryText = q;
        vm.runInContext('circuitSearch = queryText', context);
        assert.equal(context.filteredCircuits()[0].id, expected);
    }
    vm.runInContext("circuitSearch = ''; circuitCountry = 'br'; circuitType = 'STREET'", context);
    assert.deepEqual(Array.from(context.filteredCircuits(), row => row.id), ['c']);
});

test('most recent and most races sorts use populated archive data', () => {
    const { context } = fixture('view=all&sort=recent');
    context.applyCircuitData(circuits);
    assert.deepEqual(Array.from(context.filteredCircuits(), row => row.id), ['a', 'c', 'b']);
    vm.runInContext("circuitSort = 'races'", context);
    assert.deepEqual(Array.from(context.filteredCircuits(), row => row.id), ['b', 'c', 'a']);
});

test('cards use short names, useful track facts, honest history and archive return URLs', () => {
    const { context } = fixture('view=all&country=uk&sort=races');
    context.applyCircuitData(circuits);
    const card = context.renderCircuitCard(circuits[0], 0);
    assert.match(card, /<h3>Alpha<\/h3>/);
    assert.match(card, /title="Official Alpha Circuit"/);
    assert.match(card, /5.891 km/);
    assert.match(card, /18 turns/);
    assert.match(card, /1950–2026/);
    assert.match(card, /return=%2Fcircuits%3Fview%3Dall%26country%3Duk%26sort%3Draces/);
    assert.match(context.renderCircuitCard({ ...circuits[0], totalRacesHeld: 0, firstHeldYear: null }, 0), /Awaiting first race/);
    assert.match(card, /Layout unavailable/);
});

test('pagination state survives refresh and is included in detail links', () => {
    const { context, node } = fixture('view=all&page=2');
    context.applyCircuitData(Array.from({ length: 30 }, (_, i) => ({ ...circuits[0], id: `track-${i}`, name: `Track ${i}`, shortName: `Track ${i}` })));
    assert.equal(context.pagination.page, 2);
    assert.equal(context.pagination.size, 24);
    assert.equal((node('circuits').innerHTML.match(/class="entity-card/g) || []).length, 6);
    assert.match(context.url, /page=2/);
    assert.match(node('circuits').innerHTML, /page%3D2/);
    context.pagination.change(1);
    assert.doesNotMatch(context.url, /page=/);
    const detail = read('frontend/js/circuit.js');
    assert.match(detail, /returnPath === archive/);
    assert.ok(detail.includes('startsWith(`${archive}?`)'));
});

test('empty results offer a working clear action and invalid page input is safe', () => {
    const { context, node } = fixture('view=all&q=missing&page=Infinity');
    context.applyCircuitData(circuits);
    assert.match(node('circuits').innerHTML, /No circuits found/);
    assert.equal(context.pagination.page, 1);
    node('circuit-empty-clear').events.click();
    assert.equal(context.filteredCircuits().length, 3);
    assert.equal(node('circuits').attributes['aria-busy'], 'false');
});

test('cached cards appear before refresh completes and survive a network failure', async () => {
    const { context, node, storage } = fixture();
    storage.set('racelytic:f1:circuits:v1', JSON.stringify({ savedAt: Date.now(), rows: circuits }));
    let reject;
    context.getJSON = () => new Promise((_resolve, fail) => { reject = fail; });
    const load = context.loadCircuits();
    assert.match(node('circuits').innerHTML, /<h3>Alpha/);
    assert.equal(node('circuit-load-status').textContent, 'Refreshing circuits…');
    reject(new Error('Offline')); await load;
    assert.match(node('circuits').innerHTML, /<h3>Alpha/);
    assert.match(node('circuit-load-status').innerHTML, /Showing saved circuits/);
});

test('uncached errors provide retry and blocked storage does not prevent loading', async () => {
    const { context, node } = fixture();
    context.sessionStorage.getItem = () => { throw Error('Disabled'); };
    context.sessionStorage.setItem = () => { throw Error('Disabled'); };
    context.getJSON = async () => { throw Error('Offline'); };
    await context.loadCircuits();
    assert.match(node('circuits').innerHTML, /Circuits unavailable/);
    context.getJSON = async () => circuits;
    await node('circuit-retry').events.click();
    assert.match(node('circuits').innerHTML, /<h3>Alpha/);
});

test('F1 circuit API retains exact calendar years, recency and completed-race counts', () => {
    const backend = read('backend/routes/circuits.js');
    assert.match(backend, /GROUP_CONCAT\(DISTINCT r.year/);
    assert.match(backend, /MAX\(r.year\) AS lastYear/);
    assert.match(backend, /SELECT DISTINCT raceId FROM races_race_results/);
    assert.match(backend, /COUNT\(completed.raceId\) AS recordedRacesHeld/);
    assert.match(backend, /c.previousNames LIKE/);
    assert.match(backend, /if \(isJuniorSeries\(series\)\)/);
});

for (const series of ['f2', 'f3', 'academy']) {
    test(`${series} shares F1 filters, cards, pagination and championship-specific navigation`, () => {
        const { context, node } = fixture('view=all&season=2026&country=uk&type=RACE&sort=races&page=2', series);
        context.applyCircuitData(Array.from({ length: 30 }, (_, i) => ({ ...circuits[0], id: `track-${i}` })));
        assert.equal(context.pagination.page, 2);
        assert.equal(context.pagination.size, 24);
        assert.equal(context.url, `/${series}/circuits?view=all&season=2026&country=uk&type=RACE&sort=races&page=2`);
        assert.match(node('circuits').innerHTML, new RegExp(`href="/${series}/circuit\\?`));
        assert.ok(node('circuits').innerHTML.includes(`return=%2F${series}%2Fcircuits`));
        assert.match(node('circuits').innerHTML, /5.891 km/);
        const current = fixture('', series).context;
        current.applyCircuitData(circuits);
        assert.deepEqual(Array.from(current.filteredCircuits(), row => row.id), ['a', 'c']);
        vm.runInContext("circuitView = 'all'; circuitSeason = '1960'", current);
        assert.equal(current.filteredCircuits().length, 0);
    });

    test(`${series} caches are isolated and show saved cards immediately with retry on failure`, async () => {
        const { context, node, storage } = fixture('', series);
        storage.set('racelytic:f1:circuits:v1', JSON.stringify({ savedAt: Date.now(), rows: [{ ...circuits[0], shortName: 'Wrong series' }] }));
        context.getJSON = async url => { assert.equal(url, `/api/circuits?series=${series}`); return circuits; };
        await context.loadCircuits();
        assert.ok(storage.has(`racelytic:${series}:circuits:v1`));
        const cached = fixture('', series);
        cached.storage.set(`racelytic:${series}:circuits:v1`, storage.get(`racelytic:${series}:circuits:v1`));
        let reject;
        cached.context.getJSON = () => new Promise((_resolve, fail) => { reject = fail; });
        const loading = cached.context.loadCircuits();
        assert.match(cached.node('circuits').innerHTML, /<h3>Alpha/);
        assert.doesNotMatch(node('circuits').innerHTML, /Wrong series/);
        reject(Error('Offline')); await loading;
        assert.match(cached.node('circuit-load-status').innerHTML, /Showing saved circuits/);
        cached.context.getJSON = async () => circuits;
        await cached.node('circuit-retry').events.click();
        assert.equal(cached.node('circuit-load-status').textContent, '');
    });
}

test('junior templates and generated Academy page share controls and retain safe detail return links', () => {
    const { renderAcademyHtml, renderAcademyScript } = require('../backend/academy-renderer');
    for (const series of ['f2', 'f3', 'academy']) {
        const file = series === 'f2' ? 'f2' : 'f3';
        let html = read(`frontend/${file}-circuits.html`);
        let detail = read(`frontend/js/${file}-circuit.js`);
        if (series === 'academy') {
            html = renderAcademyHtml('f3-circuits.html', html);
            detail = renderAcademyScript(detail);
            assert.match(html, /F1 Academy circuits/);
            assert.doesNotMatch(html, /Formula 3|academy-js/);
        }
        assert.match(html, /class="container page circuits-page"/);
        assert.match(html, /src="\/js\/circuits.js"/);
        assert.equal((html.match(/circuit-card-skeleton/g) || []).length, 8);
        for (const id of ['search', 'circuit-season', 'circuit-country', 'circuit-type', 'circuit-sort']) assert.ok(html.includes(`id="${id}"`));
        assert.ok(detail.includes(`returnPath === '/${series}/circuits'`));
        assert.ok(detail.includes(`startsWith('/${series}/circuits?')`));
    }
});

test('junior archive normalizes country, types, metres, short names and calendar years without inventing results', () => {
    const { juniorCircuitArchiveRow } = require('../backend/circuit-archive');
    const layouts = new Map([['silverstone-8', { name: 'Silverstone', countryName: 'United Kingdom', previousNames: '' }]]);
    const input = { id: 'silverstone-circuit_silverstone-circuit', name: 'Silverstone Circuit', placeName: 'Silverstone, Northamptonshire, Great Britain', type: 'Race Circuit', lengthMeters: '5891.000000', calendarYears: '2026,2024', currentSeason: 2026, recordedRacesHeld: '4', firstHeldYear: 2024, lastHeldYear: 2024 };
    const row = juniorCircuitArchiveRow(input, layouts);
    assert.equal(row.shortName, 'Silverstone');
    assert.equal(row.fullName, 'Silverstone Circuit');
    assert.equal(row.countryName, 'Great Britain');
    assert.equal(row.countryId, 'great-britain');
    assert.equal(row.placeName, 'Silverstone, Northamptonshire');
    assert.equal(row.type, 'RACE');
    assert.equal(row.length, 5.891);
    assert.deepEqual(row.seasons, [2026, 2024]);
    assert.equal(row.totalRacesHeld, 4);
    assert.equal(row.lastHeldYear, 2024);
    assert.equal(juniorCircuitArchiveRow({ ...input, placeName: '' }, layouts).countryName, 'United Kingdom');
    const future = juniorCircuitArchiveRow({ ...input, recordedRacesHeld: null, firstHeldYear: null, lastHeldYear: null }, layouts);
    assert.equal(future.totalRacesHeld, 0);
    assert.equal(future.firstHeldYear, null);
    const unknown = juniorCircuitArchiveRow({ id: 'unknown', type: 'Street Circuit' }, layouts);
    assert.equal(unknown.type, 'STREET');
    assert.equal(unknown.layoutId, null);
    assert.equal(unknown.countryId, '');
    assert.equal(juniorCircuitArchiveRow({ id: 'valencia', name: 'Circuit Ricardo Tormo' }, layouts).layoutId, null);
});

test('junior archive counts distinct completed race sessions, not classifications or scheduled weekends', () => {
    const backend = read('backend/routes/circuits.js');
    assert.match(backend, /SELECT s.raceId, COUNT\(\*\) AS raceCount/);
    assert.match(backend, /LOWER\(CAST\(s.isRace AS CHAR\)\) IN \('1', 'true'\)/);
    assert.match(backend, /s.cancelled IS NULL OR LOWER\(CAST\(s.cancelled AS CHAR\)\) NOT IN \('1', 'true'\)/);
    assert.match(backend, /EXISTS \(SELECT 1 FROM \$\{prefix\}session_results results WHERE results.sessionId = s.id\)/);
    assert.match(backend, /SUM\(COALESCE\(completed.raceCount, 0\)\) AS recordedRacesHeld/);
});
