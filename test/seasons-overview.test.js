const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../frontend/js/seasons.js'), 'utf8');
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function archive(seasons, series = 'f1') {
    const elements = Object.fromEntries(['seasons', 'season-search', 'season-sort', 'season-years'].map(id => [id, {
        value: '', innerHTML: '', textContent: '', handlers: {},
        addEventListener(event, handler) { this.handlers[event] = handler; },
        scrollIntoView() {}
    }]));
    let pagination;
    const context = vm.createContext({
        document: { getElementById: id => elements[id] },
        window: { location: { href: '' } },
        activeSeriesKey: () => series,
        getJSON: async url => { assert.equal(url, `/api/seasons${series === 'f1' ? '' : `?series=${series}`}`); return seasons; },
        esc, fmtNumber: String, console,
        setError: (_id, message) => { throw new Error(message); },
        pageItems: (items, page, size) => ({ items: items.slice((page - 1) * size, page * size), page }),
        renderPagination: (id, total, page, size, onPage) => { pagination = { id, total, page, size, onPage }; }
    });
    await vm.runInContext(source, context);
    return { elements, context, pagination: () => pagination };
}

test('season champion names use real name parts with safe fallback and escaping', async () => {
    const { context } = await archive([]);
    const format = context.championNameMarkup;
    assert.equal(format(null), 'To be decided');
    assert.equal(format({ name: 'Nino Farina' }), '<span class="champion-first-name">Nino</span> <span class="champion-last-name">Farina</span>');
    assert.equal(format({ name: 'Nyck de Vries', firstName: null, lastName: null }), '<span class="champion-first-name">Nyck</span> <span class="champion-last-name">de Vries</span>');
    assert.equal(format({ name: 'Driver' }), 'Driver');
    assert.equal(format({ name: 'Juan Manuel Fangio', firstName: 'Juan Manuel', lastName: 'Fangio' }), '<span class="champion-first-name">Juan Manuel</span> <span class="champion-last-name">Fangio</span>');
    assert.equal(format({ name: 'A B', firstName: '<A>', lastName: 'B & C' }), '<span class="champion-first-name">&lt;A&gt;</span> <span class="champion-last-name">B &amp; C</span>');
});

test('live year filtering resets pagination, handles no matches, and restores the archive', async () => {
    const seasons = Array.from({ length: 25 }, (_, i) => ({ year: 2026 - i }));
    const app = await archive(seasons);
    assert.equal(app.pagination().total, 25);
    app.pagination().onPage(2);
    assert.equal(app.pagination().page, 2);
    const input = app.elements['season-search'];
    input.value = '200';
    input.handlers.input();
    assert.equal(app.pagination().page, 1);
    assert.equal(app.pagination().total, 8);
    assert.match(app.elements.seasons.innerHTML, /href="\/season\?year=2008"/);
    input.value = '9999';
    input.handlers.input();
    assert.equal(app.pagination().total, 0);
    assert.match(app.elements.seasons.innerHTML, /No season matches/);
    input.value = '';
    input.handlers.input();
    assert.equal(app.pagination().total, 25);
});

test('the year control only filters, even with an exact year', async () => {
    const app = await archive([{ year: 2008 }]);
    app.elements['season-search'].value = ' 2008 ';
    app.elements['season-search'].handlers.input();
    assert.equal(app.pagination().total, 1);
    assert.equal(app.context.window.location.href, '');
    assert.doesNotMatch(source, /window.location|addEventListener\('submit'/);
});

test('year sorting is numeric, resets pagination and preserves the active filter', async () => {
    const seasons = Array.from({ length: 25 }, (_, i) => ({ year: 2002 + i }));
    const original = seasons.map(season => season.year);
    const app = await archive(seasons);
    const visibleYears = () => [...app.elements.seasons.innerHTML.matchAll(/href="\/season\?year=(\d+)"/g)].map(match => Number(match[1]));
    assert.equal(visibleYears()[0], 2026);
    app.pagination().onPage(2);
    const sort = app.elements['season-sort'];
    sort.value = 'asc';
    sort.handlers.change();
    assert.equal(app.pagination().page, 1);
    assert.equal(visibleYears()[0], 2002);
    app.pagination().onPage(2);
    assert.equal(visibleYears()[0], 2018);
    app.elements['season-search'].value = '200';
    app.elements['season-search'].handlers.input();
    assert.deepEqual(visibleYears(), [2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009]);
    sort.value = 'desc';
    sort.handlers.change();
    assert.deepEqual(visibleYears(), [2009, 2008, 2007, 2006, 2005, 2004, 2003, 2002]);
    assert.equal(app.elements['season-search'].value, '200');
    assert.deepEqual(seasons.map(season => season.year), original);
});

test('F1 seasons have reader-focused copy and a labelled year control', () => {
    const html = fs.readFileSync(path.join(__dirname, '../frontend/seasons.html'), 'utf8');
    assert.doesNotMatch(html, /F1DB dataset/);
    assert.match(html, /label for="season-search"/);
    assert.match(html, /label for="season-sort"/);
    assert.match(html, /value="desc" selected>Descending/);
    assert.match(html, /value="asc">Ascending/);
    assert.match(html, /aria-controls="seasons"/);
    assert.doesNotMatch(html, /<form|<button|season-search-message/);
});

test('seasons API supplies champion name parts without changing counts or unknown champions', async () => {
    const routes = new Map();
    const router = { get: (route, handler) => routes.set(route, handler) };
    const routeSource = fs.readFileSync(path.join(__dirname, '../backend/routes/seasons.js'), 'utf8');
    const connection = { query: async sql => {
        if (sql.includes('championName')) {
            assert.match(sql, /drivers.firstName AS championFirstName/);
            assert.match(sql, /drivers.lastName AS championLastName/);
            return [{ year: 1957, championDriverId: 'fangio', championName: 'Juan Manuel Fangio', championFirstName: 'Juan Manuel', championLastName: 'Fangio' }];
        }
        if (sql.includes('AS raceCount')) return [{ year: 1957, raceCount: 8 }];
        if (sql.includes('AS driverCount')) return [{ year: 1957, driverCount: 40 }];
        if (sql.includes('AS constructorCount')) return [{ year: 1957, constructorCount: 10 }];
        return [{ year: 2026 }, { year: 1957 }];
    } };
    vm.runInNewContext(routeSource, {
        require: name => {
            if (name === 'express') return { Router: () => router };
            if (name === '../route-helpers') return { withConnection: fn => fn(connection), sendError: (_res, error) => { throw error; } };
            if (name === '../series-config') return {};
            throw new Error(`Unexpected import ${name}`);
        },
        module: { exports: {} }
    });
    for (const series of ['f1', 'f2', 'f3', 'academy']) {
        let result;
        await routes.get('/api/seasons')({ query: { series } }, { json: data => { result = data; } });
        assert.equal(result[0].champion, null);
        assert.equal(result[1].raceCount, 8);
        assert.equal(result[1].champion.firstName, 'Juan Manuel');
        assert.equal(result[1].champion.lastName, 'Fangio');
    }
});

test('all junior seasons pages use the approved shared layout, labels and renderer', () => {
    const { renderAcademyHtml } = require('../backend/academy-renderer');
    for (const series of ['f2', 'f3', 'academy']) {
        const file = `${series === 'f2' ? 'f2' : 'f3'}-seasons.html`;
        const source = fs.readFileSync(path.join(__dirname, '../frontend', file), 'utf8');
        const html = series === 'academy' ? renderAcademyHtml(file, source) : source;
        assert.match(html, /class="container page seasons-directory"/);
        assert.match(html, /\/css\/seasons-overview.css/);
        assert.match(html, /\/js\/seasons.js/);
        assert.match(html, /label for="season-search">Filter by year/);
        assert.match(html, /label for="season-sort">order by/);
        assert.match(html, /value="desc" selected>Descending/);
        assert.match(html, /value="asc">Ascending/);
        assert.match(html, /id="seasons" class="season-grid"/);
        assert.match(html, new RegExp(`class="${series}-mode"`));
        assert.doesNotMatch(html, /<form|<button|<p>|season-jump|f[23]-seasons.js/);
        if (series === 'academy') assert.match(html, /F1 ACADEMY CHAMPIONSHIP HISTORY/);
    }
});

test('junior season cards preserve series links and terms while filtering and sorting', async () => {
    for (const [series, label] of [['f2', 'F2 champion'], ['f3', 'F3 champion'], ['academy', 'F1 Academy champion']]) {
        const app = await archive([
            { year: 2023, champion: { name: 'Example Driver', firstName: 'Example', lastName: 'Driver' } },
            { year: 2026 }, { year: 2024 }
        ], series);
        const years = () => [...app.elements.seasons.innerHTML.matchAll(/season\?year=(\d+)/g)].map(match => Number(match[1]));
        assert.deepEqual(years(), [2026, 2024, 2023]);
        assert.ok(app.elements.seasons.innerHTML.includes(`href="/${series}/season?year=2023"`));
        assert.ok(app.elements.seasons.innerHTML.includes(`<span>${label}</span>`));
        assert.match(app.elements.seasons.innerHTML, /<span>Rounds<\/span>/);
        assert.match(app.elements.seasons.innerHTML, /<span>Teams<\/span>/);
        assert.match(app.elements.seasons.innerHTML, /champion-last-name">Driver/);
        assert.match(app.elements.seasons.innerHTML, /To be decided/);
        app.elements['season-sort'].value = 'asc';
        app.elements['season-sort'].handlers.change();
        assert.deepEqual(years(), [2023, 2024, 2026]);
        app.elements['season-search'].value = '2024';
        app.elements['season-search'].handlers.input();
        assert.deepEqual(years(), [2024]);
        app.elements['season-search'].value = '9999';
        app.elements['season-search'].handlers.input();
        assert.equal(app.pagination().total, 0);
        app.elements['season-search'].value = '';
        app.elements['season-search'].handlers.input();
        assert.deepEqual(years(), [2023, 2024, 2026]);
    }
});
