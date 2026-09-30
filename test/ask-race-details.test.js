const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretLocally } = require('../backend/ask-interpreter');
const { calculateF1RaceDetail } = require('../backend/ask-race-details');

const event = { id: 12, name: 'Monaco Grand Prix', year: 2024, round: 8, circuitName: 'Circuit de Monaco' };
const rows = {
    races_race_results: [
        { driverId: 1, driverName: 'Alice One', constructorId: 10, teamName: 'Red Team', positionNumber: 1, positionText: '1', positionDisplayOrder: 1, gridPositionNumber: 3, points: 25, polePosition: 1 },
        { driverId: 2, driverName: 'Bob Two', constructorId: 10, teamName: 'Red Team', positionNumber: 2, positionText: '2', positionDisplayOrder: 2, gridPositionNumber: 2, points: 18 },
        { driverId: 3, driverName: 'Cara Three', constructorId: 20, teamName: 'Blue Team', positionNumber: null, positionText: 'DNF', positionDisplayOrder: 3, gridPositionNumber: 1, points: 0 }
    ],
    races_sprint_race_results: [
        { driverId: 1, driverName: 'Alice One', constructorId: 10, teamName: 'Red Team', positionNumber: 1, positionText: '1', positionDisplayOrder: 1, points: 8 },
        { driverId: 2, driverName: 'Bob Two', constructorId: 10, teamName: 'Red Team', positionNumber: 2, positionText: '2', positionDisplayOrder: 2, points: 7 }
    ],
    races_starting_grid_positions: [
        { driverId: 3, driverName: 'Cara Three', constructorId: 20, teamName: 'Blue Team', positionNumber: 1, positionDisplayOrder: 1 },
        { driverId: 2, driverName: 'Bob Two', constructorId: 10, teamName: 'Red Team', positionNumber: 2, positionDisplayOrder: 2 },
        { driverId: 1, driverName: 'Alice One', constructorId: 10, teamName: 'Red Team', positionNumber: 3, positionDisplayOrder: 3 }
    ],
    races_qualifying_results: [
        { driverId: 1, driverName: 'Alice One', constructorId: 10, teamName: 'Red Team', positionNumber: 1, positionDisplayOrder: 1 }
    ],
    races_fastest_laps: [
        { driverId: 2, driverName: 'Bob Two', constructorId: 10, teamName: 'Red Team', positionNumber: 1, positionDisplayOrder: 1, lap: 60, time: '1:15.000' }
    ]
};
const connection = { query: async sql => {
    if (/FROM races LEFT JOIN grands_prix/.test(sql)) return [event];
    const table = Object.keys(rows).find(name => sql.includes(`FROM ${name} results`));
    if (table) return rows[table];
    throw new Error(`Unexpected query: ${sql}`);
} };

async function answer(query) {
    return calculateF1RaceDetail(connection, { ...interpretLocally(query), series: 'f1' });
}

test('race details use the official grid, pole, qualifying and fastest-lap rows', async () => {
    assert.match((await answer('Who started from P3 at Monaco in 2024?')).answer, /Alice One started from P3/);
    assert.match((await answer('Who took pole at Monaco in 2024?')).answer, /Alice One was credited with pole/);
    assert.match((await answer('Who qualified P1 at Monaco in 2024?')).answer, /Alice One qualified P1/);
    assert.match((await answer('Who set the fastest race lap at Monaco in 2024?')).answer, /Bob Two.*1:15\.000/);
});

test('event points add race and sprint and aggregate a named team once', async () => {
    const driver = await answer('How many points did Alice One score at Monaco in 2024?');
    assert.match(driver.answer, /33 recorded points/);
    const team = await answer("What was Red Team's points haul at Monaco in 2024?");
    assert.match(team.answer, /58 recorded points/);
    assert.equal(team.fact.rows.length, 2);
    assert.match(team.fact.rows[1].value, /43 Grand Prix \+ 15 sprint/);
});

test('race status and grid movement exclude nonclassified finishes from movement', async () => {
    assert.match((await answer('Who retired at Monaco in 2024?')).answer, /1 competitor was recorded as retired/);
    assert.match((await answer('Who gained most places at Monaco in 2024?')).answer, /Alice One gained.*2 places/);
    assert.match((await answer('Who started Monaco in 2024?')).answer, /3 competitors started/);
});

test('race detail rejects an event missing from the completed calendar', async () => {
    await assert.rejects(() => answer('Who took pole at Silverstone in 2024?'), { statusCode: 422 });
});
