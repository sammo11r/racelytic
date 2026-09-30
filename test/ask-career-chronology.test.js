const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretLocally } = require('../backend/ask-interpreter');
const { planWecQuestion, executeWecQuestion } = require('../backend/ask-wec');
const { calculateCareerChronology } = require('../backend/ask-career-chronology');

const starts = [
    { eventId: 'first', eventName: 'First Grand Prix', eventDate: '2020-03-01', year: 2020, round: 1,
        driverId: 'prost', driverName: 'Alain Prost', teamId: 'ferrari', teamName: 'Ferrari', points: 0, position: 8, status: '8' },
    { eventId: 'second', eventName: 'Second Grand Prix', eventDate: '2020-04-01', year: 2020, round: 2,
        driverId: 'prost', driverName: 'Alain Prost', teamId: 'ferrari', teamName: 'Ferrari', points: 15, position: 1, status: '1', polePosition: 1 },
    { eventId: 'third', eventName: 'Third Grand Prix', eventDate: '2020-05-01', year: 2020, round: 3,
        driverId: 'prost', driverName: 'Alain Prost', teamId: 'ferrari', teamName: 'Ferrari', points: 10, position: 3, status: '3' }
];

test('career chronology variations retain a name and milestone', () => {
    for (const [query, expected] of [
        ['When did Prost last race?', { intent: 'driver_last_start', subjectName: 'Prost' }],
        ["What was Prost's final recorded start?", { intent: 'driver_last_start', subjectName: 'Prost' }],
        ['When did the Ferrari team first race?', { intent: 'team_boundary_start', subjectName: 'Ferrari', chronologyDirection: 'first' }],
        ['When did Ferrari first win?', { intent: 'competitor_milestone', subjectName: 'Ferrari', milestone: 'win', chronologyDirection: 'first' }],
        ["What was Prost's first points finish?", { intent: 'competitor_milestone', subjectName: 'Prost', milestone: 'points', chronologyDirection: 'first' }],
        ["What was Prost's last win?", { intent: 'competitor_milestone', subjectName: 'Prost', milestone: 'win', chronologyDirection: 'last' }],
        ['When did Prost last take pole?', { intent: 'competitor_milestone', subjectName: 'Prost', milestone: 'pole', chronologyDirection: 'last' }],
        ['When did Prost last score points?', { intent: 'competitor_milestone', subjectName: 'Prost', milestone: 'points', chronologyDirection: 'last' }]
    ]) {
        const actual = interpretLocally(query);
        for (const [field, value] of Object.entries(expected)) assert.equal(actual[field], value, `${query}: ${field}`);
    }
});

test('driver and team chronology return the qualifying boundary race', async () => {
    const connection = { query: async sql => sql.includes('races_sprint_race_results') ? [] : starts };
    const last = await calculateCareerChronology(connection, { intent: 'driver_last_start', series: 'f1', subjectName: 'Prost' });
    const firstWin = await calculateCareerChronology(connection, { intent: 'competitor_milestone', series: 'f1', subjectName: 'Ferrari',
        chronologyDirection: 'first', milestone: 'win' });
    const teamFirst = await calculateCareerChronology(connection, { intent: 'team_boundary_start', series: 'f1', subjectName: 'Ferrari',
        chronologyDirection: 'first' });
    const lastPole = await calculateCareerChronology(connection, { intent: 'competitor_milestone', series: 'f1', subjectName: 'Prost',
        chronologyDirection: 'last', milestone: 'pole' });
    assert.match(last.answer, /Third Grand Prix/);
    assert.match(firstWin.answer, /Second Grand Prix/);
    assert.match(teamFirst.answer, /First Grand Prix/);
    assert.match(lastPole.answer, /Second Grand Prix/);
    assert.equal(firstWin.fact.rows.find(row => row.label === 'Position').value, 1);
});

test('F1 first points include a sprint before the main race', async () => {
    const sprint = [{ ...starts[0], eventId: 'sprint', eventName: 'Opening Sprint', eventDate: '2020-02-29', points: 1, position: 8 }];
    const connection = { query: async sql => sql.includes('races_sprint_race_results') ? sprint : starts };
    const result = await calculateCareerChronology(connection, { intent: 'competitor_milestone', series: 'f1', subjectName: 'Prost',
        chronologyDirection: 'first', milestone: 'points' });
    assert.match(result.answer, /Opening Sprint in the sprint/);
});

test('ambiguous surname and unapplied venue are refused', async () => {
    const connection = { query: async () => [...starts, { ...starts[0], driverId: 'ralf', driverName: 'Ralf Prost' }] };
    await assert.rejects(() => calculateCareerChronology(connection, { intent: 'driver_last_start', series: 'f1', subjectName: 'Prost' }),
        /More than one name/);
    assert.equal(interpretLocally('When did Prost last race at Spa?').intent, 'unsupported');
});

test('WEC planner accepts a first win and preserves class', () => {
    const plan = planWecQuestion('When did Toyota Gazoo Racing first win in Hypercar?');
    assert.equal(plan.intent, 'competitor_milestone');
    assert.equal(plan.subjectName, 'Toyota Gazoo Racing');
    assert.equal(plan.classCode, 'HYPERCAR');
    assert.equal(plan.milestone, 'win');
});
