const RECORD_CATEGORIES = Object.freeze([
    ['wins', 'Race wins'],
    ['podiums', 'Podiums'],
    ['poles', 'Pole positions'],
    ['fastestLaps', 'Fastest laps'],
    ['starts', 'Race starts'],
    ['points', 'Points'],
    ['gridGain', 'Average positions gained'],
    ['averageFinish', 'Average finish'],
    ['finishRate', 'Finish rate'],
    ['winRate', 'Win rate'],
    ['podiumRate', 'Podium rate'],
    ['dnfs', 'DNFs'],
    ['championships', 'Championships']
].map(([id, name]) => Object.freeze({ id, name })));

const RECORD_CATEGORY_IDS = new Set(RECORD_CATEGORIES.map(category => category.id));

const INTENT_CATALOG = Object.freeze([
    {
        id: 'record_leader',
        family: 'archive_records',
        requiredSlots: ['recordCategory'],
        optionalSlots: ['entity', 'constructorName', 'circuitName', 'venueCountryName', 'nationalityName', 'raceFormat', 'resultLimit', 'minStarts', 'fromYear', 'toYear'],
        description: 'Rank drivers or constructors by an official career record.'
    },
    {
        id: 'record_subject_total',
        family: 'archive_records',
        requiredSlots: ['recordCategory', 'subjectName'],
        optionalSlots: ['entity', 'constructorName', 'circuitName', 'venueCountryName', 'nationalityName', 'raceFormat', 'resultLimit', 'minStarts', 'fromYear', 'toYear'],
        description: 'Calculate one driver or constructor’s official record total.'
    },
    {
        id: 'race_result',
        family: 'archive_facts',
        requiredSlots: ['targetSeason', 'eventName'],
        optionalSlots: ['targetSeason', 'eventName', 'raceId', 'subjectName', 'subjectId', 'resultView', 'raceFormat'],
        description: 'Look up a race winner, podium, classification, or one driver’s result.'
    },
    {
        id: 'season_standings',
        family: 'archive_facts',
        requiredSlots: ['targetSeason'],
        optionalSlots: ['entity', 'standingRound', 'resultLimit'],
        description: 'Show a season championship table, including standings after a round.'
    },
    {
        id: 'driver_head_to_head',
        family: 'comparisons',
        requiredSlots: ['subjectNames'],
        minimumItems: { subjectNames: 2 },
        optionalSlots: ['subjectIds', 'comparisonScope', 'comparisonMetric', 'pointsSystemYear', 'constructorName', 'circuitName', 'venueCountryName', 'fromYear', 'toYear'],
        description: 'Compare two drivers across shared starts or their teammate races.'
    },
    {
        id: 'constructor_head_to_head',
        family: 'comparisons',
        requiredSlots: ['subjectNames'],
        minimumItems: { subjectNames: 2 },
        optionalSlots: ['comparisonMetric', 'circuitName', 'venueCountryName', 'fromYear', 'toYear'],
        description: 'Compare two constructors or teams using official archive totals.'
    },
    {
        id: 'streak_leader',
        family: 'archive_streaks',
        requiredSlots: ['streakCategory'],
        optionalSlots: ['fromYear', 'toYear', 'resultLimit'],
        description: 'Rank the longest consecutive win, podium, points or classified-finish streaks.'
    },
    {
        id: 'recalculate_title_counts',
        family: 'points_counterfactual',
        requiredSlots: ['entity', 'pointsSystemYear'],
        optionalSlots: ['fromYear', 'toYear'],
        description: 'Rank championship totals under a historical rulebook.'
    },
    {
        id: 'recalculate_season_champion',
        family: 'points_counterfactual',
        requiredSlots: ['entity', 'pointsSystemYear', 'targetSeason'],
        optionalSlots: [],
        description: 'Recalculate one season under a historical rulebook.'
    },
    {
        id: 'recalculate_entity_titles',
        family: 'points_counterfactual',
        requiredSlots: ['pointsSystemYear', 'subjectName'],
        optionalSlots: ['entity', 'fromYear', 'toYear'],
        description: 'Recalculate one driver or constructor’s titles.'
    },
    {
        id: 'list_changed_championships',
        family: 'points_counterfactual',
        requiredSlots: ['entity', 'pointsSystemYear'],
        optionalSlots: ['fromYear', 'toYear'],
        description: 'List championships that change under a historical rulebook.'
    },
    {
        id: 'compare_points_systems',
        family: 'points_counterfactual',
        requiredSlots: ['comparisonPointsSystemYears'],
        minimumItems: { comparisonPointsSystemYears: 2 },
        optionalSlots: ['entity', 'subjectName', 'fromYear', 'toYear'],
        description: 'Compare two complete historical rulebooks.'
    }
].map(Object.freeze));

const BY_ID = new Map(INTENT_CATALOG.map(intent => [intent.id, intent]));

function intentDefinition(id) {
    return BY_ID.get(id) || null;
}

function supportedIntentIds() {
    return new Set(BY_ID.keys());
}

function hasSlotValue(value, minimumItems = 1) {
    if (Array.isArray(value)) return value.filter(item => item !== null && item !== undefined && item !== '').length >= minimumItems;
    return value !== null && value !== undefined && value !== '';
}

function missingRequiredSlots(intentId, slots = {}) {
    const definition = intentDefinition(intentId);
    if (!definition) return [];
    return definition.requiredSlots.filter(slot => !hasSlotValue(slots[slot], definition.minimumItems?.[slot] || 1));
}

function isRecordCategory(value) {
    return RECORD_CATEGORY_IDS.has(value);
}

module.exports = {
    INTENT_CATALOG,
    RECORD_CATEGORIES,
    intentDefinition,
    isRecordCategory,
    missingRequiredSlots,
    supportedIntentIds
};
