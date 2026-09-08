const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateRatings } = require('../backend/rating-engine');
const { calculateJointRatings, jointConfiguration, jointRateCandidates, jointStructureCandidates,
  nestedJointValidation, validateJointAllocation } = require('../backend/joint-rating-model');

const driver = (driverId, constructorId, finishOrder) => ({
  driverId, driverName: driverId, constructorId, constructorName: constructorId,
  finishOrder, classified: true, completion: 1
});
const events = [
  { id: 'one', date: '2024-01-01', year: 2024, weight: 1, participants: [
    driver('a', 'red', 1), driver('b', 'red', 2), driver('c', 'blue', 3), driver('d', 'blue', 4)
  ] },
  { id: 'two', date: '2024-02-01', year: 2024, weight: 1, participants: [
    driver('c', 'blue', 1), driver('a', 'red', 2), driver('d', 'blue', 3), driver('b', 'red', 4)
  ] }
];

test('joint model validates the driver/team allocation', () => {
  assert.equal(jointConfiguration({}).driverShare, .5);
  assert.equal(jointConfiguration({ driverShare: .7 }).driverShare, .7);
  assert.equal(jointConfiguration({ driverShare: 2 }).driverShare, .5);
  assert.equal(jointConfiguration({ driverKMultiplier: .8 }).driverKMultiplier, .8);
  assert.equal(jointConfiguration({ constructorSeasonRetention: .25 }).constructorSeasonRetention, .25);
});

test('constructor effects can regress between seasons', () => {
  const nextSeason = { ...events[1], id: 'next', date: '2025-02-01', year: 2025 };
  const retained = calculateJointRatings([events[0], nextSeason], {
    collectComparisons: true, driverKMultiplier: 0, constructorKMultiplier: 1, constructorSeasonRetention: 1
  });
  const reset = calculateJointRatings([events[0], nextSeason], {
    collectComparisons: true, driverKMultiplier: 0, constructorKMultiplier: 1, constructorSeasonRetention: 0
  });
  const retainedFirst = retained.comparisons.find(item => item.eventId === 'next');
  const resetFirst = reset.comparisons.find(item => item.eventId === 'next');
  assert.notEqual(retainedFirst.firstConstructorRating, 0);
  assert.equal(resetFirst.firstConstructorRating, 0);
});

test('constructor learning can be normalized for multi-car entries', () => {
  const raw = calculateJointRatings(events.slice(0, 1), {
    driverKMultiplier: 0, constructorKMultiplier: 1, constructorFieldNormalization: 0
  });
  const normalized = calculateJointRatings(events.slice(0, 1), {
    driverKMultiplier: 0, constructorKMultiplier: 1, constructorFieldNormalization: 1
  });
  assert.ok(Math.abs(normalized.constructorRatings.get('red')) < Math.abs(raw.constructorRatings.get('red')));
});

test('driver-only control reproduces competitive Elo predictions', () => {
  const competitive = calculateRatings(events, { collectComparisons: true });
  const control = calculateJointRatings(events, { collectComparisons: true, driverShare: 1 });
  assert.deepEqual(control.comparisons.map(item => item.expected), competitive.comparisons.map(item => item.expected));
  for (const [id, rating] of competitive.ratings) assert.equal(control.driverRatings.get(id), rating);
  assert.ok([...control.constructorRatings.values()].every(value => value === 0));
});

test('joint model separates teammate evidence from constructor evidence', () => {
  const result = calculateJointRatings(events.slice(0, 1), { collectComparisons: true, driverShare: .5 });
  const teammate = result.comparisons.find(item => item.firstConstructorId === item.secondConstructorId);
  assert.equal(teammate.firstConstructorRating, teammate.secondConstructorRating);
  assert.ok(result.driverRatings.get('a') > result.driverRatings.get('b'));
  assert.ok(result.constructorRatings.get('red') > result.constructorRatings.get('blue'));
  const constructorSum = [...result.constructorRatings.values()].reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(constructorSum) < 1e-10);
});

test('joint validation retains a driver-only control and locked holdout', () => {
  const validation = validateJointAllocation(events, {
    folds: [{ validationFromYear: 2024, validationToYear: 2024 }],
    tuningFromYear: 2024, holdoutYear: 2025, toYear: 2025,
    driverShares: [.5, 1]
  });
  assert.equal(validation.control.driverShare, 1);
  assert.equal(validation.candidates, 2);
  assert.ok(Array.isArray(validation.decision.reasons));
});

test('F1 improvement grids retain the exact competitive control', () => {
  assert.equal(jointStructureCandidates().length, 11);
  assert.equal(jointRateCandidates({ constructorSeasonRetention: .5 }).length, 42);
  for (const candidates of [jointStructureCandidates(), jointRateCandidates()]) {
    assert.ok(candidates.some(candidate => candidate.driverKMultiplier === 1 && candidate.constructorKMultiplier === 0));
  }
});

test('nested validation selects only from prior inner periods', () => {
  const candidates = jointRateCandidates();
  const report = nestedJointValidation(events, { outerFolds: [{ fromYear: 2024, toYear: 2024,
    innerFolds: [{ fromYear: 2024, toYear: 2024 }] }], candidates: [candidates[0],
      candidates.find(candidate => candidate.id === 'competitive-control')] });
  assert.equal(report.folds.length, 1);
  assert.ok(Number.isFinite(report.delta.brier));
});
