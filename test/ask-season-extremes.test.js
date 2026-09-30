const test = require('node:test');
const assert = require('node:assert/strict');
const { singleSeasonRecord, teamSeasonExtreme, standingsImprovement, championSeasonExtreme } = require('../backend/ask-season-extremes');

const driverStandings = [
    { year: 2023, position: 5, points: 70, id: 1, name: 'Alice One' },
    { year: 2024, position: 2, points: 120, id: 1, name: 'Alice One' },
    { year: 2023, position: 1, points: 90, id: 2, name: 'Bob Two' },
    { year: 2024, position: 4, points: 100, id: 2, name: 'Bob Two' }
];
const teamStandings = [
    { year: 2023, position: 2, points: 90, id: 10, name: 'Red Team' },
    { year: 2024, position: 1, points: 140, id: 10, name: 'Red Team' }
];
const starts = [
    { eventId: 1, eventName: 'First Grand Prix', eventDate: '2023-03-01', year: 2023, round: 1,
        driverId: 1, driverName: 'Alice One', teamId: 10, teamName: 'Red Team', points: 0, position: 2, status: '2' },
    { eventId: 2, eventName: 'Second Grand Prix', eventDate: '2024-03-01', year: 2024, round: 1,
        driverId: 1, driverName: 'Alice One', teamId: 10, teamName: 'Red Team', points: 25, position: 1, status: '1' },
    { eventId: 3, eventName: 'Third Grand Prix', eventDate: '2024-04-01', year: 2024, round: 2,
        driverId: 1, driverName: 'Alice One', teamId: 10, teamName: 'Red Team', points: 25, position: 1, status: '1' }
];
const connection = { query: async sql => {
    if (/FROM seasons_driver_standings/.test(sql)) return driverStandings;
    if (/FROM seasons_constructor_standings/.test(sql)) return teamStandings;
    if (/FROM races ORDER BY races.year/.test(sql)) return [
        { year: 2023, round: 1, date: '2023-03-01', recorded: 1 },
        { year: 2024, round: 1, date: '2024-03-01', recorded: 1 }
    ];
    if (/FROM races_race_results results/.test(sql)) return starts;
    throw new Error(`Unexpected query: ${sql}`);
} };

test('single-season wins use completed race classifications', async () => {
    const result = await singleSeasonRecord(connection, { series: 'f1', entity: 'drivers', recordCategory: 'wins' });
    assert.match(result.answer, /Alice One \(2024\).*2/);
});

test('team season maximum uses final standings points', async () => {
    const result = await teamSeasonExtreme(connection, { series: 'f1', subjectName: 'Red Team', recordCategory: 'points', extreme: 'largest' });
    assert.match(result.answer, /2024 with 140 points/);
});

test('standings improvement compares only shared competitors across consecutive seasons', async () => {
    const result = await standingsImprovement(connection, { series: 'f1', entity: 'drivers', fromYear: 2023, toYear: 2024 });
    assert.match(result.answer, /Alice One improved the most: 3 championship places/);
    await assert.rejects(() => standingsImprovement(connection, { series: 'f1', fromYear: 2022, toYear: 2024 }), { statusCode: 422 });
});

test('champion extremes join official champions with recorded race wins', async () => {
    const result = await championSeasonExtreme(connection, { series: 'f1', entity: 'drivers', recordCategory: 'wins', extreme: 'smallest' });
    assert.match(result.answer, /Bob Two \(2023\).*fewest wins.*0/);
});
