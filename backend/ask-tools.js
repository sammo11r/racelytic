const TOOL_CATALOG = Object.freeze({
    lineup_record: Object.freeze({ id: 'rank_lineup_records', label: 'Lineup wins or points ranking', source: 'Recorded race starts and classifications' }),
    consecutive_event_wins: Object.freeze({ id: 'count_consecutive_event_wins', label: 'Consecutive wins at an event', source: 'Recorded race results' }),
    team_change_comparison: Object.freeze({ id: 'compare_driver_team_stints', label: 'Driver results across team change', source: 'Recorded race starts' }),
    compare_seasons: Object.freeze({ id: 'compare_competitor_seasons', label: 'Same competitor two-season comparison', source: 'Recorded race results and final standings' }),
    longest_milestone_gap: Object.freeze({ id: 'rank_milestone_gaps', label: 'Longest gap between milestones', source: 'Recorded race starts' }),
    best_worst_result: Object.freeze({ id: 'get_best_worst_result', label: 'Best or worst driver result', source: 'Recorded race results and final standings' }),
    result_distribution: Object.freeze({ id: 'get_result_distribution', label: 'Recorded result distribution', source: 'Recorded race results' }),
    latest_failure: Object.freeze({ id: 'get_latest_failure', label: 'Latest non-scoring or non-finish result', source: 'Recorded race results' }),
    driver_season_participation: Object.freeze({ id: 'get_driver_season_participation', label: 'Season race entries and starts', source: 'F1 completed calendar and race results' }),
    driver_team_history: Object.freeze({ id: 'get_driver_team_history', label: 'Driver team and teammate history', source: 'Recorded race starts' }),
    round_standings_change: Object.freeze({ id: 'compare_round_standings', label: 'Two round standings cutoffs', source: 'F1 cumulative round standings' }),
    round_rival_swing: Object.freeze({ id: 'calculate_round_rival_swing', label: 'Rival round points swing', source: 'F1 cumulative round standings' }),
    championship_lead_changes: Object.freeze({ id: 'find_championship_lead_changes', label: 'Championship lead history', source: 'F1 cumulative round standings' }),
    champion_season_extreme: Object.freeze({ id: 'rank_champion_season_extreme', label: 'Champion season wins or points', source: 'Official final standings and race results' }),
    single_season_record: Object.freeze({ id: 'rank_single_season_record', label: 'Single-season record', source: 'Completed-season standings and race results' }),
    team_season_extreme: Object.freeze({ id: 'get_team_season_extreme', label: 'Team season maximum or minimum', source: 'Completed-season standings and race results' }),
    standings_improvement: Object.freeze({ id: 'rank_standings_improvement', label: 'Season standings improvement', source: 'Final standings archive' }),
    grid_position: Object.freeze({ id: 'get_starting_grid_position', label: 'Official starting grid position', source: 'F1 starting grid archive' }),
    race_pole: Object.freeze({ id: 'get_official_pole', label: 'Official pole attribution', source: 'F1 race results' }),
    session_classification: Object.freeze({ id: 'get_session_classification', label: 'Session classification', source: 'F1 session results' }),
    event_points: Object.freeze({ id: 'get_event_points', label: 'Event points breakdown', source: 'F1 race and sprint results' }),
    race_status: Object.freeze({ id: 'get_race_statuses', label: 'Race status list', source: 'F1 race results' }),
    grid_movement: Object.freeze({ id: 'rank_grid_movement', label: 'Grid to finish movement', source: 'F1 race results' }),
    race_entries: Object.freeze({ id: 'get_race_entries', label: 'Race entrants and starters', source: 'F1 race results' }),
    fastest_race_lap: Object.freeze({ id: 'get_fastest_race_lap', label: 'Fastest race lap', source: 'F1 fastest lap archive' }),
    qualifying_position: Object.freeze({ id: 'get_qualifying_position', label: 'Qualifying classification position', source: 'F1 qualifying results' }),
    streak_subject: Object.freeze({ id: 'get_driver_streak', label: 'Named driver streak', source: 'Recorded race results' }),
    milestone_threshold: Object.freeze({ id: 'rank_career_milestone_threshold', label: 'Career milestone threshold', source: 'Recorded race results' }),
    debut_milestone: Object.freeze({ id: 'get_debut_milestones', label: 'Debut milestone results', source: 'Recorded race results' }),
    milestone_never_reached: Object.freeze({ id: 'rank_never_reached_milestones', label: 'Starts without a milestone', source: 'Recorded race results' }),
    team_tenure: Object.freeze({ id: 'rank_team_tenure', label: 'Driver team tenure ranking', source: 'Recorded race starts' }),
    team_seasons: Object.freeze({ id: 'rank_team_seasons', label: 'Driver seasons with one team', source: 'Recorded race starts' }),
    teammate_events: Object.freeze({ id: 'rank_teammate_events', label: 'Shared teammate event count', source: 'Recorded race starts' }),
    debut_to_milestone: Object.freeze({ id: 'rank_debut_to_milestone', label: 'Debut to milestone ranking', source: 'Recorded race results' }),
    standings_gap: Object.freeze({ id: 'rank_final_standings_gap', label: 'Final standings gap ranking', source: 'Official final standings' }),
    season_standings_gap: Object.freeze({ id: 'get_season_standings_gap', label: 'Single-season final standings gap', source: 'Official final standings' }),
    top_four_spread: Object.freeze({ id: 'rank_top_four_spread', label: 'Final top four spread', source: 'Official final standings' }),
    latest_team_milestone: Object.freeze({ id: 'get_latest_team_milestone', label: 'Latest team podium or win', source: 'Recorded race results' }),
    points_without_win: Object.freeze({ id: 'rank_winless_season_points', label: 'Season points without wins', source: 'Official standings and race results' }),
    record_leader: Object.freeze({ id: 'find_records', label: 'Archive record search', source: 'Racelytic results archive' }),
    record_subject_total: Object.freeze({ id: 'get_competitor_record', label: 'Competitor record lookup', source: 'Racelytic results archive' }),
    race_result: Object.freeze({ id: 'get_race_result', label: 'Race classification lookup', source: 'Official recorded classifications' }),
    season_opener: Object.freeze({ id: 'get_season_opener', label: 'Season opener lookup', source: 'Recorded race calendar and classifications' }),
    season_closer: Object.freeze({ id: 'get_season_closer', label: 'Season closer lookup', source: 'Recorded race calendar and classifications' }),
    season_calendar: Object.freeze({ id: 'get_season_calendar', label: 'Completed season calendar', source: 'Recorded race calendar and classifications' }),
    season_event_count: Object.freeze({ id: 'count_season_events', label: 'Season event and race count', source: 'Recorded race calendar and classifications' }),
    adjacent_event: Object.freeze({ id: 'get_adjacent_event', label: 'Adjacent completed event lookup', source: 'Recorded race calendar and classifications' }),
    calendar_host_years: Object.freeze({ id: 'get_calendar_host_years', label: 'Circuit or event calendar years', source: 'Recorded race calendar and classifications' }),
    calendar_host_boundary: Object.freeze({ id: 'get_calendar_host_boundary', label: 'First or last calendar appearance', source: 'Recorded race calendar and classifications' }),
    calendar_host_leader: Object.freeze({ id: 'rank_calendar_hosts', label: 'Circuit or event appearance ranking', source: 'Recorded race calendar and classifications' }),
    driver_debut: Object.freeze({ id: 'get_driver_debut', label: 'Driver debut lookup', source: 'Recorded race classifications' }),
    driver_last_start: Object.freeze({ id: 'get_driver_last_start', label: 'Driver last-start lookup', source: 'Recorded race classifications' }),
    team_boundary_start: Object.freeze({ id: 'get_team_boundary_start', label: 'Team boundary-start lookup', source: 'Recorded race classifications' }),
    competitor_milestone: Object.freeze({ id: 'get_competitor_milestone', label: 'Competitor milestone lookup', source: 'Recorded race classifications' }),
    competitor_season_summary: Object.freeze({ id: 'get_competitor_season_summary', label: 'Competitor season summary', source: 'Official final standings and race classifications' }),
    latest_team_points: Object.freeze({ id: 'get_latest_team_points', label: 'Latest team points lookup', source: 'Recorded race and sprint points' }),
    season_standings: Object.freeze({ id: 'get_season_standings', label: 'Championship standings lookup', source: 'Official recorded standings' }),
    driver_profile: Object.freeze({ id: 'get_driver_profile', label: 'Driver archive profile', source: 'Racelytic driver and results archive' }),
    constructor_profile: Object.freeze({ id: 'get_constructor_profile', label: 'Constructor archive profile', source: 'Racelytic constructor and results archive' }),
    circuit_profile: Object.freeze({ id: 'get_circuit_profile', label: 'Circuit archive profile', source: 'Racelytic circuit and race archive' }),
    season_summary: Object.freeze({ id: 'get_season_summary', label: 'Season archive summary', source: 'Official recorded results and standings' }),
    motorsport_explanation: Object.freeze({ id: 'explain_motorsport_term', label: 'Motorsport glossary', source: 'Racelytic curated methodology glossary' }),
    driver_head_to_head: Object.freeze({ id: 'compare_drivers', label: 'Driver comparison', source: 'Racelytic results archive' }),
    constructor_head_to_head: Object.freeze({ id: 'compare_constructors', label: 'Constructor comparison', source: 'Racelytic results archive' }),
    streak_leader: Object.freeze({ id: 'find_streaks', label: 'Consecutive-result search', source: 'Racelytic results archive' }),
    recalculate_title_counts: Object.freeze({ id: 'recalculate_title_counts', label: 'Historical title recalculation', source: 'Recorded results and Racelytic points engine' }),
    recalculate_points_totals: Object.freeze({ id: 'recalculate_points_totals', label: 'Historical career-points recalculation', source: 'Recorded results and Racelytic points engine' }),
    recalculate_season_champion: Object.freeze({ id: 'recalculate_season', label: 'Season recalculation', source: 'Recorded results and Racelytic points engine' }),
    recalculate_entity_titles: Object.freeze({ id: 'recalculate_competitor_titles', label: 'Competitor title recalculation', source: 'Recorded results and Racelytic points engine' }),
    list_changed_championships: Object.freeze({ id: 'find_changed_championships', label: 'Changed-championship search', source: 'Recorded results and Racelytic points engine' }),
    compare_points_systems: Object.freeze({ id: 'compare_points_systems', label: 'Points-system comparison', source: 'Recorded results and Racelytic points engine' })
});

const WEC_TOOL_CATALOG = Object.freeze({
    lineup_record: Object.freeze({ id: 'wec_rank_crew_records', label: 'WEC car crew record ranking' }),
    consecutive_event_wins: Object.freeze({ id: 'wec_count_consecutive_event_wins', label: 'WEC consecutive event wins' }),
    team_change_comparison: Object.freeze({ id: 'wec_compare_driver_team_stints', label: 'WEC driver team-stint comparison' }),
    compare_seasons: Object.freeze({ id: 'wec_compare_competitor_seasons', label: 'WEC two-season comparison' }),
    longest_milestone_gap: Object.freeze({ id: 'wec_rank_milestone_gaps', label: 'WEC longest milestone gap' }),
    best_worst_result: Object.freeze({ id: 'wec_best_worst_result', label: 'WEC best or worst driver result' }),
    result_distribution: Object.freeze({ id: 'wec_result_distribution', label: 'WEC result distribution' }),
    latest_failure: Object.freeze({ id: 'wec_latest_failure', label: 'WEC latest non-scoring or non-finish result' }),
    driver_team_history: Object.freeze({ id: 'wec_driver_team_history', label: 'WEC driver team and crew history' }),
    wec_class_overall_rank: Object.freeze({ id: 'wec_compare_class_overall_rank', label: 'WEC car class and overall positions' }),
    wec_team_car_count: Object.freeze({ id: 'wec_count_team_cars', label: 'WEC team car entry count' }),
    milestone_threshold: Object.freeze({ id: 'wec_career_milestone_threshold', label: 'WEC career milestone threshold' }),
    debut_milestone: Object.freeze({ id: 'wec_debut_milestones', label: 'WEC debut milestone results' }),
    milestone_never_reached: Object.freeze({ id: 'wec_never_reached_milestones', label: 'WEC starts without a milestone' }),
    team_tenure: Object.freeze({ id: 'wec_rank_team_tenure', label: 'WEC driver team tenure ranking' }),
    team_seasons: Object.freeze({ id: 'wec_rank_team_seasons', label: 'WEC seasons with one team' }),
    teammate_events: Object.freeze({ id: 'wec_rank_teammate_events', label: 'WEC shared car event count' }),
    debut_to_milestone: Object.freeze({ id: 'wec_rank_debut_to_milestone', label: 'WEC debut to milestone ranking' }),
    standings_gap: Object.freeze({ id: 'wec_rank_final_standings_gap', label: 'WEC final standings gap ranking' }),
    season_standings_gap: Object.freeze({ id: 'wec_season_standings_gap', label: 'WEC single-season final standings gap' }),
    top_four_spread: Object.freeze({ id: 'wec_rank_top_four_spread', label: 'WEC final top four spread' }),
    latest_team_milestone: Object.freeze({ id: 'wec_latest_team_milestone', label: 'WEC latest team podium or win' }),
    points_without_win: Object.freeze({ id: 'wec_rank_winless_season_points', label: 'WEC season points without wins' }),
    season_opener: Object.freeze({ id: 'wec_season_opener', label: 'WEC season opener lookup' }),
    season_closer: Object.freeze({ id: 'wec_season_closer', label: 'WEC season closer lookup' }),
    season_calendar: Object.freeze({ id: 'wec_season_calendar', label: 'WEC completed season calendar' }),
    season_event_count: Object.freeze({ id: 'wec_count_season_events', label: 'WEC season event count' }),
    adjacent_event: Object.freeze({ id: 'wec_adjacent_event', label: 'WEC adjacent event lookup' }),
    calendar_host_years: Object.freeze({ id: 'wec_calendar_host_years', label: 'WEC circuit or event calendar years' }),
    calendar_host_boundary: Object.freeze({ id: 'wec_calendar_host_boundary', label: 'WEC first or last calendar appearance' }),
    calendar_host_leader: Object.freeze({ id: 'wec_rank_calendar_hosts', label: 'WEC circuit or event appearance ranking' }),
    driver_debut: Object.freeze({ id: 'wec_driver_debut', label: 'WEC driver debut lookup' }),
    driver_last_start: Object.freeze({ id: 'wec_driver_last_start', label: 'WEC driver last-start lookup' }),
    team_boundary_start: Object.freeze({ id: 'wec_team_boundary_start', label: 'WEC team boundary-start lookup' }),
    competitor_milestone: Object.freeze({ id: 'wec_competitor_milestone', label: 'WEC competitor milestone lookup' }),
    latest_team_points: Object.freeze({ id: 'wec_latest_team_points', label: 'WEC latest team points lookup' }),
    record_leader: Object.freeze({ id: 'wec_record_search', label: 'WEC classification search' }),
    record_subject_total: Object.freeze({ id: 'wec_record_search', label: 'WEC classification search' }),
    head_to_head: Object.freeze({ id: 'wec_head_to_head', label: 'WEC competitor comparison' }),
    season_summary: Object.freeze({ id: 'wec_competitor_season', label: 'WEC competitor season summary' }),
    season_standings: Object.freeze({ id: 'wec_official_standings', label: 'WEC championship standings' }),
    race_result: Object.freeze({ id: 'wec_race_classification', label: 'WEC race classification' })
});

function toolForIntent(intent) {
    return TOOL_CATALOG[intent] || null;
}

function evidenceCount(result = {}) {
    if (Array.isArray(result.fact?.rows)) return result.fact.rows.length;
    if (Array.isArray(result.profile?.facts)) return result.profile.facts.length;
    if (Array.isArray(result.summary?.standings)) return result.summary.standings.length + Number(result.summary.races || 0);
    if (result.explanation?.topic) return 1;
    if (Array.isArray(result.record?.entries)) return result.record.entries.length;
    if (Array.isArray(result.ranking)) return result.ranking.length;
    if (Array.isArray(result.changedChampionships)) return result.changedChampionships.length;
    if (Array.isArray(result.streak?.ranking)) return result.streak.ranking.length;
    if (Array.isArray(result.comparison?.details)) return result.comparison.details.length;
    if (Array.isArray(result.standings)) return result.standings.length;
    if (Array.isArray(result.classifications)) {
        return result.classifications.reduce((total, classification) => total + (classification.entries?.length || 0), 0);
    }
    return 0;
}

async function executeAskTool(connection, interpretation, execute) {
    const tool = toolForIntent(interpretation.intent);
    if (!tool) {
        const error = new Error('No trusted Racelytic tool is registered for that question type.');
        error.statusCode = 422;
        throw error;
    }
    const startedAt = Date.now();
    const result = await execute(connection, interpretation);
    return {
        result,
        grounding: {
            grounded: true,
            tool: tool.id,
            label: tool.label,
            source: result.methodology?.source || tool.source,
            evidenceItems: evidenceCount(result),
            durationMs: Date.now() - startedAt
        }
    };
}

module.exports = { TOOL_CATALOG, WEC_TOOL_CATALOG, evidenceCount, executeAskTool, toolForIntent };
