const { calculateRatings, configuration, DEFAULT_CONFIGURATION, eventBaseWeight } = require('./rating-engine');
const { evaluateRatings } = require('./rating-evaluation');

function candidateGrid(base = DEFAULT_CONFIGURATION, grid = {}) {
    const scales = grid.eloScales || [300, 400, 500];
    const multipliers = grid.kMultipliers || [.75, 1, 1.25];
    const sprintWeights = grid.sprintWeights || [.5, .75, 1];
    const kSmoothings = grid.kSmoothings || [base.kSmoothing];
    const candidates = [];
    for (const eloScale of scales) {
        for (const kMultiplier of multipliers) {
            for (const sprintWeight of sprintWeights) {
                for (const kSmoothing of kSmoothings) {
                    candidates.push({
                        id: `scale-${eloScale}_k-${kMultiplier}_smooth-${kSmoothing}_sprint-${sprintWeight}`,
                        configuration: configuration({ ...base, eloScale, sprintWeight, kSmoothing,
                            provisionalK: base.provisionalK * kMultiplier,
                            developingK: base.developingK * kMultiplier,
                            establishedK: base.establishedK * kMultiplier })
                    });
                }
            }
        }
    }
    return candidates;
}

function retirementCandidateGrid(base = DEFAULT_CONFIGURATION, grid = {}) {
    const floors = grid.retirementFloors || [.05, .15, .3];
    const exponents = grid.retirementExponents || [.5, 1, 1.5];
    return floors.flatMap(retirementFloor => exponents.map(retirementExponent => ({
        id: `retirement-floor-${retirementFloor}_exponent-${retirementExponent}`,
        configuration: configuration({ ...base, retirementFloor, retirementExponent })
    })));
}

function inactivityCandidateGrid(base = DEFAULT_CONFIGURATION, grid = {}) {
    const boosts = grid.returnKBoosts || [0, .25, .5, 1, 1.5, 2];
    const halfLives = grid.returnKHalfLifeYears || [.1, .25, .5, 1, 2, 5, 10];
    const candidates = [];
    for (const returnKBoost of boosts) {
        const values = returnKBoost === 0 ? [base.returnKHalfLifeYears] : halfLives;
        for (const returnKHalfLifeYears of values) candidates.push({
            id: `return-boost-${returnKBoost}_half-life-${returnKHalfLifeYears}`,
            configuration: configuration({ ...base, returnKBoost, returnKHalfLifeYears })
        });
    }
    return candidates;
}

function dynamicsCandidateGrid(base = DEFAULT_CONFIGURATION, grid = {}) {
    const individualWeights = grid.individualKWeights || [0, .5, 1];
    const centerings = grid.eventCenterings || [0, 1];
    return individualWeights.flatMap(individualKWeight => centerings.map(eventCentering => ({
        id: `individual-k-${individualKWeight}_centering-${eventCentering}`,
        configuration: configuration({ ...base, individualKWeight, eventCentering })
    })));
}

function uncertaintyCandidateGrid(base = DEFAULT_CONFIGURATION, grid = {}) {
    const halfLives = grid.evidenceHalfLifeYears || [1.5, 3, 5];
    const initialValues = grid.initialUncertainties || [220, 260, 300];
    const minimumValues = grid.minimumUncertainties || [35, 45, 55];
    const predictionWeights = grid.uncertaintyPredictionWeights || [.5, 1, 2];
    const candidates = [];
    for (const evidenceHalfLifeYears of halfLives) for (const initialUncertainty of initialValues) {
        for (const minimumUncertainty of minimumValues) for (const uncertaintyPredictionWeight of predictionWeights) {
            candidates.push({
                id: `half-life-${evidenceHalfLifeYears}_initial-${initialUncertainty}_minimum-${minimumUncertainty}_prediction-${uncertaintyPredictionWeight}`,
                configuration: configuration({ ...base, evidenceHalfLifeYears, initialUncertainty,
                    minimumUncertainty, uncertaintyPredictionWeight })
            });
        }
    }
    return candidates;
}

function configuredEvents(events, config) {
    return events.map(event => {
        const sourceBase = eventBaseWeight(event.sessionType, DEFAULT_CONFIGURATION);
        const targetBase = eventBaseWeight(event.sessionType, config);
        const suppliedWeight = event.weight == null ? sourceBase : Number(event.weight);
        const sourceWeight = Number.isFinite(suppliedWeight) ? suppliedWeight : sourceBase;
        return { ...event, weight: sourceBase ? sourceWeight / sourceBase * targetBase : targetBase };
    });
}

function candidateResult(events, candidate, ranges) {
    const result = calculateRatings(configuredEvents(events, candidate.configuration), {
        ...candidate.configuration, collectComparisons: true
    });
    return Object.fromEntries(Object.entries(ranges).map(([name, range]) => [name, evaluateRatings(result, range)]));
}

function score(evaluation) {
    return {
        events: evaluation.events,
        comparisons: evaluation.pairwise.comparisons,
        accuracy: evaluation.pairwise.accuracy,
        brier: evaluation.pairwise.brierScore,
        logLoss: evaluation.pairwise.logLoss,
        eventBrier: evaluation.eventNormalized.brierScore,
        eventLogLoss: evaluation.eventNormalized.logLoss,
        poolDrift: evaluation.pool.meanAbsoluteEventDrift,
        positionPredictions: evaluation.positions.predictions,
        positionMAE: evaluation.positions.meanAbsoluteError
    };
}

function uncertaintyScore(evaluation) {
    const cohorts = Object.fromEntries(evaluation.uncertainty.cohorts.map(cohort => [cohort.name, {
        comparisons: cohort.comparisons, brier: cohort.brierScore, logLoss: cohort.logLoss
    }]));
    return {
        comparisons: evaluation.uncertainty.adjustedPairwise.comparisons,
        brier: evaluation.uncertainty.adjustedPairwise.brierScore,
        logLoss: evaluation.uncertainty.adjustedPairwise.logLoss,
        unadjustedBrier: evaluation.pairwise.brierScore,
        unadjustedLogLoss: evaluation.pairwise.logLoss,
        cohorts
    };
}

function aggregate(scores) {
    const comparisonTotal = scores.reduce((sum, item) => sum + item.comparisons, 0);
    const eventTotal = scores.reduce((sum, item) => sum + item.events, 0);
    const positionTotal = scores.reduce((sum, item) => sum + item.positionPredictions, 0);
    const weighted = key => comparisonTotal
        ? scores.reduce((sum, item) => sum + item[key] * item.comparisons, 0) / comparisonTotal : 0;
    const eventWeighted = key => eventTotal
        ? scores.reduce((sum, item) => sum + item[key] * item.events, 0) / eventTotal : 0;
    return {
        folds: scores.length,
        events: eventTotal,
        comparisons: comparisonTotal,
        accuracy: Number(weighted('accuracy').toFixed(6)),
        brier: Number(weighted('brier').toFixed(6)),
        logLoss: Number(weighted('logLoss').toFixed(6)),
        eventBrier: Number(eventWeighted('eventBrier').toFixed(6)),
        eventLogLoss: Number(eventWeighted('eventLogLoss').toFixed(6)),
        positionMAE: positionTotal ? Number((scores.reduce((sum, item) => sum + item.positionMAE * item.positionPredictions, 0) / positionTotal).toFixed(3)) : 0,
        poolDrift: scores.length ? Number((scores.reduce((sum, item) => sum + (Number(item.poolDrift) || 0), 0) / scores.length).toFixed(4)) : 0
    };
}

function aggregateUncertainty(scores) {
    const comparisons = scores.reduce((sum, item) => sum + item.comparisons, 0);
    const weighted = key => comparisons
        ? scores.reduce((sum, item) => sum + item[key] * item.comparisons, 0) / comparisons : 0;
    const cohorts = Object.fromEntries(['stable', 'measured', 'provisional'].map(name => {
        const total = scores.reduce((sum, item) => sum + (item.cohorts[name]?.comparisons || 0), 0);
        const metric = key => total ? scores.reduce((sum, item) => {
            const cohort = item.cohorts[name];
            return sum + (cohort?.[key] || 0) * (cohort?.comparisons || 0);
        }, 0) / total : 0;
        return [name, { comparisons: total, brier: Number(metric('brier').toFixed(6)),
            logLoss: Number(metric('logLoss').toFixed(6)) }];
    }));
    return { folds: scores.length, comparisons, brier: Number(weighted('brier').toFixed(6)),
        logLoss: Number(weighted('logLoss').toFixed(6)),
        unadjustedBrier: Number(weighted('unadjustedBrier').toFixed(6)),
        unadjustedLogLoss: Number(weighted('unadjustedLogLoss').toFixed(6)), cohorts };
}

function rollingUncertaintyCalibration(events, options) {
    if (!Array.isArray(options.folds) || !options.folds.length) throw new Error('At least one rolling validation fold is required.');
    const candidates = options.candidates || uncertaintyCandidateGrid(options.baseConfiguration, options.grid);
    const ranges = Object.fromEntries(options.folds.map((fold, index) => [`fold${index}`, {
        fromYear: fold.validationFromYear, toYear: fold.validationToYear
    }]));
    const evaluated = candidates.map(candidate => {
        const result = candidateResult(events, candidate, ranges);
        const folds = options.folds.map((fold, index) => ({ ...fold, ...uncertaintyScore(result[`fold${index}`]) }));
        return { id: candidate.id, configuration: candidate.configuration, folds, aggregate: aggregateUncertainty(folds) };
    }).sort((a, b) => a.aggregate.brier - b.aggregate.brier || a.aggregate.logLoss - b.aggregate.logLoss);
    const published = evaluated.find(candidate => candidate.configuration.evidenceHalfLifeYears === DEFAULT_CONFIGURATION.evidenceHalfLifeYears
        && candidate.configuration.initialUncertainty === DEFAULT_CONFIGURATION.initialUncertainty
        && candidate.configuration.minimumUncertainty === DEFAULT_CONFIGURATION.minimumUncertainty
        && candidate.configuration.uncertaintyPredictionWeight === DEFAULT_CONFIGURATION.uncertaintyPredictionWeight);
    if (!published) throw new Error('The uncertainty grid must include the published configuration.');
    const bestCandidate = evaluated[0];
    const improvesUnadjusted = bestCandidate.aggregate.brier < bestCandidate.aggregate.unadjustedBrier
        && bestCandidate.aggregate.logLoss < bestCandidate.aggregate.unadjustedLogLoss;
    const selected = improvesUnadjusted ? bestCandidate : published;
    return { candidates: evaluated.length, folds: options.folds, selected, bestCandidate, published,
        probabilityAdjustmentRecommended: improvesUnadjusted,
        delta: { brier: Number((bestCandidate.aggregate.unadjustedBrier - bestCandidate.aggregate.brier).toFixed(6)),
            logLoss: Number((bestCandidate.aggregate.unadjustedLogLoss - bestCandidate.aggregate.logLoss).toFixed(6)) },
        runnersUp: evaluated.slice(1, 5).map(candidate => ({ id: candidate.id, configuration: candidate.configuration,
            aggregate: candidate.aggregate })) };
}

function rollingCalibration(events, options) {
    if (!Array.isArray(options.folds) || !options.folds.length) throw new Error('At least one rolling validation fold is required.');
    const candidates = options.candidates || candidateGrid(options.baseConfiguration, options.grid);
    const evaluated = candidates.map(candidate => {
        const ranges = Object.fromEntries(options.folds.map((fold, index) => [`fold${index}`, {
            fromYear: fold.validationFromYear, toYear: fold.validationToYear
        }]));
        const result = candidateResult(events, candidate, ranges);
        const folds = options.folds.map((fold, index) => ({ ...fold, ...score(result[`fold${index}`]) }));
        return { id: candidate.id, configuration: candidate.configuration, folds, aggregate: aggregate(folds) };
    });
    if (evaluated.some(candidate => candidate.folds.some(fold => !fold.comparisons))) {
        throw new Error('Every rolling validation fold must contain results.');
    }
    evaluated.sort((a, b) => a.aggregate.brier - b.aggregate.brier || a.aggregate.logLoss - b.aggregate.logLoss);
    const published = evaluated.find(candidate => candidate.configuration.eloScale === DEFAULT_CONFIGURATION.eloScale
        && candidate.configuration.provisionalK === DEFAULT_CONFIGURATION.provisionalK
        && candidate.configuration.sprintWeight === DEFAULT_CONFIGURATION.sprintWeight
        && candidate.configuration.kSmoothing === DEFAULT_CONFIGURATION.kSmoothing
        && candidate.configuration.retirementFloor === DEFAULT_CONFIGURATION.retirementFloor
        && candidate.configuration.retirementExponent === DEFAULT_CONFIGURATION.retirementExponent
        && candidate.configuration.returnKBoost === DEFAULT_CONFIGURATION.returnKBoost
        && candidate.configuration.individualKWeight === DEFAULT_CONFIGURATION.individualKWeight
        && candidate.configuration.eventCentering === DEFAULT_CONFIGURATION.eventCentering);
    if (!published) throw new Error('The rolling grid must include the published configuration.');
    const bestCandidate = evaluated[0];
    const eventSelected = [...evaluated].sort((a, b) => a.aggregate.eventBrier - b.aggregate.eventBrier
        || a.aggregate.eventLogLoss - b.aggregate.eventLogLoss)[0];
    const selected = bestCandidate.aggregate.brier === published.aggregate.brier
        && bestCandidate.aggregate.logLoss === published.aggregate.logLoss ? published : bestCandidate;
    const foldWins = selected.folds.filter((fold, index) => fold.brier < published.folds[index].brier
        && fold.logLoss < published.folds[index].logLoss).length;
    const grid = options.grid || {};
    const boundary = (values, value) => Array.isArray(values) && values.length > 1
        && (value === Math.min(...values) || value === Math.max(...values));
    const multiplier = selected.configuration.provisionalK / DEFAULT_CONFIGURATION.provisionalK;
    const aggregateDelta = {
        brier: Number((published.aggregate.brier - selected.aggregate.brier).toFixed(6)),
        logLoss: Number((published.aggregate.logLoss - selected.aggregate.logLoss).toFixed(6)),
        eventBrier: Number((published.aggregate.eventBrier - selected.aggregate.eventBrier).toFixed(6)),
        eventLogLoss: Number((published.aggregate.eventLogLoss - selected.aggregate.eventLogLoss).toFixed(6)),
        positionMAE: Number((published.aggregate.positionMAE - selected.aggregate.positionMAE).toFixed(3))
    };
    const minimumImprovement = { brier: .0005, eventBrier: .0005, ...(options.minimumImprovement || {}) };
    return {
        candidates: evaluated.length,
        folds: options.folds,
        selected,
        eventSelected,
        objectivesAgree: selected.id === eventSelected.id,
        published,
        foldWins,
        consistent: foldWins === options.folds.length,
        minimumImprovement,
        meetsMinimumImprovement: aggregateDelta.brier >= minimumImprovement.brier
            && aggregateDelta.eventBrier >= minimumImprovement.eventBrier,
        boundary: {
            eloScale: boundary(grid.eloScales, selected.configuration.eloScale),
            kMultiplier: boundary(grid.kMultipliers, multiplier),
            sprintWeight: boundary(grid.sprintWeights, selected.configuration.sprintWeight),
            kSmoothing: boundary(grid.kSmoothings, selected.configuration.kSmoothing),
            retirementFloor: boundary(grid.retirementFloors, selected.configuration.retirementFloor),
            retirementExponent: boundary(grid.retirementExponents, selected.configuration.retirementExponent),
            returnKBoost: boundary(grid.returnKBoosts, selected.configuration.returnKBoost),
            returnKHalfLifeYears: boundary(grid.returnKHalfLifeYears, selected.configuration.returnKHalfLifeYears),
            individualKWeight: boundary(grid.individualKWeights, selected.configuration.individualKWeight),
            eventCentering: boundary(grid.eventCenterings, selected.configuration.eventCentering)
        },
        aggregateDelta,
        runnersUp: evaluated.slice(1, 5).map(candidate => ({ id: candidate.id, configuration: candidate.configuration, aggregate: candidate.aggregate }))
    };
}

function holdoutCalibration(events, options) {
    const holdoutYear = Number(options.holdoutYear);
    if (!Number.isInteger(holdoutYear)) throw new Error('A holdout year is required.');
    const candidates = options.candidates || candidateGrid(options.baseConfiguration);
    const ranges = {
        tuning: { fromYear: options.tuningFromYear, toYear: holdoutYear - 1 },
        holdout: { fromYear: holdoutYear, toYear: options.toYear }
    };
    const evaluated = candidates.map(candidate => {
        const result = candidateResult(events, candidate, ranges);
        return { id: candidate.id, configuration: candidate.configuration,
            tuning: score(result.tuning), holdout: score(result.holdout) };
    });
    if (evaluated.some(candidate => !candidate.tuning.comparisons || !candidate.holdout.comparisons)) {
        throw new Error('The tuning and holdout ranges must both contain results.');
    }
    evaluated.sort((a, b) => a.tuning.brier - b.tuning.brier || a.tuning.logLoss - b.tuning.logLoss);
    const defaultCandidate = evaluated.find(candidate => candidate.configuration.eloScale === DEFAULT_CONFIGURATION.eloScale
        && candidate.configuration.provisionalK === DEFAULT_CONFIGURATION.provisionalK
        && candidate.configuration.sprintWeight === DEFAULT_CONFIGURATION.sprintWeight
        && candidate.configuration.kSmoothing === DEFAULT_CONFIGURATION.kSmoothing
        && candidate.configuration.retirementFloor === DEFAULT_CONFIGURATION.retirementFloor
        && candidate.configuration.retirementExponent === DEFAULT_CONFIGURATION.retirementExponent
        && candidate.configuration.returnKBoost === DEFAULT_CONFIGURATION.returnKBoost
        && candidate.configuration.individualKWeight === DEFAULT_CONFIGURATION.individualKWeight
        && candidate.configuration.eventCentering === DEFAULT_CONFIGURATION.eventCentering);
    const selected = evaluated[0];
    const eventSelected = [...evaluated].sort((a, b) => a.tuning.eventBrier - b.tuning.eventBrier
        || a.tuning.eventLogLoss - b.tuning.eventLogLoss)[0];
    const holdoutOrder = [...evaluated].sort((a, b) => a.holdout.brier - b.holdout.brier || a.holdout.logLoss - b.holdout.logLoss);
    const holdoutDelta = {
        brier: Number((defaultCandidate.holdout.brier - selected.holdout.brier).toFixed(6)),
        logLoss: Number((defaultCandidate.holdout.logLoss - selected.holdout.logLoss).toFixed(6)),
        eventBrier: Number((defaultCandidate.holdout.eventBrier - selected.holdout.eventBrier).toFixed(6)),
        eventLogLoss: Number((defaultCandidate.holdout.eventLogLoss - selected.holdout.eventLogLoss).toFixed(6)),
        positionMAE: Number((defaultCandidate.holdout.positionMAE - selected.holdout.positionMAE).toFixed(3))
    };
    const minimumImprovement = { brier: .0005, eventBrier: .0005, ...(options.minimumImprovement || {}) };
    return {
        split: { tuningFromYear: Number(options.tuningFromYear) || null, tuningToYear: holdoutYear - 1,
            holdoutFromYear: holdoutYear, holdoutToYear: Number(options.toYear) || null },
        candidates: evaluated.length,
        selected,
        eventSelected,
        objectivesAgree: selected.id === eventSelected.id,
        published: defaultCandidate,
        holdoutRank: holdoutOrder.findIndex(candidate => candidate.id === selected.id) + 1,
        holdoutDelta,
        minimumImprovement,
        meetsMinimumImprovement: holdoutDelta.brier >= minimumImprovement.brier
            && holdoutDelta.eventBrier >= minimumImprovement.eventBrier,
        generalizes: selected.holdout.brier < defaultCandidate.holdout.brier
            && selected.holdout.logLoss < defaultCandidate.holdout.logLoss,
        bestOnHoldout: holdoutOrder.slice(0, 3)
    };
}

function promotionDecision(rolling, holdout) {
    const reasons = [];
    const expandableBoundaries = ['kMultiplier', 'sprintWeight', 'retirementExponent', 'returnKBoost', 'returnKHalfLifeYears']
        .filter(name => rolling.boundary?.[name]);
    if (!rolling.objectivesAgree) reasons.push('rolling-objectives-disagree');
    if (!rolling.consistent) reasons.push('rolling-folds-inconsistent');
    if (!rolling.meetsMinimumImprovement) reasons.push('rolling-improvement-below-threshold');
    if (expandableBoundaries.length) reasons.push(`search-boundary:${expandableBoundaries.join(',')}`);
    if (!holdout.objectivesAgree) reasons.push('holdout-objectives-disagree');
    if (!holdout.generalizes) reasons.push('holdout-does-not-generalize');
    if (!holdout.meetsMinimumImprovement) reasons.push('holdout-improvement-below-threshold');
    if (rolling.selected.id !== holdout.selected.id) reasons.push('rolling-holdout-selection-differs');
    return { recommended: reasons.length === 0, reasons,
        rollingCandidate: rolling.selected.id, holdoutCandidate: holdout.selected.id };
}

module.exports = { aggregate, aggregateUncertainty, candidateGrid, candidateResult, configuredEvents,
    dynamicsCandidateGrid, holdoutCalibration, inactivityCandidateGrid, promotionDecision, retirementCandidateGrid,
    rollingCalibration, rollingUncertaintyCalibration, score, uncertaintyCandidateGrid, uncertaintyScore };
