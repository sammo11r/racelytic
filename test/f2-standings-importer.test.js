const test = require('node:test');
const assert = require('node:assert/strict');
const {
  latestCompletedEvents,
  slugFromHref,
  validateStandings
} = require('../scripts/import-f2-standings');

test('extracts Motorsport Stats entity slugs', () => {
  assert.equal(slugFromHref('/driver/leonardo-fornaroli/summary/series/f2', 'driver'), 'leonardo-fornaroli');
  assert.equal(slugFromHref('/team/invicta-racing/summary/series/f2', 'team'), 'invicta-racing');
});

test('rejects incomplete official standings', () => {
  assert.throws(
    () => validateStandings([
      { id: 'first', positionNumber: 1 },
      { id: 'third', positionNumber: 3 }
    ], '2025', 'driver'),
    /Missing position 2/
  );
});

test('selects the latest round with non-cancelled race results', () => {
  const races = [
    { id: 'r1', year: '2025', round: '1' },
    { id: 'r2', year: '2025', round: '2' },
    { id: 'r3', year: '2025', round: '3' }
  ];
  const sessions = [
    { id: 's1', raceId: 'r1', isRace: 'True', cancelled: 'False' },
    { id: 's2', raceId: 'r2', isRace: 'True', cancelled: 'False' },
    { id: 's3', raceId: 'r3', isRace: 'True', cancelled: 'True' }
  ];
  const results = [{ sessionId: 's1' }, { sessionId: 's2' }, { sessionId: 's3' }];
  assert.deepEqual(latestCompletedEvents(races, sessions, results).map(race => race.id), ['r2']);
});
