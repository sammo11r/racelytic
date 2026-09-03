const test = require('node:test');
const assert = require('node:assert/strict');
const { buildJuniorCircuitAnalysis } = require('../backend/junior-circuit-analysis');
const { f2SessionType, f3SessionType, academySessionType } = require('../backend/routes/seasons');
const model = require('../frontend/js/f1-circuit-analysis-model');
test.after(() => require('../backend/db').end());

function session(id, name, sessionNumber, year, results, extra = {}) {
    return results.map((result, index) => ({ raceId: 'weekend', raceName: 'Test weekend', year, round: 1,
        sessionId: id, sessionName: name, sessionNumber, isRace: /race/i.test(name), cancelled: false,
        driverId: `driver-${index + 1}`, driverName: `Driver ${index + 1}`, constructorId: 'team', constructorName: 'Team',
        positionNumber: index + 1, positionText: 'CLA', laps: 20, ...extra, ...result }));
}

test('junior circuit analysis normalizes status markers, lapped gaps and cancelled sessions', () => {
    const rows = [
        ...session('q', 'Qualifying', 1, 2024, [{}, {}, {}, {}]),
        ...session('feature', 'Feature Race', 2, 2024, [{}, { gapMillis: 1234, gapLaps: 0 }, { positionNumber: 999 }, { positionNumber: 999, positionText: 'DNS' }]),
        ...session('cancelled', 'Sprint Race', 3, 2024, [{}], { cancelled: true }),
        ...session('sprint', 'Sprint Race', 4, 2024, [{}, { gapMillis: null, gapLaps: 1 }])
    ];
    const data = buildJuniorCircuitAnalysis({ id: 'circuit' }, rows, 'f2', f2SessionType);
    assert.equal(data.races.length, 2);
    const feature = data.races[0];
    assert.equal(feature.sessionId, 'feature');
    assert.equal(feature.results[2].position, null);
    assert.equal(feature.results[2].positionText, 'DNF');
    assert.equal(model.metrics([feature]).retirements, 1);
    assert.equal(model.metrics([feature]).starters, 3);
    assert.equal(model.gap(feature.results[1]).seconds, 1.234);
    assert.equal(model.gap(data.races[1].results[1]).laps, 1);
    assert.equal(feature.gridSource, 'derived');
});

test('Academy 2023 uses both qualifying sessions and distinguishes its reverse-grid race', () => {
    const drivers = Array.from({ length: 8 }, () => ({}));
    const rows = [
        ...session('q1', 'Qualifying 1', 1, 2023, drivers),
        ...session('q2', 'Qualifying 2', 2, 2023, drivers.map((_, index) => ({ positionNumber: 8 - index }))),
        ...session('r1', 'Race 1', 3, 2023, drivers),
        ...session('r2', 'Race 2', 4, 2023, drivers),
        ...session('r3', 'Race 3', 5, 2023, drivers)
    ];
    const data = buildJuniorCircuitAnalysis({ id: 'spielberg' }, rows, 'academy', academySessionType);
    assert.deepEqual(data.races.map(race => race.raceType), ['F', 'S', 'F']);
    assert.deepEqual(data.races.map(race => race.results[0].grid), [1, 8, 8]);
    assert.match(data.races[2].officialName, /Race 3/);
    assert.equal(model.metrics(data.races, true).poles, 3);
});

test('F2 and F3 preserve sprint identities and official versus derived grid coverage', () => {
    for (const [series, type] of [['f2', f2SessionType], ['f3', f3SessionType]]) {
        const rows = [
            ...session('q', 'Qualifying', 1, 2021, Array.from({ length: 12 }, () => ({}))),
            ...session('grid', 'Starting Grid', 2, 2021, [{ positionNumber: 2 }, { positionNumber: 1 }]),
            ...session('s1', 'Sprint Race 1', 3, 2021, [{}, {}]),
            ...session('s2', 'Sprint Race 2', 4, 2021, [{}, {}]),
            ...session('feature', 'Feature Race', 5, 2021, [{}, {}])
        ];
        const { races } = buildJuniorCircuitAnalysis({ id: 'circuit' }, rows, series, type);
        assert.deepEqual(races.map(race => race.raceType), ['S', 'S', 'F']);
        assert.equal(races[0].gridSource, 'official');
        assert.equal(races[0].results[0].grid, 2);
        assert.equal(races[1].gridSource, 'derived');
        assert.notEqual(races[0].officialName, races[1].officialName);
        assert.equal(races[2].results[0].grid, 1);
    }
});

test('grid P1 conversion includes reverse grids and skips unavailable P1 data', () => {
    const races = [
        { results: [{ driverId: 'winner', position: 1, grid: 1, polePosition: false }] },
        { results: [{ driverId: 'winner', position: 1, grid: null, polePosition: false }] }
    ];
    assert.equal(model.metrics(races, true).poleRate, 100);
    assert.equal(model.metrics(races, true).poles, 1);
    assert.equal(model.metrics(races).poleRate, null);
});
