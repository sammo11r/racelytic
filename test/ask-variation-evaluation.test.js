const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretLocally } = require('../backend/ask-interpreter');
const { planWecQuestion, executeWecQuestion } = require('../backend/ask-wec');
const { applyFollowUpInterpretation } = require('../backend/routes/ask');
const { pool } = require('../backend/route-helpers');

test.after(async () => { await pool.end(); });

// Concrete representatives from docs/ask-question-variations.md. Keep intent
// and requested slots together: a correct label with a lost filter is a failure.
const CORE_CASES = [
    ['CAL-01', 'Where did the 2025 season begin?', { intent: 'season_opener', targetSeason: 2025 }],
    ['CAL-01', 'Which circuit hosted round one in 2025?', { intent: 'season_opener', targetSeason: 2025 }],
    ['CAR-02', 'When did Alain Prost debut?', { intent: 'driver_debut', subjectName: 'Alain Prost' }],
    ['CAR-02', "What was Prost's first recorded start?", { intent: 'driver_debut', subjectName: 'Prost' }],
    ['CAR-06', 'Who reached a first win in the fewest starts?', { intent: 'debut_to_milestone', milestone: 'win', extreme: 'smallest', milestoneMeasure: 'starts' }],
    ['CAR-07', 'Who needed the fewest starts to reach 10 wins?', { intent: 'milestone_threshold', milestone: 'win', milestoneCount: 10 }],
    ['CAR-07', 'Who reached 100 starts first?', { intent: 'milestone_threshold', milestone: 'starts', milestoneCount: 100, chronologyDirection: 'first' }],
    ['CAR-05', 'Who took the most calendar time to reach a first podium?', { intent: 'debut_to_milestone', milestone: 'podium', extreme: 'largest', milestoneMeasure: 'days' }],
    ['CAR-08', 'Who has the most starts without a win?', { intent: 'milestone_never_reached', milestone: 'win', minStarts: 1, extreme: 'largest' }],
    ['CAR-08', 'Which drivers raced at least 20 times without scoring points?', { intent: 'milestone_never_reached', milestone: 'points', minStarts: 20 }],
    ['CAR-09', 'Who won their debut race?', { intent: 'debut_milestone', milestone: 'win' }],
    ['CAR-09', 'Which drivers scored points in their first start?', { intent: 'debut_milestone', milestone: 'points' }],
    ['STR-02', "What is Hamilton's longest points streak?", { intent: 'streak_subject', subjectName: 'Hamilton', streakCategory: 'points' }],
    ['STR-03', "List the events in Hamilton's longest win streak.", { intent: 'streak_subject', subjectName: 'Hamilton', streakCategory: 'wins' }],
    ['TEAM-06', "What was Ferrari's most recent podium?", { intent: 'latest_team_milestone', subjectName: 'Ferrari', milestone: 'podium' }],
    ['TEAM-06', 'When did Alpine last earn points?', { intent: 'latest_team_points', subjectName: 'Alpine' }],
    ['TEAM-03', 'Who stayed with Ferrari longest?', { intent: 'team_tenure', subjectName: 'Ferrari' }],
    ['TEAM-03', 'Which driver logged the most calendar time for McLaren?', { intent: 'team_tenure', subjectName: 'McLaren' }],
    ['TEAM-04', 'Which driver-team pairing spans the most seasons?', { intent: 'team_seasons' }],
    ['TEAM-05', 'Which teammate pair shared the most race weekends?', { intent: 'teammate_events' }],
    ['STD-06', 'Which year had the widest P3–P4 final margin?', { intent: 'standings_gap', firstPosition: 3, secondPosition: 4, extreme: 'largest' }],
    ['STD-07', 'In which season were the top four closest?', { intent: 'top_four_spread' }],
    ['REC-06', 'Which winless driver season produced the most points?', { intent: 'points_without_win' }],
    ['REC-01', 'Who tops the all-time wins list?', { intent: 'record_leader', recordCategory: 'wins' }],
    ['REC-02', 'How many podiums does Ferrari have?', { intent: 'record_subject_total', recordCategory: 'podiums', subjectName: 'Ferrari' }],
    ['REC-03', 'Who has the most wins at Monaco?', { intent: 'record_leader', recordCategory: 'wins', circuitName: 'Monaco' }],
    ['RES-01', 'Who won the 2024 Monaco Grand Prix?', { intent: 'race_result', targetSeason: 2024, eventName: 'Monaco' }],
    ['RES-02', 'Who filled the top three at Monaco in 2024?', { intent: 'race_result', targetSeason: 2024, eventName: 'Monaco', resultView: 'podium' }],
    ['RES-04', 'Where did Alonso place at Monaco in 2024?', { intent: 'race_result', targetSeason: 2024, eventName: 'Monaco', subjectName: 'Alonso', resultView: 'driver' }],
    ['STD-01', 'Show the final 2024 driver standings.', { intent: 'season_standings', targetSeason: 2024 }],
    ['STD-02', 'Show 2024 standings following round 10.', { intent: 'season_standings', targetSeason: 2024, standingRound: 10 }],
    ['CAR-01', 'Tell me about Fernando Alonso career.', { intent: 'driver_profile', subjectName: 'Fernando Alonso' }],
    ['CAL-09', 'Tell me about the Monaco circuit.', { intent: 'circuit_profile', circuitName: 'Monaco' }],
    ['CMP-01', 'Senna versus Prost for wins.', { intent: 'driver_head_to_head', comparisonMetric: 'wins', subjectNames: ['Senna', 'Prost'] }],
    ['CMP-01', 'Senna against Prost for wins.', { intent: 'driver_head_to_head', comparisonMetric: 'wins', subjectNames: ['Senna', 'Prost'] }],
    ['STR-01', 'Who had the longest consecutive podium run?', { intent: 'streak_leader', streakCategory: 'podiums' }],
    ['EXP-01', 'What does countback mean in racing?', { intent: 'motorsport_explanation', topic: 'countback' }]
];

const WEC_CASES = [
    ['CAL-01', 'Where was the first WEC race of 2025?', { intent: 'season_opener', targetSeason: 2025 }],
    ['CAL-01', 'Where did the 2025 WEC season begin?', { intent: 'season_opener', targetSeason: 2025 }],
    ['CAR-02', 'When did Robert Kubica debut in WEC?', { intent: 'driver_debut' }],
    ['CAR-02', "What was Robert Kubica's first recorded start in WEC?", { intent: 'driver_debut', subjectName: 'Robert Kubica' }],
    ['TEAM-06', 'When did Toyota Gazoo Racing last score WEC points?', { intent: 'latest_team_points' }],
    ['TEAM-06', "What was Toyota Gazoo Racing's most recent podium?", { intent: 'latest_team_milestone', subjectName: 'Toyota Gazoo Racing', milestone: 'podium' }],
    ['TEAM-03', 'Who stayed with Toyota Gazoo Racing longest?', { intent: 'team_tenure', subjectName: 'Toyota Gazoo Racing' }],
    ['STD-02', 'Hypercar driver standings after round 3 in 2025', { intent: 'season_standings', classCode: 'HYPERCAR', standingRound: 3, targetSeason: 2025 }],
    ['REC-03', 'Most Hypercar wins at Spa in 2024', { intent: 'record_leader', metric: 'wins', classCode: 'HYPERCAR', fromYear: 2024, toYear: 2024 }]
];

function mismatches(actual, expected, label) {
    return Object.entries(expected).flatMap(([slot, value]) => {
        try {
            assert.deepEqual(actual[slot], value);
            return [];
        } catch {
            return [`${label}: ${slot} expected ${JSON.stringify(value)}, got ${JSON.stringify(actual[slot])}`];
        }
    });
}

test('core Ask variation representatives preserve intent and slots', () => {
    const failures = CORE_CASES.flatMap(([id, query, expected]) =>
        mismatches(interpretLocally(query), expected, `${id} ${query}`));
    assert.deepEqual(failures, []);
});

test('WEC variation representatives preserve intent and slots', () => {
    const failures = WEC_CASES.flatMap(([id, query, expected]) =>
        mismatches(planWecQuestion(query), expected, `${id} ${query}`));
    assert.deepEqual(failures, []);
});

test('unsupported modifiers do not produce a broader supported answer', () => {
    for (const query of [
        'When did Prost debut at Spa?',
        'When did Ferrari last win in 2024?',
        'Who stayed with Ferrari longest at Monaco?'
    ]) assert.equal(interpretLocally(query).intent, 'unsupported', query);
});

test('named streak follow-ups retain the driver while changing the result type', () => {
    const context = interpretLocally("What is Hamilton's longest winning streak?");
    const result = applyFollowUpInterpretation(interpretLocally('What about podiums?'), context, 'What about podiums?');
    assert.equal(result.intent, 'streak_subject');
    assert.equal(result.subjectName, 'Hamilton');
    assert.equal(result.streakCategory, 'podiums');
});

test('WEC debut fallback refuses a team qualifier before querying results', async () => {
    await assert.rejects(() => executeWecQuestion({}, 'When did Robert Kubica debut for Toyota?'),
        /team, time or condition filter/);
});
