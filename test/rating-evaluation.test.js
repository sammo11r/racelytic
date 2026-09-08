const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRatings, configuration } = require('../backend/rating-engine');
const { bootstrapByWeekend, comparisonMetrics, evaluateRatings, eventNormalizedMetrics,
  pairedBootstrapDelta, positionMetrics } = require('../backend/rating-evaluation');
const { aggregate, candidateGrid, dynamicsCandidateGrid, holdoutCalibration, rollingCalibration,
  configuredEvents, inactivityCandidateGrid, promotionDecision, retirementCandidateGrid, rollingUncertaintyCalibration,
  uncertaintyCandidateGrid } = require('../backend/rating-calibration');

function race(id, order) {
  return { id, series: 'f1', year: 2024, date: `2024-02-${String(id).padStart(2, '0')}`,
    name: `Race ${id}`, sessionType: 'race', weight: 1,
    participants: order.map((driverId, index) => ({ driverId, driverName: driverId,
      finishOrder: index + 1, positionNumber: index + 1, classified: true, completion: 1, started: true })) };
}

test('evaluation reports walk-forward prediction quality against an uninformed baseline', () => {
  const result = calculateRatings([race(1, ['A', 'B']), race(2, ['A', 'B']), race(3, ['A', 'B'])], { collectComparisons: true });
  const evaluation = evaluateRatings(result);
  assert.equal(evaluation.events, 3);
  assert.equal(evaluation.pairwise.comparisons, 3);
  assert.ok(evaluation.pairwise.brierScore < evaluation.baseline.brierScore);
  assert.ok(evaluation.pairwise.logLoss < evaluation.baseline.logLoss);
  assert.equal(evaluation.range.fromYear, 2024);
});

test('evaluation ranges filter scoring without removing earlier model training', () => {
  const early = race(1, ['A', 'B']);
  early.year = 2023;
  const result = calculateRatings([early, race(2, ['A', 'B'])], { collectComparisons: true });
  const evaluation = evaluateRatings(result, { fromYear: 2024, toYear: 2024 });
  assert.equal(evaluation.events, 1);
  assert.ok(result.rows.find(row => row.eventId === '2' && row.driverId === 'A').ratingBefore > 1500);
});

test('weighted metrics and finishing-position errors remain finite for empty and partial samples', () => {
  assert.deepEqual(comparisonMetrics([]), { comparisons: 0, effectiveComparisons: 0, accuracy: 0, brierScore: 0, logLoss: 0 });
  assert.deepEqual(positionMetrics([]), { predictions: 0, meanAbsoluteError: 0, rootMeanSquaredError: 0 });
  const metrics = comparisonMetrics([{ expected: .8, actual: 1, weight: .5 }]);
  assert.equal(metrics.brierScore, .04);
  assert.equal(comparisonMetrics([{ expected: .8, actual: 1, weight: .1, evaluationWeight: 1 }]).effectiveComparisons, 1);
});

test('paired weekend bootstrap measures candidate improvement on identical comparisons', () => {
  const baseline = [{ eventId: 'one', year: 2024, round: 1, firstId: 'a', secondId: 'b', expected: .5, actual: 1, weight: 1 }];
  const candidate = [{ ...baseline[0], expected: .7 }];
  const report = pairedBootstrapDelta(candidate, baseline, { samples: 20, seed: 7 });
  assert.ok(report.point.brier > 0);
  assert.ok(report.point.eventBrier > 0);
  assert.ok(report.intervals.brier.lower > 0);
  assert.throws(() => pairedBootstrapDelta(candidate, [], { samples: 1 }), /identical comparison samples/);
});

test('retirement candidates change training weights without changing evaluation weights', () => {
  const retired = race(1, ['A', 'B']);
  retired.participants[1].classified = false;
  retired.participants[1].completion = .5;
  const linear = calculateRatings([retired], { collectComparisons: true, retirementExponent: 1 }).comparisons[0];
  const curved = calculateRatings([retired], { collectComparisons: true, retirementExponent: 2 }).comparisons[0];
  assert.notEqual(linear.weight, curved.weight);
  assert.equal(linear.evaluationWeight, curved.evaluationWeight);
});

test('event-normalized metrics give small and large fields equal influence', () => {
  const comparisons = [
    { eventId: 'small', expected: .9, actual: 0, weight: 1 },
    ...Array.from({ length: 9 }, () => ({ eventId: 'large', expected: .9, actual: 1, weight: 1 }))
  ];
  assert.equal(comparisonMetrics(comparisons).brierScore, .09);
  assert.equal(eventNormalizedMetrics(comparisons).brierScore, .41);
});

test('weekend bootstrap intervals are deterministic and cluster complete events', () => {
  const result = calculateRatings([
    race(1, ['A', 'B', 'C']), race(2, ['A', 'C', 'B']), race(3, ['B', 'A', 'C'])
  ], { collectComparisons: true });
  const options = { samples: 100, seed: 42 };
  const first = bootstrapByWeekend(result.comparisons, options);
  const second = bootstrapByWeekend(result.comparisons, options);
  assert.deepEqual(first, second);
  assert.equal(first.samples, 100);
  assert.equal(first.weekends, 3);
  assert.ok(first.pairwise.brierScore.lower <= first.pairwise.brierScore.upper);
});

test('pool health reports active-field movement separately from zero-sum event drift', () => {
  const result = calculateRatings([
    race(1, ['A', 'B']), race(2, ['A', 'B']), race(3, ['C', 'A'])
  ], { collectComparisons: true });
  const pool = evaluateRatings(result).pool;
  assert.ok(Math.abs(pool.totalDrift) < 1e-9);
  assert.notEqual(pool.activeFieldMean.change, 0);
  assert.ok(pool.activeFieldMean.minimum <= pool.activeFieldMean.maximum);
});

test('evaluation separates format, experience, teammate and retirement samples', () => {
  const feature = race(1, ['A', 'B', 'C']);
  feature.participants[1].constructorName = 'Shared';
  feature.participants[2].constructorName = 'Shared';
  feature.participants[2].classified = false;
  feature.participants[2].completion = .5;
  const sprint = { ...race(2, ['A', 'B', 'C']), sessionType: 'sprint', weight: .5 };
  const evaluation = evaluateRatings(calculateRatings([feature, sprint], { collectComparisons: true }),
    { bootstrapSamples: 20, bootstrapSeed: 7 });
  assert.deepEqual(evaluation.breakdowns.sessionType.map(item => item.name), ['race', 'sprint']);
  assert.equal(evaluation.breakdowns.relationship.find(item => item.name === 'teammates').comparisons, 1);
  assert.ok(evaluation.breakdowns.outcome.find(item => item.name === 'retirement').comparisons > 0);
  assert.equal(evaluation.confidenceIntervals.samples, 20);
});

test('rating parameters are explicit, validated and returned with each calculation', () => {
  const config = configuration({ eloScale: 320, provisionalK: 35, sprintWeight: .4, retirementFloor: 'invalid' });
  assert.equal(config.eloScale, 320);
  assert.equal(config.provisionalK, 35);
  assert.equal(config.sprintWeight, .4);
  assert.equal(config.retirementFloor, .15);
  assert.equal(configuration({ eloScale: -1 }).eloScale, 400);
  assert.deepEqual(calculateRatings([], config).configuration, config);
});

test('calibration grid includes the published model and bounded alternatives', () => {
  const candidates = candidateGrid();
  assert.equal(candidates.length, 27);
  assert.ok(candidates.some(candidate => candidate.configuration.eloScale === 400
    && candidate.configuration.provisionalK === 140 && candidate.configuration.sprintWeight === .5));
});

test('calibration sprint labels equal their actual effective event weights', () => {
  const source = { ...race(1, ['A', 'B']), sessionType: 'sprint', weight: .5 };
  assert.equal(configuredEvents([source], configuration())[0].weight, .5);
  assert.equal(configuredEvents([source], configuration({ sprintWeight: .75 }))[0].weight, .75);
  assert.equal(configuredEvents([{ ...source, weight: 0 }], configuration({ sprintWeight: .75 }))[0].weight, 0);
});

test('dynamics, retirement and uncertainty grids include the published configurations', () => {
  assert.equal(dynamicsCandidateGrid().length, 6);
  assert.equal(retirementCandidateGrid().length, 9);
  assert.equal(uncertaintyCandidateGrid().length, 81);
  assert.equal(inactivityCandidateGrid().length, 36);
  assert.ok(dynamicsCandidateGrid().some(candidate => candidate.configuration.individualKWeight === 0
    && candidate.configuration.eventCentering === 1));
  assert.ok(uncertaintyCandidateGrid().some(candidate => candidate.configuration.evidenceHalfLifeYears === 3
    && candidate.configuration.initialUncertainty === 260 && candidate.configuration.minimumUncertainty === 45));
  assert.ok(retirementCandidateGrid().some(candidate => candidate.configuration.retirementFloor === .15
    && candidate.configuration.retirementExponent === 1));
  assert.ok(inactivityCandidateGrid().some(candidate => candidate.configuration.returnKBoost === 0));
});

test('temporal holdout selects on earlier seasons and reports unseen-season deltas', () => {
  const events = [2020, 2021, 2022, 2023, 2024].map((year, index) => {
    const item = race(index + 1, index < 3 ? ['A', 'B'] : ['B', 'A']);
    item.year = year;
    item.date = `${year}-02-01`;
    return item;
  });
  const configs = [
    { id: 'published', configuration: configuration() },
    { id: 'slower', configuration: configuration({ provisionalK: 10, developingK: 10, establishedK: 10 }) }
  ];
  const report = holdoutCalibration(events, { tuningFromYear: 2020, holdoutYear: 2023, candidates: configs });
  assert.equal(report.split.tuningToYear, 2022);
  assert.equal(report.split.holdoutFromYear, 2023);
  assert.equal(report.candidates, 2);
  assert.equal(report.selected.tuning.events, 3);
  assert.equal(report.selected.holdout.events, 2);
  assert.equal(typeof report.holdoutDelta.brier, 'number');
  assert.equal(typeof report.holdoutDelta.eventBrier, 'number');
  assert.equal(typeof report.objectivesAgree, 'boolean');
  assert.equal(typeof report.meetsMinimumImprovement, 'boolean');
});

test('rolling calibration aggregates disjoint future windows and checks consistency', () => {
  const events = [2020, 2021, 2022, 2023, 2024].map((year, index) => {
    const item = race(index + 1, ['A', 'B']);
    item.year = year;
    item.date = `${year}-02-01`;
    return item;
  });
  const grid = { eloScales: [300, 400], kMultipliers: [1, 1.25], sprintWeights: [.5, .75] };
  const report = rollingCalibration(events, { grid, folds: [
    { tuningToYear: 2020, validationFromYear: 2021, validationToYear: 2022 },
    { tuningToYear: 2022, validationFromYear: 2023, validationToYear: 2024 }
  ] });
  assert.equal(report.candidates, 8);
  assert.equal(report.selected.folds.length, 2);
  assert.equal(report.published.configuration.eloScale, 400);
  assert.equal(typeof report.consistent, 'boolean');
  assert.equal(typeof report.objectivesAgree, 'boolean');
  assert.equal(typeof report.eventSelected.id, 'string');
  assert.equal(typeof report.meetsMinimumImprovement, 'boolean');
  assert.equal(aggregate(report.selected.folds).comparisons, report.selected.aggregate.comparisons);
});

test('uncertainty evaluation reports evidence cohorts and rejects harmful probability adjustment', () => {
  const events = [2020, 2021, 2022, 2023, 2024].map((year, index) => {
    const item = race(index + 1, ['A', 'B']);
    item.year = year;
    item.date = `${year}-02-01`;
    return item;
  });
  const published = { id: 'published', configuration: configuration() };
  const extreme = { id: 'extreme', configuration: configuration({ uncertaintyPredictionWeight: 10 }) };
  const report = rollingUncertaintyCalibration(events, { candidates: [published, extreme], folds: [
    { validationFromYear: 2021, validationToYear: 2022 },
    { validationFromYear: 2023, validationToYear: 2024 }
  ] });
  assert.equal(typeof report.probabilityAdjustmentRecommended, 'boolean');
  assert.equal(report.selected.id, 'published');
  assert.ok(report.published.aggregate.cohorts.provisional.comparisons > 0);
});

test('promotion gate rejects unstable rolling and holdout selections', () => {
  const decision = promotionDecision({
    selected: { id: 'rolling' }, objectivesAgree: true, consistent: true,
    meetsMinimumImprovement: true, boundary: { kMultiplier: false, sprintWeight: false }
  }, {
    selected: { id: 'holdout' }, objectivesAgree: true, generalizes: true, meetsMinimumImprovement: true
  });
  assert.equal(decision.recommended, false);
  assert.deepEqual(decision.reasons, ['rolling-holdout-selection-differs']);
});

test('promotion gate accepts only stable candidates with complete evidence', () => {
  const rolling = { selected: { id: 'candidate' }, objectivesAgree: true, consistent: true,
    meetsMinimumImprovement: true, boundary: {} };
  const holdout = { selected: { id: 'candidate' }, objectivesAgree: true, generalizes: true,
    meetsMinimumImprovement: true };
  assert.deepEqual(promotionDecision(rolling, holdout).reasons, []);
  assert.equal(promotionDecision(rolling, holdout).recommended, true);
});
