const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCompetitorSeason } = require('../backend/ask-competitor-season');
const { interpretLocally } = require('../backend/ask-interpreter');
const { applyFollowUpInterpretation } = require('../backend/routes/ask');
const { planWecQuestion } = require('../backend/ask-wec');
const { pool } = require('../backend/route-helpers');

test.after(async () => { await pool.end(); });

const starts = [
    { eventId: 'a', eventName: 'First Grand Prix', year: 2024, round: 1, driverId: 'driver', driverName: 'Alice Driver',
        teamId: 'team', teamName: 'Blue Team', points: 18, position: 2, status: '2' },
    { eventId: 'b', eventName: 'Second Grand Prix', year: 2024, round: 2, driverId: 'driver', driverName: 'Alice Driver',
        teamId: 'team', teamName: 'Blue Team', points: 25, position: 1, status: '1' }
];
const db = { query: async sql => {
    if (sql.includes('FROM races ORDER BY')) return [
        { year: 2024, round: 1, date: '2024-03-01', recorded: 1 },
        { year: 2024, round: 2, date: '2024-04-01', recorded: 1 }
    ];
    if (sql.includes('FROM races_race_results results')) return starts;
    if (sql.includes('FROM seasons_driver_standings')) return [
        { year: 2024, position: 2, points: 44, id: 'driver', name: 'Alice Driver' }
    ];
    throw new Error(`Unexpected query: ${sql}`);
} };

test('competitor summary combines starts and official final points', async () => {
    const result = await calculateCompetitorSeason(db, { series: 'f1', targetSeason: 2024, subjectName: 'Alice Driver' });
    assert.match(result.answer, /2 race starts, 1 win, 2 podiums, 44 official points, and P2/);
    assert.equal(result.scope.targetSeason, 2024);
    assert.equal(result.fact.rows.filter(row => row.href?.includes('/races/')).length, 2);
    await assert.rejects(() => calculateCompetitorSeason(db, { series: 'f1', targetSeason: 2023, subjectName: 'Alice Driver' }), /no recorded/);
});

test('summary variants and follow-ups keep the selected competitor and season', () => {
    const context = interpretLocally('Show the 2024 season stats for Charles Leclerc');
    assert.equal(context.intent, 'competitor_season_summary');
    const seasonEdit = applyFollowUpInterpretation(interpretLocally('What about 2023?'), context, 'What about 2023?');
    assert.equal(seasonEdit.subjectName, 'Charles Leclerc');
    assert.equal(seasonEdit.targetSeason, 2023);
    const nameEdit = applyFollowUpInterpretation(interpretLocally('What about Verstappen?'), context, 'What about Verstappen?');
    assert.equal(nameEdit.subjectName, 'Verstappen');
    assert.equal(nameEdit.targetSeason, 2024);
    assert.equal(interpretLocally('Show the 2024 season stats for Charles Leclerc at Spa').intent, 'unsupported');
    assert.equal(planWecQuestion('Show the 2024 season stats for Robert Kubica in Hypercar').intent, 'season_summary');
});
