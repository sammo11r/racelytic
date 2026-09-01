const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { renderAcademyHtml } = require('../backend/academy-renderer');
const { seriesPageRoutes } = require('../backend/series-pages');

const frontend = path.join(__dirname, '../frontend');
const html = fs.readFileSync(path.join(frontend, 'database.html'), 'utf8');
const script = fs.readFileSync(path.join(frontend, 'js/database-overview.js'), 'utf8');

test('F1 directory leads with a red section label, editorial title and six destinations', () => {
    assert.match(html, /class="eyebrow">FORMULA 1 DATABASE<\/div>/);
    assert.match(html, /<h1>The facts behind Formula 1\.?<\/h1>/);
    const destinations = [...html.matchAll(/class="database-category" href="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(destinations, ['/seasons', '/races', '/drivers', '/constructors', '/circuits', '/chassis']);
    for (const destination of destinations) assert.ok(fs.existsSync(path.join(frontend, `${destination.slice(1)}.html`)));
    assert.doesNotMatch(html, /analysis-hero|analysis-tool-card|stats-grid|The history behind every result/);
});

test('six archive totals form a separate layer between the header and navigation', () => {
    const summary = html.match(/<section class="database-summary"[\s\S]*?<\/section>/)[0];
    const summaryOrder = [...summary.matchAll(/data-archive-count="([^"]+)"/g)].map(match => match[1]);
    const navigationOrder = [...html.matchAll(/class="database-category" href="\/([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(summaryOrder, navigationOrder);
    assert.ok(html.indexOf('</header>') < html.indexOf(summary));
    assert.ok(html.indexOf(summary) < html.indexOf('<nav'));
    assert.doesNotMatch(html.slice(html.indexOf('<nav')), /data-archive-count|database-category-count/);
});

test('directory relies on header search and labels navigation with explicit browse actions', () => {
    assert.doesNotMatch(html, /<form|database-query|database-search-controls/);
    assert.match(html, /<div id="header"><\/div>/);
    assert.match(html, /<script src="\/js\/header.js"><\/script>/);
    assert.match(html, /<h2 class="eyebrow database-navigation-title" id="database-navigation-title">BROWSE THE TABLES<\/h2>/);
    assert.match(html, /<nav class="database-category-grid" aria-labelledby="database-navigation-title">/);
    const cards = [...html.matchAll(/<a class="database-category" href="\/([^"]+)">([\s\S]*?)<\/a>/g)];
    assert.equal(cards.length, 6);
    for (const [, category, content] of cards) {
        assert.match(content, /<h3>/);
        assert.ok(content.includes(`Browse ${category} <span aria-hidden="true">→</span>`));
        assert.ok(content.indexOf('database-category-action') > content.indexOf('</p>'));
    }
});

test('all junior directories share the approved layout with their own labels and destinations', () => {
    const routes = new Set(seriesPageRoutes().map(page => page.route));
    for (const [series, name] of [['f2', 'Formula 2'], ['f3', 'Formula 3'], ['academy', 'F1 Academy']]) {
        const source = fs.readFileSync(path.join(frontend, `${series === 'f2' ? 'f2' : 'f3'}-database.html`), 'utf8');
        const junior = series === 'academy' ? renderAcademyHtml('f3-database.html', source) : source;
        assert.match(junior, /class="container page database-directory"/);
        assert.match(junior, /\/css\/database-overview\.css/);
        assert.match(junior, /\/js\/database-overview\.js/);
        assert.ok(junior.includes(`The facts behind ${name}`));
        const links = [...junior.matchAll(/class="database-category" href="([^"]+)"/g)].map(match => match[1]);
        assert.equal(links.length, 6);
        for (const link of links) assert.ok(routes.has(link) && link.startsWith(`/${series}/`), link);
        const labels = [...junior.matchAll(/<dt>([^<]+)<\/dt>/g)].map(match => match[1]);
        assert.deepEqual(labels, [...junior.matchAll(/<h3>([^<]+)<\/h3>/g)].map(match => match[1]));
        assert.deepEqual(labels, ['Seasons', 'Races', 'Drivers', 'Teams', 'Circuits', 'Chassis']);
        assert.doesNotMatch(junior, /analysis-hero|database-overview-stats|<form/);
        if (series === 'academy') {
            assert.doesNotMatch(junior, /sprint and feature|Dallara|Formula 3|\/f3\//);
            assert.match(junior, /Tatuus chassis/);
        }
    }
});

test('directory reserves room for the original footer brand without restyling it', () => {
    const css = fs.readFileSync(path.join(frontend, 'css/database-overview.css'), 'utf8');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector]) => selector.includes('.footer'));
    assert.equal(rules.length, 0);
    assert.match(css, /min-height: calc\(100svh - var\(--header-height\) - 128px\)/);
    assert.match(css, /padding-bottom: clamp\(48px, 6vh, 80px\)/);
});

test('shared directory keeps the added section gap and responsive card layouts', () => {
    const css = fs.readFileSync(path.join(frontend, 'css/database-overview.css'), 'utf8');
    assert.match(css, /database-navigation-title \{ margin: 32px 0 14px/);
    assert.match(css, /text-wrap: balance/);
    assert.match(css, /@media \(max-width: 1000px\)[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /@media \(max-width: 600px\)[\s\S]*?database-category-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
});

async function loadCounts(data, fail = false, series = 'f1') {
    const elements = ['seasons', 'drivers', 'constructors', 'circuits', 'races', 'chassis'].map(key => ({
        dataset: { archiveCount: key }, textContent: '—',
        previousElementSibling: { textContent: key === 'constructors' && series !== 'f1' ? 'Teams' : key },
        setAttribute(name, value) { this[name] = value; }
    }));
    const errors = [];
    await vm.runInNewContext(script, {
        getJSON: async url => {
            assert.equal(url, `/api/dashboard?series=${series}&archive=1`);
            if (fail) throw new Error('Offline');
            return data;
        },
        document: { querySelectorAll: () => elements },
        activeSeriesKey: () => series,
        fmtNumber: value => Number(value).toLocaleString('en-US'),
        console: { error: (...args) => errors.push(args) }
    });
    return { elements, errors };
}

test('archive counts load by category rather than display order', async () => {
    const { elements, errors } = await loadCounts({ seasons: 77, drivers: 900, constructors: 180, circuits: 80, races: 1150, chassis: 1000 });
    assert.deepEqual(elements.map(element => element.textContent), ['77', '900', '180', '80', '1,150', '1,000']);
    assert.equal(elements[0]['aria-label'], '77 seasons in the archive');
    assert.deepEqual(errors, []);
});

test('shared counts use the active championship and the visible team label', async () => {
    for (const series of ['f2', 'f3', 'academy']) {
        const { elements, errors } = await loadCounts({ constructors: 15, chassis: 2, races: 80 }, false, series);
        assert.deepEqual(errors, []);
        assert.equal(elements.find(element => element.dataset.archiveCount === 'constructors')['aria-label'], '15 teams in the archive');
    }
});

test('missing or invalid counts retain placeholders without breaking the directory', async () => {
    const { elements } = await loadCounts({ seasons: null, drivers: 'invalid', constructors: -1 });
    assert.ok(elements.every(element => element.textContent === '—'));
    const offline = await loadCounts({}, true);
    assert.ok(offline.elements.every(element => element.textContent === '—'));
    assert.equal(offline.errors.length, 1);
});

test('dashboard adds archive totals only on request, using the selected series tables', async () => {
    const routes = new Map();
    const queries = [];
    const router = { get: (url, handler) => routes.set(url, handler) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../backend/routes/core.js'), 'utf8'), {
        module: { exports: {} },
        require: name => {
            if (name === 'express') return { Router: () => router };
            if (name === '../search-results') return {};
            if (name === '../route-helpers') return {
                sendError: (_res, error) => { throw error; },
                withConnection: callback => callback({ query: async sql => {
                    queries.push(sql);
                    if (sql.includes('AS races')) return [{ races: '1150', chassis: '1000' }];
                    if (sql.includes('MAX(year)')) return [{ year: 2026 }];
                    if (sql.includes('COUNT(*)')) return [{ count: 23 }];
                    return [];
                } })
            };
            throw new Error(`Unexpected import: ${name}`);
        }
    });
    for (const [query, expected] of [[{ series: 'f1', archive: '1' }, true], [{ series: 'f1' }, false], [{ series: 'f2', archive: '1' }, true], [{ series: 'f3', archive: '1' }, true], [{ series: 'academy', archive: '1' }, true]]) {
        queries.length = 0;
        let result;
        await routes.get('/api/dashboard')({ query }, { json: data => { result = data; } });
        assert.equal(result.races, expected ? 1150 : undefined);
        assert.equal(result.chassis, expected ? 1000 : undefined);
        assert.equal(result.currentSeason.rounds, 23);
        assert.equal(queries.some(sql => sql.includes('AS races')), expected);
        if (expected) {
            const sql = queries.find(sql => sql.includes('AS races'));
            const prefix = { f1: '', f2: 'f2_', f3: 'f3_', academy: 'fa_' }[query.series];
            assert.ok(sql.includes(`FROM \`${prefix}races\``));
            assert.ok(sql.includes(`FROM \`${prefix}chassis\``));
            if (query.series === 'f3') assert.match(sql, /WHERE id NOT IN \('dallara-f3-2020', 'dallara-f3-2021'\)/);
            else assert.doesNotMatch(sql, /WHERE/);
        }
    }
});
