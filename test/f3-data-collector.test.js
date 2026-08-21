const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalChassisId, countryCode, createDataset, dateTimeValue, dateValue, mergeDataset, resultRow, slug } = require('../scripts/collect-f3-data');
const chassisSpecifications = require('../data/f3-chassis-specifications.json');

test('normalizes Formula 3 source values', () => {
  assert.equal(countryCode('https://assets.motorsportstats.com/flags/svg/gb.svg'), 'gb');
  assert.equal(dateValue(1772755200), '2026-03-06');
  assert.equal(dateTimeValue(1772747400), '2026-03-05T21:50:00Z');
  assert.equal(slug('Dallara F3 2025'), 'dallara-f3-2025');
  assert.equal(canonicalChassisId('Dallara F3 2020'), 'dallara-f3-2019');
  assert.equal(canonicalChassisId('dallara-f3-2021'), 'dallara-f3-2019');
});

test('defines the two FIA Formula 3 chassis generations', () => {
  assert.deepEqual(chassisSpecifications.map(chassis => chassis.id), ['dallara-f3-2019', 'dallara-f3-2025']);
  assert.deepEqual(chassisSpecifications.map(chassis => [chassis.introducedYear, chassis.retiredYear]), [[2019, 2024], [2025, null]]);
  assert.ok(chassisSpecifications.every(chassis => chassis.engineId === 'mecachrome-v634'));
  assert.deepEqual(chassisSpecifications.map(chassis => chassis.wheelRimInches), [13, 16]);
});

test('maps a Motorsport Stats classification into a stable result row', () => {
  const row = resultRow(
    { session: { slug: 'f3-race' } },
    { id: 'race-id', year: 2026, round: 1 },
    { finishPosition: 1, carNumber: '2', classifiedStatus: 'CLA', drivers: [{ slug: 'ugo-ugochukwu' }],
      team: { slug: 'campos-racing' }, laps: 23, time: 2579653, gap: {}, bestLap: { lap: 4, time: 97379 } },
    1,
    { poleDrivers: [{ slug: 'ugo-ugochukwu' }], fastestLapDrivers: [] }
  );
  assert.equal(row.driverId, 'ugo-ugochukwu');
  assert.equal(row.constructorId, 'campos-racing');
  assert.equal(row.polePosition, 'True');
  assert.equal(row.fastestLap, 'False');
});

test('merges yearly Formula 3 checkpoints into one dataset', () => {
  const target = createDataset();
  const season = createDataset();
  season.maps.drivers.set('test-driver', { id: 'test-driver', name: 'Test Driver', countryCode: 'nl' });
  season.rows.seasons.push({ year: 2026 });
  mergeDataset(target, season);
  assert.deepEqual(target.maps.drivers.get('test-driver'), season.maps.drivers.get('test-driver'));
  assert.deepEqual(target.rows.seasons, [{ year: 2026 }]);
});

test('normalizes legacy chassis labels from cached checkpoints', () => {
  const target = createDataset();
  const season = createDataset();
  season.maps.chassis.set('dallara-f3-2020', { id: 'dallara-f3-2020', name: 'Dallara F3 2020' });
  season.rows.entries.push({ raceId: 'race-id', chassisId: 'dallara-f3-2020' });
  mergeDataset(target, season);
  assert.equal(target.maps.chassis.size, 1);
  assert.equal(target.maps.chassis.get('dallara-f3-2019').name, 'Dallara F3 2019');
  assert.equal(target.rows.entries[0].chassisId, 'dallara-f3-2019');
});
