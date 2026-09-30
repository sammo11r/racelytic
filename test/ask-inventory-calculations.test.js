const test = require('node:test');
const assert = require('node:assert/strict');
const calculations = require('../backend/ask-inventory-calculations');
const { interpretLocally } = require('../backend/ask-interpreter');
const { planWecQuestion } = require('../backend/ask-wec');
const { applyConfirmedInterpretation, applyFollowUpInterpretation } = require('../backend/routes/ask');
const { pool } = require('../backend/route-helpers');

test.after(async () => { await pool.end(); });

const starts = [
    { eventId: 'r1', eventName: 'First Grand Prix', eventDate: new Date(2020, 0, 1), year: 2020, round: 1, driverId: 'a', driverName: 'Alice', teamId: 'red', teamName: 'Red', points: 0, position: 10, status: '10' },
    { eventId: 'r1', eventName: 'First Grand Prix', eventDate: new Date(2020, 0, 1), year: 2020, round: 1, driverId: 'b', driverName: 'Bob', teamId: 'red', teamName: 'Red', points: 1, position: 9, status: '9' },
    { eventId: 'r2', eventName: 'Second Grand Prix', eventDate: new Date(2020, 11, 31), year: 2020, round: 2, driverId: 'a', driverName: 'Alice', teamId: 'red', teamName: 'Red', points: 0, position: 5, status: '5' },
    { eventId: 'r2', eventName: 'Second Grand Prix', eventDate: new Date(2020, 11, 31), year: 2020, round: 2, driverId: 'b', driverName: 'Bob', teamId: 'red', teamName: 'Red', points: 0, position: 6, status: '6' },
    { eventId: 'r3', eventName: 'Third Grand Prix', eventDate: new Date(2021, 5, 1), year: 2021, round: 1, driverId: 'a', driverName: 'Alice', teamId: 'blue', teamName: 'Blue', points: 0, position: 8, status: '8' },
    { eventId: 'r4', eventName: 'Fourth Grand Prix', eventDate: new Date(2022, 0, 1), year: 2022, round: 1, driverId: 'a', driverName: 'Alice', teamId: 'red', teamName: 'Red', points: 0, position: 4, status: '4' },
    { eventId: 'r5', eventName: 'Fifth Grand Prix', eventDate: new Date(2022, 11, 31), year: 2022, round: 2, driverId: 'a', driverName: 'Alice', teamId: 'red', teamName: 'Red', points: 6, position: 7, status: '7' },
    { eventId: 'r5', eventName: 'Fifth Grand Prix', eventDate: new Date(2022, 11, 31), year: 2022, round: 2, driverId: 'b', driverName: 'Bob', teamId: 'red', teamName: 'Red', points: 25, position: 1, status: '1' }
];

function connection() {
    const calls = [];
    return { calls, query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('FROM races_race_results results') && sql.includes('AS eventId')) return starts;
        if (sql.includes('FROM races ORDER BY')) return [
            { year: 2020, round: 1, date: new Date(2020, 0, 1), recorded: 1 },
            { year: 2020, round: 2, date: new Date(2020, 11, 31), recorded: 1 },
            { year: 2021, round: 1, date: new Date(2021, 5, 1), recorded: 1 },
            { year: 2022, round: 1, date: new Date(2022, 0, 1), recorded: 1 },
            { year: 2022, round: 2, date: new Date(2022, 11, 31), recorded: 0 }
        ];
        if (sql.includes('FROM seasons_driver_standings')) return [
            { year: 2020, position: 1, points: 100, id: 'c', name: 'Champion' },
            { year: 2020, position: 2, points: 90, id: 'd', name: 'Runner' },
            { year: 2020, position: 3, points: 30, id: 'a', name: 'Alice' },
            { year: 2020, position: 4, points: 29, id: 'b', name: 'Bob' },
            { year: 2021, position: 1, points: 60, id: 'c', name: 'Champion' },
            { year: 2021, position: 2, points: 59, id: 'd', name: 'Runner' },
            { year: 2021, position: 3, points: 28, id: 'a', name: 'Alice' },
            { year: 2021, position: 4, points: 24, id: 'b', name: 'Bob' },
            { year: 2022, position: 3, points: 100, id: 'a', name: 'Alice' },
            { year: 2022, position: 4, points: 100, id: 'b', name: 'Bob' }
        ];
        if (sql.includes('FROM races_sprint_race_results')) return [];
        throw new Error(`Unexpected query: ${sql}`);
    } };
}

test('team tenure adds separate stints and excludes time with another team', async () => {
    const result = await calculations.teamTenure(connection(), { series: 'f1', subjectName: 'Red' });
    assert.match(result.answer, /Alice.*729 calendar days.*across 2 stints/);
    assert.equal(result.fact.rows.filter(row => row.label.startsWith('Alice stint')).length, 2);
});

test('team seasons and teammate events count distinct seasons and events', async () => {
    const db = connection();
    const seasons = await calculations.teamSeasons(db, { series: 'f1' });
    assert.match(seasons.answer, /Alice.*Red.*2 recorded/);
    const teammates = await calculations.teammateEvents(db, { series: 'f1' });
    assert.match(teammates.answer, /Alice and Bob.*3 Formula 1 events/);
});

test('debut wait and latest team milestone retain date and result evidence', async () => {
    const db = connection();
    const wait = await calculations.firstMilestone(db, { series: 'f1', milestone: 'points' });
    assert.match(wait.answer, /Alice waited 1095 calendar days/);
    const quick = await calculations.firstMilestone(db, { series: 'f1', milestone: 'points',
        extreme: 'smallest', milestoneMeasure: 'starts' });
    assert.match(quick.answer, /Bob reached first points in 1 race start/);
    const quickQuestion = interpretLocally('Who reached a first win in the fewest starts?');
    assert.equal(quickQuestion.intent, 'debut_to_milestone');
    assert.equal(quickQuestion.extreme, 'smallest');
    assert.equal(quickQuestion.milestoneMeasure, 'starts');
    const latest = await calculations.latestTeamMilestone(db, { series: 'f1', subjectName: 'Red', milestone: 'win' });
    assert.match(latest.answer, /Red last won at the Fifth Grand Prix on 2022-12-31/);
    assert.equal(latest.fact.rows.find(row => row.label === 'Result').value, 'P1');
});

test('standings gaps use completed seasons, requested positions and tied extremes', async () => {
    const db = connection();
    const gap = await calculations.standingsGap(db, { series: 'f1', firstPosition: 3, secondPosition: 4, extreme: 'smallest' });
    assert.match(gap.answer, /1 point in 2020/);
    assert.ok(db.calls.some(call => call.sql.includes('EXISTS(SELECT 1 FROM races_race_results')));
    const topFour = await calculations.topFourSpread(connection(), { series: 'f1' });
    assert.match(topFour.answer, /tightest final top four/);
    assert.equal(topFour.fact.rows.length, 4);
    await assert.rejects(() => calculations.standingsGap(connection(), { series: 'f1', firstPosition: 4, secondPosition: 3 }), /first position ahead/);
});

test('one-season final gap retains season and both points totals', async () => {
    const parsed = interpretLocally('What was the P3 to P4 points gap in the 2020 final driver standings?');
    assert.equal(parsed.intent, 'season_standings_gap');
    assert.equal(parsed.targetSeason, 2020);
    assert.deepEqual([parsed.firstPosition, parsed.secondPosition], [3, 4]);
    const result = await calculations.seasonStandingsGap(connection(), { ...parsed, series: 'f1' });
    assert.match(result.answer, /1 point.*Alice scored 30 and Bob scored 29/);
    assert.equal(result.scope.targetSeason, 2020);
    assert.equal(result.fact.rows.length, 3);
    await assert.rejects(() => calculations.seasonStandingsGap(connection(), { ...parsed, series: 'f1', targetSeason: 2022 }), /No completed/);
    assert.equal(interpretLocally('P3 to P4 gap in 2020 at Spa').intent, 'unsupported');
});

test('winless season points use official totals and reject the incomplete season', async () => {
    const result = await calculations.mostPointsWithoutWin(connection(), { series: 'f1' });
    assert.match(result.answer, /Alice scored 30 Formula 1 points in 2020 without a race win/);
    assert.equal(result.fact.rows[0].value, '30 points, 0 wins, 2 race starts');
});

test('new language variants keep team, milestone, positions and championship scope', () => {
    assert.equal(interpretLocally('Who drove for Williams the longest?').subjectName, 'Williams');
    assert.equal(interpretLocally('Who took the longest from debut to first podium?').milestone, 'podium');
    const gap = interpretLocally('Largest gap between P2 and P5 in final team standings');
    assert.equal(gap.entity, 'constructors');
    assert.deepEqual([gap.firstPosition, gap.secondPosition, gap.extreme], [2, 5, 'largest']);
    assert.equal(interpretLocally('Who spent the most seasons with one team at Spa?').intent, 'unsupported');
    assert.equal(planWecQuestion('Which WEC teammates raced together for the most events?').intent, 'teammate_events');
});

test('inventory follow-ups edit team, milestone and standings positions without dropping context', () => {
    const tenure = interpretLocally('Who drove for Ferrari the longest?');
    const nextTeam = applyFollowUpInterpretation(interpretLocally('What about McLaren?'), tenure, 'What about McLaren?');
    assert.equal(nextTeam.intent, 'team_tenure');
    assert.equal(nextTeam.subjectName, 'McLaren');
    const podium = interpretLocally('When did Alpine last reach a podium?');
    const nextMilestone = applyFollowUpInterpretation(interpretLocally('What about wins?'), podium, 'What about wins?');
    assert.equal(nextMilestone.intent, 'latest_team_milestone');
    assert.equal(nextMilestone.subjectName, 'Alpine');
    assert.equal(nextMilestone.milestone, 'win');
    const gap = interpretLocally('Smallest gap between P3 and P4 in final standings');
    const nextGap = applyFollowUpInterpretation(interpretLocally('What about P2 and P5?'), gap, 'What about P2 and P5?');
    assert.equal(nextGap.intent, 'standings_gap');
    assert.deepEqual([nextGap.firstPosition, nextGap.secondPosition], [2, 5]);
    const wec = planWecQuestion('Smallest gap between P3 and P4 in final Hypercar standings');
    const wecNext = planWecQuestion('What about P2 and P5?', wec);
    assert.equal(wecNext.classCode, 'HYPERCAR');
    assert.deepEqual([wecNext.firstPosition, wecNext.secondPosition], [2, 5]);
    const invalidEdit = applyConfirmedInterpretation(interpretLocally('Who scored the most points without winning a race in a season?'), { entity: 'constructors' });
    assert.equal(invalidEdit.intent, 'unsupported');
});
