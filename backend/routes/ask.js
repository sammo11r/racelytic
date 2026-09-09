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
    const candidate = {
        ...interpreted,
        detectedIntent,
        entity,
        pointsSystemYear,
        comparisonPointsSystemYears,
        targetSeason,
        subjectName,
        constructorName,
        circuitName: confirmedName('circuitName'),
        nationalityName: confirmedName('nationalityName'),
        raceFormat,
        resultLimit: Object.hasOwn(requested, 'resultLimit') ? optionalLimit(requested.resultLimit) : interpreted.resultLimit || null,
        recordCategory,
        fromYear: confirmedYear('fromYear'),
        toYear: confirmedYear('toYear'),
        confidence: 'confirmed',
        ambiguousFields: [],
        missingFields: []
    };
    const missingFields = missingRequiredSlots(detectedIntent, candidate);
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
    const followUp = /^(?:and\b|now\b|only\b|instead\b|what\s+about\b|how\s+about\b|show\b|make\s+that\b)/i.test(String(query || '').trim());
    if (!followUp || !supportedIntentIds().has(context.intent)) return interpreted;
    const entityChanged = interpreted.entityExplicit && interpreted.entity && interpreted.entity !== context.entity;
    const value = (field, fallback = null) => interpreted[field] !== null && interpreted[field] !== undefined && interpreted[field] !== ''
        ? interpreted[field] : context[field] ?? fallback;
    const detectedIntent = interpreted.detectedIntent || context.intent;
    const candidate = {
        ...context,
        ...interpreted,
        intent: detectedIntent,
        detectedIntent,
        entity: interpreted.entityExplicit ? interpreted.entity : context.entity,
        recordCategory: value('recordCategory'),
        subjectName: entityChanged ? null : value('subjectName'),
        constructorName: entityChanged ? null : value('constructorName'),
        circuitName: value('circuitName'),
        nationalityName: value('nationalityName'),
        raceFormat: value('raceFormat'),
        resultLimit: value('resultLimit'),
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
                return {
                    teams: teams.map(row => row.name).filter(Boolean),
                    circuits: circuits.map(row => row.name).filter(Boolean),
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
        if (isJuniorSeries(series) && !['record_leader', 'record_subject_total'].includes(interpretation.intent)) {
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
        res.json({
            query,
            interpretation: {
                intent: interpretation.intent,
                series: SERIES[series].name,
                entity: result.entity,
                entityLabel: result.entityLabel,
                pointsSystemYear: interpretation.pointsSystemYear,
                comparisonPointsSystemYears: interpretation.comparisonPointsSystemYears,
                targetSeason: interpretation.targetSeason,
                subjectName: interpretation.subjectName,
                constructorName: interpretation.constructorName,
                circuitName: interpretation.circuitName,
                nationalityName: interpretation.nationalityName,
                raceFormat: interpretation.raceFormat,
                resultLimit: interpretation.resultLimit,
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
            ...(error.statusCode ? { interpretation, options: askOptions(series), suggestions: error.suggestions || [] } : {})
        });
    }
    });
    return router;
}

const router = createAskRouter();

module.exports = { applyConfirmedInterpretation, applyFollowUpInterpretation, askOptions, createAskRouter, mentionedSeries, router };
