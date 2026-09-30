const express = require('express');
const { availablePointsSystems, executeAskQuery, nationalityOptions } = require('../ask-engine');
const { interpretQuestion, pointsSystemExists } = require('../ask-interpreter');
const { MemoryRateLimiter } = require('../rate-limit');
const { withConnection } = require('../route-helpers');
const { RECORD_CATEGORIES, intentDefinition, isRecordCategory, missingRequiredSlots, supportedIntentIds } = require('../ask-intents');
const { isJuniorSeries, normaliseSeries, seriesPrefix } = require('../series-config');
const { extractFollowUpDirectives, mergeFollowUpSlot } = require('../ask-slots');
const { all: SERIES } = require('../../frontend/js/series-config');
const { AskConversationStore } = require('../ask-conversations');
const { executeAskTool } = require('../ask-tools');
const { LOCAL_PLANNER_VERSION } = require('../ask-local-fallback');
const { executeWecQuestion } = require('../ask-wec');

function askOptions(series = 'f1') {
    return {
        pointsSystems: isJuniorSeries(series) || series === 'wec' ? [] : availablePointsSystems(),
        recordCategories: series === 'wec'
            ? RECORD_CATEGORIES.filter(category => ['wins', 'podiums', 'starts'].includes(category.id))
            : RECORD_CATEGORIES
    };
}

function optionalYear(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1950 && number <= 2100 ? number : null;
}

function optionalLimit(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 50 ? number : null;
}

function optionalMinimumStarts(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 1000 ? number : null;
}

function optionalMilestoneCount(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 10000 ? number : null;
}

function optionalRound(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 100 ? number : null;
}

function isEvidenceFollowUp(query) {
    return /^(?:why\??|how (?:did you|was (?:that|this|it)) (?:calculate|work out|derive)|what (?:data|sources?|evidence) did you use)/i.test(String(query || '').trim());
}

function explainPreviousCalculation(conversation) {
    const previous = conversation?.lastEvidence;
    if (!previous?.methodology?.source) return null;
    const { methodology, assumptions = [], grounding } = previous;
    const answer = `I used ${methodology.source} ${methodology.coverage ? `The calculation covers ${methodology.coverage}.` : ''} ${methodology.sample || ''}`.replace(/\s+/g, ' ').trim();
    return {
        intent: 'explain_calculation', answer, methodology, assumptions,
        grounding: { grounded: true, tool: 'explain_previous_calculation', label: 'Previous calculation evidence',
            source: methodology.source, evidenceItems: grounding?.evidenceItems || 0 }
    };
}

function assertRequestedScopesApplied(interpretation, result) {
    const scope = result.scope || {};
    const filters = result.comparison?.filters || {};
    const inferredLocation = interpretation.confidence !== 'confirmed';
    const checks = [
        ['constructorName', Boolean(result.constructorFilter || filters.constructor)],
        ['circuitName', Boolean(result.profile?.kind === 'circuit' || scope.circuit || filters.circuit || inferredLocation && (scope.venueCountry || filters.venueCountry))],
        ['venueCountryName', Boolean(scope.venueCountry || filters.venueCountry || inferredLocation && (scope.circuit || filters.circuit))],
        ['nationalityName', Boolean(scope.nationality)],
        ['pointsSystemYear', Boolean(result.pointsSystem)]
    ];
    const missing = checks.filter(([field, applied]) => interpretation[field] && !applied).map(([field]) => field);
    if (!missing.length) return;
    const labels = { constructorName: 'team', circuitName: 'circuit', venueCountryName: 'host country', nationalityName: 'nationality', pointsSystemYear: 'scoring rules' };
    const error = new Error(`Racelytic could not safely apply the requested ${missing.map(field => labels[field]).join(' and ')} scope. The broader answer was not returned.`);
    error.statusCode = 422;
    throw error;
}

function applyConfirmedInterpretation(interpreted, requested) {
    if (!requested || typeof requested !== 'object') return interpreted;
    const entity = ['drivers', 'constructors'].includes(requested.entity) ? requested.entity : interpreted.entity;
    const detectedIntent = supportedIntentIds().has(requested.intent) ? requested.intent : interpreted.detectedIntent || interpreted.intent;
    const requestedComparison = Array.isArray(requested.comparisonPointsSystemYears)
        ? requested.comparisonPointsSystemYears.map(optionalYear).filter(Boolean)
        : [optionalYear(requested.comparisonPointsSystemYearA), optionalYear(requested.comparisonPointsSystemYearB)].filter(Boolean);
    const comparisonPointsSystemYears = requestedComparison.length
        ? [...new Set(requestedComparison)]
        : interpreted.comparisonPointsSystemYears || [];
    const confirmedYear = field => Object.hasOwn(requested, field) ? optionalYear(requested[field]) : interpreted[field];
    const pointsSystemYear = detectedIntent === 'compare_points_systems'
        ? comparisonPointsSystemYears[0] || interpreted.pointsSystemYear
        : confirmedYear('pointsSystemYear');
    const targetSeason = confirmedYear('targetSeason');
    const subjectName = String(requested.subjectName || interpreted.subjectName || '').trim() || null;
    const constructorName = Object.hasOwn(requested, 'constructorName')
        ? String(requested.constructorName || '').trim() || null
        : interpreted.constructorName || null;
    const recordCategory = isRecordCategory(requested.recordCategory) ? requested.recordCategory : interpreted.recordCategory;
    const confirmedName = field => Object.hasOwn(requested, field) ? String(requested[field] || '').trim() || null : interpreted[field] || null;
    const raceFormat = Object.hasOwn(requested, 'raceFormat')
        ? ['all', 'F', 'S'].includes(requested.raceFormat) ? requested.raceFormat : null
        : interpreted.raceFormat || null;
    const requestedSubjectNames = Array.isArray(requested.subjectNames)
        ? requested.subjectNames
        : [requested.subjectNameA, requested.subjectNameB];
    const subjectNames = requestedSubjectNames.some(value => value !== undefined)
        ? requestedSubjectNames.map(value => String(value || '').trim()).filter(Boolean).slice(0, 2)
        : interpreted.subjectNames || [];
    const comparisonMetrics = new Set(['wins', 'podiums', 'poles', 'fastestLaps', 'points', 'pointsShare', 'starts', 'dnfs', 'gridGain', 'averageFinish', 'averageQualifying', 'finishRate', 'winRate', 'podiumRate', 'race', 'qualifying', 'both']);
    const comparisonScopes = new Set(['career', 'shared', 'teammates']);
    const resultViews = new Set(['winner', 'podium', 'classification', 'driver']);
    const streakCategories = new Set(['wins', 'podiums', 'points', 'finishes']);
    const candidate = {
        ...interpreted,
        detectedIntent,
        entity,
        pointsSystemYear,
        comparisonPointsSystemYears,
        targetSeason,
        subjectName,
        subjectNames,
        milestoneCount: Object.hasOwn(requested, 'milestoneCount') ? optionalMilestoneCount(requested.milestoneCount) : interpreted.milestoneCount || null,
        milestoneMeasure: ['starts', 'days'].includes(requested.milestoneMeasure) ? requested.milestoneMeasure : interpreted.milestoneMeasure || null,
        eventName: confirmedName('eventName'),
        resultPosition: Object.hasOwn(requested, 'resultPosition') ? optionalRound(requested.resultPosition) : interpreted.resultPosition || null,
        sessionType: ['race', 'sprint', 'qualifying'].includes(requested.sessionType) ? requested.sessionType : interpreted.sessionType || null,
        statusFilter: ['retired', 'dns', 'disqualified'].includes(requested.statusFilter) ? requested.statusFilter : interpreted.statusFilter || null,
        entryMode: ['entered', 'started'].includes(requested.entryMode) ? requested.entryMode : interpreted.entryMode || null,
        historyMode: ['teams', 'teammates'].includes(requested.historyMode) ? requested.historyMode : interpreted.historyMode || null,
        participationMode: ['entered', 'started', 'missed'].includes(requested.participationMode) ? requested.participationMode : interpreted.participationMode || null,
        resultMetric: ['race_finish', 'season_points', 'season_rank'].includes(requested.resultMetric) ? requested.resultMetric : interpreted.resultMetric || null,
        distributionMetric: ['finishes', 'points'].includes(requested.distributionMetric) ? requested.distributionMetric : interpreted.distributionMetric || null,
        failureMetric: ['points', 'finish'].includes(requested.failureMetric) ? requested.failureMetric : interpreted.failureMetric || null,
        gapMeasure: ['days', 'starts'].includes(requested.gapMeasure) ? requested.gapMeasure : interpreted.gapMeasure || null,
        newTeamName: confirmedName('newTeamName'),
        calendarHistoryName: confirmedName('calendarHistoryName'),
        calendarHistoryKind: ['circuit', 'event', 'country'].includes(requested.calendarHistoryKind) ? requested.calendarHistoryKind : interpreted.calendarHistoryKind || null,
        calendarDirection: ['previous', 'next'].includes(requested.calendarDirection) ? requested.calendarDirection : interpreted.calendarDirection || null,
        countUnit: ['events', 'races'].includes(requested.countUnit) ? requested.countUnit : interpreted.countUnit || null,
        chronologyDirection: ['first', 'last'].includes(requested.chronologyDirection) ? requested.chronologyDirection : interpreted.chronologyDirection || null,
        resultView: Object.hasOwn(requested, 'resultView') && resultViews.has(requested.resultView) ? requested.resultView : interpreted.resultView || null,
        standingRound: Object.hasOwn(requested, 'standingRound') ? optionalRound(requested.standingRound) : interpreted.standingRound || null,
        roundStart: Object.hasOwn(requested, 'roundStart') ? optionalRound(requested.roundStart) : interpreted.roundStart || null,
        roundEnd: Object.hasOwn(requested, 'roundEnd') ? optionalRound(requested.roundEnd) : interpreted.roundEnd || null,
        comparisonScope: Object.hasOwn(requested, 'comparisonScope') && comparisonScopes.has(requested.comparisonScope) ? requested.comparisonScope : interpreted.comparisonScope || null,
        comparisonMetric: Object.hasOwn(requested, 'comparisonMetric') && comparisonMetrics.has(requested.comparisonMetric) ? requested.comparisonMetric : interpreted.comparisonMetric || null,
        streakCategory: Object.hasOwn(requested, 'streakCategory') && streakCategories.has(requested.streakCategory) ? requested.streakCategory : interpreted.streakCategory || null,
        constructorName,
        circuitName: confirmedName('circuitName'),
        topic: confirmedName('topic'),
        venueCountryName: confirmedName('venueCountryName'),
        nationalityName: confirmedName('nationalityName'),
        raceFormat,
        resultLimit: Object.hasOwn(requested, 'resultLimit') ? optionalLimit(requested.resultLimit) : interpreted.resultLimit || null,
        minStarts: Object.hasOwn(requested, 'minStarts') ? optionalMinimumStarts(requested.minStarts) : interpreted.minStarts || null,
        recordCategory,
        fromYear: confirmedYear('fromYear'),
        toYear: confirmedYear('toYear'),
        confidence: 'confirmed',
        ambiguousFields: [],
        missingFields: []
    };
    const missingFields = missingRequiredSlots(detectedIntent, candidate);
    if (detectedIntent === 'race_result' && candidate.resultView === 'driver' && !candidate.subjectName) missingFields.push('subjectName');
    const inventoryEntityMismatch = ['team_tenure', 'team_seasons', 'teammate_events', 'debut_to_milestone', 'debut_milestone', 'milestone_never_reached', 'milestone_threshold', 'points_without_win'].includes(detectedIntent)
        ? candidate.entity !== 'drivers' : detectedIntent === 'latest_team_milestone' && candidate.entity !== 'constructors';
    const systemsAvailable = detectedIntent === 'compare_points_systems'
        ? comparisonPointsSystemYears.length >= 2 && comparisonPointsSystemYears.every(pointsSystemExists)
        : !detectedIntent || !detectedIntent.startsWith('recalculate_') && detectedIntent !== 'list_changed_championships'
            ? true
            : pointsSystemExists(pointsSystemYear);
    const ready = detectedIntent && !missingFields.length && systemsAvailable && !interpreted.unsupportedQualifiers?.length && !inventoryEntityMismatch;
    return {
        ...candidate,
        intent: ready ? detectedIntent : 'unsupported',
        missingFields,
        reason: ready ? 'Confirmed by the user.' : inventoryEntityMismatch
            ? 'That question has a fixed subject type; ask for a driver ranking or name a team as appropriate.' : interpreted.reason
    };
}

function mentionedSeries(query) {
    const text = String(query || '').toLowerCase();
    if (/\b(?:world\s+endurance\s+championship|wec)\b/.test(text)) return 'wec';
    if (/\b(?:formula\s*e|e-prix)\b/.test(text)) return 'fe';
    if (/\bf1\s+academy\b|\bformula\s+1\s+academy\b/.test(text)) return 'academy';
    if (/\b(?:formula\s*3|f3)\b/.test(text)) return 'f3';
    if (/\b(?:formula\s*2|f2)\b/.test(text)) return 'f2';
    if (/\b(?:formula\s*1|f1)\b/.test(text)) return 'f1';
    return null;
}

function applyFollowUpInterpretation(interpreted, context, query) {
    if (!context || typeof context !== 'object') return interpreted;
    const text = String(query || '').trim();
    const directives = extractFollowUpDirectives(text);
    const hasReference = /\b(?:he|him|his|she|her|hers|they|them|their|theirs|it|its|that|those|same|previous|former|latter)\b/i.test(text);
    if ((!directives.isFollowUp && !hasReference) || !supportedIntentIds().has(context.intent)) return interpreted;
    const { clearFields } = directives;
    const subjectReplacement = /^(?:wins?|victor(?:y|ies)|podiums?|points?|(?:19|20)\d{2})$/i.test(directives.subjectReplacement || '')
        ? null : directives.subjectReplacement;
    const entityChanged = interpreted.entityExplicit && interpreted.entity && interpreted.entity !== context.entity;
    const value = (field, fallback = null) => mergeFollowUpSlot(interpreted, context, field, clearFields, fallback);
    let detectedIntent = directives.isFollowUp && interpreted.interpretationSource === 'local_fallback'
        ? context.intent
        : ['driver_head_to_head', 'constructor_head_to_head'].includes(context.intent) && !(interpreted.subjectNames || []).length
            ? context.intent : interpreted.detectedIntent || context.intent;
    if (/\bwhat\s+happened\b.*\b(?:that|the same|previous)\s+(?:season|year)\b/i.test(text) && context.targetSeason) detectedIntent = 'season_summary';
    if (/\b(?:profile|tell me more)\b/i.test(text) && /\b(?:him|her|them|it|that driver|that team|that constructor)\b/i.test(text)) {
        detectedIntent = context.entity === 'constructors' ? 'constructor_profile' : 'driver_profile';
    }
    if (entityChanged && context.intent === 'driver_head_to_head' && interpreted.entity === 'constructors') detectedIntent = 'constructor_head_to_head';
    if (entityChanged && context.intent === 'constructor_head_to_head' && interpreted.entity === 'drivers') detectedIntent = 'driver_head_to_head';
    if (subjectReplacement && context.intent === 'record_leader') detectedIntent = 'record_subject_total';
    let subjectNames = Array.isArray(interpreted.subjectNames) && interpreted.subjectNames.length
        ? interpreted.subjectNames : context.subjectNames || [];
    if (subjectReplacement && ['driver_head_to_head', 'constructor_head_to_head'].includes(context.intent)) {
        subjectNames = [...(context.subjectNames || [])];
        subjectNames[1] = subjectReplacement;
    }
    const contextualSubject = context.subjectName || context.subjectNames?.[0] || null;
    const pronoun = /^(?:he|him|his|she|her|hers|they|them|their|theirs|it|its|that\s+(?:driver|team|constructor))$/i;
    if (contextualSubject) {
        if (pronoun.test(String(interpreted.subjectName || '').trim())) interpreted = { ...interpreted, subjectName: contextualSubject };
        subjectNames = subjectNames.map(name => pronoun.test(String(name).trim()) ? contextualSubject : name);
    }
    const requestedScope = directives.comparisonScope;
    const requestedView = directives.resultView;
    const followUpPositions = [...text.matchAll(/\bp\s*(\d{1,2})\b/gi)].map(match => Number(match[1]));
    const followUpMilestone = ['debut_to_milestone', 'debut_milestone', 'milestone_never_reached', 'milestone_threshold', 'latest_team_milestone'].includes(context.intent)
        ? /\bpodiums?\b/i.test(text) ? 'podium' : /\b(?:wins?|victor(?:y|ies))\b/i.test(text) ? 'win'
            : /\bpoints?\b/i.test(text) ? 'points' : null : null;
    const candidate = {
        ...context,
        ...interpreted,
        intent: detectedIntent,
        detectedIntent,
        entity: interpreted.entityExplicit ? interpreted.entity : context.entity,
        pointsSystemYear: value('pointsSystemYear'),
        comparisonPointsSystemYears: interpreted.comparisonPointsSystemYears?.length >= 2
            ? interpreted.comparisonPointsSystemYears : context.comparisonPointsSystemYears || [],
        recordCategory: value('recordCategory'),
        subjectName: entityChanged ? null : subjectReplacement && ['record_leader', 'record_subject_total', 'race_result', 'driver_profile', 'constructor_profile', 'team_tenure', 'latest_team_milestone', 'latest_team_points', 'competitor_season_summary', 'streak_subject'].includes(context.intent)
            ? subjectReplacement : value('subjectName'),
        milestone: followUpMilestone || value('milestone'),
        milestoneCount: context.intent === 'milestone_threshold' && /\b(\d{1,4})\s+(?:wins?|victor(?:y|ies)|podiums?|points?|starts?)\b/i.test(text)
            ? Number(text.match(/\b(\d{1,4})\s+(?:wins?|victor(?:y|ies)|podiums?|points?|starts?)\b/i)[1]) : value('milestoneCount'),
        milestoneMeasure: /\b(?:starts?|races?)\b/i.test(text) && context.intent === 'debut_to_milestone' ? 'starts'
            : /\b(?:days?|calendar\s+time)\b/i.test(text) && context.intent === 'debut_to_milestone' ? 'days' : value('milestoneMeasure'),
        chronologyDirection: context.intent === 'milestone_threshold' && /\b(?:fewest|fastest|quickest|least)\b/i.test(text) ? null
            : /\b(?:first|earliest)\b/i.test(text) ? 'first'
                : /\b(?:last|latest|final|most\s+recent)\b/i.test(text) ? 'last' : value('chronologyDirection'),
        firstPosition: followUpPositions.length === 2 ? followUpPositions[0] : value('firstPosition'),
        secondPosition: followUpPositions.length === 2 ? followUpPositions[1] : value('secondPosition'),
        extreme: /\b(?:largest|widest|biggest|greatest)\b/i.test(text) ? 'largest'
            : /\b(?:smallest|closest|narrowest|tightest)\b/i.test(text) ? 'smallest' : value('extreme'),
        constructorName: entityChanged ? null : value('constructorName'),
        circuitName: /\b(?:that|the same|previous)\s+(?:circuit|track|venue)\b/i.test(text) ? context.circuitName
            : interpreted.venueCountryName ? null : value('circuitName'),
        venueCountryName: interpreted.circuitName ? null : value('venueCountryName'),
        nationalityName: value('nationalityName'),
        raceFormat: value('raceFormat'),
        resultLimit: value('resultLimit'),
        minStarts: value('minStarts'),
        targetSeason: /\b(?:that|the same|previous)\s+(?:season|year)\b/i.test(text) ? context.targetSeason
            : /\b(?:19|20)\d{2}\b/.test(text) && /\bwhat\s+about\b/i.test(text)
                ? Number(text.match(/\b((?:19|20)\d{2})\b/)[1]) : value('targetSeason'),
        eventName: /\b(?:that|the same|previous)\s+race\b/i.test(text) ? context.eventName : value('eventName'),
        resultPosition: value('resultPosition'),
        sessionType: value('sessionType'),
        statusFilter: value('statusFilter'),
        entryMode: value('entryMode'),
        historyMode: value('historyMode'),
        participationMode: value('participationMode'),
        resultMetric: value('resultMetric'),
        distributionMetric: value('distributionMetric'),
        failureMetric: value('failureMetric'),
        gapMeasure: value('gapMeasure'),
        newTeamName: value('newTeamName'),
        calendarHistoryName: subjectReplacement && ['calendar_host_years', 'calendar_host_boundary'].includes(context.intent)
            ? subjectReplacement : value('calendarHistoryName'),
        calendarHistoryKind: /\b(?:circuits?|tracks?|venues?)\b/i.test(text) ? 'circuit'
            : /\b(?:events?|grands?\s+prix|gps?)\b/i.test(text) && context.intent === 'calendar_host_leader' ? 'event'
                : value('calendarHistoryKind'),
        calendarDirection: /\b(?:previous|before|preceding)\b/i.test(text) ? 'previous'
            : /\b(?:next|after|following)\b/i.test(text) ? 'next' : value('calendarDirection'),
        countUnit: context.intent === 'season_event_count' && /\b(?:races?|events?)\b/i.test(text)
            ? /\bevents?\b/i.test(text) ? 'events' : 'races' : value('countUnit'),
        resultView: subjectReplacement && context.intent === 'race_result' ? 'driver' : requestedView || value('resultView'),
        standingRound: value('standingRound'),
        roundStart: value('roundStart'),
        roundEnd: value('roundEnd'),
        subjectNames,
        comparisonScope: requestedScope || value('comparisonScope'),
        comparisonMetric: value('comparisonMetric'),
        streakCategory: context.intent === 'streak_subject' && /\b(?:podiums?|points?|wins?|victor(?:y|ies)|finish(?:es|ed|ing)?)\b/i.test(text)
            ? /\bpodiums?\b/i.test(text) ? 'podiums' : /\bpoints?\b/i.test(text) ? 'points'
                : /\bfinish(?:es|ed|ing)?\b/i.test(text) ? 'finishes' : 'wins' : value('streakCategory'),
        topic: value('topic'),
        fromYear: value('fromYear'),
        toYear: value('toYear'),
        confidence: 'contextual',
        ambiguousFields: [],
        unsupportedQualifiers: (interpreted.unsupportedQualifiers || []).filter(qualifier => !(
            ['a race-format, class, or condition filter', 'a class, race-format, or condition filter'].includes(qualifier)
            && ['record_leader', 'record_subject_total'].includes(detectedIntent)
            && interpreted.raceFormat
            && !/\b(?:wet|rainy|night)\b/i.test(text)
        ))
    };
    candidate.missingFields = missingRequiredSlots(detectedIntent, candidate);
    if (candidate.missingFields.length || candidate.unsupportedQualifiers.length) candidate.intent = 'unsupported';
    return candidate;
}

function supportedResponse(res, interpretation, message) {
    const series = normaliseSeries(interpretation.series);
    const config = SERIES[series];
    const seriesReason = isJuniorSeries(series) && !message && /^Ask about Formula 1 records/.test(interpretation.reason || '')
        ? `Ask about ${config.name} records such as wins, podiums, poles, fastest laps, starts, points or championships.`
        : interpretation.reason;
    const juniorExamples = [
        `Who has the most ${config.name} race wins?`,
        `Who has the most ${config.name} championships?`,
        'Which driver has the most pole positions?',
        'Who has the most race wins at Monaco?',
        'Which British driver has the most podiums?'
    ];
    const simulatorYear = interpretation.targetSeason || interpretation.fromYear;
    const suggestedAction = isJuniorSeries(series) && intentDefinition(interpretation.detectedIntent || interpretation.intent)?.family === 'points_counterfactual'
        ? { label: `Open the ${config.shortName} season simulator`, url: `${config.path}/simulate-season${simulatorYear ? `?year=${simulatorYear}` : ''}` }
        : null;
    return res.status(422).json({
        error: message || seriesReason,
        interpretation,
        planner: { mode: 'local', version: LOCAL_PLANNER_VERSION, externalServices: false },
        options: askOptions(series),
        ...(suggestedAction ? { suggestedAction } : {}),
        examples: isJuniorSeries(series) ? juniorExamples : [
            'Who has the most Formula 1 race wins?',
            'Which constructor has the most podiums since 2000?',
            'Which driver has the most pole positions with Ferrari?',
            'How many wins does Fernando Alonso have?',
            'How many podiums did Ferrari score between 2000 and 2010?',
            'Who wins the 2008 championship under 1991 rules?',
            'How many titles would Alonso have under 1982 rules?',
            'Which championships change under 1991 rules?',
            'Compare the 1982 and 1991 points systems.',
            'How does Ferrari perform under current rules versus 2003 rules?',
            'Who has the most world championships if every season uses the 1982 points system?',
            'Which constructor has the most titles under the 1991 scoring rules?'
        ]
    });
}

function createAskRouter({
    execute = executeAskQuery,
    interpret = interpretQuestion,
    connect = withConnection,
    limiter = new MemoryRateLimiter({ windowMs: 5 * 60 * 1000, limit: 60, maxEntries: 5000 }),
    conversations = new AskConversationStore()
} = {}) {
    const router = express.Router();
    router.get('/api/ask/options', async (req, res) => {
        const series = normaliseSeries(req.query?.series);
        const prefix = seriesPrefix(series);
        try {
            const options = await connect(async connection => {
                if (series === 'wec') {
                    const [teams, circuits, drivers] = await Promise.all([
                        connection.query('SELECT name FROM wec_teams ORDER BY name'),
                        connection.query('SELECT name FROM wec_circuits ORDER BY name'),
                        connection.query('SELECT name FROM wec_drivers ORDER BY name')
                    ]);
                    return { teams: teams.map(row => row.name), circuits: circuits.map(row => row.name),
                        drivers: drivers.map(row => row.name), countries: [], nationalities: [] };
                }
                const teams = await connection.query(`SELECT name FROM ${prefix}constructors ORDER BY name`);
                const circuits = await connection.query(`SELECT name FROM ${prefix}circuits ORDER BY name`);
                const drivers = await connection.query(`SELECT name FROM ${prefix}drivers ORDER BY name`);
                const countryRows = isJuniorSeries(series)
                    ? await connection.query(`SELECT placeName FROM ${prefix}circuits ORDER BY placeName`)
                    : await connection.query(`SELECT DISTINCT countries.name FROM circuits JOIN countries ON countries.id = circuits.countryId ORDER BY countries.name`);
                const countries = isJuniorSeries(series)
                    ? countryRows.map(row => String(row.placeName || '').split(',').at(-1)?.trim()).filter(Boolean)
                    : countryRows.map(row => row.name).filter(Boolean);
                return {
                    teams: teams.map(row => row.name).filter(Boolean),
                    circuits: circuits.map(row => row.name).filter(Boolean),
                    drivers: drivers.map(row => row.name).filter(Boolean),
                    countries: [...new Set(countries)].sort(),
                    nationalities: nationalityOptions()
                };
            });
            res.set('Cache-Control', 'public, max-age=300');
            res.json(options);
        } catch (error) {
            console.error(`Ask Racelytic options failed: ${error.message}`);
            res.status(500).json({ error: 'Filter suggestions are unavailable right now.' });
        }
    });
    router.delete('/api/ask/conversations/:conversationId', (req, res) => {
        const origin = req.get('origin');
        if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
            return res.status(403).json({ error: 'Invalid request origin.' });
        }
        conversations.delete(req.params.conversationId);
        res.status(204).end();
    });
    router.post('/api/ask', async (req, res) => {
    const origin = req.get('origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
        return res.status(403).json({ error: 'Invalid request origin.' });
    }
    if (limiter.consume(req.ip)) {
        res.set('Retry-After', '300');
        return res.status(429).json({ error: 'Too many questions. Please try again in a few minutes.' });
    }
    const query = String(req.body?.query || '').trim();
    const series = normaliseSeries(req.body?.series);
    const continuing = Boolean(conversations.get(req.body?.conversationId, series));
    if (query.length < (continuing ? 2 : 8) || query.length > 300) {
        return res.status(400).json({ error: continuing ? 'Enter at least two characters for a follow-up.' : 'Enter a question between 8 and 300 characters.' });
    }
    let interpretation;
    try {
        const requestedSeries = mentionedSeries(query);
        if (requestedSeries && requestedSeries !== series) {
            const target = SERIES[requestedSeries];
            return res.status(409).json({
                error: `That question mentions ${target.name}, but this is the ${SERIES[series].name} Ask page.`,
                seriesMismatch: { current: series, requested: requestedSeries, name: target.name, url: `${target.path}/ask?q=${encodeURIComponent(query)}` }
            });
        }
        if (isEvidenceFollowUp(query)) {
            const conversation = conversations.get(req.body?.conversationId, series);
            const result = explainPreviousCalculation(conversation);
            if (!result) return res.status(422).json({ error: 'Ask a calculable archive question first, then I can explain its evidence and assumptions.' });
            const savedConversation = conversations.remember({
                id: conversation.id, series, query, answer: result.answer,
                context: conversation.context, tool: result.grounding.tool,
                evidence: conversation.lastEvidence
            });
            return res.json({ query, ...result, interpretation: conversation.context,
                planner: { mode: 'local', version: LOCAL_PLANNER_VERSION, externalServices: false },
                options: askOptions(series), conversation: conversations.publicView(savedConversation) });
        }
        if (series === 'wec') {
            const conversation = conversations.get(req.body?.conversationId, series);
            const context = req.body?.context && typeof req.body.context === 'object'
                ? req.body.context : conversation?.context;
            const result = await connect(connection => executeWecQuestion(connection, query, context));
            interpretation = { ...result.interpretation, series: SERIES.wec.name };
            const savedConversation = conversations.remember({
                id: conversation?.id, series, query, answer: result.answer,
                context: result.interpretation, tool: result.grounding.tool,
                evidence: { methodology: result.methodology, assumptions: result.assumptions, grounding: result.grounding }
            });
            return res.json({ query, ...result, interpretation,
                planner: { mode: 'local', version: 'wec-archive-v1', externalServices: false },
                options: askOptions(series), conversation: conversations.publicView(savedConversation) });
        }
        const conversation = conversations.get(req.body?.conversationId, series);
        const conversationContext = req.body?.context && typeof req.body.context === 'object'
            ? req.body.context
            : conversation?.context;
        const contextual = applyFollowUpInterpretation({ ...interpret(query), series }, conversationContext, query);
        if (series === 'fe' && /^formula\s*e$/i.test(contextual.constructorName || '')) {
            contextual.constructorName = null;
        }
        interpretation = applyConfirmedInterpretation(contextual, req.body?.interpretation);
        if (interpretation.intent === 'motorsport_explanation') {
            return supportedResponse(res, interpretation, 'Ask Racelytic only answers questions it can calculate from recorded archive data. Try a race result, standings, record, or comparison.');
        }
        const supportedIntents = supportedIntentIds();
        if (!supportedIntents.has(interpretation.intent)) return supportedResponse(res, interpretation);
        if (isJuniorSeries(series) && intentDefinition(interpretation.intent)?.family === 'points_counterfactual') {
            return supportedResponse(res, interpretation, `Ask Racelytic currently answers ${SERIES[series].name} archive record questions. Try asking about wins, podiums, poles, fastest laps, starts or points.`);
        }
        if (interpretation.fromYear && interpretation.toYear && interpretation.fromYear > interpretation.toYear) {
            return res.status(400).json({
                error: 'The end season must be the same as or after the start season.',
                interpretation,
                options: askOptions(series)
            });
        }
        const execution = await connect(connection => executeAskTool(connection, interpretation, execute));
        const { result, grounding } = execution;
        assertRequestedScopesApplied(interpretation, result);
        const responseInterpretation = {
                intent: result.intent || interpretation.intent,
                series: SERIES[series].name,
                entity: result.entity || interpretation.entity,
                entityLabel: result.entityLabel,
                pointsSystemYear: interpretation.pointsSystemYear,
                comparisonPointsSystemYears: interpretation.comparisonPointsSystemYears,
                targetSeason: interpretation.targetSeason,
                subjectName: interpretation.subjectName,
                milestone: interpretation.milestone,
                milestoneCount: interpretation.milestoneCount,
                milestoneMeasure: interpretation.milestoneMeasure,
                chronologyDirection: interpretation.chronologyDirection,
                firstPosition: interpretation.firstPosition,
                secondPosition: interpretation.secondPosition,
                extreme: interpretation.extreme,
                subjectNames: interpretation.subjectNames,
                eventName: interpretation.eventName,
                resultPosition: interpretation.resultPosition,
                sessionType: interpretation.sessionType,
                statusFilter: interpretation.statusFilter,
                entryMode: interpretation.entryMode,
                historyMode: interpretation.historyMode,
                participationMode: interpretation.participationMode,
                calendarHistoryName: interpretation.calendarHistoryName,
                calendarHistoryKind: interpretation.calendarHistoryKind,
                calendarDirection: interpretation.calendarDirection,
                countUnit: interpretation.countUnit,
                resultView: interpretation.resultView,
                standingRound: interpretation.standingRound,
                roundStart: interpretation.roundStart,
                roundEnd: interpretation.roundEnd,
                comparisonScope: result.comparison?.scope || interpretation.comparisonScope,
                comparisonMetric: result.comparison?.metric || interpretation.comparisonMetric,
                streakCategory: interpretation.streakCategory,
                topic: interpretation.topic,
                constructorName: interpretation.constructorName,
                circuitName: result.scope?.circuit?.name || result.comparison?.filters?.circuit?.name
                    || (result.scope?.venueCountry || result.comparison?.filters?.venueCountry ? null : interpretation.circuitName),
                venueCountryName: result.scope?.venueCountry?.name || result.comparison?.filters?.venueCountry?.name
                    || (result.scope?.circuit || result.comparison?.filters?.circuit ? null : interpretation.venueCountryName),
                nationalityName: interpretation.nationalityName,
                raceFormat: interpretation.raceFormat,
                resultLimit: interpretation.resultLimit,
                minStarts: interpretation.minStarts,
                recordCategory: interpretation.recordCategory,
                fromYear: interpretation.fromYear,
                toYear: interpretation.toYear,
                confidence: interpretation.confidence,
                interpretationSource: interpretation.interpretationSource || 'rules'
            };
        const savedConversation = conversations.remember({
            id: conversation?.id,
            series,
            query,
            answer: result.answer,
            context: { ...interpretation, ...responseInterpretation, series },
            tool: grounding.tool,
            evidence: { methodology: result.methodology, assumptions: result.assumptions, grounding }
        });
        res.json({
            query,
            ...result,
            interpretation: responseInterpretation,
            planner: { mode: 'local', version: LOCAL_PLANNER_VERSION, externalServices: false },
            options: askOptions(series),
            conversation: conversations.publicView(savedConversation),
            grounding
        });
    } catch (error) {
        if (!error.statusCode) console.error(`Ask Racelytic failed: ${error.message}`);
        res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Racelytic could not calculate that answer right now.',
            ...(error.statusCode ? {
                interpretation,
                options: askOptions(series),
                suggestions: error.suggestions || [],
                suggestionContext: {
                    field: error.suggestionField || 'subjectName',
                    index: Number.isInteger(error.suggestionIndex) ? error.suggestionIndex : null,
                    originalName: error.originalName || interpretation?.subjectName || null
                }
            } : {})
        });
    }
    });
    return router;
}

const router = createAskRouter();

module.exports = { applyConfirmedInterpretation, applyFollowUpInterpretation, askOptions, createAskRouter, mentionedSeries, router };
