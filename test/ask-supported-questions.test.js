const test = require('node:test');
const assert = require('node:assert/strict');
const { INTENT_CATALOG, missingRequiredSlots, supportedIntentIds } = require('../backend/ask-intents');
const { interpretLocally } = require('../backend/ask-interpreter');
const { TOOL_CATALOG, executeAskTool, toolForIntent } = require('../backend/ask-tools');

const QUESTION_CONTRACTS = Object.freeze([
    ['lineup_record', 'Which lineup scored the most wins together?', { recordCategory: 'wins' }],
    ['consecutive_event_wins', 'How often did Lewis Hamilton win at consecutive appearances of Monaco?', { subjectName: 'Lewis Hamilton', eventName: 'Monaco' }],
    ['team_change_comparison', 'How did Lewis Hamilton perform before and after joining Mercedes?', { subjectName: 'Lewis Hamilton', newTeamName: 'Mercedes' }],
    ['compare_seasons', 'How did Lewis Hamilton perform in 2021 versus 2022?', { subjectName: 'Lewis Hamilton', fromYear: 2021, toYear: 2022 }],
    ['longest_milestone_gap', 'Who had the longest gap between wins?', { milestone: 'win', gapMeasure: 'days' }],
    ['best_worst_result', "What was driver Lewis Hamilton's best season by points?", { subjectName: 'Lewis Hamilton', resultMetric: 'season_points', extreme: 'largest' }],
    ['result_distribution', "Show Lewis Hamilton's distribution of finishes", { subjectName: 'Lewis Hamilton', distributionMetric: 'finishes' }],
    ['latest_failure', 'When did Lewis Hamilton last fail to score points?', { subjectName: 'Lewis Hamilton', failureMetric: 'points' }],
    ['driver_season_participation', 'Which races did Alonso miss in 2024?', { subjectName: 'Alonso', targetSeason: 2024, participationMode: 'missed' }],
    ['driver_team_history', 'Which teams did Alonso race for?', { subjectName: 'Alonso', historyMode: 'teams' }],
    ['round_standings_change', "How did Hamilton's championship position change between rounds 3 and 8 of 2021?", { subjectName: 'Hamilton', targetSeason: 2021, roundStart: 3, roundEnd: 8 }],
    ['round_rival_swing', 'How many points did Leclerc gain on Verstappen in round 8 of 2022?', { subjectNames: ['Leclerc', 'Verstappen'], targetSeason: 2022, standingRound: 8 }],
    ['championship_lead_changes', 'When did the championship lead change in 2021?', { targetSeason: 2021, entity: 'drivers' }],
    ['champion_season_extreme', 'Which champion had the fewest wins?', { recordCategory: 'wins', extreme: 'smallest', entity: 'drivers' }],
    ['single_season_record', 'Who had the most wins in a single season?', { recordCategory: 'wins', entity: 'drivers' }],
    ['team_season_extreme', "What was Ferrari's best season by wins?", { subjectName: 'Ferrari', recordCategory: 'wins', extreme: 'largest' }],
    ['standings_improvement', 'Which driver improved most in the standings from 2023 to 2024?', { fromYear: 2023, toYear: 2024, entity: 'drivers' }],
    ['grid_position', 'Who started from P3 at Monaco in 2024?', { targetSeason: 2024, eventName: 'Monaco', resultPosition: 3 }],
    ['race_pole', 'Who took pole at Monaco in 2024?', { targetSeason: 2024, eventName: 'Monaco' }],
    ['session_classification', 'What was the sprint result at Monaco in 2024?', { targetSeason: 2024, eventName: 'Monaco', sessionType: 'sprint' }],
    ['event_points', 'How many points did Leclerc score at Monaco in 2024?', { targetSeason: 2024, eventName: 'Monaco', subjectName: 'Leclerc' }],
    ['race_status', 'Who retired at Monaco in 2024?', { targetSeason: 2024, eventName: 'Monaco', statusFilter: 'retired' }],
    ['grid_movement', 'Who gained most places at Monaco in 2024?', { targetSeason: 2024, eventName: 'Monaco', extreme: 'largest' }],
    ['race_entries', 'Who started Monaco in 2024?', { targetSeason: 2024, eventName: 'Monaco', entryMode: 'started' }],
    ['fastest_race_lap', 'Who set the fastest race lap at Monaco in 2024?', { targetSeason: 2024, eventName: 'Monaco' }],
    ['qualifying_position', 'Who qualified P3 at Monaco in 2024?', { targetSeason: 2024, eventName: 'Monaco', resultPosition: 3 }],
    ['streak_subject', "What is Hamilton's longest points streak?", { subjectName: 'Hamilton', streakCategory: 'points' }],
    ['milestone_threshold', 'Who needed the fewest starts to reach 10 wins?', { entity: 'drivers', milestone: 'win', milestoneCount: 10 }],
    ['debut_milestone', 'Who won on debut?', { entity: 'drivers', milestone: 'win' }],
    ['milestone_never_reached', 'Which drivers never won despite 100 starts?', { entity: 'drivers', milestone: 'win', minStarts: 100 }],
    ['team_tenure', 'Who drove for Ferrari the longest?', { subjectName: 'Ferrari', entity: 'drivers' }],
    ['team_seasons', 'Who spent the most seasons with one team?', { entity: 'drivers' }],
    ['teammate_events', 'Which teammates raced together for the most events?', { entity: 'drivers' }],
    ['debut_to_milestone', 'Who took the longest from debut to first points?', { entity: 'drivers', milestone: 'points' }],
    ['standings_gap', 'What is the smallest points gap between P3 and P4 in final standings?', { entity: 'drivers', firstPosition: 3, secondPosition: 4, extreme: 'smallest' }],
    ['season_standings_gap', 'What was the P3 to P4 points gap in the 2020 final driver standings?', { entity: 'drivers', firstPosition: 3, secondPosition: 4, targetSeason: 2020 }],
    ['top_four_spread', 'Which season had the tightest top four in final standings?', { entity: 'drivers' }],
    ['latest_team_milestone', 'When did Alpine last reach a podium?', { subjectName: 'Alpine', milestone: 'podium' }],
    ['points_without_win', 'Who scored the most points without winning a race in a season?', { entity: 'drivers' }],
    ['record_leader', 'Show the top five drivers by fastest laps since 2000', { entity: 'drivers', recordCategory: 'fastestLaps', resultLimit: 5, fromYear: 2000 }],
    ['record_subject_total', 'How many podiums did Ferrari score between 2000 and 2010?', { subjectName: 'Ferrari', recordCategory: 'podiums', fromYear: 2000, toYear: 2010 }],
    ['race_result', 'Where did Alonso finish at the 2021 Hungarian Grand Prix?', { targetSeason: 2021, eventName: 'Hungarian', subjectName: 'Alonso', resultView: 'driver' }],
    ['season_opener', 'Where was the first Grand Prix of 2025 held?', { targetSeason: 2025 }],
    ['season_closer', 'Where was the last Grand Prix of 2025 held?', { targetSeason: 2025 }],
    ['season_calendar', 'List the 2025 Formula 1 calendar', { targetSeason: 2025 }],
    ['season_event_count', 'How many F1 races were held in 2025?', { targetSeason: 2025, countUnit: 'races' }],
    ['adjacent_event', 'What race came after Monaco in the 2025 F1 calendar?', { targetSeason: 2025, calendarDirection: 'next' }],
    ['calendar_host_years', 'Which years did Spa host Formula 1?', { calendarHistoryName: 'Spa', calendarHistoryKind: 'circuit' }],
    ['calendar_host_boundary', 'When did Spa first host Formula 1?', { calendarHistoryName: 'Spa', calendarHistoryKind: 'circuit', chronologyDirection: 'first' }],
    ['calendar_host_leader', 'Which circuit hosted the most races?', { calendarHistoryKind: 'circuit' }],
    ['driver_debut', 'When did Schumacher make his debut?', { subjectName: 'Schumacher', entity: 'drivers' }],
    ['driver_last_start', 'When did Prost last race?', { subjectName: 'Prost' }],
    ['team_boundary_start', 'When did the Ferrari team first race?', { subjectName: 'Ferrari', chronologyDirection: 'first' }],
    ['competitor_milestone', 'When did Ferrari first win?', { subjectName: 'Ferrari', milestone: 'win', chronologyDirection: 'first' }],
    ['competitor_season_summary', 'Show the 2024 season stats for Charles Leclerc', { subjectName: 'Charles Leclerc', targetSeason: 2024 }],
    ['latest_team_points', 'What was the last time Alpine scored points?', { subjectName: 'Alpine', entity: 'constructors' }],
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
    lineup_record: 'rank_lineup_records',
    consecutive_event_wins: 'count_consecutive_event_wins',
    team_change_comparison: 'compare_driver_team_stints',
    compare_seasons: 'compare_competitor_seasons',
    longest_milestone_gap: 'rank_milestone_gaps',
    best_worst_result: 'get_best_worst_result',
    result_distribution: 'get_result_distribution',
    latest_failure: 'get_latest_failure',
    driver_season_participation: 'get_driver_season_participation',
    driver_team_history: 'get_driver_team_history',
    round_standings_change: 'compare_round_standings',
    round_rival_swing: 'calculate_round_rival_swing',
    championship_lead_changes: 'find_championship_lead_changes',
    champion_season_extreme: 'rank_champion_season_extreme',
    single_season_record: 'rank_single_season_record',
    team_season_extreme: 'get_team_season_extreme',
    standings_improvement: 'rank_standings_improvement',
    grid_position: 'get_starting_grid_position',
    race_pole: 'get_official_pole',
    session_classification: 'get_session_classification',
    event_points: 'get_event_points',
    race_status: 'get_race_statuses',
    grid_movement: 'rank_grid_movement',
    race_entries: 'get_race_entries',
    fastest_race_lap: 'get_fastest_race_lap',
    qualifying_position: 'get_qualifying_position',
    streak_subject: 'get_driver_streak',
    milestone_threshold: 'rank_career_milestone_threshold',
    debut_milestone: 'get_debut_milestones',
    milestone_never_reached: 'rank_never_reached_milestones',
    team_tenure: 'rank_team_tenure',
    team_seasons: 'rank_team_seasons',
    teammate_events: 'rank_teammate_events',
    debut_to_milestone: 'rank_debut_to_milestone',
    standings_gap: 'rank_final_standings_gap',
    season_standings_gap: 'get_season_standings_gap',
    top_four_spread: 'rank_top_four_spread',
    latest_team_milestone: 'get_latest_team_milestone',
    points_without_win: 'rank_winless_season_points',
    record_leader: 'find_records',
    record_subject_total: 'get_competitor_record',
    race_result: 'get_race_result',
    season_opener: 'get_season_opener',
    season_closer: 'get_season_closer',
    season_calendar: 'get_season_calendar',
    season_event_count: 'count_season_events',
    adjacent_event: 'get_adjacent_event',
    calendar_host_years: 'get_calendar_host_years',
    calendar_host_boundary: 'get_calendar_host_boundary',
    calendar_host_leader: 'rank_calendar_hosts',
    driver_debut: 'get_driver_debut',
    driver_last_start: 'get_driver_last_start',
    team_boundary_start: 'get_team_boundary_start',
    competitor_milestone: 'get_competitor_milestone',
    competitor_season_summary: 'get_competitor_season_summary',
    latest_team_points: 'get_latest_team_points',
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
