const test = require('node:test');
const assert = require('node:assert/strict');
const { bestWorstResult, resultDistribution, latestFailure, compareSeasons, longestMilestoneGap,
    consecutiveEventWins, lineupRecord } = require('../backend/ask-result-analytics');

const starts = [
    { eventId: 1, eventName: 'Opening Grand Prix', eventDate: '2022-03-01', year: 2022, round: 1,
        driverId: 7, driverName: 'Test Driver', teamId: 9, teamName: 'Test Team', points: 0, position: 0, status: 'R' },
    { eventId: 2, eventName: 'Second Grand Prix', eventDate: '2022-04-01', year: 2022, round: 2,
        driverId: 7, driverName: 'Test Driver', teamId: 9, teamName: 'Test Team', points: 18, position: 2, status: '2' },
    { eventId: 3, eventName: 'Third Grand Prix', eventDate: '2023-03-01', year: 2023, round: 1,
        driverId: 7, driverName: 'Test Driver', teamId: 9, teamName: 'Test Team', points: 18, position: 2, status: '2' },
    { eventId: 4, eventName: 'Fourth Grand Prix', eventDate: '2023-04-01', year: 2023, round: 2,
        driverId: 7, driverName: 'Test Driver', teamId: 9, teamName: 'Test Team', points: 0, position: 0, status: 'R' },
    { eventId: 4, eventName: 'Fourth Grand Prix', eventDate: '2023-04-01', year: 2023, round: 2,
        driverId: 8, driverName: 'Other Driver', teamId: 9, teamName: 'Test Team', points: 6, position: 7, status: '7' }
];

function archive(sprintRows = []) {
    return { async query(sql) {
        if (sql.includes('FROM races ORDER BY')) return [
            { year: 2022, round: 2, date: '2022-04-01', recorded: 1 },
            { year: 2023, round: 2, date: '2023-04-01', recorded: 1 }
        ];
        if (sql.includes('FROM races_race_results results')) return starts;
        if (sql.includes('FROM seasons_driver_standings')) return [
            { year: 2022, position: 4, points: 100, id: 7, name: 'Test Driver' },
            { year: 2023, position: 3, points: 100, id: 7, name: 'Test Driver' }
        ];
        if (sql.includes('FROM races_sprint_race_results')) return sprintRows;
        throw new Error(`Unexpected query: ${sql}`);
    } };
}

test('best season points preserve ties and use completed final standings', async () => {
    const answer = await bestWorstResult(archive(), { series: 'f1', subjectName: 'Test Driver',
        resultMetric: 'season_points', extreme: 'largest' });
    assert.match(answer.answer, /2022 final standings, 2023 final standings/);
    assert.equal(answer.fact.rows.length, 3);
});

test('finish distribution separates retirements from classified positions', async () => {
    const answer = await resultDistribution(archive(), { series: 'f1', subjectName: 'Test Driver',
        distributionMetric: 'finishes' });
    assert.deepEqual(answer.fact.rows.slice(2).map(row => [row.label, row.value]),
        [['P2', '2 starts'], ['Unclassified', '2 starts']]);
});

test('latest team non-scoring event checks every starter and F1 sprint points', async () => {
    const request = { series: 'f1', subjectName: 'Test Team', failureMetric: 'points' };
    await assert.rejects(latestFailure(archive([{ raceId: 1, driverId: 7, constructorId: 9, points: 3 }]), request),
        /No recorded non-scoring race start/);
    const answer = await latestFailure(archive(), request);
    assert.match(answer.answer, /Opening Grand Prix/);
});

test('two-season comparison keeps each official standing with its own season', async () => {
    const answer = await compareSeasons(archive(), { series: 'f1', subjectName: 'Test Driver', fromYear: 2022, toYear: 2023 });
    assert.match(answer.answer, /P4 in 2022 to .*P3 in 2023/);
    assert.equal(answer.fact.rows.length, 5);
});

test('longest points gap requires two point-scoring boundary starts', async () => {
    const answer = await longestMilestoneGap(archive(), { series: 'f1', milestone: 'points', gapMeasure: 'days' });
    assert.match(answer.answer, /Second Grand Prix.*Third Grand Prix/);
    assert.match(answer.answer, /0 intervening starts/);
});

test('consecutive event wins resolve a circuit name to the correct calendar events', async () => {
    const connection = { async query(sql) {
        if (sql.includes('FROM races LEFT JOIN grands_prix')) return [
            { id: 10, name: 'Italian Grand Prix', circuitName: 'Monza', placeName: 'Monza' },
            { id: 11, name: 'Italian Grand Prix', circuitName: 'Monza', placeName: 'Monza' },
            { id: 12, name: 'Monaco Grand Prix', circuitName: 'Monaco', placeName: 'Monte Carlo' }
        ];
        if (sql.includes('FROM races_race_results results')) return [
            ...[10, 11, 12].map((eventId, index) => ({ eventId, eventName: eventId === 12 ? 'Monaco Grand Prix' : 'Italian Grand Prix',
                eventDate: `202${index}-09-01`, year: 2020 + index, round: 1,
                driverId: 7, driverName: 'Test Driver', teamId: 9, teamName: 'Test Team',
                points: 25, position: 1, status: '1' }))
        ];
        throw new Error(`Unexpected query: ${sql}`);
    } };
    const answer = await consecutiveEventWins(connection, { series: 'f1', subjectName: 'Test Team', eventName: 'Monza' });
    assert.match(answer.answer, /Italian Grand Prix 1 time across 1 run/);
    assert.equal(answer.fact.rows.length, 4);
});

test('WEC crew points count once per car entry rather than once per driver', async () => {
    const connection = { async query(sql) {
        if (!sql.includes('FROM wec_entry_drivers crew')) throw new Error(`Unexpected query: ${sql}`);
        return [1, 2].flatMap(eventId => [7, 8, 9].map(driverId => ({
            eventId, eventName: `Event ${eventId}`, eventDate: `2024-0${eventId}-01`, year: 2024,
            round: eventId, entryId: eventId + 100, driverId, driverName: `Driver ${driverId}`,
            teamId: 4, teamName: 'Test Crew', points: 25, classPosition: 1, overallPosition: 1,
            status: 'classified', classCode: 'Hypercar'
        })));
    } };
    const answer = await lineupRecord(connection, { series: 'wec', classCode: 'Hypercar', recordCategory: 'points' });
    assert.match(answer.answer, /50 across 2 race starts/);
    assert.match(answer.fact.rows[1].value, /2 wins · 50 recorded race points/);
});
