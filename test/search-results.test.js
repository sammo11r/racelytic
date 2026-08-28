const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSearchResponse, circuitKey, completionFor, diverseSlice, relevance, searchLikePattern } = require('../backend/search-results');

const circuit = (series, label, place, url) => ({ category: 'circuit', series, label, place, meta: place, url });

test('equivalent circuit rows collapse into one cross-series result', () => {
    const response = buildSearchResponse([
        circuit('f1', 'Melbourne Grand Prix Circuit', 'Melbourne', '/circuit?id=melbourne'),
        circuit('f2', 'Melbourne Grand Prix Circuit', 'Melbourne, Victoria, Australia', '/f2/circuit?id=melbourne'),
        circuit('f3', 'Melbourne Grand Prix Circuit', 'Melbourne, Victoria, Australia', '/f3/circuit?id=melbourne')
    ], { query: 'melbourne', preferredSeries: 'f2' });
    const result = response.groups[0].results[0];
    assert.equal(response.groups[0].results.length, 1);
    assert.equal(result.url, '/f2/circuit?id=melbourne');
    assert.deepEqual(result.series, ['f1', 'f2', 'f3']);
    assert.match(result.meta, /Melbourne · F1 · F2 · F3/);
});

test('race suggestions retain series diversity before filling with more history', () => {
    const races = [
        ['f1', 2026], ['f1', 2025], ['f1', 2024], ['f2', 2026], ['f3', 2026]
    ].map(([series, year]) => ({ category: 'race', series, year, label: `${year} Melbourne`, meta: String(year), url: `/${series}/${year}` }));
    const response = buildSearchResponse(races, { query: 'melbourne', preferredSeries: 'f1' });
    const suggestions = response.groups[0].results;
    assert.deepEqual(new Set(suggestions.slice(0, 3).map(result => result.series)), new Set(['f1', 'f2', 'f3']));
});

test('full search can filter results to one series', () => {
    const response = buildSearchResponse([
        { category: 'driver', series: 'f1', label: 'Alex Driver', meta: 'F1', url: '/f1' },
        { category: 'driver', series: 'f2', label: 'Alex Driver', meta: 'F2', url: '/f2' }
    ], { query: 'alex', mode: 'full', seriesFilter: 'f2' });
    assert.equal(response.total, 1);
    assert.equal(response.groups[0].results[0].series, 'f2');
});

test('exact and prefix matches rank above incidental metadata matches', () => {
    const exact = { category: 'circuit', label: 'Melbourne', meta: 'Australia' };
    const incidental = { category: 'race', label: 'Australian Grand Prix', meta: '2026', searchText: 'Australian Grand Prix Melbourne' };
    assert.ok(relevance(exact, 'Melbourne', 'f1') < relevance(incidental, 'Melbourne', 'f1'));
    assert.equal(circuitKey(circuit('f1', 'Melbourne Grand Prix Circuit', 'Melbourne', '/')), 'melbourne');
});

test('SQL LIKE patterns treat user wildcard characters literally', () => {
    assert.equal(searchLikePattern('50%_off!'), '%50!%!_off!!%');
});

test('a surname prefix beats an incidental metadata match globally', () => {
    const response = buildSearchResponse([
        { category: 'circuit', series: 'f1', label: 'Silverstone Circuit', meta: 'Verstappen won here', url: '/silverstone' },
        { category: 'driver', series: 'f1', label: 'Max Verstappen', meta: 'Netherlands', prominence: 60, url: '/verstappen' }
    ], { query: 'verst', preferredSeries: 'f1' });
    assert.equal(response.bestMatch.label, 'Max Verstappen');
    assert.equal(response.completion, 'verstappen');
    assert.equal(response.groups[0].key, 'driver');
    assert.ok(response.bestMatch.confidence >= .9);
});

test('multi-token prefixes and aliases rank as strong intent signals', () => {
    const multiToken = buildSearchResponse([
        { category: 'driver', series: 'f1', label: 'Max Verstappen', meta: 'Netherlands', url: '/verstappen' },
        { category: 'driver', series: 'f1', label: 'Max Chilton', meta: 'Verstappen teammate', url: '/chilton' }
    ], { query: 'max v' });
    assert.equal(multiToken.bestMatch.label, 'Max Verstappen');
    assert.equal(multiToken.completion, 'max verstappen');

    const alias = buildSearchResponse([
        { category: 'team', series: 'f1', label: 'Red Bull Racing', aliases: ['RBR'], meta: 'Austria', url: '/red-bull' },
        { category: 'team', series: 'f1', label: 'Racing Bulls', meta: 'Italy', url: '/racing-bulls' }
    ], { query: 'rbr' });
    assert.equal(alias.bestMatch.label, 'Red Bull Racing');
    assert.equal(completionFor({ label: 'Red Bull Racing', aliases: ['RBR'] }, 'rb'), 'rbR');
});

test('series context and prominence break ties without overriding match quality', () => {
    const response = buildSearchResponse([
        { category: 'driver', series: 'f1', label: 'Alex Example', meta: 'F1', prominence: 20, url: '/f1' },
        { category: 'driver', series: 'f2', label: 'Alex Example', meta: 'F2', prominence: 0, url: '/f2' },
        { category: 'circuit', series: 'f2', label: 'Unrelated Circuit', meta: 'Alex Example visited', url: '/weak' }
    ], { query: 'alex', preferredSeries: 'f2' });
    assert.equal(response.bestMatch.url, '/f2');
    assert.notEqual(response.bestMatch.url, '/weak');
});

test('a close surname typo is retained as a low-confidence fallback', () => {
    const response = buildSearchResponse([
        { category: 'driver', series: 'f1', label: 'Lewis Hamilton', aliases: ['HAM'], meta: 'United Kingdom', url: '/hamilton' },
        { category: 'driver', series: 'f1', label: 'Jack Aitken', meta: 'United Kingdom', url: '/aitken' }
    ], { query: 'hamiton' });
    assert.equal(response.total, 1);
    assert.equal(response.bestMatch.label, 'Lewis Hamilton');
    assert.ok(response.bestMatch.confidence < .5);
});

test('commercial race titles remain searchable while canonical names are displayed', () => {
    const response = buildSearchResponse([{
        category: 'race',
        series: 'f1',
        label: 'Hungarian Grand Prix',
        aliases: ['Hungarian GP', 'Formula 1 Lenovo Hungarian Grand Prix 2025'],
        meta: '2025 · Budapest',
        url: '/race?id=1139'
    }], { query: 'lenovo' });
    assert.equal(response.bestMatch.label, 'Hungarian Grand Prix');
});
