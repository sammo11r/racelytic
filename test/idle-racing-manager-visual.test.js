const test = require('node:test');
const assert = require('node:assert/strict');
const { circuitDistancePoint, circuitPoint, easedPosition } = require('../frontend/js/idle-racing-manager-visual');

test('idle race visual provides bounded fictional circuit paths', () => {
  for (const circuit of ['industrial-park', 'ridgeway', 'aurora-ring', 'ember-coast', 'blackstone-pass', 'halcyon-circuit']) {
    const points = Array.from({ length: 100 }, (_, index) => circuitPoint(circuit, index / 100));
    assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
    assert.ok(points.every(point => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
    assert.notDeepEqual(points[0], points[25]);
  }
});

test('industrial park has an asymmetric infield section instead of an oval outline', () => {
  const points = Array.from({ length: 140 }, (_, index) => circuitPoint('industrial-park', index / 140));
  assert.ok(points.some(point => point.x > .6 && point.x < .75 && point.y > .44 && point.y < .56));
  assert.ok(points.some(point => point.x > .25 && point.x < .4 && point.y > .25 && point.y < .35));
});

test('distance-sampled circuit progress keeps cars evenly spaced', () => {
  const points = Array.from({ length: 40 }, (_, index) => circuitDistancePoint('industrial-park', index / 40));
  const distances = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  assert.ok(Math.max(...distances) / Math.min(...distances) < 1.15);
});

test('idle race position animation eases toward the simulated result', () => {
  const first = easedPosition(12, 4, .1);
  const second = easedPosition(first, 4, .1);
  assert.ok(first < 12 && first > 4);
  assert.ok(second < first && second > 4);
  assert.equal(easedPosition(7, 2, 0), 7);
});
