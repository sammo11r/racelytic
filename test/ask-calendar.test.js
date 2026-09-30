const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretLocally } = require('../backend/ask-interpreter');
const { applyFollowUpInterpretation } = require('../backend/routes/ask');
const { pool } = require('../backend/route-helpers');
const { calculateCalendarQuestion } = require('../backend/ask-calendar-calculations');
const { executeWecQuestion, planWecQuestion } = require('../backend/ask-wec');

const calendar = [
    { id: 'monaco', name: 'Monaco Grand Prix', year: 2025, round: 1, date: '2025-05-25',
        circuitId: 'monaco-circuit', circuitName: 'Circuit de Monaco', placeName: 'Monte Carlo', raceCount: 2 },
    { id: 'britain', name: 'British Grand Prix', year: 2025, round: 2, date: '2025-07-06',
        circuitId: 'silverstone', circuitName: 'Silverstone', placeName: 'Silverstone', raceCount: 1 }
];

test.after(async () => { await pool.end(); });

test('calendar variants preserve year, direction and count unit', () => {
    for (const [query, expected] of [
        ['What was the last Grand Prix of 2025?', { intent: 'season_closer', targetSeason: 2025 }],
        ['Where did the 2025 season finish?', { intent: 'season_closer', targetSeason: 2025 }],
        ['Show the completed 2025 race calendar', { intent: 'season_calendar', targetSeason: 2025 }],
        ['List every event held in the 2025 season', { intent: 'season_calendar', targetSeason: 2025 }],
        ['How many events took place in 2025?', { intent: 'season_event_count', countUnit: 'events', targetSeason: 2025 }],
        ['How many races were run in 2025?', { intent: 'season_event_count', countUnit: 'races', targetSeason: 2025 }],
        ['What came after Monaco in the 2025 calendar?', { intent: 'adjacent_event', eventName: 'Monaco', calendarDirection: 'next', targetSeason: 2025 }],
        ['Which race preceded Spa in 2024?', { intent: 'adjacent_event', eventName: 'Spa', calendarDirection: 'previous', targetSeason: 2024 }]
    ]) {
        const actual = interpretLocally(query);
        for (const [field, value] of Object.entries(expected)) assert.deepEqual(actual[field], value, `${query}: ${field}`);
    }
});

test('calendar calculations count completed events and race sessions separately', async () => {
    const calls = [];
    const connection = { query: async (sql, params) => { calls.push({ sql, params }); return calendar; } };
    const events = await calculateCalendarQuestion(connection, { intent: 'season_event_count', series: 'f1', targetSeason: 2025, countUnit: 'events' });
    const races = await calculateCalendarQuestion(connection, { intent: 'season_event_count', series: 'f1', targetSeason: 2025, countUnit: 'races' });
    assert.match(events.answer, /2 recorded events/);
    assert.match(races.answer, /3 recorded races/);
    assert.deepEqual(calls[0].params, [2025]);
    assert.match(calls[0].sql, /races_sprint_race_results/);
    assert.equal(events.fact.rows.length, 3);
});

test('calendar chronology uses only recorded classified events and returns linked evidence', async () => {
    const connection = { query: async () => calendar };
    const closer = await calculateCalendarQuestion(connection, { intent: 'season_closer', series: 'f2', targetSeason: 2025 });
    const next = await calculateCalendarQuestion(connection, { intent: 'adjacent_event', series: 'f2', targetSeason: 2025,
        eventName: 'Monaco', calendarDirection: 'next' });
    assert.match(closer.answer, /British Grand Prix/);
    assert.match(next.answer, /British Grand Prix/);
    assert.equal(next.fact.rows[0].label, 'Race');
    await assert.rejects(() => calculateCalendarQuestion(connection, { intent: 'adjacent_event', series: 'f2', targetSeason: 2025,
        eventName: 'Monaco', calendarDirection: 'previous' }), /no previous completed event/);
});

test('WEC calendar planner and answer retain year and reject a class filter', async () => {
    const query = 'How many WEC races were run in 2025?';
    const plan = planWecQuestion(query);
    assert.equal(plan.intent, 'season_event_count');
    assert.equal(plan.countUnit, 'races');
    const result = await executeWecQuestion({ query: async () => calendar }, query);
    assert.match(result.answer, /3 recorded races/);
    assert.equal(result.scope.targetSeason, 2025);
    await assert.rejects(() => executeWecQuestion({}, 'How many Hypercar WEC races were run in 2025?'), /class.*filter/);
});

test('calendar parser refuses a requested condition it cannot apply', () => {
    const result = interpretLocally('How many sprint races were run in 2025?');
    assert.equal(result.intent, 'unsupported');
    assert.ok(result.unsupportedQualifiers.includes('a race-format, class, or condition filter'));
});

test('calendar follow-up replaces only the count unit', () => {
    const first = interpretLocally('How many events took place in 2025?');
    const next = applyFollowUpInterpretation(interpretLocally('What about races?'), first, 'What about races?');
    assert.equal(next.intent, 'season_event_count');
    assert.equal(next.targetSeason, 2025);
    assert.equal(next.countUnit, 'races');
    const wecFirst = planWecQuestion('How many WEC events took place in 2025?');
    const wecNext = planWecQuestion('What about races?', wecFirst);
    assert.equal(wecNext.intent, 'season_event_count');
    assert.equal(wecNext.targetSeason, 2025);
    assert.equal(wecNext.countUnit, 'races');
});
