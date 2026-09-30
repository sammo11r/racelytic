const test = require('node:test');
const assert = require('node:assert/strict');
const { driverSeasonParticipation } = require('../backend/ask-season-participation');

const connection = { query: async sql => {
    if (/SELECT id, name FROM drivers/.test(sql)) return [{ id: 1, name: 'Alice One' }];
    if (/FROM races LEFT JOIN grands_prix/.test(sql)) return [
        { id: 10, name: 'First Grand Prix', year: 2024, round: 1 },
        { id: 11, name: 'Second Grand Prix', year: 2024, round: 2 },
        { id: 12, name: 'Third Grand Prix', year: 2024, round: 3 }
    ];
    if (/FROM races_race_results/.test(sql)) return [
        { raceId: 10, positionText: '1' }, { raceId: 11, positionText: 'DNS' }
    ];
    throw new Error(`Unexpected query: ${sql}`);
} };

test('season participation separates result-table entries, starts, and missing events', async () => {
    const base = { series: 'f1', targetSeason: 2024, subjectName: 'Alice' };
    const entered = await driverSeasonParticipation(connection, { ...base, participationMode: 'entered' });
    const started = await driverSeasonParticipation(connection, { ...base, participationMode: 'started' });
    const missed = await driverSeasonParticipation(connection, { ...base, participationMode: 'missed' });
    assert.match(entered.answer, /entered 2 of the 3/);
    assert.match(started.answer, /started 1 of the 3/);
    assert.match(missed.answer, /missed 1 of the 3.*Third Grand Prix/);
});
