const test = require('node:test');
const assert = require('node:assert/strict');
const { INTENT_CATALOG, missingRequiredSlots, supportedIntentIds } = require('../backend/ask-intents');
const { interpretLocally } = require('../backend/ask-interpreter');
const { TOOL_CATALOG, executeAskTool, toolForIntent } = require('../backend/ask-tools');

const QUESTION_CONTRACTS = Object.freeze([
    ['record_leader', 'Show the top five drivers by fastest laps since 2000', { entity: 'drivers', recordCategory: 'fastestLaps', resultLimit: 5, fromYear: 2000 }],
    ['record_subject_total', 'How many podiums did Ferrari score between 2000 and 2010?', { subjectName: 'Ferrari', recordCategory: 'podiums', fromYear: 2000, toYear: 2010 }],
    ['race_result', 'Where did Alonso finish at the 2021 Hungarian Grand Prix?', { targetSeason: 2021, eventName: 'Hungarian', subjectName: 'Alonso', resultView: 'driver' }],
    ['season_standings', 'Show the 2022 driver standings after round 10', { entity: 'drivers', targetSeason: 2022, standingRound: 10 }],
    ['driver_profile', 'Career bio for Fernando Alonso', { subjectName: 'Fernando Alonso' }],
    ['constructor_profile', 'Give me a constructor profile of McLaren', { subjectName: 'McLaren' }],
    ['circuit_profile', 'Tell me about the Monaco circuit', { circuitName: 'Monaco' }],
    ['season_summary', 'Give me a recap of the 2012 campaign', { targetSeason: 2012 }],
    ['motorsport_explanation', 'Define countback in racing', { topic: 'countback' }],
    ['driver_head_to_head', 'Compare Hamilton and Rosberg as teammates', { subjectNames: ['Hamilton', 'Rosberg'], comparisonScope: 'teammates' }],
    ['constructor_head_to_head', 'Compare teams Ferrari and McLaren head-to-head', { entity: 'constructors', subjectNames: ['Ferrari', 'McLaren'] }],
    ['streak_leader', 'Show the longest points-scoring streak', { streakCategory: 'points' }],
    ['recalculate_title_counts', 'Rank drivers by championships using 1991 scoring', { entity: 'drivers', pointsSystemYear: 1991 }],
    ['recalculate_points_totals', 'Who would have the most points if all seasons used the 2024 points system?', { entity: 'drivers', pointsSystemYear: 2024 }],
    ['recalculate_season_champion', 'Who wins the 2008 championship under 1991 rules?', { entity: 'drivers', targetSeason: 2008, pointsSystemYear: 1991 }],
    ['recalculate_entity_titles', 'How many titles would Alonso have under 1982 rules?', { subjectName: 'Alonso', pointsSystemYear: 1982 }],
    ['list_changed_championships', 'Which constructor championships change under 2003 scoring?', { entity: 'constructors', pointsSystemYear: 2003 }],
    ['compare_points_systems', 'Compare the 1982 and 1991 systems', { comparisonPointsSystemYears: [1982, 1991] }]
]);

const EXPECTED_TOOLS = Object.freeze({
    record_leader: 'find_records',
    record_subject_total: 'get_competitor_record',
    race_result: 'get_race_result',
    season_standings: 'get_season_standings',
    driver_profile: 'get_driver_profile',
    constructor_profile: 'get_constructor_profile',
    circuit_profile: 'get_circuit_profile',
    season_summary: 'get_season_summary',
    motorsport_explanation: 'explain_motorsport_term',
    driver_head_to_head: 'compare_drivers',
    constructor_head_to_head: 'compare_constructors',
    streak_leader: 'find_streaks',
    recalculate_title_counts: 'recalculate_title_counts',
    recalculate_points_totals: 'recalculate_points_totals',
    recalculate_season_champion: 'recalculate_season',
    recalculate_entity_titles: 'recalculate_competitor_titles',
    list_changed_championships: 'find_changed_championships',
    compare_points_systems: 'compare_points_systems'
});

test('supported-question contracts cover every declared intent exactly once', () => {
    const declared = INTENT_CATALOG.map(intent => intent.id).sort();
    const covered = QUESTION_CONTRACTS.map(([intent]) => intent).sort();
    assert.deepEqual(covered, declared);
    assert.equal(new Set(covered).size, covered.length);
    assert.deepEqual([...supportedIntentIds()].sort(), declared);
});

test('every supported question family produces its documented intent and slots', () => {
    QUESTION_CONTRACTS.forEach(([intent, query, expectedSlots]) => {
        const interpretation = interpretLocally(query);
        assert.equal(interpretation.intent, intent, query);
        Object.entries(expectedSlots).forEach(([slot, expected]) => {
            assert.deepEqual(interpretation[slot], expected, `${query} → ${slot}`);
        });
        assert.deepEqual(missingRequiredSlots(intent, interpretation), [], query);
        assert.notEqual(interpretation.confidence, 'low', query);
    });
});

test('every catalogue example remains executable and satisfies its required slots', () => {
    INTENT_CATALOG.forEach(definition => definition.examples.forEach(query => {
        const interpretation = interpretLocally(query);
        assert.equal(interpretation.intent, definition.id, `${definition.id}: ${query}`);
        assert.deepEqual(missingRequiredSlots(definition.id, interpretation), [], query);
    }));
});

test('every supported question type is isolated behind one trusted local tool', async () => {
    assert.deepEqual(Object.keys(TOOL_CATALOG).sort(), Object.keys(EXPECTED_TOOLS).sort());
    for (const [intent, expectedTool] of Object.entries(EXPECTED_TOOLS)) {
        assert.equal(toolForIntent(intent)?.id, expectedTool, intent);
        let executions = 0;
        const execution = await executeAskTool({}, { intent }, async () => {
            executions++;
            return { intent, answer: 'Contract answer', methodology: { source: 'Local test archive' } };
        });
        assert.equal(executions, 1, intent);
        assert.equal(execution.result.intent, intent);
        assert.deepEqual(execution.grounding, {
            grounded: true,
            tool: expectedTool,
            label: TOOL_CATALOG[intent].label,
            source: 'Local test archive',
            evidenceItems: 0,
            durationMs: execution.grounding.durationMs
        });
        assert.ok(Number.isInteger(execution.grounding.durationMs));
    }
});

test('incomplete supported questions request clarification instead of executing', () => {
    const incomplete = [
        ['Who won the Monaco Grand Prix?', 'race_result', 'targetSeason'],
        ['Show the driver standings', 'season_standings', 'targetSeason'],
        ['Give me a driver profile', 'driver_profile', 'subjectName'],
        ['Tell me about a circuit', 'circuit_profile', 'circuitName'],
        ['Season leaderboard', 'season_standings', 'targetSeason'],
        ['Compare the 1982 scoring system', 'compare_points_systems', 'comparisonPointsSystemYears']
    ];
    incomplete.forEach(([query, detectedIntent, field]) => {
        const interpretation = interpretLocally(query);
        assert.equal(interpretation.intent, 'unsupported', query);
        assert.equal(interpretation.detectedIntent, detectedIntent, query);
        assert.ok(interpretation.missingFields.includes(field), `${query} should request ${field}`);
    });
});

test('unsupported, live and subjective questions stay outside every trusted tool', () => {
    [
        'What is the weather tomorrow?',
        'Who will win next weekend?',
        'Show the live timing right now',
        'Who is objectively the greatest driver ever?',
        'Book me tickets for the next race',
        'Write a poem about a racing car'
    ].forEach(query => {
        const interpretation = interpretLocally(query);
        assert.equal(interpretation.intent, 'unsupported', query);
        assert.equal(toolForIntent(interpretation.intent), null, query);
    });
});
