const test = require('node:test');
const assert = require('node:assert/strict');
const { roundStandingsChange, roundRivalSwing, championshipLeadChanges } = require('../backend/ask-round-standings');

const data = [
    { round: 1, position: 1, points: 25, id: 1, name: 'Alice One', raceId: 1, raceName: 'First Grand Prix' },
    { round: 1, position: 2, points: 18, id: 2, name: 'Bob Two', raceId: 1, raceName: 'First Grand Prix' },
    { round: 2, position: 2, points: 40, id: 1, name: 'Alice One', raceId: 2, raceName: 'Second Grand Prix' },
    { round: 2, position: 1, points: 43, id: 2, name: 'Bob Two', raceId: 2, raceName: 'Second Grand Prix' },
    { round: 3, position: 1, points: 65, id: 1, name: 'Alice One', raceId: 3, raceName: 'Third Grand Prix' },
    { round: 3, position: 2, points: 58, id: 2, name: 'Bob Two', raceId: 3, raceName: 'Third Grand Prix' }
];
const connection = { query: async sql => {
    if (/FROM races_driver_standings standings/.test(sql)) return data;
    throw new Error(`Unexpected query: ${sql}`);
} };

test('two-round standings change uses exact cumulative cutoffs', async () => {
    const result = await roundStandingsChange(connection, { series: 'f1', targetSeason: 2024,
        subjectName: 'Alice', roundStart: 1, roundEnd: 2 });
    assert.match(result.answer, /P1 after round 1 to P2 after round 2 \(-1 places\), gaining 15/);
});

test('rival swing subtracts both competitors’ points gained in the selected round', async () => {
    const result = await roundRivalSwing(connection, { series: 'f1', targetSeason: 2024,
        subjectNames: ['Alice', 'Bob'], standingRound: 2 });
    assert.match(result.answer, /Alice One lost 10 championship points to Bob Two.*15 versus 25/);
});

test('lead changes count official P1 identity after the opening round', async () => {
    const result = await championshipLeadChanges(connection, { series: 'f1', targetSeason: 2024 });
    assert.match(result.answer, /changed 2 times/);
    assert.equal(result.fact.rows.length, 2);
});
