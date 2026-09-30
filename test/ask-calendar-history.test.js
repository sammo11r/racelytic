const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCalendarHistory } = require('../backend/ask-calendar-history');
const { interpretLocally } = require('../backend/ask-interpreter');
const { planWecQuestion } = require('../backend/ask-wec');
const { applyFollowUpInterpretation } = require('../backend/routes/ask');
const { pool } = require('../backend/route-helpers');

test.after(async () => { await pool.end(); });

const events = [
    { id: 'a', name: 'Belgian Grand Prix', year: 2023, round: 1, date: '2023-07-30', circuitId: 'spa', circuitName: 'Spa-Francorchamps', countryName: 'Belgium', raceCount: 2 },
    { id: 'b', name: 'Monaco Grand Prix', year: 2023, round: 2, date: '2023-08-01', circuitId: 'monaco', circuitName: 'Monaco', countryName: 'Monaco', raceCount: 1 },
    { id: 'c', name: 'Belgian Grand Prix', year: 2024, round: 1, date: '2024-07-28', circuitId: 'spa', circuitName: 'Spa-Francorchamps', countryName: 'Belgium', raceCount: 1 },
    { id: 'd', name: 'Monaco Grand Prix', year: 2024, round: 2, date: '2024-08-01', circuitId: 'monaco', circuitName: 'Monaco', countryName: 'Monaco', raceCount: 1 }
];
const connection = { query: async () => events };

test('calendar history counts recorded seasons and returns event evidence', async () => {
    const result = await calculateCalendarHistory(connection, { intent: 'calendar_host_years', series: 'f1',
        calendarHistoryKind: 'circuit', calendarHistoryName: 'Spa' });
    assert.match(result.answer, /2 Formula 1 seasons: 2023, 2024/);
    assert.equal(result.fact.rows.length, 2);
    assert.deepEqual(result.scope.years, [2023, 2024]);
    const country = await calculateCalendarHistory(connection, { intent: 'calendar_host_years', series: 'f1',
        calendarHistoryKind: 'circuit', calendarHistoryName: 'Belgium' });
    assert.equal(country.scope.calendarHistoryKind, 'country');
    assert.deepEqual(country.scope.years, [2023, 2024]);
});

test('boundary and leader keep circuit and event identities separate', async () => {
    const boundary = await calculateCalendarHistory(connection, { intent: 'calendar_host_boundary', series: 'f1',
        calendarHistoryKind: 'event', calendarHistoryName: 'Belgian Grand Prix', chronologyDirection: 'last' });
    assert.match(boundary.answer, /2024-07-28/);
    const leader = await calculateCalendarHistory(connection, { intent: 'calendar_host_leader', series: 'f1', calendarHistoryKind: 'circuit' });
    assert.match(leader.answer, /Spa-Francorchamps hosted 3 recorded Formula 1 races/);
    await assert.rejects(() => calculateCalendarHistory(connection, { intent: 'calendar_host_years', series: 'f1',
        calendarHistoryKind: 'circuit', calendarHistoryName: 'Unknown' }), /No recorded circuit/);
});

test('calendar history parser retains names and rejects unsupported conditions', () => {
    assert.equal(interpretLocally('Which years did Spa host Formula 1?').calendarHistoryName, 'Spa');
    assert.equal(interpretLocally('When was the Monaco Grand Prix last held?').calendarHistoryKind, 'event');
    assert.equal(interpretLocally('Which years did Spa host Formula 1 since 2020?').intent, 'unsupported');
    assert.equal(planWecQuestion('Which years did Spa host WEC?').calendarHistoryName, 'Spa');
    const context = interpretLocally('Which years did Spa host Formula 1?');
    const followUp = applyFollowUpInterpretation(interpretLocally('What about Monaco?'), context, 'What about Monaco?');
    assert.equal(followUp.intent, 'calendar_host_years');
    assert.equal(followUp.calendarHistoryName, 'Monaco');
    assert.equal(followUp.calendarHistoryKind, 'circuit');
    const leader = interpretLocally('Which circuit hosted the most races?');
    const eventFollowUp = applyFollowUpInterpretation(interpretLocally('What about events?'), leader, 'What about events?');
    assert.equal(eventFollowUp.calendarHistoryKind, 'event');
});
