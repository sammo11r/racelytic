const test = require('node:test');
const assert = require('node:assert/strict');
const { debutMilestone, milestoneNeverReached, milestoneThreshold } = require('../backend/ask-inventory-calculations');
const { interpretLocally } = require('../backend/ask-interpreter');
const { planWecQuestion, executeWecQuestion } = require('../backend/ask-wec');
const { applyFollowUpInterpretation } = require('../backend/routes/ask');
const { pool } = require('../backend/route-helpers');

test.after(async () => { await pool.end(); });

const starts = [
    { eventId: 'one', eventName: 'First Race', eventDate: '2023-03-01', year: 2023, round: 1,
        driverId: 'alice', driverName: 'Alice', teamId: 'a', teamName: 'A', points: 25, position: 1, status: '1' },
    { eventId: 'one', eventName: 'First Race', eventDate: '2023-03-01', year: 2023, round: 1,
        driverId: 'bob', driverName: 'Bob', teamId: 'b', teamName: 'B', points: 0, position: 12, status: '12' },
    { eventId: 'two', eventName: 'Second Race', eventDate: '2023-03-08', year: 2023, round: 2,
        driverId: 'alice', driverName: 'Alice', teamId: 'a', teamName: 'A', points: 0, position: 11, status: '11' },
    { eventId: 'two', eventName: 'Second Race', eventDate: '2023-03-08', year: 2023, round: 2,
        driverId: 'bob', driverName: 'Bob', teamId: 'b', teamName: 'B', points: 0, position: 8, status: '8' }
];
const db = { query: async () => starts };

test('debut milestones use the first recorded race start and link evidence', async () => {
    const result = await debutMilestone(db, { intent: 'debut_milestone', series: 'f1', milestone: 'win' });
    assert.match(result.answer, /won on their first recorded race start: Alice/);
    assert.equal(result.fact.rows.length, 1);
    assert.match(result.fact.rows[0].href, /races/);
});

test('never-reached milestone enforces the start threshold', async () => {
    const result = await milestoneNeverReached(db, { intent: 'milestone_never_reached', series: 'f1',
        milestone: 'win', minStarts: 2 });
    assert.match(result.answer, /1 Formula 1 driver has at least 2 recorded race starts/);
    assert.equal(result.fact.rows[0].label, 'Bob');
    await assert.rejects(() => milestoneNeverReached(db, { series: 'f1', milestone: 'win', minStarts: 0 }), /minimum/);
    const sprintDb = { query: async sql => sql.includes('races_sprint_race_results') ? [{ driverId: 'bob' }] : starts };
    const points = await milestoneNeverReached(sprintDb, { series: 'f1', milestone: 'points', minStarts: 2 });
    assert.equal(points.fact.rows.length, 0);
});

test('cumulative milestones rank race starts and retain boundary events', async () => {
    const result = await milestoneThreshold(db, { series: 'f1', milestone: 'win', milestoneCount: 1 });
    assert.match(result.answer, /Alice reached 1 win in 1 recorded Formula 1 race start/);
    assert.equal(result.fact.rows[0].label, 'Debut');
    assert.equal(result.fact.rows[1].label, 'Milestone event');
    const chronological = await milestoneThreshold(db, { series: 'f1', milestone: 'starts',
        milestoneCount: 2, chronologyDirection: 'first' });
    assert.match(chronological.answer, /first recorded Formula 1 driver to reach 2 starts/);
    await assert.rejects(() => milestoneThreshold(db, { series: 'f1', milestone: 'win', milestoneCount: 0 }), /positive milestone count/);
});

test('language variants keep milestone, threshold, and WEC class', async () => {
    for (const [query, intent, milestone, minStarts] of [
        ['Who won on debut?', 'debut_milestone', 'win', null],
        ['Which drivers scored points on debut?', 'debut_milestone', 'points', null],
        ['Who reached the podium in their debut race?', 'debut_milestone', 'podium', null],
        ['Which drivers never won despite 100 starts?', 'milestone_never_reached', 'win', 100],
        ['Who never scored points with 20 race starts?', 'milestone_never_reached', 'points', 20],
        ['Which drivers had no podium after 50 starts?', 'milestone_never_reached', 'podium', 50]
    ]) {
        const result = interpretLocally(query);
        assert.equal(result.intent, intent, query);
        assert.equal(result.milestone, milestone, query);
        assert.equal(result.minStarts, minStarts, query);
    }
    const wec = planWecQuestion('Which WEC drivers never won despite 20 starts in Hypercar?');
    assert.equal(wec.intent, 'milestone_never_reached');
    assert.equal(wec.minStarts, 20);
    assert.equal(wec.classCode, 'HYPERCAR');
    const threshold = interpretLocally('Which driver reached 10 podiums in the fewest starts?');
    assert.equal(threshold.intent, 'milestone_threshold');
    assert.equal(threshold.milestoneCount, 10);
    assert.equal(threshold.milestone, 'podium');
    assert.equal(interpretLocally('Who reached 100 starts first?').chronologyDirection, 'first');
    const context = interpretLocally('Who reached 100 starts first?');
    const followUp = applyFollowUpInterpretation(interpretLocally('What about 20 wins?'), context, 'What about 20 wins?');
    assert.equal(followUp.intent, 'milestone_threshold');
    assert.equal(followUp.milestone, 'win');
    assert.equal(followUp.milestoneCount, 20);
    const wecFollowUp = planWecQuestion('What about 20 wins?', planWecQuestion('Who first reached 10 Hypercar wins?'));
    assert.equal(wecFollowUp.milestoneCount, 20);
    assert.equal(wecFollowUp.classCode, 'HYPERCAR');
    await assert.rejects(() => executeWecQuestion(db, 'Who won on debut in WEC?'), /Choose a WEC class/);
});
