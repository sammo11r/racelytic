const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateRatings } = require('../backend/rating-engine');
const { teammateEvents } = require('../backend/rating-models');

function participant(driverId, constructorName, finishOrder) {
  return { driverId, driverName: driverId, constructorName, finishOrder, classified: true, completion: 1 };
}

test('teammate events retain only multi-driver constructor groups', () => {
  const events = teammateEvents([{ id: 'race-1', date: '2025-01-01', year: 2025, participants: [
    participant('a', 'Red', 1), participant('b', 'Red', 3), participant('c', 'Blue', 2),
    participant('d', '', 4)
  ] }]);
  assert.equal(events.length, 1);
  assert.equal(events[0].sourceEventId, 'race-1');
  assert.equal(events[0].constructorName, 'Red');
  assert.deepEqual(events[0].participants.map(driver => driver.driverId), ['a', 'b']);
});

test('teammate ratings never create cross-constructor comparisons', () => {
  const events = teammateEvents([{ id: 'race-1', date: '2025-01-01', year: 2025, participants: [
    participant('a', 'Red', 1), participant('b', 'Red', 3),
    participant('c', 'Blue', 2), participant('d', 'Blue', 4)
  ] }]);
  const result = calculateRatings(events, { collectComparisons: true });
  assert.equal(result.comparisons.length, 2);
  assert.ok(result.comparisons.every(comparison => comparison.sameConstructor));
  assert.ok(result.comparisons.every(comparison => comparison.bootstrapEventId === 'race-1'));
  assert.ok(result.comparisons.every(comparison => comparison.firstConstructorName === comparison.secondConstructorName));
});
