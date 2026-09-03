const test = require('node:test');
const assert = require('node:assert/strict');
const { configuration, aggregate, explore } = require('../backend/junior-records');
const { renderRecordsHtml } = require('../backend/records-renderer');
const pool = require('../backend/db');
test.after(() => pool.end());
const driver = (id, position, extra = {}) => ({ driverId: id, driverName: id, constructorId: 'team', constructorName: 'Team',
    position, grid: 5, positionText: 'CLA', points: 0, ...extra });
const race = (sessionId, year, raceType, results, extra = {}) => ({ sessionId, year, raceType, results, gridSource: 'official', ...extra });

test('new junior records include all formats and old saved feature-only definitions still restore', () => {
    for (const series of ['f2', 'f3', 'academy']) {
        assert.equal(configuration({ series }).raceFormat, 'all');
        assert.equal(configuration({ series, includeSprints: false }).raceFormat, 'F');
        assert.equal(configuration({ series, raceFormat: 'S' }).raceFormat, 'S');
        assert.equal(configuration({ series, raceFormat: 'S', category: 'poles' }).raceFormat, 'F');
        const title = configuration({ series, category: 'championships', raceFormat: 'S', circuitId: 'monaco', constructorId: 'team' });
        assert.equal(title.raceFormat, 'all'); assert.equal(title.circuitId, ''); assert.equal(title.constructorId, 'team');
        assert.equal(configuration({ series, category: 'gridGain', minStarts: 25 }).minStarts, 25);
    }
});

test('race format filters use session identity, and team starts count each session once', () => {
    const races = [race('feature', 2024, 'F', [driver('a', 1), driver('b', 2)]), race('sprint', 2024, 'S', [driver('a', 2), driver('b', 1)])];
    const all = aggregate(races, [], configuration({ series: 'f3', type: 'constructors', category: 'starts' })).entries[0];
    assert.equal(all.starts, 2); assert.equal(all.carStarts, 4); assert.equal(all.wins, 2); assert.equal(all.podiums, 4);
    assert.equal(aggregate(races, [], configuration({ series: 'f3', type: 'constructors', category: 'starts', raceFormat: 'S' })).entries[0].starts, 1);
});

test('starts exclude DNS and keep retirees while averages use actual measured samples', () => {
    const races = [race('r', 2024, 'F', [driver('dns', null, { positionText: 'DNS' }), driver('retired', null, { positionText: 'DNF' }),
        driver('dsq', null, { positionText: 'DSQ' }), driver('unknown-grid', 5, { grid: null }), driver('negative', 8)])];
    const starts = aggregate(races, [], configuration({ series: 'f2', category: 'starts' }));
    assert.equal(starts.entries.length, 4); assert.ok(!starts.entries.some(row => row.id === 'dns'));
    const averages = aggregate(races, [], configuration({ series: 'f2', category: 'gridGain', minStarts: 1 }));
    assert.equal(averages.entries.length, 1); assert.equal(averages.entries[0].value, -3); assert.equal(averages.entries[0].sample, 1);
    assert.equal(aggregate(races, [], configuration({ series: 'f2', category: 'gridGain', minStarts: 5 })).entries.length, 0);
});

test('title attribution requires points for the selected team in the winning season', () => {
    const races = [race('old', 2023, 'F', [driver('champion', 1, { points: 25, constructorId: 'old-team' })]),
        race('new', 2024, 'S', [driver('champion', 1, { points: 10, constructorId: 'new-team' })])];
    const titles = [{ id: 'champion', year: 2023 }];
    assert.equal(aggregate(races, titles, configuration({ series: 'f2', category: 'championships', constructorId: 'new-team' })).entries.length, 0);
    assert.equal(aggregate(races, titles, configuration({ series: 'f2', category: 'championships', constructorId: 'old-team' })).entries[0].value, 1);
});

test('reverse-grid starts never become pole awards, and known derived grids disclose coverage', () => {
    const races = [race('standard', 2024, 'F', [driver('a', 1, { polePosition: true })]),
        race('reverse', 2024, 'S', [driver('a', 1, { polePosition: true })], { gridSource: 'derived' })];
    assert.equal(aggregate(races, [], configuration({ series: 'academy', category: 'poles' })).entries[0].value, 1);
    const data = aggregate(races, [], configuration({ series: 'academy', category: 'gridGain', minStarts: 1 }));
    assert.equal(data.coverage.measured, 2); assert.equal(data.coverage.derived, 1);
});

test('nationality filters and ties apply within the selected championship', () => {
    const races = [race('r', 2024, 'F', [driver('b', 1), driver('a', 2), driver('c', 3)])];
    const entries = aggregate(races, [], configuration({ series: 'f3', category: 'starts', nationality: 'GB' }), new Map([['a', 'gb'], ['b', 'gb'], ['c', 'fr']])).entries;
    assert.deepEqual(entries.map(row => [row.id, row.rank]), [['a', 1], ['b', 1]]);
});

test('all records pages use the shared layout with series-specific labels and season ranges', () => {
    for (const [series, name, start, team] of [['f2', 'F2', 2017, 'Constructor'], ['f3', 'F3', 2019, 'Team'], ['academy', 'F1 Academy', 2023, 'Team']]) {
        const html = renderRecordsHtml(`/${series}/records`);
        assert.ok(html.includes(`<h1>${name} Records</h1>`));
        assert.ok(html.includes(`min="${start}"`));
        assert.ok(html.includes(`for="fr-constructor">${team}`));
        assert.ok(html.includes('id="fr-format"'));
        assert.ok(!html.includes('Indianapolis'));
        assert.ok(!html.includes('2000–present'));
    }
    assert.ok(!renderRecordsHtml('/records').includes('id="fr-format"'));
});

test('saved record links retain legacy feature-only scope when false booleans are omitted', () => {
    const source = require('node:fs').readFileSync(require.resolve('../frontend/js/account.js'), 'utf8');
    const functionSource = source.match(/function savedRecordUrl\(configuration\) \{[\s\S]*?\n\}/)[0];
    const savedRecordUrl = require('node:vm').runInNewContext(`(${functionSource})`, { URLSearchParams });
    for (const series of ['f2', 'f3', 'academy']) {
        const old = new URL(savedRecordUrl({ series, category: 'wins', includeSprints: false }), 'http://localhost');
        assert.equal(old.pathname, `/${series}/records`);
        assert.equal(old.searchParams.get('raceFormat'), 'F');
        const current = new URL(savedRecordUrl({ series, category: 'gridGain', raceFormat: 'S', minStarts: 25 }), 'http://localhost');
        assert.equal(current.searchParams.get('raceFormat'), 'S');
        assert.equal(current.searchParams.get('minStarts'), '25');
    }
});

test('junior archive integration', { skip: process.env.JUNIOR_RECORDS_DB_TESTS !== '1' }, async t => {
    for (const series of ['f2', 'f3', 'academy']) await t.test(series, async () => {
        const all = await explore(pool, { series, category: 'starts', fromYear: 2023, toYear: 2023 });
        const feature = await explore(pool, { series, category: 'starts', fromYear: 2023, toYear: 2023, raceFormat: 'F' });
        const sprint = await explore(pool, { series, category: 'starts', fromYear: 2023, toYear: 2023, raceFormat: 'S' });
        const count = data => data.entries.reduce((sum, row) => sum + row.starts, 0);
        assert.ok(all.total > 0); assert.ok(sprint.total > 0);
        assert.equal(count(all), count(feature) + count(sprint));
        const titles = await explore(pool, { series, category: 'championships', toYear: 2024 });
        assert.ok(titles.entries.length > 0); assert.ok(titles.entries.every(row => row.value >= 1));
        const averages = await explore(pool, { series, category: 'gridGain', minStarts: 25 });
        assert.ok(averages.entries.length > 0); assert.ok(averages.entries.every(row => row.sample >= 25));
    });
});
