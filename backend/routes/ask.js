const express = require('express');
const { availablePointsSystems, executeAskQuery } = require('../ask-engine');
const { interpretQuestion } = require('../ask-interpreter');
const { MemoryRateLimiter } = require('../rate-limit');
const { withConnection } = require('../route-helpers');

const router = express.Router();
const limiter = new MemoryRateLimiter({ windowMs: 5 * 60 * 1000, limit: 20, maxEntries: 5000 });

function askOptions() {
    return { pointsSystems: availablePointsSystems() };
}

function optionalYear(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1950 && number <= 2100 ? number : null;
}

function applyConfirmedInterpretation(interpreted, requested) {
    if (!requested || typeof requested !== 'object') return interpreted;
    const entity = ['drivers', 'constructors'].includes(requested.entity) ? requested.entity : interpreted.entity;
    const detectedIntent = interpreted.detectedIntent || interpreted.intent;
    const requestedComparison = Array.isArray(requested.comparisonPointsSystemYears)
        ? requested.comparisonPointsSystemYears.map(optionalYear).filter(Boolean)
        : [optionalYear(requested.comparisonPointsSystemYearA), optionalYear(requested.comparisonPointsSystemYearB)].filter(Boolean);
    const comparisonPointsSystemYears = requestedComparison.length
        ? [...new Set(requestedComparison)]
        : interpreted.comparisonPointsSystemYears || [];
    const pointsSystemYear = detectedIntent === 'compare_points_systems'
        ? comparisonPointsSystemYears[0] || interpreted.pointsSystemYear
        : optionalYear(requested.pointsSystemYear) || interpreted.pointsSystemYear;
    const targetSeason = optionalYear(requested.targetSeason) || interpreted.targetSeason;
    const subjectName = String(requested.subjectName || interpreted.subjectName || '').trim() || null;
    const ready = entity !== null || ['recalculate_entity_titles', 'compare_points_systems'].includes(detectedIntent);
    const rulesReady = detectedIntent === 'compare_points_systems' ? comparisonPointsSystemYears.length >= 2 : Boolean(pointsSystemYear);
    return {
        ...interpreted,
        intent: ready && rulesReady && detectedIntent ? detectedIntent : 'unsupported',
        detectedIntent,
        entity,
        pointsSystemYear,
        comparisonPointsSystemYears,
        targetSeason,
        subjectName,
        fromYear: optionalYear(requested.fromYear),
        toYear: optionalYear(requested.toYear),
        confidence: 'confirmed',
        ambiguousFields: [],
        missingFields: rulesReady ? [] : [detectedIntent === 'compare_points_systems' ? 'comparisonPointsSystemYears' : 'pointsSystemYear'],
        reason: rulesReady ? 'Confirmed by the user.' : interpreted.reason
    };
}

function supportedResponse(res, interpretation, message) {
    return res.status(422).json({
        error: message || interpretation.reason,
        interpretation,
        options: askOptions(),
        examples: [
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
    if (query.length < 8 || query.length > 300) {
        return res.status(400).json({ error: 'Enter a question between 8 and 300 characters.' });
    }
    let interpretation;
    try {
        interpretation = applyConfirmedInterpretation(interpretQuestion(query), req.body?.interpretation);
        const supportedIntents = new Set([
            'recalculate_title_counts',
            'recalculate_season_champion',
            'recalculate_entity_titles',
            'list_changed_championships',
            'compare_points_systems'
        ]);
        if (!supportedIntents.has(interpretation.intent)) return supportedResponse(res, interpretation);
        const result = await withConnection(connection => executeAskQuery(connection, interpretation));
        res.json({
            query,
            interpretation: {
                intent: interpretation.intent,
                series: 'Formula 1',
                entity: result.entity,
                entityLabel: result.entityLabel,
                pointsSystemYear: interpretation.pointsSystemYear,
                comparisonPointsSystemYears: interpretation.comparisonPointsSystemYears,
                targetSeason: interpretation.targetSeason,
                subjectName: interpretation.subjectName,
                fromYear: interpretation.fromYear,
                toYear: interpretation.toYear,
                confidence: interpretation.confidence
            },
            options: askOptions(),
            ...result
        });
    } catch (error) {
        if (!error.statusCode) console.error(`Ask Racelytic failed: ${error.message}`);
        res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Racelytic could not calculate that answer right now.',
            ...(error.statusCode ? { interpretation, options: askOptions(), suggestions: error.suggestions || [] } : {})
        });
    }
});

module.exports = { router };
