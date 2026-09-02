const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildCircuitDetail, buildJuniorCircuitDetail } = require('../backend/circuit-detail');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('frontend/js/circuit.js');
const functions = source.slice(0, source.lastIndexOf('\nreadCircuitHistoryState();'));
const circuit = { id: 'silverstone', name: 'Silverstone Circuit', length: 5.891, layoutLength: 5.891, layoutTurns: 18, type: 'RACE', direction: 'CLOCKWISE', latitude: 52, longitude: -1, placeName: 'Silverstone', countryName: 'United Kingdom' };
const race = { id: '1', year: 2020, round: 1, date: '2020-07-05', name: 'British Grand Prix', hasResults: 1, laps: 52, winnerDriverId: 'a', winnerName: 'José Driver', winnerConstructorId: 'team', winnerConstructorName: 'Team A' };
function fixture(query = 'id=silverstone', series = 'f1') {
    const nodes = new Map(), storage = new Map(), events = {};
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', value: '', hidden: false, attrs: {}, events: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.events[k] = fn; }, scrollIntoView() {}, replaceWith() {} });
        return nodes.get(id);
    };
    const context = vm.createContext({ document: { getElementById: node, createElement: () => ({}) }, window: { addEventListener: (key, fn) => { events[key] = fn; }, location: { pathname: series === 'f1' ? '/circuit' : `/${series}/circuit`, reload() {} } },
        params: () => new URLSearchParams(query), URLSearchParams, Date,
        esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'), fmtNumber: String, fmtDate: value => value || '—', displayRaceName: row => row.name,
        history: { replaceState(_a, _b, url) { context.url = url; query = url.split('?')[1]; } },
        sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        pageItems(items, page, size) { page = Math.min(Math.max(1, page), Math.max(1, Math.ceil(items.length / size))); return { page, items: items.slice((page - 1) * size, page * size) }; },
        renderPagination(id, total, page, size, change) { context.pagination = { id, total, page, size, change }; }
    });
    vm.runInContext(functions, context);
    context.readCircuitHistoryState(); context.bindCircuitHistory();
    return { context, node, storage, events };
}

test('circuit history deduplicates shared wins without inflating race or constructor totals', () => {
    const result = buildCircuitDetail(circuit, [race, { ...race, winnerDriverId: 'b', winnerName: 'Driver B' }, race, { ...race, id: '2', year: 2099, hasResults: 0, winnerDriverId: null }]);
    assert.equal(result.races.length, 2);
    assert.equal(result.circuit.totalRacesHeld, 1);
    assert.equal(result.circuit.firstHeldYear, 2020);
    assert.equal(result.circuit.lastHeldYear, 2020);
    assert.equal(result.races[0].winners.length, 2);
    assert.deepEqual(result.records.drivers.map(row => row.wins), [1, 1]);
    assert.equal(result.records.constructors[0].wins, 1);
});

test('circuits without completed races do not invent records or first/latest race years', () => {
    const data = buildCircuitDetail(circuit, [{ id: '1', year: 2099, hasResults: 0 }]);
    assert.equal(data.circuit.totalRacesHeld, 0);
    assert.equal(data.circuit.firstHeldYear, null);
    assert.equal(data.circuit.lastHeldYear, null);
    assert.deepEqual(data.records, { drivers: [], constructors: [] });
});

test('history shows no more than 25 rows and saves filters and archive return path', () => {
    const { context, node } = fixture('id=silverstone&page=2&sort=oldest&return=%2Fcircuits%3Fview%3Dall%26page%3D2');
    context.applyCircuitDetail(buildCircuitDetail(circuit, Array.from({ length: 60 }, (_, i) => ({ ...race, id: String(i), round: i + 1 }))));
    assert.equal(context.pagination.size, 25);
    assert.equal(context.pagination.page, 2);
    assert.equal((node('circuit-races').innerHTML.match(/<tr>/g) || []).length, 26);
    assert.match(context.url, /page=2/);
    assert.equal(node('circuit-back-link').href, '/circuits?view=all&page=2');
    context.pagination.change(3);
    assert.equal((node('circuit-races').innerHTML.match(/<tr>/g) || []).length, 11);
    node('circuit-history-search').events.input({ target: { value: 'jose' } });
    assert.equal(context.pagination.page, 1);
    assert.equal(context.filteredCircuitHistory().length, 60);
    assert.match(context.url, /q=jose/);
});

test('history filters by season and winners, sorts numerically and has a working empty state', () => {
    const { context, node } = fixture('id=silverstone&season=2021');
    context.applyCircuitDetail(buildCircuitDetail(circuit, [race, { ...race, id: '2', year: 2021 }, { ...race, id: '3', year: 2019 }]));
    assert.equal(context.filteredCircuitHistory().length, 1);
    node('circuit-history-search').events.input({ target: { value: 'missing' } });
    assert.match(node('circuit-races').innerHTML, /No races match/);
    node('circuit-empty-clear').events.click();
    assert.deepEqual(Array.from(context.filteredCircuitHistory(), row => row.year), [2021, 2020, 2019]);
    node('circuit-history-sort').events.change({ target: { value: 'oldest' } });
    assert.deepEqual(Array.from(context.filteredCircuitHistory(), row => row.year), [2019, 2020, 2021]);
});

test('scheduled appearances stay outside history and missing past results are explicit', () => {
    const { context, node } = fixture();
    const future = { ...race, id: '2', year: 2099, date: '2099-10-20', hasResults: 0, winnerDriverId: null };
    const missing = { ...race, id: '3', hasResults: 0, winnerDriverId: null };
    context.applyCircuitDetail(buildCircuitDetail(circuit, [race, future, missing]));
    assert.equal(context.filteredCircuitHistory().length, 2);
    assert.equal(node('circuit-upcoming').hidden, false);
    assert.match(node('circuit-upcoming').innerHTML, /2099.*Scheduled/);
    assert.match(node('circuit-races').innerHTML, /Result unavailable/);
    assert.equal(context.circuitRaceStatus({ ...future, hasResults: true }), 'completed');
    assert.equal(context.circuitRaceStatus({ date: null }), 'unavailable');
});

test('hero starts with the name and renders safe location, layout and record links', () => {
    const { context, node } = fixture('id=silverstone&return=https%3A%2F%2Fevil.example');
    context.applyCircuitDetail(buildCircuitDetail(circuit, [race]));
    assert.match(node('circuit-head').innerHTML, /<div><h1>Silverstone Circuit/);
    assert.doesNotMatch(node('circuit-head').innerHTML, /eyebrow|circuit-coordinate/);
    assert.match(node('circuit-head').innerHTML, /View location/);
    assert.equal(node('circuit-back-link').href, '/circuits');
    assert.equal(context.circuitLocationLink({ latitude: null, longitude: null }), '');
    assert.equal(context.circuitLocationLink({ latitude: 200, longitude: 5 }), '');
    assert.match(node('circuit-records').innerHTML, /\/driver\?id=a/);
    assert.match(node('circuit-records').innerHTML, /\/constructor\?id=team/);
    assert.equal(node('circuit-analysis-link').href, '/circuit-analysis?id=silverstone');
    assert.match(node('circuit-layout-note').textContent, /Historical races/);
    assert.equal(context.circuitDate('2026-09-06'), '2026-09-06T12:00:00');
});

test('cached details render immediately, survive failed refresh and support retry', async () => {
    const { context, node, storage } = fixture();
    const data = buildCircuitDetail(circuit, [race]);
    storage.set('racelytic:f1:circuit:silverstone:v2', JSON.stringify({ savedAt: Date.now(), data }));
    let reject;
    context.getJSON = () => new Promise((_resolve, fail) => { reject = fail; });
    const loading = context.loadCircuit();
    assert.match(node('circuit-head').innerHTML, /<h1>Silverstone/);
    reject(Error('Offline')); await loading;
    assert.match(node('circuit-load-status').innerHTML, /Showing saved circuit/);
    assert.match(node('circuit-head').innerHTML, /<h1>Silverstone/);
    context.getJSON = async () => data;
    await node('circuit-retry').events.click();
    assert.equal(node('circuit-load-status').textContent, '');
});

test('blocked storage, request errors and missing circuit IDs clear loading placeholders', async () => {
    const { context, node } = fixture();
    context.sessionStorage.getItem = () => { throw Error('Disabled'); };
    context.sessionStorage.setItem = () => { throw Error('Disabled'); };
    context.getJSON = async () => { throw Error('Offline'); };
    await context.loadCircuit();
    assert.equal(node('circuit-head').attrs['aria-busy'], 'false');
    assert.match(node('circuit-load-status').innerHTML, /Retry/);
    context.getJSON = async () => buildCircuitDetail(circuit, [race]);
    await node('circuit-retry').events.click();
    assert.match(node('circuit-head').innerHTML, /Silverstone/);
    const missing = fixture('');
    await missing.context.loadCircuit();
    assert.match(missing.node('circuit-load-status').textContent, /No circuit selected/);
    assert.equal(missing.node('circuit-races').innerHTML, '');
});

test('page reserves loading space and uses open sections, five facts and responsive history', () => {
    const html = read('frontend/circuit.html'), css = read('frontend/css/polish.css');
    assert.match(html, /circuit-detail-page/);
    assert.match(html, /circuit-hero-placeholder/);
    assert.match(html, /circuit-history-placeholder/);
    assert.doesNotMatch(html, /class="detail-section"|circuit-history-grid/);
    assert.match(css, /\.circuit-facts dl \{[^}]*repeat\(5,/);
    assert.match(css, /\.circuit-history-scroll \{ overflow-x: auto/);
    assert.match(css, /prefers-reduced-motion: reduce.*circuit-detail-skeleton/);
    assert.match(read('backend/routes/circuits.js'), /DATE_FORMAT\(r.date, '%Y-%m-%d'\) AS date/);
    assert.match(read('frontend/js/circuit-analysis.js'), /const selected=params\(\).get\('id'\)/);
});

test('circuit detail matches race-page labels, selective cards and dividers without boxing whole sections', () => {
    const html = read('frontend/circuit.html'), css = read('frontend/css/polish.css');
    assert.match(html, /class="eyebrow">ALL-TIME RECORDS/);
    assert.match(html, /class="eyebrow">GRAND PRIX RESULTS/);
    assert.match(source, /class="eyebrow">ON THE CALENDAR/);
    assert.doesNotMatch(html, /class="detail-section"/);
    assert.match(css, /\.circuit-plain-section \.section-heading \{[^}]*border-bottom: 1px solid var\(--border\)/);
    for (const selector of ['.circuit-facts dl', '.circuit-history-scroll', '.circuit-record-columns > div:not(.circuit-detail-skeleton)', '.circuit-scheduled-list']) {
        const rule = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
        assert.match(rule, /background: #fff/);
        assert.match(rule, /box-shadow: var\(--shadow-small\)/);
        assert.match(rule, /border-radius: 1[56]px/);
    }
    assert.match(css, /\.circuit-facts dl > div \{[^}]*border-right: 1px solid var\(--border\)/);
    assert.match(css, /\.circuit-facts dl > div:last-child \{ grid-column: 1 \/ -1; border-bottom: 0;/);
});

for (const series of ['f2', 'f3', 'academy']) {
    test(`${series} circuit detail shares styling, pagination, filters and championship-specific links`, () => {
        const { context, node } = fixture(`id=silverstone&page=2&return=%2F${series}%2Fcircuits%3Fview%3Dall`, series);
        const result = buildCircuitDetail(circuit, Array.from({ length: 30 }, (_, i) => ({ ...race, id: `s${i}`, raceId: 'weekend', sessionId: `s${i}`, sessionNumber: i })));
        context.applyCircuitDetail({ ...result, history: result.races, races: [{ id: 'weekend' }] });
        assert.equal(context.pagination.size, 25);
        assert.equal(context.pagination.total, 30);
        assert.equal(context.pagination.page, 2);
        assert.equal((node('circuit-races').innerHTML.match(/<tr>/g) || []).length, 6);
        assert.equal(node('circuit-back-link').href, `/${series}/circuits?view=all`);
        assert.ok(context.url.startsWith(`/${series}/circuit?`));
        assert.match(node('circuit-races').innerHTML, new RegExp(`/${series}/race\\?id=weekend&amp;session=s`));
        assert.ok(node('circuit-races').innerHTML.includes(`/${series}/driver?id=a`));
        assert.ok(node('circuit-records').innerHTML.includes(`/${series}/${series === 'f2' ? 'constructor' : 'team'}?id=team`));
        assert.equal(node('circuit-analysis-link').href, `/${series}/circuit-analysis?id=silverstone`);
        node('circuit-history-search').events.input({ target: { value: 'jose' } });
        assert.equal(context.pagination.page, 1);
        assert.equal(context.filteredCircuitHistory().length, 30);
        node('circuit-history-search').events.input({ target: { value: 'absent' } });
        assert.match(node('circuit-races').innerHTML, /No races match/);
        node('circuit-empty-clear').events.click();
        assert.equal(context.filteredCircuitHistory().length, 30);
        const wrong = fixture('id=silverstone&return=%2Fcircuits%3Fview%3Dall', series);
        assert.equal(wrong.context.circuitReturnPath(), `/${series}/circuits`);
    });

    test(`${series} caches are isolated, request the right API and retain cards after a failed refresh`, async () => {
        const { context, node, storage } = fixture('id=silverstone', series);
        const data = buildCircuitDetail(circuit, [race]);
        storage.set('racelytic:f1:circuit:silverstone:v2', JSON.stringify({ savedAt: Date.now(), data: { ...data, circuit: { ...circuit, name: 'Wrong championship' } } }));
        context.getJSON = async url => { assert.equal(url, `/api/circuits/silverstone?series=${series}`); return data; };
        await context.loadCircuit();
        assert.ok(storage.has(`racelytic:${series}:circuit:silverstone:v2`));
        assert.doesNotMatch(node('circuit-head').innerHTML, /Wrong championship/);
        const fresh = fixture('id=silverstone', series);
        fresh.storage.set(`racelytic:${series}:circuit:silverstone:v2`, storage.get(`racelytic:${series}:circuit:silverstone:v2`));
        let reject;
        fresh.context.getJSON = () => new Promise((_resolve, fail) => { reject = fail; });
        const loading = fresh.context.loadCircuit();
        assert.match(fresh.node('circuit-head').innerHTML, /Silverstone/);
        reject(Error('Offline')); await loading;
        assert.match(fresh.node('circuit-load-status').innerHTML, /Showing saved circuit/);
        fresh.context.getJSON = async () => data;
        await fresh.node('circuit-retry').events.click();
        assert.equal(fresh.node('circuit-load-status').textContent, '');
    });
}

test('junior circuit sessions retain race formats, exclude cancellations from records and distinguish weekend dates', () => {
    const weekend = { id: 'weekend', year: 2021, round: 1, name: 'Silverstone', date: '2021-07-16', endDate: '2021-07-18' };
    const sessions = [
        { id: 'practice', raceId: 'weekend', name: 'Practice', sessionNumber: 1, isRace: 'False', hasResults: 1 },
        ...[4, 6, 8].map((number, i) => ({ id: `s${i}`, raceId: 'weekend', name: 'Race', sessionNumber: number, isRace: 'True', cancelled: i === 1 ? 'True' : 'False', hasResults: 1, winnerDriverId: 'a', winnerName: 'Winner', winnerConstructorId: 'team', winnerConstructorName: 'Team', laps: 20 }))
    ];
    const classify = (_session, index) => index === 2 ? 'F' : 'S';
    const data = buildJuniorCircuitDetail(circuit, [weekend], sessions, 'f2', classify);
    assert.equal(data.races.length, 1);
    assert.equal(data.races[0].sessions.length, 4);
    assert.equal(data.history.length, 3);
    assert.deepEqual(data.history.map(row => row.name), ['Silverstone · Sprint Race 1', 'Silverstone · Sprint Race 2', 'Silverstone · Feature Race']);
    assert.equal(data.circuit.totalRacesHeld, 2);
    assert.equal(data.records.drivers[0].wins, 2);
    assert.equal(data.history[1].hasResults, false);
    assert.equal(data.history[1].winners.length, 0);
    assert.equal(data.history[0].dateIsWeekend, true);
    const { context } = fixture('id=silverstone', 'f2');
    assert.equal(context.circuitRaceStatus(data.history[1]), 'cancelled');
    assert.match(context.circuitWinnerLinks(data.history[1]), /Cancelled/);
    assert.match(context.circuitRaceDate(data.history[0]), /2021-07-16.*2021-07-18.*weekend/);
    const academy = buildJuniorCircuitDetail(circuit, [weekend], sessions.map(s => ({ ...s, startTimeUtc: '2021-07-17T10:00:00Z' })), 'academy', classify);
    assert.equal(academy.history[0].name, 'Silverstone · Race 1');
    assert.equal(academy.history[0].date, '2021-07-17');
    assert.equal(academy.history[0].dateIsWeekend, false);
    const future = buildJuniorCircuitDetail(circuit, [{ ...weekend, year: 2099, date: '2099-01-01', endDate: '2099-01-03' }], [], 'f3', classify);
    assert.equal(future.circuit.totalRacesHeld, 0);
    assert.equal(future.history.length, 1);
    assert.equal(context.circuitRaceStatus(future.history[0]), 'scheduled');
});

test('junior and generated Academy pages load the approved shared circuit detail and own championship labels', () => {
    const { renderAcademyHtml } = require('../backend/academy-renderer');
    for (const series of ['f2', 'f3', 'academy']) {
        const file = series === 'f2' ? 'f2-circuit.html' : 'f3-circuit.html';
        const html = series === 'academy' ? renderAcademyHtml(file, read(`frontend/${file}`)) : read(`frontend/${file}`);
        assert.match(html, /class="container page circuit-detail-page"/);
        assert.match(html, /src="\/js\/circuit.js"/);
        assert.match(html, /ALL-TIME RECORDS/);
        assert.match(html, /circuit-history-placeholder/);
        assert.match(html, /circuit-history-season/);
        assert.doesNotMatch(html, /GRAND PRIX|Grand Prix wins|f[23]-circuit.js/);
        assert.ok(html.includes(`href="/${series}/circuits"`));
        if (series === 'academy') { assert.match(html, /F1 Academy race wins/); assert.doesNotMatch(html, /Formula 3|f3-mode/); }
    }
});
