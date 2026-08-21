const test = require('node:test');
const assert = require('node:assert/strict');
const {
  eligibleFastestLapDrivers,
  f2ResultPoints,
  f3ResultPoints,
  f3SessionType,
  resolveSeasonAwards
} = require('../backend/routes/seasons');
const pool = require('../backend/db');

test.after(async () => {
  await pool.end();
});

test('classifies each historical Formula 3 weekend format', () => {
  assert.equal(f3SessionType({ sessionNumber: 4, name: 'Race' }, 0, 2, 2019), 'F');
  assert.equal(f3SessionType({ sessionNumber: 6, name: 'Race' }, 1, 2, 2019), 'S');
  assert.equal(f3SessionType({ sessionNumber: 4, name: 'Race' }, 0, 3, 2021), 'S');
  assert.equal(f3SessionType({ sessionNumber: 6, name: 'Race' }, 1, 3, 2021), 'S');
  assert.equal(f3SessionType({ sessionNumber: 8, name: 'Race' }, 2, 3, 2021), 'F');
  assert.equal(f3SessionType({ sessionNumber: 6, name: 'Race' }, 1, 2, 2025), 'F');
});

test('uses official F3 points before historical scoring fallbacks', () => {
  assert.equal(f3ResultPoints({ officialPoints: 7 }, 'S', 2025, false), 7);
  assert.equal(f3ResultPoints({ officialPoints: null, positionNumber: 2 }, 'S', 2021, false), 12);
  assert.equal(f3ResultPoints({ officialPoints: null, positionNumber: 2 }, 'S', 2025, false), 9);
  assert.equal(f3ResultPoints({ officialPoints: null, positionNumber: 1, fastestLap: true }, 'F', 2025, true), 28);
});

test('disqualified F2 and F3 results always score zero points', () => {
  assert.equal(f2ResultPoints({ officialPoints: 10, status: 'DSQ' }, 'S', 2025, false), 0);
  assert.equal(f3ResultPoints({ officialPoints: 11, status: 'DSQ' }, 'S', 2023, false), 0);
});

test('awards fastest lap to the quickest top-ten finisher in each race session', () => {
  const drivers = eligibleFastestLapDrivers([
    { sessionId: 'sprint', driverId: 'raw-fastest', positionNumber: 14, fastestLap: true, fastestLapTimeMillis: 80000 },
    { sessionId: 'sprint', driverId: 'disqualified-fastest', positionNumber: 5, status: 'DSQ', fastestLap: false, fastestLapTimeMillis: 80200 },
    { sessionId: 'sprint', driverId: 'eligible-fastest', positionNumber: 7, fastestLap: false, fastestLapTimeMillis: 80500 },
    { sessionId: 'sprint', driverId: 'eligible-slower', positionNumber: 2, fastestLap: false, fastestLapTimeMillis: 81000 },
    { sessionId: 'feature', driverId: 'feature-fastest', positionNumber: 10, fastestLap: true, fastestLapTimeMillis: '' }
  ]);

  assert.equal(drivers.get('sprint'), 'eligible-fastest');
  assert.equal(drivers.get('feature'), 'feature-fastest');
});

test('assigns pole only to the feature-race qualifying pole sitter', () => {
  const poles = new Map([['round-1', 'pole-sitter']]);
  const fastest = new Map([
    ['sprint', 'pole-sitter'],
    ['feature', 'pole-sitter']
  ]);
  const sprint = resolveSeasonAwards(
    { sessionId: 'sprint', driverId: 'pole-sitter' },
    { raceId: 'round-1', type: 'S' },
    poles,
    fastest
  );
  const feature = resolveSeasonAwards(
    { sessionId: 'feature', driverId: 'pole-sitter' },
    { raceId: 'round-1', type: 'F' },
    poles,
    fastest
  );

  assert.deepEqual(sprint, { polePosition: false, fastestLap: true });
  assert.deepEqual(feature, { polePosition: true, fastestLap: true });
});
