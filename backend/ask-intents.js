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
const ASK_LANGUAGE_POLICY = Object.freeze({
    minimumIntentScore: 0.70,
    ambiguityMargin: 0.025
});

const INTENT_CATALOG = Object.freeze([
    {
        id: 'record_leader',
        label: 'a record ranking',
        family: 'archive_records',
        requiredSlots: ['recordCategory'],
        optionalSlots: ['entity', 'constructorName', 'circuitName', 'venueCountryName', 'nationalityName', 'raceFormat', 'resultLimit', 'minStarts', 'fromYear', 'toYear'],
        description: 'Rank drivers or constructors by an official career record.',
        examples: ['Who has the most race wins?', 'Rank constructors by podiums', 'Which driver holds the pole-position record?', 'Show the top five drivers by fastest laps']
    },
    {
        id: 'record_subject_total',
        label: 'one competitor’s record total',
        family: 'archive_records',
        requiredSlots: ['recordCategory', 'subjectName'],
        optionalSlots: ['entity', 'constructorName', 'circuitName', 'venueCountryName', 'nationalityName', 'raceFormat', 'resultLimit', 'minStarts', 'fromYear', 'toYear'],
        description: 'Calculate one driver or constructor’s official record total.',
        examples: ['How many wins does Lewis Hamilton have?', 'How many podiums did Ferrari score?', "What is Verstappen's win record?", "Alonso's total race starts"]
    },
    {
        id: 'race_result',
        label: 'a race result',
        family: 'archive_facts',
        requiredSlots: ['targetSeason', 'eventName'],
        optionalSlots: ['targetSeason', 'eventName', 'raceId', 'subjectName', 'subjectId', 'resultView', 'raceFormat'],
        description: 'Look up a race winner, podium, classification, or one driver’s result.',
        examples: ['Who won the 2024 Monaco Grand Prix?', 'Who was on the podium at the British Grand Prix in 2023?', 'Show the classification at the 2022 Italian Grand Prix', 'Where did Alonso finish at the 2021 Hungarian Grand Prix?', 'Show the finishing order from Monaco in 2022']
    },
    {
        id: 'season_standings',
        label: 'season standings',
        family: 'archive_facts',
        requiredSlots: ['targetSeason'],
        optionalSlots: ['entity', 'standingRound', 'resultLimit'],
        description: 'Show a season championship table, including standings after a round.',
        examples: ['Show the 2024 driver standings', 'Show the 2023 constructor championship table', 'Driver standings after round 10 in 2022', 'Summarize the 2020 season', 'Season leaderboard for 2024']
    },
    {
        id: 'driver_head_to_head',
        label: 'a driver comparison',
        family: 'comparisons',
        requiredSlots: ['subjectNames'],
        minimumItems: { subjectNames: 2 },
        optionalSlots: ['subjectIds', 'comparisonScope', 'comparisonMetric', 'pointsSystemYear', 'constructorName', 'circuitName', 'venueCountryName', 'fromYear', 'toYear'],
        description: 'Compare two drivers across shared starts or their teammate races.',
        examples: ['Compare Hamilton and Verstappen head-to-head', 'Hamilton versus Rosberg in qualifying', 'Who has more wins, Senna or Prost?', 'Compare Alonso with Räikkönen as teammates']
    },
    {
        id: 'constructor_head_to_head',
        label: 'a constructor comparison',
        family: 'comparisons',
        requiredSlots: ['subjectNames'],
        minimumItems: { subjectNames: 2 },
        optionalSlots: ['comparisonMetric', 'circuitName', 'venueCountryName', 'fromYear', 'toYear'],
        description: 'Compare two constructors or teams using official archive totals.',
        examples: ['Compare teams Ferrari and McLaren head-to-head', 'Constructors Ferrari versus McLaren for wins', 'Compare Mercedes and Red Bull constructors in 2021', 'Which team had more points, Ferrari or McLaren?']
    },
    {
        id: 'streak_leader',
        label: 'a streak ranking',
        family: 'archive_streaks',
        requiredSlots: ['streakCategory'],
        optionalSlots: ['fromYear', 'toYear', 'resultLimit'],
        description: 'Rank the longest consecutive win, podium, points or classified-finish streaks.',
        examples: ['Who has the longest winning streak?', 'Most consecutive podiums', 'Show the longest points-scoring streak', 'Most classified finishes in a row']
    },
    {
        id: 'recalculate_title_counts',
        label: 'recalculated career title totals',
        family: 'points_counterfactual',
        requiredSlots: ['entity', 'pointsSystemYear'],
        optionalSlots: ['fromYear', 'toYear'],
        description: 'Rank championship totals under a historical rulebook.',
        examples: ['Who has the most titles under 1982 rules?', 'Rank drivers by championships using 1991 scoring', 'Top constructor by titles with 2010 points', 'Who leads the WDC count under current rules?']
    },
    {
        id: 'recalculate_season_champion',
        label: 'a recalculated season champion',
        family: 'points_counterfactual',
        requiredSlots: ['entity', 'pointsSystemYear', 'targetSeason'],
        optionalSlots: [],
        description: 'Recalculate one season under a historical rulebook.',
        examples: ['Who wins the 2008 championship under 1991 rules?', 'Which constructor wins the 2016 title using 1982 points?', 'Who would have won the championship in 2021 with 2003 scoring?', 'Why would the 2012 championship be won by Vettel under 2010 rules?']
    },
    {
        id: 'recalculate_entity_titles',
        label: 'one competitor’s recalculated titles',
        family: 'points_counterfactual',
        requiredSlots: ['pointsSystemYear', 'subjectName'],
        optionalSlots: ['entity', 'fromYear', 'toYear'],
        description: 'Recalculate one driver or constructor’s titles.',
        examples: ['How many titles would Alonso have under 1982 rules?', 'How many WDCs does Vettel win with 1991 scoring?', 'How many championships for McLaren under 2010 rules?', 'How many WCCs would Ferrari have under current rules?']
    },
    {
        id: 'list_changed_championships',
        label: 'championships changed by another rulebook',
        family: 'points_counterfactual',
        requiredSlots: ['entity', 'pointsSystemYear'],
        optionalSlots: ['fromYear', 'toYear'],
        description: 'List championships that change under a historical rulebook.',
        examples: ['Which championships change under 1991 rules?', 'What seasons would flip with 1982 scoring?', 'Which WCC champions differ under 2010 points?', 'How many driver championships switch with current rules?']
    },
    {
        id: 'compare_points_systems',
        label: 'a comparison of scoring systems',
        family: 'points_counterfactual',
        requiredSlots: ['comparisonPointsSystemYears'],
        minimumItems: { comparisonPointsSystemYears: 2 },
        optionalSlots: ['entity', 'subjectName', 'fromYear', 'toYear'],
        description: 'Compare two complete historical rulebooks.',
        examples: ['Compare the 1982 and 1991 systems', '1982 rules versus 2010 rules', 'How does Ferrari perform under current rules versus 2003 rules?', 'Does Alonso win more titles under 1982 or 1991 rules?']
    }
].map(intent => Object.freeze({
    ...intent,
    requiredSlots: Object.freeze(intent.requiredSlots),
    optionalSlots: Object.freeze(intent.optionalSlots),
    minimumItems: intent.minimumItems ? Object.freeze(intent.minimumItems) : undefined,
    examples: Object.freeze(intent.examples)
})));

const BY_ID = new Map(INTENT_CATALOG.map(intent => [intent.id, intent]));

function intentDefinition(id) {
    return BY_ID.get(id) || null;
}

function intentLabel(id) {
    return intentDefinition(id)?.label || id;
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
    ASK_LANGUAGE_POLICY,
    INTENT_CATALOG,
    RECORD_CATEGORIES,
    intentDefinition,
    intentLabel,
    isRecordCategory,
    missingRequiredSlots,
    supportedIntentIds
};
