const assert = require('node:assert/strict');
const test = require('node:test');
const { academyComparisonLookups, comparisonRaceGroups } = require('../backend/driver-comparison');

test('driver comparison separates all shared races from same-team races', () => {
  const groups = comparisonRaceGroups([
    { raceId: 'one', sameTeam: 0, firstConstructorName: 'Team A', secondConstructorName: 'Team B' },
    { raceId: 'two', sameTeam: 1, firstConstructorName: 'Team A', secondConstructorName: 'Team A' },
    { raceId: 'three', sameTeam: 'true', firstConstructorName: 'Team C', secondConstructorName: 'Team C' }
  ]);
  assert.deepEqual(groups.sharedRaces.map(row => row.raceId), ['one', 'two', 'three']);
  assert.deepEqual(groups.teammateRaces.map(row => row.raceId), ['two', 'three']);
  assert.equal(groups.sharedRaces[0].sameTeam, false);
});

test('Academy comparison derives direct and reverse grids from qualifying', () => {
  const races = [
    { raceId: 'weekend', sessionId: 'reverse', sessionName: 'Reverse Grid Race', sessionNumber: 3, year: 2026 },
    { raceId: 'weekend', sessionId: 'feature', sessionName: 'Feature Race', sessionNumber: 4, year: 2026 }
  ];
  const qualifying = [
    { raceId: 'weekend', sessionId: 'qualifying', sessionName: 'Qualifying', sessionNumber: 2, driverId: 'one', positionNumber: 1 },
    { raceId: 'weekend', sessionId: 'qualifying', sessionName: 'Qualifying', sessionNumber: 2, driverId: 'eight', positionNumber: 8 }
  ];
  const lookup = academyComparisonLookups(races, qualifying);
  assert.equal(lookup.gridPosition(races[0], 'one'), 8);
  assert.equal(lookup.gridPosition(races[0], 'eight'), 1);
  assert.equal(lookup.gridPosition(races[1], 'one'), 1);
  assert.equal(lookup.qualifyingPosition(races[1], 'eight'), 8);
});

test('Academy form maps 2024 fastest and second-fastest qualifying classifications to each race', () => {
  const races = [
    { raceId: 'weekend', sessionId: 'race1', sessionName: 'Race 1', sessionNumber: 4, year: 2024 },
    { raceId: 'weekend', sessionId: 'race2', sessionName: 'Race 2', sessionNumber: 5, year: 2024 }
  ];
  const qualifying = [
    { raceId: 'weekend', sessionId: 'q1', sessionName: 'Qualifying 1', sessionNumber: 2, driverId: 'driver', positionNumber: 2 },
    { raceId: 'weekend', sessionId: 'q2', sessionName: 'Qualifying 2', sessionNumber: 3, driverId: 'driver', positionNumber: 7 }
  ];
  const lookup = academyComparisonLookups(races, qualifying);
  assert.equal(lookup.qualifyingPosition(races[0], 'driver'), 2);
  assert.equal(lookup.qualifyingPosition(races[1], 'driver'), 7);
  assert.equal(lookup.gridPosition(races[0], 'driver'), 2);
  assert.equal(lookup.gridPosition(races[1], 'driver'), 7);
});
