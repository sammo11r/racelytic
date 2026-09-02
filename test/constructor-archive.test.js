const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('frontend/js/constructors.js');
function fixture(query = '', series = 'f1') {
    const nodes = new Map(), storage = new Map(), windowEvents = {};
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', value: '', attrs: {}, events: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.events[k] = fn; }, scrollIntoView() {} });
        return nodes.get(id);
    };
    const context = vm.createContext({ document: { getElementById: node, querySelectorAll: () => [] }, window: { location: { pathname: series === 'f1' ? '/constructors' : `/${series}/${series === 'f2' ? 'constructors' : 'teams'}` }, addEventListener: (k, fn) => { windowEvents[k] = fn; } }, URLSearchParams, Date,
        params: () => new URLSearchParams(query), esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'), fmtNumber: String,
        history: { replaceState(_a, _b, url) { context.url = url; } },
        sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        pageItems(items, page, size) { page = Math.min(Math.max(1, page), Math.max(1, Math.ceil(items.length / size))); return { page, items: items.slice((page - 1) * size, page * size) }; },
        renderPagination(id, total, page, size, change) { context.pagination = { id, total, page, size, change }; }
    });
    vm.runInContext(source.slice(0, source.lastIndexOf('\nreadConstructorState();')), context);
    context.readConstructorState(); context.bindConstructorControls();
    return { context, node, storage, windowEvents };
}
const rows = [
    { id: 'alpha', name: 'Alpha', fullName: 'Alpha', countryId: 'uk', countryName: 'United Kingdom', seasons: [1950, 2026], firstYear: 1950, lastYear: 2026, currentSeason: 2026, totalRaceWins: 3, totalPodiums: 4, totalChampionshipWins: 1, totalRaceStarts: 100, currentPosition: 2, currentPoints: 35, currentDrivers: ['Driver A', 'Driver B'] },
    { id: 'beta', name: 'Béta', fullName: 'Beta Engineering', countryId: 'fr', countryName: 'France', seasons: [1960], firstYear: 1960, lastYear: 1960, currentSeason: 2026, totalRaceWins: 10, totalPodiums: 20, totalChampionshipWins: 2, totalRaceStarts: 50, currentDrivers: [] },
    { id: 'gamma', name: 'Gamma', fullName: 'Gamma', countryId: 'uk', countryName: 'United Kingdom', seasons: [2026], firstYear: 2026, lastYear: 2026, currentSeason: 2026, totalRaceWins: 0, totalPodiums: 0, totalChampionshipWins: 0, totalRaceStarts: 5, currentPosition: null, currentPoints: 0, currentDrivers: [] }
];

test('constructors default to current grid and filter exact participation years, nationality and titles', () => {
    const { context, node } = fixture(); context.applyConstructorData(rows);
    assert.deepEqual(Array.from(context.filteredConstructors(), row => row.id), ['alpha', 'gamma']);
    node('constructor-season').events.change({ target: { value: '1960' } });
    assert.deepEqual(Array.from(context.filteredConstructors(), row => row.id), ['beta']);
    node('constructor-season').events.change({ target: { value: '' } });
    node('constructor-country').events.change({ target: { value: 'uk' } });
    node('constructor-type').events.change({ target: { value: 'champions' } });
    assert.deepEqual(Array.from(context.filteredConstructors(), row => row.id), ['alpha']);
    assert.match(context.url, /achievement=champions/);
});

test('constructor search is accent-insensitive and sorting uses numerical career metrics', () => {
    const { context, node } = fixture('view=all'); context.applyConstructorData(rows);
    for (const search of ['beta', 'Engineering', 'France']) {
        node('search').events.input({ target: { value: search } });
        assert.deepEqual(Array.from(context.filteredConstructors(), row => row.id), ['beta']);
    }
    node('search').events.input({ target: { value: '' } });
    for (const [sort, first] of [['wins', 'beta'], ['titles', 'beta'], ['starts', 'alpha'], ['recent', 'alpha']]) {
        node('constructor-sort').events.change({ target: { value: sort } });
        assert.equal(context.filteredConstructors()[0].id, first);
    }
});

test('cards suppress duplicate names and zero achievements while separating current season and career', () => {
    const { context, node } = fixture(); context.applyConstructorData(rows);
    const alpha = context.renderConstructorCard(rows[0]);
    assert.doesNotMatch(alpha, /constructor-full-name/);
    assert.match(alpha, /2026 season/); assert.match(alpha, /P2 · 35 points/);
    assert.match(alpha, /Driver A · Driver B/); assert.match(alpha, />Career</);
    assert.match(alpha, /constructors’ title/); assert.match(alpha, /1950–2026 · 2 seasons/);
    const gamma = context.renderConstructorCard(rows[2]);
    assert.doesNotMatch(gamma, />0<\/strong> (wins|podiums|titles)/);
    assert.match(gamma, /race starts/); assert.match(gamma, /Not classified · 0 points/);
    node('constructor-season').events.change({ target: { value: '1950' } });
    assert.doesNotMatch(context.renderConstructorCard(rows[0]), /constructor-season-snapshot/);
    node('constructor-season').events.change({ target: { value: '2026' } });
    assert.match(context.renderConstructorCard(rows[0]), /constructor-season-snapshot/);
    assert.match(context.renderConstructorCard(rows[1]), /constructor-full-name/);
});

test('constructor pagination is bounded, shareable and preserved in detail links', () => {
    const { context, node } = fixture('view=all&page=2');
    context.applyConstructorData(Array.from({ length: 30 }, (_, i) => ({ ...rows[0], id: `constructor-${i}` })));
    assert.equal(context.pagination.page, 2); assert.equal(context.pagination.size, 24);
    assert.equal((node('constructors').innerHTML.match(/class="entity-card/g) || []).length, 6);
    assert.match(context.url, /page=2/);
    assert.match(node('constructors').innerHTML, /return=%2Fconstructors%3Fview%3Dall%26page%3D2/);
    context.pagination.change(1); assert.doesNotMatch(context.url, /page=/);
    assert.match(read('frontend/js/constructor.js'), /returnPath === CONSTRUCTOR_ARCHIVE/);
    assert.match(read('frontend/js/constructor.js'), /startsWith\(`\$\{CONSTRUCTOR_ARCHIVE\}\?`\)/);
});

test('constructor empty state clears filters and invalid pagination is safe', () => {
    const { context, node } = fixture('view=all&q=missing&page=Infinity'); context.applyConstructorData(rows);
    assert.match(node('constructors').innerHTML, /No constructors found/);
    assert.equal(context.pagination.page, 1);
    node('constructor-empty-clear').events.click(); assert.equal(context.filteredConstructors().length, 3);
    assert.equal(node('constructors').attrs['aria-busy'], 'false');
});

test('cached constructor cards render before refresh and remain visible after failure', async () => {
    const { context, node, storage } = fixture();
    storage.set('racelytic:f1:constructors:v1', JSON.stringify({ savedAt: Date.now(), rows }));
    let reject; context.getJSON = () => new Promise((_resolve, fail) => { reject = fail; });
    const loading = context.loadConstructors(); assert.match(node('constructors').innerHTML, /<h3>Alpha/);
    reject(Error('Offline')); await loading;
    assert.match(node('constructor-load-status').innerHTML, /Showing saved constructors/);
    context.getJSON = async () => rows; await node('constructor-retry').events.click();
    assert.equal(node('constructor-load-status').textContent, '');
});

test('constructor loading still works with unavailable storage and offers retry on errors', async () => {
    const { context, node } = fixture();
    context.sessionStorage.getItem = () => { throw Error('Disabled'); };
    context.sessionStorage.setItem = () => { throw Error('Disabled'); };
    context.getJSON = async () => { throw Error('Offline'); };
    await context.loadConstructors(); assert.match(node('constructors').innerHTML, /Constructors unavailable/);
    context.getJSON = async () => rows; await node('constructor-retry').events.click();
    assert.match(node('constructors').innerHTML, /<h3>Alpha/);
});

test('F1 constructor archive has compact four-column skeletons and identity-preserving data joins', () => {
    const html = read('frontend/constructors.html'), css = read('frontend/css/polish.css'), backend = read('backend/routes/constructors.js');
    assert.equal((html.match(/constructor-card-skeleton/g) || []).length, 8);
    assert.match(html, /data-constructor-view="current"/); assert.match(html, /data-constructor-view="all"/);
    assert.match(css, /\.constructors-page \.constructor-archive-grid \{ grid-template-columns: repeat\(4,/);
    assert.match(css, /prefers-reduced-motion: reduce.*constructor-card-skeleton/);
    assert.match(backend, /GROUP_CONCAT\(DISTINCT year ORDER BY year DESC/);
    assert.match(backend, /FROM seasons_entrants_constructors/);
    assert.match(backend, /entry.testDriver IS NULL/);
    assert.match(backend, /career.constructorId = k.id/);
    assert.match(backend, /positionNumber BETWEEN 1 AND 99/);
});

for (const series of ['f1', 'f2', 'f3', 'academy']) {
    test(`${series} gives championship winners a badge, not teams merely leading the standings`, () => {
        const { context } = fixture('', series); context.applyConstructorData(rows);
        const champion = context.renderConstructorCard(rows[0]);
        const label = { f1: 'F1 constructors’', f2: 'F2 teams’', f3: 'F3 teams’', academy: 'F1 Academy teams’' }[series];
        assert.ok(champion.includes(`${label} champion</em>`));
        assert.match(champion, /constructor-champion-card/);
        assert.doesNotMatch(context.renderConstructorCard({ ...rows[2], currentPosition: 1 }), /constructor-champion-(badge|card)/);
    });
}

for (const series of ['f2', 'f3', 'academy']) {
    const entity = series === 'f2' ? 'constructor' : 'team';
    test(`${series} shares exact season filters, compact cards and archive return navigation`, () => {
        const { context, node } = fixture('view=all&season=2026&country=uk&achievement=champions&sort=wins&page=2', series);
        context.applyConstructorData(Array.from({ length: 30 }, (_, i) => ({ ...rows[0], id: `team-${i}` })));
        assert.equal(context.pagination.page, 2); assert.equal(context.pagination.size, 24);
        assert.equal((node('constructors').innerHTML.match(/class="entity-card/g) || []).length, 6);
        assert.equal(context.url, `/${series}/${entity}s?view=all&season=2026&country=uk&achievement=champions&sort=wins&page=2`);
        assert.ok(node('constructors').innerHTML.includes(`href="/${series}/${entity}?`));
        assert.ok(node('constructors').innerHTML.includes(`return=%2F${series}%2F${entity}s`));
        assert.ok(node('constructor-count').textContent.includes(`30 ${entity}s`));
        const current = fixture('', series);
        current.context.applyConstructorData(rows);
        assert.deepEqual(Array.from(current.context.filteredConstructors(), row => row.id), ['alpha', 'gamma']);
        current.node('constructor-season').events.change({ target: { value: '1960' } });
        assert.deepEqual(Array.from(current.context.filteredConstructors(), row => row.id), ['beta']);
    });

    test(`${series} loads its own endpoint and renders only its cached cards immediately`, async () => {
        const { context, node, storage } = fixture('', series);
        storage.set('racelytic:f1:constructors:v1', JSON.stringify({ savedAt: Date.now(), rows: [{ ...rows[0], name: 'Wrong series' }] }));
        context.getJSON = async url => { assert.equal(url, `/api/constructors?series=${series}`); return rows; };
        const loading = context.loadConstructors();
        assert.doesNotMatch(node('constructors').innerHTML, /Wrong series/);
        await loading;
        assert.ok(storage.has(`racelytic:${series}:constructors:v1`));
        const cached = fixture('', series);
        cached.storage.set(`racelytic:${series}:constructors:v1`, storage.get(`racelytic:${series}:constructors:v1`));
        let reject; cached.context.getJSON = () => new Promise((_resolve, fail) => { reject = fail; });
        const refresh = cached.context.loadConstructors();
        assert.match(cached.node('constructors').innerHTML, /<h3>Alpha/);
        reject(Error('Offline')); await refresh;
        assert.ok(cached.node('constructor-load-status').innerHTML.includes(`Showing saved ${entity}s`));
        cached.context.getJSON = async () => rows;
        await cached.node('constructor-retry').events.click();
        assert.equal(cached.node('constructor-load-status').textContent, '');
    });
}

test('junior and generated Academy templates share the archive and detail experience', () => {
    const { renderAcademyHtml } = require('../backend/academy-renderer');
    for (const series of ['f2', 'f3', 'academy']) {
        const file = series === 'f2' ? 'f2-constructors' : 'f3-teams';
        const detailFile = series === 'f2' ? 'f2-constructor' : 'f3-team';
        const archivePath = `/${series}/${series === 'f2' ? 'constructors' : 'teams'}`;
        let html = read(`frontend/${file}.html`);
        if (series === 'academy') {
            html = renderAcademyHtml(`${file}.html`, html);
            assert.match(html, /F1 Academy teams/); assert.doesNotMatch(html, /Formula 3|academy-js/);
        }
        assert.match(html, /class="container page constructors-page"/);
        assert.match(html, /src="\/js\/constructors.js"/);
        assert.equal((html.match(/constructor-card-skeleton/g) || []).length, 8);
        for (const id of ['search', 'constructor-season', 'constructor-country', 'constructor-type', 'constructor-sort']) assert.ok(html.includes(`id="${id}"`));
        const detailHtml = series === 'academy' ? renderAcademyHtml('f3-team.html', read('frontend/f3-team.html')) : read(`frontend/${detailFile}.html`);
        assert.match(detailHtml, /id="constructor-back-link"/);
        assert.match(detailHtml, /src="\/js\/constructor.js"/);
        assert.match(detailHtml, /constructor-detail-page junior-constructor-detail-page/);
        assert.ok(detailHtml.includes(`href="${archivePath}"`));
        assert.doesNotMatch(detailHtml, /constructor-cars|Chassis history|constructor-chassis/);
    }
});

test('junior archive uses exact participation and current-season data with distinct non-cancelled starts', () => {
    const backend = read('backend/routes/constructors.js');
    assert.match(backend, /UNION SELECT constructorId, year FROM \$\{prefix\}season_constructor_standings/);
    assert.match(backend, /currentStandings.year = current.year/);
    assert.match(backend, /WHERE entries.year = \(SELECT MAX\(year\) FROM \$\{prefix\}races\)/);
    assert.match(backend, /COUNT\(DISTINCT CASE WHEN.*THEN sessions.id END\) AS starts/);
    assert.match(backend, /sessions.cancelled IS NULL OR LOWER\(CAST\(sessions.cancelled AS CHAR\)\) NOT IN \('1', 'true'\)/);
});
