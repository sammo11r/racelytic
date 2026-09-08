const test = require('node:test');
const assert = require('node:assert/strict');
const { auditRatingEvents } = require('../backend/rating-audit');

function event(id, overrides = {}) {
  return { id, series: 'f2', date: '2024-01-01', datePrecision: 'date', year: 2024, round: 1,
    eventSequence: 1, name: 'Sprint Race', sessionName: 'Sprint Race', sessionType: 'sprint', weight: .5,
    participants: [
      { driverId: 'A', started: true }, { driverId: 'B', started: true }
    ], ...overrides };
}

test('rating event audit reports clean deterministic weekends', () => {
  const report = auditRatingEvents([
    event('sprint'),
    event('feature', { eventSequence: 2, name: 'Feature Race', sessionName: 'Feature Race',
      sessionType: 'feature', weight: 1 })
  ]);
  assert.equal(report.summary.events, 2);
  assert.equal(report.summary.weekends, 1);
  assert.equal(report.summary.issueCount, 0);
  assert.equal(report.summary.fallbackDateEvents, 2);
  assert.deepEqual(report.weekendFormats[0].sessions.map(item => item.type), ['sprint', 'feature']);
});

test('rating event audit exposes ordering, format, field and weight problems', () => {
  const report = auditRatingEvents([
    event('one', { eventSequence: 0, weight: .75, sessionType: 'feature', participants: [{ driverId: 'A' }] }),
    event('two', { eventSequence: 0, weight: -1, participants: [
      { driverId: 'A', started: true }, { driverId: 'A', started: true }
    ] })
  ]);
  assert.equal(report.issues.missingSequence.length, 2);
  assert.equal(report.issues.orderingCollisions.length, 1);
  assert.equal(report.issues.invalidWeights.length, 1);
  assert.equal(report.issues.smallFields.length, 1);
  assert.equal(report.issues.duplicateDrivers.length, 1);
  assert.equal(report.issues.formatMismatches.length, 1);
});
