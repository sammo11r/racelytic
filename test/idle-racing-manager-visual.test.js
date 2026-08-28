const test = require('node:test');
const assert = require('node:assert/strict');
const { circuitPoint, easedPosition } = require('../frontend/js/idle-racing-manager-visual');

test('idle race visual provides bounded fictional circuit paths', () => {
  for (const circuit of ['industrial-park', 'ridgeway', 'aurora-ring']) {
    const points = Array.from({ length: 100 }, (_, index) => circuitPoint(circuit, index / 100));
    assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
    assert.ok(points.every(point => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
    assert.notDeepEqual(points[0], points[25]);
  }
});

test('idle race position animation eases toward the simulated result', () => {
  const first = easedPosition(12, 4, .1);
  const second = easedPosition(first, 4, .1);
  assert.ok(first < 12 && first > 4);
  assert.ok(second < first && second > 4);
  assert.equal(easedPosition(7, 2, 0), 7);
});
