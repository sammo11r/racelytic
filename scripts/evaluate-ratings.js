const pool = require('../backend/db');
const { loadRatingEvents } = require('../backend/rating-data');
const { calculateRatings, configuration, MODEL_VERSION } = require('../backend/rating-engine');
const { comparisonMetrics, evaluateRatings, eventNormalizedMetrics, pairedBootstrapDelta } = require('../backend/rating-evaluation');
const { teammateEvents } = require('../backend/rating-models');
const { calculateJointRatings, competitiveControl, jointRateCandidates, jointStructureCandidates,
    nestedJointValidation, validateJointAllocation } = require('../backend/joint-rating-model');
const { candidateGrid, configuredEvents, dynamicsCandidateGrid, holdoutCalibration, rollingCalibration,
    inactivityCandidateGrid, promotionDecision, retirementCandidateGrid,
    rollingUncertaintyCalibration } = require('../backend/rating-calibration');
const { ensureRatingsSchema } = require('../backend/ratings');

const SERIES = ['f1', 'f2', 'f3', 'academy'];
const HOLDOUT_SPLITS = Object.freeze({
    f1: { tuningFromYear: 2000, holdoutYear: 2022 },
    f2: { tuningFromYear: 2017, holdoutYear: 2023 },
    f3: { tuningFromYear: 2019, holdoutYear: 2023 },
    academy: { tuningFromYear: 2023, holdoutYear: 2025 }
});
const ROLLING_FOLDS = Object.freeze({
    f1: [
        { tuningToYear: 2013, validationFromYear: 2014, validationToYear: 2017 },
        { tuningToYear: 2017, validationFromYear: 2018, validationToYear: 2021 },
        { tuningToYear: 2021, validationFromYear: 2022, validationToYear: 2026 }
    ],
    f2: [
        { tuningToYear: 2019, validationFromYear: 2020, validationToYear: 2021 },
        { tuningToYear: 2021, validationFromYear: 2022, validationToYear: 2023 },
        { tuningToYear: 2023, validationFromYear: 2024, validationToYear: 2026 }
    ],
    f3: [
        { tuningToYear: 2020, validationFromYear: 2021, validationToYear: 2022 },
        { tuningToYear: 2022, validationFromYear: 2023, validationToYear: 2024 },
        { tuningToYear: 2024, validationFromYear: 2025, validationToYear: 2026 }
    ],
    academy: [
        { tuningToYear: 2023, validationFromYear: 2024, validationToYear: 2024 },
        { tuningToYear: 2024, validationFromYear: 2025, validationToYear: 2026 }
    ]
});
const EXPANDED_GRID = Object.freeze({
    // Elo scale defines the public rating unit. Keep the conventional 400
    // fixed and tune the effective learning rate through K instead.
    eloScales: [400],
    kMultipliers: [.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75],
    kSmoothings: [0, .5, 1],
    sprintWeights: [.5, .75, 1, 1.25, 1.5, 1.75, 2]
});
const DYNAMICS_GRID = Object.freeze({ individualKWeights: [0, .5, 1], eventCenterings: [0, .5, 1] });
const RETIREMENT_GRID = Object.freeze({ retirementFloors: [0, .025, .05, .1, .15, .3],
    retirementExponents: [.5, 1, 1.5, 2, 2.5] });
const INACTIVITY_GRID = Object.freeze({
    returnKBoosts: [0, .25, .5, 1, 1.5, 2],
    returnKHalfLifeYears: [.1, .25, .5, 1, 2, 5, 10]
});
const UNCERTAINTY_GRID = Object.freeze({
    evidenceHalfLifeYears: [1.5, 3, 5], initialUncertainties: [220, 260, 300],
    minimumUncertainties: [35, 45, 55], uncertaintyPredictionWeights: [.5, 1, 2]
});
const F1_NESTED_FOLDS = Object.freeze([
    { fromYear: 2014, toYear: 2017, innerFolds: [{ fromYear: 2002, toYear: 2005 }, { fromYear: 2006, toYear: 2009 }, { fromYear: 2010, toYear: 2013 }] },
    { fromYear: 2018, toYear: 2021, innerFolds: [{ fromYear: 2006, toYear: 2009 }, { fromYear: 2010, toYear: 2013 }, { fromYear: 2014, toYear: 2017 }] },
    { fromYear: 2022, toYear: 2026, innerFolds: [{ fromYear: 2010, toYear: 2013 }, { fromYear: 2014, toYear: 2017 }, { fromYear: 2018, toYear: 2021 }] }
]);

function argument(name) {
    return process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function numericArgument(name) {
    const value = Number(argument(name));
    return Number.isFinite(value) ? value : undefined;
}

function selectedSeries() {
    const value = argument('series');
    if (!value) return SERIES;
    if (!SERIES.includes(value)) throw new Error(`Unknown series: ${value}`);
    return [value];
}

function requestedConfiguration(overrides = {}) {
    return configuration({
        eloScale: numericArgument('elo-scale'), provisionalK: numericArgument('k-provisional'),
        developingK: numericArgument('k-developing'), establishedK: numericArgument('k-established'),
        kSmoothing: numericArgument('k-smoothing'),
        returnKBoost: numericArgument('return-k-boost'), returnKGraceYears: numericArgument('return-k-grace'),
        returnKHalfLifeYears: numericArgument('return-k-half-life'),
        individualKWeight: numericArgument('individual-k-weight'), eventCentering: numericArgument('event-centering'),
        retirementFloor: numericArgument('retirement-floor'), retirementExponent: numericArgument('retirement-exponent'),
        sprintWeight: numericArgument('sprint-weight'),
        evidenceHalfLifeYears: numericArgument('evidence-half-life'), initialUncertainty: numericArgument('initial-uncertainty'),
        minimumUncertainty: numericArgument('minimum-uncertainty'),
        uncertaintyPredictionWeight: numericArgument('uncertainty-prediction-weight'),
        ...overrides
    });
}

function requestedJointConfiguration() {
    return { ...requestedConfiguration(), driverShare: numericArgument('driver-share'),
        driverKMultiplier: numericArgument('driver-k-multiplier'),
        constructorKMultiplier: numericArgument('constructor-k-multiplier'),
        constructorSeasonRetention: numericArgument('constructor-season-retention'),
        constructorFieldNormalization: numericArgument('constructor-field-normalization') };
}

function summary(series, evaluation) {
    return {
        series: series.toUpperCase(), model: evaluation.model || 'competitive', events: evaluation.events,
        sourceEvents: evaluation.sourceEvents ?? evaluation.events,
        comparisons: evaluation.pairwise.comparisons,
        accuracy: evaluation.pairwise.accuracy,
        brier: evaluation.pairwise.brierScore,
        eventBrier: evaluation.eventNormalized.brierScore,
        logLoss: evaluation.pairwise.logLoss,
        establishedBrier: evaluation.establishedPairwise.brierScore,
        uncertaintyBrier: evaluation.uncertainty.adjustedPairwise.brierScore,
        competitiveBrier: evaluation.comparison?.competitivePairwise?.brierScore ?? null,
        competitiveEventBrier: evaluation.comparison?.competitiveEventNormalized?.brierScore ?? null,
        brierDelta: evaluation.comparison?.pairwiseBrierDelta ?? null,
        eventBrierDelta: evaluation.comparison?.eventBrierDelta ?? null,
        teammateBrierDelta: evaluation.comparison?.relationship?.teammates?.brierDelta ?? null,
        otherBrierDelta: evaluation.comparison?.relationship?.other?.brierDelta ?? null,
        driverRange: evaluation.decomposition ? `${evaluation.decomposition.driverRange.minimum.toFixed(1)}..${evaluation.decomposition.driverRange.maximum.toFixed(1)}` : null,
        constructorRange: evaluation.decomposition ? `${evaluation.decomposition.constructorRange.minimum.toFixed(1)}..${evaluation.decomposition.constructorRange.maximum.toFixed(1)}` : null,
        positionMAE: evaluation.model === 'teammate' ? null : evaluation.positions.meanAbsoluteError
    };
}

function calibrationSummary(series, report) {
    if (report.decision) return {
        series: series.toUpperCase(), selected: report.rolling.selected.id,
        holdoutSelected: report.holdout.selected.id, promotionRecommended: report.decision.recommended,
        reasons: report.decision.reasons.join(', ')
    };
    const delta = report.aggregateDelta || report.holdoutDelta || {};
    const boundaries = report.boundary ? Object.entries(report.boundary).filter(([, value]) => value)
        .map(([name]) => name).join(', ') : '';
    return {
        series: series.toUpperCase(), selected: report.selected?.id || '',
        eventSelected: report.eventSelected?.id || '', objectivesAgree: report.objectivesAgree,
        consistent: report.consistent ?? report.generalizes ?? null,
        meetsMinimum: report.meetsMinimumImprovement,
        brierDelta: delta.brier, eventBrierDelta: delta.eventBrier, boundaries
    };
}

function jointValidationSummary(series, report) {
    return { series: series.toUpperCase(), selected: report.selected.id,
        eventSelected: report.eventSelected.id, tuningSelected: report.tuningSelected.id,
        foldWins: `${report.foldWins}/${report.selected.folds.length}`,
        rollingBrierDelta: report.rollingDelta.brier, rollingEventDelta: report.rollingDelta.eventBrier,
        holdoutBrierDelta: report.holdoutDelta.brier, holdoutEventDelta: report.holdoutDelta.eventBrier,
        recommended: report.decision.recommended, reasons: report.decision.reasons.join(', ') };
}

function jointImprovementSummary(series, report) {
    const confidence = report.holdoutConfidence;
    return { series: series.toUpperCase(), structure: report.structure.selected.id,
        selected: report.final.selected.id, foldWins: `${report.final.foldWins}/${report.final.selected.folds.length}`,
        rollingBrierDelta: report.final.rollingDelta.brier, holdoutBrierDelta: report.final.holdoutDelta.brier,
        holdoutEventDelta: report.final.holdoutDelta.eventBrier,
        bootstrapLower: confidence.intervals?.brier.lower ?? null,
        bootstrapUpper: confidence.intervals?.brier.upper ?? null,
        recommended: report.final.decision.recommended, reasons: report.final.decision.reasons.join(', ') };
}

function nestedJointSummary(series, report) {
    return { series: series.toUpperCase(), selections: report.folds.map(fold => fold.selected).join(' | '),
        foldBrierDeltas: report.folds.map(fold => fold.delta.brier).join(' | '),
        brierDelta: report.delta.brier, eventBrierDelta: report.delta.eventBrier,
        recommended: report.decision.recommended, reasons: report.decision.reasons.join(', ') };
}

async function evaluate(connection, series, config) {
    const events = await loadRatingEvents(connection, series);
    const result = calculateRatings(configuredEvents(events, config), { ...config, collectComparisons: true });
    const requestedSamples = numericArgument('bootstrap-samples');
    return evaluateRatings(result, { fromYear: numericArgument('from-year'), toYear: numericArgument('to-year'),
        bootstrapSamples: requestedSamples == null ? 1000 : requestedSamples,
        bootstrapSeed: numericArgument('bootstrap-seed') });
}

async function evaluateTeammates(connection, series, config) {
    const source = await loadRatingEvents(connection, series);
    const events = teammateEvents(source);
    const result = calculateRatings(configuredEvents(events, config), { ...config, collectComparisons: true });
    const competitive = calculateRatings(configuredEvents(source, config), { ...config, collectComparisons: true });
    const fromYear = numericArgument('from-year') ?? -Infinity, toYear = numericArgument('to-year') ?? Infinity;
    const competitiveComparisons = competitive.comparisons.filter(item => item.sameConstructor
        && item.year >= fromYear && item.year <= toYear);
    const evaluation = evaluateRatings(result, {
        fromYear, toYear,
        bootstrapSamples: numericArgument('bootstrap-samples') ?? 1000,
        bootstrapSeed: numericArgument('bootstrap-seed')
    });
    const teammatePairwise = evaluation.pairwise;
    const competitivePairwise = comparisonMetrics(competitiveComparisons);
    return { ...evaluation, model: 'teammate', sourceEvents: new Set(events.map(event => event.sourceEventId)).size,
        teamEvents: events.length, comparison: {
            competitivePairwise,
            competitiveEventNormalized: eventNormalizedMetrics(competitiveComparisons),
            pairwiseBrierDelta: Number((competitivePairwise.brierScore - teammatePairwise.brierScore).toFixed(6))
        } };
}

async function evaluateJoint(connection, series, config) {
    const events = await loadRatingEvents(connection, series);
    const joint = calculateJointRatings(configuredEvents(events, config), { ...config, collectComparisons: true });
    const competitive = calculateRatings(configuredEvents(events, config), { ...config, collectComparisons: true });
    const evaluationOptions = { fromYear: numericArgument('from-year'), toYear: numericArgument('to-year'),
        bootstrapSamples: numericArgument('bootstrap-samples') ?? 1000, bootstrapSeed: numericArgument('bootstrap-seed') };
    const evaluation = evaluateRatings(joint, evaluationOptions);
    const baseline = evaluateRatings(competitive, evaluationOptions);
    const relationship = Object.fromEntries(['teammates', 'other'].map(name => {
        const sameConstructor = name === 'teammates';
        const jointMetrics = comparisonMetrics(joint.comparisons.filter(item => item.sameConstructor === sameConstructor
            && item.year >= (evaluation.range.fromYear ?? -Infinity) && item.year <= (evaluation.range.toYear ?? Infinity)));
        const baselineMetrics = comparisonMetrics(competitive.comparisons.filter(item => item.sameConstructor === sameConstructor
            && item.year >= (evaluation.range.fromYear ?? -Infinity) && item.year <= (evaluation.range.toYear ?? Infinity)));
        return [name, { joint: jointMetrics, competitive: baselineMetrics,
            brierDelta: Number((baselineMetrics.brierScore - jointMetrics.brierScore).toFixed(6)) }];
    }));
    return { ...evaluation, model: 'joint-driver-constructor', decomposition: joint.decomposition,
        comparison: { competitivePairwise: baseline.pairwise, competitiveEventNormalized: baseline.eventNormalized,
            pairwiseBrierDelta: Number((baseline.pairwise.brierScore - evaluation.pairwise.brierScore).toFixed(6)),
            eventBrierDelta: Number((baseline.eventNormalized.brierScore - evaluation.eventNormalized.brierScore).toFixed(6)),
            relationship } };
}

async function validateJoint(connection, series) {
    const events = await loadRatingEvents(connection, series), split = HOLDOUT_SPLITS[series];
    return validateJointAllocation(configuredEvents(events, requestedConfiguration()), {
        folds: ROLLING_FOLDS[series], tuningFromYear: split.tuningFromYear, holdoutYear: split.holdoutYear,
        toYear: numericArgument('to-year'), baseConfiguration: requestedConfiguration(),
        driverShares: [0, .25, .5, .75, 1]
    });
}

async function improveJoint(connection, series) {
    const source = await loadRatingEvents(connection, series), config = requestedConfiguration();
    const events = configuredEvents(source, config), split = HOLDOUT_SPLITS[series];
    const validationOptions = { folds: ROLLING_FOLDS[series], tuningFromYear: split.tuningFromYear,
        holdoutYear: split.holdoutYear, toYear: numericArgument('to-year'), baseConfiguration: config };
    const structure = validateJointAllocation(events, { ...validationOptions, candidates: jointStructureCandidates() });
    const final = validateJointAllocation(events, { ...validationOptions,
        candidates: jointRateCandidates(structure.selected.configuration) });
    const selected = calculateJointRatings(events, { ...final.selected.configuration, collectComparisons: true });
    const control = calculateJointRatings(events, { ...config, ...competitiveControl(), collectComparisons: true });
    const holdoutConfidence = pairedBootstrapDelta(selected.comparisons, control.comparisons, {
        fromYear: split.holdoutYear, toYear: numericArgument('to-year'),
        samples: numericArgument('bootstrap-samples') ?? 1000, seed: numericArgument('bootstrap-seed')
    });
    return { structure, final, holdoutConfidence };
}

async function nestedJoint(connection, series) {
    if (series !== 'f1') throw new Error('Nested joint validation is currently defined for F1 only.');
    const config = requestedConfiguration(), events = configuredEvents(await loadRatingEvents(connection, series), config);
    return nestedJointValidation(events, { outerFolds: F1_NESTED_FOLDS, baseConfiguration: config,
        candidates: jointRateCandidates({ constructorSeasonRetention: 1, constructorFieldNormalization: 0 }) });
}

async function calibrate(connection, series) {
    const candidates = [], events = await loadRatingEvents(connection, series);
    for (const candidate of candidateGrid(requestedConfiguration())) {
        const config = candidate.configuration;
        const result = calculateRatings(configuredEvents(events, config), { ...config, collectComparisons: true });
        const evaluation = evaluateRatings(result, { fromYear: numericArgument('from-year'), toYear: numericArgument('to-year') });
        candidates.push({ id: candidate.id, eloScale: config.eloScale, provisionalK: config.provisionalK,
            developingK: config.developingK, establishedK: config.establishedK, sprintWeight: config.sprintWeight,
            brier: evaluation.pairwise.brierScore, logLoss: evaluation.pairwise.logLoss,
            positionMAE: evaluation.positions.meanAbsoluteError });
    }
    return candidates.sort((a, b) => a.brier - b.brier || a.logLoss - b.logLoss);
}

async function holdout(connection, series) {
    const events = await loadRatingEvents(connection, series);
    const defaults = HOLDOUT_SPLITS[series];
    return holdoutCalibration(events, {
        tuningFromYear: numericArgument('tune-from-year') || defaults.tuningFromYear,
        holdoutYear: numericArgument('holdout-year') || defaults.holdoutYear,
        toYear: numericArgument('to-year'),
        baseConfiguration: requestedConfiguration(),
        candidates: candidateGrid(requestedConfiguration(), EXPANDED_GRID)
    });
}

async function rolling(connection, series) {
    const events = await loadRatingEvents(connection, series);
    return rollingCalibration(events, {
        folds: ROLLING_FOLDS[series], grid: EXPANDED_GRID,
        baseConfiguration: requestedConfiguration()
    });
}

async function dynamics(connection, series) {
    const events = await loadRatingEvents(connection, series);
    return rollingCalibration(events, { folds: ROLLING_FOLDS[series], grid: DYNAMICS_GRID,
        candidates: dynamicsCandidateGrid(requestedConfiguration(), DYNAMICS_GRID) });
}

async function retirement(connection, series) {
    const events = await loadRatingEvents(connection, series);
    return rollingCalibration(events, { folds: ROLLING_FOLDS[series], grid: RETIREMENT_GRID,
        candidates: retirementCandidateGrid(requestedConfiguration(), RETIREMENT_GRID) });
}

async function inactivity(connection, series) {
    const events = await loadRatingEvents(connection, series);
    return rollingCalibration(events, { folds: ROLLING_FOLDS[series], grid: INACTIVITY_GRID,
        candidates: inactivityCandidateGrid(requestedConfiguration(), INACTIVITY_GRID) });
}

async function uncertainty(connection, series) {
    const events = await loadRatingEvents(connection, series);
    return rollingUncertaintyCalibration(events, { folds: ROLLING_FOLDS[series], grid: UNCERTAINTY_GRID,
        baseConfiguration: requestedConfiguration() });
}

async function validate(connection, series) {
    const events = await loadRatingEvents(connection, series);
    const config = requestedConfiguration(), candidates = candidateGrid(config, EXPANDED_GRID);
    const rollingReport = rollingCalibration(events, { folds: ROLLING_FOLDS[series],
        grid: EXPANDED_GRID, baseConfiguration: config, candidates });
    const defaults = HOLDOUT_SPLITS[series];
    const holdoutReport = holdoutCalibration(events, { tuningFromYear: defaults.tuningFromYear,
        holdoutYear: defaults.holdoutYear, toYear: numericArgument('to-year'),
        baseConfiguration: config, candidates });
    return { rolling: rollingReport, holdout: holdoutReport,
        decision: promotionDecision(rollingReport, holdoutReport) };
}

async function main() {
    await ensureRatingsSchema();
    const connection = await pool.getConnection(), output = {};
    try {
        const f1First = process.argv.includes('--joint-improve') || process.argv.includes('--joint-nested');
        const requestedSeries = f1First && !argument('series') ? ['f1'] : selectedSeries();
        for (const series of requestedSeries) {
            if (process.argv.includes('--joint-nested')) {
                output[series] = await nestedJoint(connection, series);
                continue;
            }
            if (process.argv.includes('--joint-improve')) {
                output[series] = await improveJoint(connection, series);
                continue;
            }
            if (process.argv.includes('--joint-validate')) {
                output[series] = await validateJoint(connection, series);
                continue;
            }
            if (process.argv.includes('--joint')) {
                output[series] = await evaluateJoint(connection, series, requestedJointConfiguration());
                continue;
            }
            if (process.argv.includes('--teammate')) {
                output[series] = await evaluateTeammates(connection, series, requestedConfiguration());
                continue;
            }
            if (process.argv.includes('--inactivity')) {
                output[series] = await inactivity(connection, series);
                if (process.argv.includes('--save')) await connection.query(`INSERT INTO app_rating_evaluations
                    (model_version, series, configuration, metrics) VALUES (?, ?, ?, ?)`,
                    [MODEL_VERSION, series, JSON.stringify(output[series].selected.configuration), JSON.stringify(output[series])]);
                continue;
            }
            if (process.argv.includes('--validate')) {
                output[series] = await validate(connection, series);
                continue;
            }
            if (process.argv.includes('--retirement')) {
                output[series] = await retirement(connection, series);
                if (process.argv.includes('--save')) await connection.query(`INSERT INTO app_rating_evaluations
                    (model_version, series, configuration, metrics) VALUES (?, ?, ?, ?)`,
                    [MODEL_VERSION, series, JSON.stringify(output[series].selected.configuration), JSON.stringify(output[series])]);
                continue;
            }
            if (process.argv.includes('--uncertainty')) {
                output[series] = await uncertainty(connection, series);
                if (process.argv.includes('--save')) await connection.query(`INSERT INTO app_rating_evaluations
                    (model_version, series, configuration, metrics) VALUES (?, ?, ?, ?)`,
                    [MODEL_VERSION, series, JSON.stringify(output[series].selected.configuration), JSON.stringify(output[series])]);
                continue;
            }
            if (process.argv.includes('--dynamics')) {
                output[series] = await dynamics(connection, series);
                if (process.argv.includes('--save')) await connection.query(`INSERT INTO app_rating_evaluations
                    (model_version, series, configuration, metrics) VALUES (?, ?, ?, ?)`,
                    [MODEL_VERSION, series, JSON.stringify(output[series].selected.configuration), JSON.stringify(output[series])]);
                continue;
            }
            if (process.argv.includes('--rolling')) {
                output[series] = await rolling(connection, series);
                if (process.argv.includes('--save')) {
                    await connection.query(`INSERT INTO app_rating_evaluations
                        (model_version, series, configuration, metrics) VALUES (?, ?, ?, ?)`,
                        [MODEL_VERSION, series, JSON.stringify(output[series].selected.configuration), JSON.stringify(output[series])]);
                }
                continue;
            }
            if (process.argv.includes('--holdout')) {
                output[series] = await holdout(connection, series);
                if (process.argv.includes('--save')) {
                    await connection.query(`INSERT INTO app_rating_evaluations
                        (model_version, series, configuration, metrics) VALUES (?, ?, ?, ?)`,
                        [MODEL_VERSION, series, JSON.stringify(output[series].selected.configuration), JSON.stringify(output[series])]);
                }
                continue;
            }
            if (process.argv.includes('--calibrate')) {
                output[series] = { bestCandidates: (await calibrate(connection, series)).slice(0, 10) };
                continue;
            }
            const evaluation = await evaluate(connection, series, requestedConfiguration());
            output[series] = evaluation;
            if (process.argv.includes('--save')) {
                await connection.query(`INSERT INTO app_rating_evaluations
                    (model_version, series, configuration, metrics) VALUES (?, ?, ?, ?)`,
                    [MODEL_VERSION, series, JSON.stringify(evaluation.configuration), JSON.stringify(evaluation)]);
            }
        }
    } finally {
        connection.release();
        await pool.end();
    }
    if (process.argv.includes('--summary')) {
        if (process.argv.includes('--joint-nested')) {
            console.table(Object.entries(output).map(([series, report]) => nestedJointSummary(series, report)));
            return;
        }
        if (process.argv.includes('--joint-improve')) {
            console.table(Object.entries(output).map(([series, report]) => jointImprovementSummary(series, report)));
            return;
        }
        if (process.argv.includes('--joint-validate')) {
            console.table(Object.entries(output).map(([series, report]) => jointValidationSummary(series, report)));
            return;
        }
        const calibrationMode = ['--inactivity', '--validate', '--retirement', '--uncertainty', '--dynamics',
            '--rolling', '--holdout', '--calibrate'].some(flag => process.argv.includes(flag));
        console.table(Object.entries(output).map(([series, report]) => calibrationMode
            ? calibrationSummary(series, report) : summary(series, report)));
    } else if (process.argv.includes('--json') || process.argv.includes('--calibrate') || process.argv.includes('--holdout')
        || process.argv.includes('--rolling') || process.argv.includes('--dynamics') || process.argv.includes('--retirement')
        || process.argv.includes('--validate')
        || process.argv.includes('--inactivity')
        || process.argv.includes('--teammate')
        || process.argv.includes('--joint')
        || process.argv.includes('--joint-validate')
        || process.argv.includes('--joint-improve')
        || process.argv.includes('--joint-nested')
        || process.argv.includes('--uncertainty')) console.log(JSON.stringify(output, null, 2));
    else console.table(Object.entries(output).map(([series, evaluation]) => summary(series, evaluation)));
}

main().catch(async error => {
    console.error(error);
    try { await pool.end(); } catch {}
    process.exitCode = 1;
});

module.exports = { DYNAMICS_GRID, EXPANDED_GRID, HOLDOUT_SPLITS, INACTIVITY_GRID, RETIREMENT_GRID,
    ROLLING_FOLDS, UNCERTAINTY_GRID,
    calibrationSummary, evaluateJoint, evaluateTeammates, F1_NESTED_FOLDS, improveJoint, jointImprovementSummary,
    jointValidationSummary, nestedJoint, nestedJointSummary, requestedConfiguration, requestedJointConfiguration,
    summary, validateJoint };
