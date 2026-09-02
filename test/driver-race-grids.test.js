const test = require('node:test');
const assert = require('node:assert/strict');
const { driverRaceGridContexts } = require('../backend/driver-race-grids');
const { juniorRaceGridContext } = require('../backend/junior-race-analysis');
const { academyRaceGridContext } = require('../backend/academy-race-analysis');

const field = (count = 20) => Array.from({ length: count }, (_, i) => ({ driverId: `d${i + 1}`, positionNumber: i + 1 }));
function classification(id, name, number, isRace, results, year = 2026) {
    return results.map(row => ({ ...row, raceId: 'weekend', year, sessionId: id, sessionName: name, sessionNumber: number, isRace }));
}

test('driver history recognizes Grid names and non-adjacent session numbers', () => {
    const rows = [
        ...classification('q', 'Qualifying', 2, 0, field()),
        ...classification('grid', 'Grid', 3, 0, field().reverse().map((r, i) => ({ ...r, positionNumber: i + 1 }))),
        ...classification('race', 'Feature Race', 5, 1, field())
    ];
    const context = driverRaceGridContexts('f2', rows, () => 'F').get('race');
    assert.equal(context.gridByDriver.get('d1'), 20);
    assert.equal(context.source, 'official');
});

test('a grid from an earlier race cannot leak into a later race with missing grid data', () => {
    const rows = [
        ...classification('q', 'Qualifying', 2, 0, field()),
        ...classification('grid', 'Starting Grid', 3, 0, field().reverse().map((r, i) => ({ ...r, positionNumber: i + 1 }))),
        ...classification('sprint', 'Sprint Race', 4, 1, field()),
        ...classification('feature', 'Feature Race', 6, 1, field())
    ];
    const context = driverRaceGridContexts('f2', rows, session => session.name.includes('Sprint') ? 'S' : 'F').get('feature');
    assert.equal(context.gridByDriver.get('d1'), 1);
    assert.equal(context.source, 'derived');
});

test('Academy context retains all weekend races even when the selected driver missed one', () => {
    const rows = [
        ...classification('q', 'Qualifying', 2, '0', field(16)),
        ...classification('r1', 'Race 1', 3, '1', field(16).slice(1)),
        ...classification('r2', 'Race 2', 4, '1', field(16))
    ];
    const contexts = driverRaceGridContexts('academy', rows);
    assert.equal(contexts.get('r1').gridByDriver.get('d1'), 8);
    assert.equal(contexts.get('r2').gridByDriver.get('d1'), 1);
    assert.equal(contexts.get('r2').source, 'derived');
});

test('Academy carry-over races and missing classifications remain explicitly unknown', () => {
    const rows = [
        ...classification('q', 'Qualifying', 2, 0, field(16), 2025),
        ...classification('r1', 'Race 1', 3, 1, field(16), 2025),
        ...classification('r2', 'Race 2', 4, 1, field(16), 2025),
        ...classification('r3', 'Race 3', 5, 1, field(16), 2025)
    ];
    const context = driverRaceGridContexts('academy', rows).get('r1');
    assert.equal(context.gridByDriver.size, 0);
    assert.match(context.gridNote, /Miami/);
    assert.equal(driverRaceGridContexts('f2', classification('r', 'Race', 4, 1, field()), () => 'S').get('r').gridByDriver.size, 0);
});

test('legacy F2 ignores podium snippets and derives feature and sprint grids from their proper basis', () => {
    const rows = [
        ...classification('q', 'Qualifying', 4, 0, field(), 2018),
        ...classification('badgrid', 'Grid', 5, 0, field(3), 2018),
        ...classification('f', 'Feature Race', 6, 1, field(), 2018),
        ...classification('badgrid2', 'Grid', 7, 0, field(3), 2018),
        ...classification('s', 'Sprint Race', 8, 1, field(), 2018)
    ];
    const contexts = driverRaceGridContexts('f2', rows, session => session.name.includes('Sprint') ? 'S' : 'F');
    assert.equal(contexts.get('f').gridByDriver.get('d10'), 10);
    assert.equal(contexts.get('s').gridByDriver.get('d1'), 8);
    assert.equal(contexts.get('s').gridByDriver.get('d8'), 1);
    assert.equal(contexts.get('s').source, 'derived');
});

test('historical F3 reverse limits and 2021 second sprint use the preceding race', () => {
    const sessions = [
        { id: 'q', name: 'Qualifying', sessionNumber: 2 },
        { id: 'r1', name: 'Race 1', sessionNumber: 4, isRace: true },
        { id: 'r2', name: 'Race 2', sessionNumber: 6, isRace: true }
    ];
    const results = new Map([['q', field()], ['r1', field().reverse().map((r, i) => ({ ...r, positionNumber: i + 1 }))]]);
    for (const [series, year, expected] of [['f3', 2019, 8], ['f3', 2020, 10], ['f3', 2021, 12], ['f2', 2021, 10]]) {
        const context = juniorRaceGridContext(series, sessions[2], sessions, results, 'S', year);
        assert.equal(context.gridByDriver.get('d20'), expected);
        assert.match(context.gridNote, /preceding race/);
    }
});

test('split qualifying groups cannot masquerade as a full starting grid', () => {
    const rows = [
        ...classification('qa', 'Qualifying Group A', 2, 0, field(10)),
        ...classification('qb', 'Qualifying Group B', 3, 0, field(10).map(r => ({ ...r, driverId: `b-${r.driverId}` }))),
        ...classification('r', 'Feature Race', 4, 1, field(20))
    ];
    assert.equal(driverRaceGridContexts('f2', rows, () => 'F').get('r').gridByDriver.size, 0);
});

test('raw grid and qualifying sentinel positions cannot propagate through grid contexts', () => {
    const sessions = [
        { id: 'q', name: 'Qualifying', sessionNumber: 2 },
        { id: 'g', name: 'Starting Grid', sessionNumber: 3 },
        { id: 'r', name: 'Race', isRace: true, sessionNumber: 4 }
    ];
    const results = new Map([['q', [{ driverId: 'bad', positionNumber: 999 }, { driverId: 'ok', positionNumber: 3 }]],
        ['g', [{ driverId: 'bad', positionNumber: 999 }, { driverId: 'ok', positionNumber: 4 }]]]);
    for (const series of ['f2', 'f3']) {
        const context = juniorRaceGridContext(series, sessions[2], sessions, results, 'F', 2026);
        assert.equal(context.gridByDriver.get('bad'), null);
        assert.equal(context.qualificationByDriver.get('bad'), null);
        assert.equal(context.gridByDriver.get('ok'), 4);
    }
    const academy = academyRaceGridContext(sessions[2], sessions, results, 2026);
    assert.equal(academy.gridByDriver.get('bad'), null);
    assert.equal(academy.gridByDriver.get('ok'), 6);
});
