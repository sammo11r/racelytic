const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('frontend/js/chassis.js');

function fixture(query = '') {
    const nodes = new Map(), storage = new Map(), windowEvents = {};
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, {
            innerHTML: '', textContent: '', value: '', attrs: {}, events: {},
            setAttribute(key, value) { this.attrs[key] = value; },
            addEventListener(key, fn) { this.events[key] = fn; },
            scrollIntoView() {}
        });
        return nodes.get(id);
    };
    const context = vm.createContext({
        document: { getElementById: node, querySelectorAll: () => [] },
        window: { addEventListener: (key, fn) => { windowEvents[key] = fn; } },
        URLSearchParams, Date,
        params: () => new URLSearchParams(query),
        esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
        fmtNumber: String,
        history: { replaceState(_a, _b, url) { context.url = url; } },
        sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        pageItems(items, page, size) { page = Math.min(Math.max(1, page), Math.max(1, Math.ceil(items.length / size))); return { page, items: items.slice((page - 1) * size, page * size) }; },
        renderPagination(id, total, page, size, change) { context.pagination = { id, total, page, size, change }; }
    });
    vm.runInContext(source.slice(0, source.lastIndexOf('\nreadChassisState();')), context);
    context.readChassisState(); context.bindChassisControls();
    return { context, node, storage, windowEvents };
}

const rows = [
    { id: 'current', name: 'Current', fullName: 'Current C26', constructorId: 'alpha', constructorName: 'Alpha', seasons: [2026, 2025], firstYear: 2025, lastYear: 2026, currentSeason: 2026, engineManufacturerIds: ['ferrari'], engineManufacturers: ['Ferrari'], engines: ['066/12'], performanceSeasons: 2, totalRaceStarts: 44, totalRaceWins: 6, totalPodiums: 15 },
    { id: 'historic', name: 'Historíc', fullName: 'Historic H24', constructorId: 'beta', constructorName: 'Béta Engineering', seasons: [2024, 2022], firstYear: 2022, lastYear: 2024, currentSeason: 2026, engineManufacturerIds: ['mercedes'], engineManufacturers: ['Mercedes'], engines: ['M14'], performanceSeasons: 1, totalRaceStarts: 20, totalRaceWins: 1, totalPodiums: 3 },
    { id: 'ambiguous', name: 'Ambiguous', fullName: 'Ambiguous A26', constructorId: 'gamma', constructorName: 'Gamma', seasons: [2026], firstYear: 2026, lastYear: 2026, currentSeason: 2026, engineManufacturerIds: [], engineManufacturers: [], engines: [], performanceSeasons: 0, totalRaceStarts: 0, totalRaceWins: 0, totalPodiums: 0 }
];

test('chassis defaults to the current grid and filters exact participation seasons', () => {
    const { context, node } = fixture(); context.applyChassisData(rows);
    assert.deepEqual(Array.from(context.filteredChassis(), row => row.id), ['ambiguous', 'current']);
    node('chassis-season').events.change({ target: { value: '2023' } });
    assert.deepEqual(Array.from(context.filteredChassis(), row => row.id), []);
    node('chassis-season').events.change({ target: { value: '2022' } });
    assert.deepEqual(Array.from(context.filteredChassis(), row => row.id), ['historic']);
    node('chassis-engine').events.change({ target: { value: 'mercedes' } });
    assert.deepEqual(Array.from(context.filteredChassis(), row => row.id), ['historic']);
});

test('chassis search is accent-insensitive and statistics sorts are numerical', () => {
    const { context, node } = fixture('view=all'); context.applyChassisData(rows);
    for (const search of ['historic', 'beta', 'Mercedes', 'M14']) {
        node('chassis-search').events.input({ target: { value: search } });
        assert.deepEqual(Array.from(context.filteredChassis(), row => row.id), ['historic']);
    }
    node('chassis-search').events.input({ target: { value: '' } });
    for (const [sort, first] of [['starts', 'current'], ['wins', 'current'], ['recent', 'ambiguous'], ['name', 'ambiguous']]) {
        node('chassis-sort').events.change({ target: { value: sort } });
        assert.equal(context.filteredChassis()[0].id, first);
    }
});

test('compact cards show useful performance without inventing ambiguous totals', () => {
    const { context } = fixture('view=all'); context.applyChassisData(rows);
    const complete = context.renderChassisCard(rows[0]);
    assert.match(complete, /2025–2026 · 2 seasons/);
    assert.match(complete, /<strong>44<\/strong> starts/);
    assert.match(complete, /<strong>6<\/strong> wins/);
    assert.doesNotMatch(complete, /seasons attributable/);
    const partial = context.renderChassisCard(rows[1]);
    assert.match(partial, /1 of 2 seasons attributable/);
    const ambiguous = context.renderChassisCard(rows[2]);
    assert.match(ambiguous, /Performance not uniquely attributable/);
    assert.doesNotMatch(ambiguous, /<strong>0<\/strong>/);
    assert.match(ambiguous, /Power unit not recorded/);
});

test('chassis pagination and filters are shareable and safely bounded', () => {
    const { context, node } = fixture('view=all&page=2');
    context.applyChassisData(Array.from({ length: 30 }, (_, index) => ({ ...rows[0], id: `chassis-${index}`, fullName: `Chassis ${index}` })));
    assert.equal(context.pagination.page, 2); assert.equal(context.pagination.size, 24);
    assert.equal((node('chassis').innerHTML.match(/class="entity-card/g) || []).length, 6);
    assert.match(context.url, /view=all/); assert.match(context.url, /page=2/);
    context.pagination.change(1); assert.doesNotMatch(context.url, /page=/);
    node('chassis-search').events.input({ target: { value: 'missing' } });
    assert.match(node('chassis').innerHTML, /No chassis found/);
    node('chassis-empty-clear').events.click(); assert.equal(context.filteredChassis().length, 30);
});

test('cached chassis render immediately and remain visible after refresh failure', async () => {
    const { context, node, storage } = fixture();
    storage.set('racelytic:f1:chassis:v1', JSON.stringify({ savedAt: Date.now(), rows }));
    let reject; context.getJSON = () => new Promise((_resolve, fail) => { reject = fail; });
    const loading = context.loadChassis();
    assert.match(node('chassis').innerHTML, /Current C26/);
    reject(Error('Offline')); await loading;
    assert.match(node('chassis-load-status').innerHTML, /Showing saved chassis/);
    context.getJSON = async () => rows; await node('chassis-retry').events.click();
    assert.equal(node('chassis-load-status').textContent, '');
});

test('chassis loading survives unavailable storage and exposes a retry', async () => {
    const { context, node } = fixture();
    context.sessionStorage.getItem = () => { throw Error('Disabled'); };
    context.sessionStorage.setItem = () => { throw Error('Disabled'); };
    context.getJSON = async () => { throw Error('Offline'); };
    await context.loadChassis(); assert.match(node('chassis').innerHTML, /Chassis unavailable/);
    context.getJSON = async () => rows; await node('chassis-retry').events.click();
    assert.match(node('chassis').innerHTML, /Current C26/);
});

test('F1 chassis archive has compact four-column skeletons and identity-safe performance data', () => {
    const html = read('frontend/chassis.html'), css = read('frontend/css/polish.css'), backend = read('backend/routes/chassis.js');
    assert.equal((html.match(/chassis-card-skeleton/g) || []).length, 8);
    assert.match(html, /data-chassis-view="current"/); assert.match(html, /data-chassis-view="all"/);
    assert.match(css, /\.chassis-page \.chassis-archive-grid \{\s*grid-template-columns: repeat\(4,/);
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*chassis-card-skeleton/);
    assert.match(backend, /GROUP_CONCAT\(DISTINCT sec\.year ORDER BY sec\.year DESC/);
    assert.match(backend, /HAVING COUNT\(DISTINCT chassisId\) = 1/);
    assert.match(backend, /JOIN seasons_constructors season/);
    assert.match(backend, /season\.year = singleChassis\.year/);
});
