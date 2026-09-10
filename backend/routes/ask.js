const express = require('express');
const { availablePointsSystems, executeAskQuery, nationalityOptions } = require('../ask-engine');
const { interpretQuestion, pointsSystemExists } = require('../ask-interpreter');
const { MemoryRateLimiter } = require('../rate-limit');
const { withConnection } = require('../route-helpers');
const { RECORD_CATEGORIES, intentDefinition, isRecordCategory, missingRequiredSlots, supportedIntentIds } = require('../ask-intents');
const { isJuniorSeries, normaliseSeries, seriesPrefix } = require('../series-config');
const { all: SERIES } = require('../../frontend/js/series-config');

function askOptions(series = 'f1') {
    return {
        pointsSystems: isJuniorSeries(series) ? [] : availablePointsSystems(),
        recordCategories: RECORD_CATEGORIES
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

function optionalRound(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 100 ? number : null;
}

function assertRequestedScopesApplied(interpretation, result) {
    const scope = result.scope || {};
    const filters = result.comparison?.filters || {};
    const inferredLocation = interpretation.confidence !== 'confirmed';
    const checks = [
        ['constructorName', Boolean(result.constructorFilter || filters.constructor)],
        ['circuitName', Boolean(scope.circuit || filters.circuit || inferredLocation && (scope.venueCountry || filters.venueCountry))],
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
        eventName: confirmedName('eventName'),
        resultView: Object.hasOwn(requested, 'resultView') && resultViews.has(requested.resultView) ? requested.resultView : interpreted.resultView || null,
        standingRound: Object.hasOwn(requested, 'standingRound') ? optionalRound(requested.standingRound) : interpreted.standingRound || null,
        comparisonScope: Object.hasOwn(requested, 'comparisonScope') && comparisonScopes.has(requested.comparisonScope) ? requested.comparisonScope : interpreted.comparisonScope || null,
        comparisonMetric: Object.hasOwn(requested, 'comparisonMetric') && comparisonMetrics.has(requested.comparisonMetric) ? requested.comparisonMetric : interpreted.comparisonMetric || null,
        streakCategory: Object.hasOwn(requested, 'streakCategory') && streakCategories.has(requested.streakCategory) ? requested.streakCategory : interpreted.streakCategory || null,
        constructorName,
        circuitName: confirmedName('circuitName'),
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
    const systemsAvailable = detectedIntent === 'compare_points_systems'
        ? comparisonPointsSystemYears.length >= 2 && comparisonPointsSystemYears.every(pointsSystemExists)
        : !detectedIntent || !detectedIntent.startsWith('recalculate_') && detectedIntent !== 'list_changed_championships'
            ? true
            : pointsSystemExists(pointsSystemYear);
    const ready = detectedIntent && !missingFields.length && systemsAvailable && !interpreted.unsupportedQualifiers?.length;
    return {
        ...candidate,
        intent: ready ? detectedIntent : 'unsupported',
        missingFields,
        reason: ready ? 'Confirmed by the user.' : interpreted.reason
    };
}

function mentionedSeries(query) {
    const text = String(query || '').toLowerCase();
    if (/\bf1\s+academy\b|\bformula\s+1\s+academy\b/.test(text)) return 'academy';
    if (/\b(?:formula\s*3|f3)\b/.test(text)) return 'f3';
    if (/\b(?:formula\s*2|f2)\b/.test(text)) return 'f2';
    if (/\b(?:formula\s*1|f1)\b/.test(text)) return 'f1';
    return null;
}

function applyFollowUpInterpretation(interpreted, context, query) {
    if (!context || typeof context !== 'object') return interpreted;
    const text = String(query || '').trim();
    const followUp = /^(?:and\b|now\b|only\b|instead\b|what\s+about\b|how\s+about\b|show\b|make\s+that\b|at\b|in\b|with\b|without\b|from\b|since\b|through\b|until\b|between\b|as\s+team-?mates?\b|career\b|shared\b)/i.test(text);
    if (!followUp || !supportedIntentIds().has(context.intent)) return interpreted;
    const subjectReplacement = text.match(/^(?:what|how)\s+about\s+(.+?)[?.!]*$/i)?.[1]?.trim() || null;
    const entityChanged = interpreted.entityExplicit && interpreted.entity && interpreted.entity !== context.entity;
    const value = (field, fallback = null) => interpreted[field] !== null && interpreted[field] !== undefined && interpreted[field] !== ''
        ? interpreted[field] : context[field] ?? fallback;
    let detectedIntent = ['driver_head_to_head', 'constructor_head_to_head'].includes(context.intent) && !(interpreted.subjectNames || []).length
        ? context.intent : interpreted.detectedIntent || context.intent;
    if (subjectReplacement && context.intent === 'record_leader') detectedIntent = 'record_subject_total';
    let subjectNames = Array.isArray(interpreted.subjectNames) && interpreted.subjectNames.length
        ? interpreted.subjectNames : context.subjectNames || [];
    if (subjectReplacement && ['driver_head_to_head', 'constructor_head_to_head'].includes(context.intent)) {
        subjectNames = [...(context.subjectNames || [])];
        subjectNames[1] = subjectReplacement;
    }
    const requestedScope = /\b(?:as\s+)?team-?mates?\b|\bsame\s+team\b/i.test(text) ? 'teammates'
        : /\bshared\s+races?\b/i.test(text) ? 'shared'
        : /\bcareer\b|\ball[- ]time\b/i.test(text) ? 'career' : null;
    const requestedView = /\bfull\s+classification\b|\bfull\s+results?\b/i.test(text) ? 'classification'
        : /\bpodium\b/i.test(text) ? 'podium' : null;
    const candidate = {
        ...context,
        ...interpreted,
        intent: detectedIntent,
        detectedIntent,
        entity: interpreted.entityExplicit ? interpreted.entity : context.entity,
        recordCategory: value('recordCategory'),
        subjectName: entityChanged ? null : subjectReplacement && ['record_leader', 'record_subject_total', 'race_result'].includes(context.intent)
            ? subjectReplacement : value('subjectName'),
        constructorName: entityChanged ? null : value('constructorName'),
        circuitName: interpreted.venueCountryName ? null : value('circuitName'),
        venueCountryName: interpreted.circuitName ? null : value('venueCountryName'),
        nationalityName: value('nationalityName'),
        raceFormat: value('raceFormat'),
        resultLimit: value('resultLimit'),
        minStarts: value('minStarts'),
        targetSeason: value('targetSeason'),
        eventName: value('eventName'),
        resultView: subjectReplacement && context.intent === 'race_result' ? 'driver' : requestedView || value('resultView'),
        standingRound: /\bfinal\s+standings?\b/i.test(text) ? null : value('standingRound'),
        subjectNames,
        comparisonScope: requestedScope || value('comparisonScope'),
        comparisonMetric: value('comparisonMetric'),
        streakCategory: value('streakCategory'),
        fromYear: /\ball[- ]time\b/i.test(query) ? null : value('fromYear'),
        toYear: /\ball[- ]time\b/i.test(query) ? null : value('toYear'),
        confidence: 'contextual',
        ambiguousFields: [],
        unsupportedQualifiers: interpreted.unsupportedQualifiers || []
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
    limiter = new MemoryRateLimiter({ windowMs: 5 * 60 * 1000, limit: 20, maxEntries: 5000 })
} = {}) {
    const router = express.Router();
    router.get('/api/ask/options', async (req, res) => {
        const series = normaliseSeries(req.query?.series);
        const prefix = seriesPrefix(series);
        try {
            const options = await connect(async connection => {
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
    if (query.length < 8 || query.length > 300) {
        return res.status(400).json({ error: 'Enter a question between 8 and 300 characters.' });
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
        const contextual = applyFollowUpInterpretation({ ...interpret(query), series }, req.body?.context, query);
        interpretation = applyConfirmedInterpretation(contextual, req.body?.interpretation);
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
        const result = await connect(connection => execute(connection, interpretation));
        assertRequestedScopesApplied(interpretation, result);
        res.json({
            query,
            interpretation: {
                intent: result.intent || interpretation.intent,
                series: SERIES[series].name,
                entity: result.entity,
                entityLabel: result.entityLabel,
                pointsSystemYear: interpretation.pointsSystemYear,
                comparisonPointsSystemYears: interpretation.comparisonPointsSystemYears,
                targetSeason: interpretation.targetSeason,
                subjectName: interpretation.subjectName,
                subjectNames: interpretation.subjectNames,
                eventName: interpretation.eventName,
                resultView: interpretation.resultView,
                standingRound: interpretation.standingRound,
                comparisonScope: result.comparison?.scope || interpretation.comparisonScope,
                comparisonMetric: result.comparison?.metric || interpretation.comparisonMetric,
                streakCategory: interpretation.streakCategory,
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
                confidence: interpretation.confidence
            },
            options: askOptions(series),
            ...result
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
