const test = require('node:test');
const assert = require('node:assert/strict');
const { displayedUncertainty, evidenceThresholds, modelConfiguration,
  uncertaintyLabel } = require('../backend/rating-presentation');

test('displayed uncertainty decays evidence to the requested date', () => {
  const row = { evidence_after: 20, event_date: '2020-01-01' };
  const state = displayedUncertainty(row, '2023-01-01', modelConfiguration());
  assert.ok(Math.abs(state.evidence - 10) < .01);
  assert.ok(state.uncertainty > displayedUncertainty(row, '2020-01-01', modelConfiguration()).uncertainty);
});

test('evidence labels use championship-relative thresholds', () => {
  assert.deepEqual(evidenceThresholds('f1'), { measured: 10, stable: 50 });
  assert.deepEqual(evidenceThresholds('academy'), { measured: 6, stable: 16 });
  assert.equal(uncertaintyLabel('f1', 80, 20), 'Measured');
  assert.equal(uncertaintyLabel('academy', 80, 20), 'Stable');
});

test('stored model configuration is validated before presentation', () => {
  assert.equal(modelConfiguration({ configuration: '{"evidenceHalfLifeYears":5}' }).evidenceHalfLifeYears, 5);
  assert.equal(modelConfiguration({ configuration: 'invalid' }).evidenceHalfLifeYears, 3);
});

test('stored model configuration accepts parsed database JSON', () => {
    const parsed = modelConfiguration({ configuration: { returnKBoost: 0.5, returnKGraceYears: 1.5, returnKHalfLifeYears: 2 } });
    assert.equal(parsed.returnKBoost, 0.5);
    assert.equal(parsed.returnKGraceYears, 1.5);
    assert.equal(parsed.returnKHalfLifeYears, 2);
});
