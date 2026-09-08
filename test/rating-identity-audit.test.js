const assert = require('node:assert/strict');
const test = require('node:test');
const { auditRatingIdentities, normalizedIdentity } = require('../backend/rating-identity-audit');

const participant = (driverId, driverName, constructorId, constructorName) =>
  ({ driverId, driverName, constructorId, constructorName });

test('identity normalization is accent and punctuation insensitive', () => {
  assert.equal(normalizedIdentity('  Álex O\'Connor Jr. '), 'alex o connor jr');
});

test('identity audit separates linked and conflicting cross-series drivers', () => {
  const report = auditRatingIdentities({
    f3: [{ participants: [participant('alex-driver', 'Álex Driver', 'team-a', 'Team A')] }],
    f2: [{ participants: [participant('alex-driver', 'Alex Driver', 'team-b', 'Team B'),
      participant('sam-other', 'Sam Other', 'team-b', 'Team B')] }],
    f1: [{ participants: [participant('alex-f1', 'Alex Driver', 'team-c', 'Team C')] }]
  });
  assert.equal(report.crossSeries.matchedNames, 1);
  assert.equal(report.crossSeries.linkedNames, 0);
  assert.equal(report.crossSeries.unlinkedNames.length, 1);
  assert.equal(report.issueCount, 1);
});

test('identity audit reports model-network connectivity and missing teams', () => {
  const report = auditRatingIdentities({ f1: [{ participants: [
    participant('a', 'A', 'red', 'Red'), participant('b', 'B', 'red', 'Red'),
    participant('b', 'B', 'blue', 'Blue'), participant('c', 'C', '', '')
  ] }] }).series.f1;
  assert.equal(report.graph.components, 2);
  assert.equal(report.graph.transferDrivers, 1);
  assert.equal(report.missingConstructorId, 1);
  assert.equal(report.issueCount, 2);
});

test('identity audit documents exact historical constructor names without masking new collisions', () => {
  const known = auditRatingIdentities({ f1: [{ participants: [
    participant('a', 'A', 'lotus', 'Lotus'), participant('b', 'B', 'lotus-f1', 'Lotus')
  ] }] }).series.f1;
  assert.deepEqual(known.constructorNameCollisions, []);
  assert.deepEqual(known.approvedConstructorNameCollisions, [
    { name: 'lotus', values: ['lotus', 'lotus-f1'] }
  ]);
  assert.equal(known.issueCount, 0);

  const unexpected = auditRatingIdentities({ f1: [{ participants: [
    participant('a', 'A', 'lotus', 'Lotus'), participant('b', 'B', 'lotus-f1', 'Lotus'),
    participant('c', 'C', 'new-lotus', 'Lotus')
  ] }] }).series.f1;
  assert.equal(unexpected.constructorNameCollisions.length, 1);
  assert.equal(unexpected.approvedConstructorNameCollisions.length, 0);
  assert.equal(unexpected.issueCount, 1);
});
