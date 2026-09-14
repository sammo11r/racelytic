const TOOL_CATALOG = Object.freeze({
    record_leader: Object.freeze({ id: 'find_records', label: 'Archive record search', source: 'Racelytic results archive' }),
    record_subject_total: Object.freeze({ id: 'get_competitor_record', label: 'Competitor record lookup', source: 'Racelytic results archive' }),
    race_result: Object.freeze({ id: 'get_race_result', label: 'Race classification lookup', source: 'Official recorded classifications' }),
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

function toolForIntent(intent) {
    return TOOL_CATALOG[intent] || null;
}

function evidenceCount(result = {}) {
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

module.exports = { TOOL_CATALOG, evidenceCount, executeAskTool, toolForIntent };
