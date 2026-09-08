const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRatings, comparisonWeight, DEFAULT_CONFIGURATION, effectiveK, expectedScore, kFactor,
  inactivityKMultiplier, uncertaintyAtDate, updateUncertainty } = require('../backend/rating-engine');
const { classified, disqualified, loadJuniorEvents, participants, started } = require('../backend/rating-data');

function event(id, field, weight = 1) {
  return { id, series: 'f1', date: `2024-01-${String(id).padStart(2, '0')}`, year: 2024, round: id,
    name: `Race ${id}`, sessionType: weight === .5 ? 'sprint' : 'race', weight,
    participants: field.map((driver, index) => ({ driverId: driver, driverName: driver,
      finishOrder: index + 1, positionNumber: index + 1, positionText: String(index + 1),
      started: true, classified: true, disqualified: false, completion: 1 })) };
}

test('rating expectations are symmetric and experience reduces volatility', () => {
  assert.equal(expectedScore(1500, 1500), .5);
  assert.ok(Math.abs(expectedScore(1600, 1500) + expectedScore(1500, 1600) - 1) < 1e-12);
  assert.deepEqual([kFactor(0), kFactor(9), kFactor(10), kFactor(49), kFactor(50)], [140, 140, 98, 98, 70]);
});

test('smooth K candidates remove threshold jumps without changing staged defaults', () => {
  const smooth = { ...DEFAULT_CONFIGURATION, kSmoothing: 1 };
  assert.deepEqual([kFactor(0, smooth), kFactor(10, smooth), kFactor(50, smooth)], [140, 98, 70]);
  assert.ok(kFactor(9, smooth) > kFactor(10, smooth));
  assert.ok(kFactor(49, smooth) > kFactor(50, smooth));
  assert.ok(kFactor(9, smooth) < kFactor(9));
});

test('Elo scale and K factors can be evaluated without changing published defaults', () => {
  assert.notEqual(expectedScore(1600, 1500, 300), expectedScore(1600, 1500, 500));
  assert.equal(kFactor(0, { provisionalEvents: 5, establishedEvents: 10, provisionalK: 36, developingK: 24, establishedK: 16 }), 36);
});

test('individual K candidates protect an established driver from provisional volatility', () => {
  assert.equal(effectiveK(70, 140, 0), 105);
  assert.equal(effectiveK(70, 140, 1), 70);
});

test('each event is zero sum and an upset rewards the lower-rated driver more', () => {
  const result = calculateRatings([event(1, ['A', 'B']), event(2, ['B', 'A'])]);
  const second = result.rows.slice(2);
  assert.ok(Math.abs(second.reduce((sum, row) => sum + row.ratingChange, 0)) < 1e-10);
  assert.ok(second.find(row => row.driverId === 'B').ratingChange > 70);
});

test('event centering keeps individual K candidates zero sum', () => {
  const result = calculateRatings([event(1, ['A', 'B', 'C'])], { individualKWeight: 1, eventCentering: 1 });
  assert.ok(Math.abs(result.rows.reduce((sum, row) => sum + row.ratingChange, 0)) < 1e-10);
});

test('uncertainty narrows with evidence and widens after inactivity', () => {
  const first = updateUncertainty(undefined, 1);
  const second = updateUncertainty(first.evidenceAfter, 1);
  const returnAfterFiveYears = updateUncertainty(second.evidenceAfter, 1, 5);
  assert.ok(first.after < first.before);
  assert.ok(second.after < first.after);
  assert.ok(returnAfterFiveYears.before > second.after);
  assert.ok(returnAfterFiveYears.evidenceBefore < second.evidenceAfter);
});

test('recent evidence decays by half in three years and never reaches a hard floor', () => {
  const decayed = updateUncertainty(20, 0, 3);
  assert.ok(Math.abs(decayed.evidenceBefore - 10) < 1e-12);
  let active;
  for (let eventIndex = 0; eventIndex < 100; eventIndex++) {
    active = updateUncertainty(active?.evidenceAfter, 1, 14 / 365.25);
  }
  assert.ok(active.after > 45);
  assert.ok(active.after < 80);
});

test('display uncertainty advances to an as-of date without changing stored evidence', () => {
  const state = uncertaintyAtDate(20, '2020-01-01', '2023-01-01');
  assert.ok(Math.abs(state.evidence - 10) < .01);
  assert.ok(state.uncertainty > updateUncertainty(20, 0).before);
});

test('return K boost is optional and rises smoothly with inactivity', () => {
  assert.equal(inactivityKMultiplier(5), 1);
  const config = { ...DEFAULT_CONFIGURATION, returnKBoost: 1, returnKGraceYears: 1, returnKHalfLifeYears: 1 };
  assert.equal(inactivityKMultiplier(1, config), 1);
  assert.equal(inactivityKMultiplier(2, config), 1.5);
  assert.ok(inactivityKMultiplier(5, config) > inactivityKMultiplier(2, config));
  const first = event(1, ['A', 'B']);
  first.date = '2020-01-01';
  const second = event(2, ['B', 'A']);
  second.date = '2025-01-01';
  const baseline = calculateRatings([first, second]).rows.find(row => row.eventId === '2' && row.driverId === 'B');
  const boosted = calculateRatings([first, second], config).rows.find(row => row.eventId === '2' && row.driverId === 'B');
  assert.ok(boosted.ratingChange > baseline.ratingChange);
});

test('rating rows retain structured evidence for event explanations', () => {
  const result = calculateRatings([event(1, ['A', 'B', 'C'])]);
  const winner = result.rows.find(row => row.driverId === 'A');
  assert.equal(winner.opponentsBeaten, 2);
  assert.equal(winner.keyRivalOutcome, 'beat');
  assert.equal(winner.fieldStrength, 1500);
  assert.ok(winner.uncertaintyAfter < winner.uncertaintyBefore);
  assert.ok(winner.effectiveEvidence > 0);
  assert.equal(winner.evidenceAfter, winner.effectiveEvidence);
});

test('an event weight scales rating movement proportionally', () => {
  const feature = calculateRatings([event(1, ['A', 'B'], 1)]).rows[0].ratingChange;
  const sprint = calculateRatings([event(1, ['A', 'B'], .5)]).rows[0].ratingChange;
  assert.equal(sprint, feature / 2);
});

test('published sprint weight matches the effective half-weight baseline', () => {
  assert.equal(DEFAULT_CONFIGURATION.sprintWeight, .5);
  const sprint = event(1, ['A', 'B'], DEFAULT_CONFIGURATION.sprintWeight);
  assert.equal(calculateRatings([sprint]).rows[0].eventWeight, DEFAULT_CONFIGURATION.sprintWeight);
});

test('an intentional zero event weight produces no movement or evidence', () => {
  const result = calculateRatings([event(1, ['A', 'B'], 0)]);
  assert.ok(result.rows.every(row => row.ratingChange === 0));
  assert.ok(result.rows.every(row => row.effectiveEvidence === 0));
});

test('explicit event sequence wins over identifiers when timestamps collide', () => {
  const first = event(1, ['B', 'A'], .5);
  Object.assign(first, { id: 'z-first', date: '2024-01-01', eventSequence: 1 });
  const second = event(2, ['A', 'B'], .5);
  Object.assign(second, { id: 'a-second', date: '2024-01-01', eventSequence: 2 });
  const result = calculateRatings([second, first]);
  const laterA = result.rows.find(row => row.eventId === 'a-second' && row.driverId === 'A');
  assert.ok(laterA.ratingBefore < 1500);
  assert.equal(laterA.eventSequence, 2);
});

test('retirements are softened by completed distance while disqualifications are not', () => {
  const finisher = { classified: true, disqualified: false, completion: 1 };
  assert.equal(comparisonWeight(finisher, { classified: false, disqualified: false, completion: .4 }), .4);
  assert.equal(comparisonWeight(finisher, { classified: false, disqualified: true, completion: .1 }), 1);
  assert.equal(comparisonWeight(finisher, { classified: false, disqualified: false, completion: .25 }, .15, .5), .5);
  assert.equal(comparisonWeight(finisher, { classified: false, disqualified: false, completion: .25 }, .15, 2), .15);
});

test('source classifications exclude non-starters and derive completion', () => {
  assert.equal(started({ positionText: 'DNS' }), false);
  assert.equal(disqualified({ positionText: 'DSQ' }), true);
  assert.equal(classified({ positionText: '4', positionNumber: 4 }), true);
  assert.equal(classified({ positionText: 'DNF', positionNumber: 4 }), false);
  assert.equal(started({ positionText: 'WIT' }), false);
  const field = participants([
    { driverId: 'A', positionNumber: 1, positionDisplayOrder: 1, laps: 50 },
    { driverId: 'B', positionText: 'Retired', positionDisplayOrder: 2, laps: 25 },
    { driverId: 'C', positionText: 'DNS', positionDisplayOrder: 3, laps: 0 }
  ]);
  assert.equal(field[1].completion, .5);
  assert.equal(field[2].started, false);
});

test('historical multiple-car entries count a driver once at their best classification', () => {
  const field = participants([
    { driverId: 'A', positionNumber: 8, positionDisplayOrder: 8, laps: 40 },
    { driverId: 'A', positionNumber: 3, positionDisplayOrder: 3, laps: 50 },
    { driverId: 'B', positionNumber: 1, positionDisplayOrder: 1, laps: 50 }
  ]);
  assert.equal(field.length, 2);
  assert.equal(field.find(driver => driver.driverId === 'A').positionNumber, 3);
});

test('junior loaders retain session order and use the published format weights', async () => {
  const result = (eventId, sessionName, sessionNumber, driverId, position) => ({
    eventId, eventDate: '2024-05-01', year: 2024, round: 1, raceName: 'Test Weekend',
    sessionName, sessionNumber, positionDisplayOrder: position, positionNumber: position,
    positionText: String(position), driverId, constructorId: 'team', laps: 20,
    driverName: driverId, constructorName: 'Team'
  });
  const rows = [
    result('weekend:feature', 'Feature Race', 6, 'A', 1),
    result('weekend:feature', 'Feature Race', 6, 'B', 2),
    result('weekend:sprint', 'Sprint Race', 3, 'B', 1),
    result('weekend:sprint', 'Sprint Race', 3, 'A', 2)
  ];
  const events = await loadJuniorEvents({ query: async () => rows }, 'f2');
  const feature = events.find(item => item.id === 'weekend:feature');
  const sprint = events.find(item => item.id === 'weekend:sprint');
  assert.deepEqual([sprint.eventSequence, feature.eventSequence], [3, 6]);
  assert.deepEqual([sprint.weight, feature.weight], [.5, 1]);
  const calculated = calculateRatings(events);
  assert.ok(calculated.rows.find(row => row.eventId === 'weekend:feature' && row.driverId === 'A').ratingBefore < 1500);
});
