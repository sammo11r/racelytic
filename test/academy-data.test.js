const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const csv = require('csv-parser');
const { academySessionType } = require('../backend/series-config');
const { academyRaceAwardsPole, academyRaceDisplayName, academyRaceGridContext } = require('../backend/academy-race-analysis');
const academyChassis = require('../data/academy-chassis-specifications.json');

function read(name) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path.join(__dirname, `../data/fadb-${name}.csv`))
      .pipe(csv()).on('data', row => rows.push(row)).on('end', () => resolve(rows)).on('error', reject);
  });
}

test('F1 Academy archive contains complete official seasons and linked race data', async () => {
  const [seasons, races, sessions, results, drivers, teams, driverStandings] = await Promise.all([
    read('seasons'), read('races'), read('sessions'), read('session-results'), read('drivers'),
    read('constructors'), read('season-driver-standings')
  ]);
  assert.deepEqual(seasons.map(row => Number(row.year)), [2023, 2024, 2025, 2026]);
  assert.equal(races.length, 27);
  assert.ok(sessions.length >= 147);
  assert.ok(results.length >= 2177);
  assert.ok(drivers.length >= 54);
  assert.ok(teams.length >= 8);
  assert.equal(driverStandings.find(row => row.year === '2023' && row.positionNumber === '1')?.driverId, 'marta-garcia');
  assert.equal(driverStandings.find(row => row.year === '2024' && row.positionNumber === '1')?.driverId, 'abbi-pulling');
  assert.equal(driverStandings.find(row => row.year === '2025' && row.positionNumber === '1')?.driverId, 'doriane-pin');
  const raceIds = new Set(races.map(row => row.id));
  const sessionIds = new Set(sessions.map(row => row.id));
  assert.deepEqual(sessions.filter(row => !raceIds.has(row.raceId)).map(row => row.id), []);
  assert.deepEqual(results.filter(row => !sessionIds.has(row.sessionId)).map(row => row.sessionId), []);
  const resultSessionIds = new Set(results.map(row => row.sessionId));
  const missingCompletedClassifications = sessions.filter(row => Number(row.year) <= 2025
    && row.cancelled !== 'True' && !resultSessionIds.has(row.id));
  assert.deepEqual(missingCompletedClassifications.map(row => `${row.year} R${row.round} ${row.name}`), []);
  const montreal = races.find(row => row.year === '2025' && row.round === '4');
  const montrealSessions = sessions.filter(row => row.raceId === montreal.id);
  assert.deepEqual(montrealSessions.map(row => row.name), ['Free Practice', 'Qualifying', 'Race 1', 'Race 2', 'Race 3']);
  assert.ok(montrealSessions.every(row => resultSessionIds.has(row.id)));
});

test('F1 Academy nationalities and flags are complete', async () => {
  const [drivers, teams] = await Promise.all([read('drivers'), read('constructors')]);
  const flagDirectory = path.join(__dirname, '../frontend/assets/flags');
  const invalid = [...drivers, ...teams].filter(row => !/^[a-z]{2}$/.test(row.countryCode)
    || !fs.existsSync(path.join(flagDirectory, `${row.countryCode}.svg`)));
  assert.deepEqual(invalid.map(row => `${row.name}:${row.countryCode}`), []);
});

test('F1 Academy weekend formats classify reverse-grid races correctly', () => {
  assert.equal(academySessionType({ name: 'Race 2' }, 1, 3, 2023), 'S');
  assert.equal(academySessionType({ name: 'Race 1' }, 0, 2, 2024), 'F');
  assert.equal(academySessionType({ name: 'Race 1' }, 0, 2, 2025), 'S');
  assert.equal(academySessionType({ name: 'Race 2' }, 1, 3, 2025), 'S');
  assert.equal(academySessionType({ name: 'Reverse Grid Race' }, 0, 2, 2026), 'S');
  assert.equal(academySessionType({ name: 'Feature Race' }, 1, 2, 2026), 'F');
});

test('F1 Academy race analysis uses the real race labels and qualifying-derived grids', () => {
  const sessions = [
    { id: 'q1', name: 'Qualifying 1', isRace: false },
    { id: 'q2', name: 'Qualifying 2', isRace: false },
    { id: 'opening', name: 'Opening Race', isRace: true },
    { id: 'reverse', name: 'Reverse Grid Race', isRace: true },
    { id: 'feature', name: 'Feature Race', isRace: true }
  ];
  const results = new Map([
    ['q1', [{ driverId: 'fastest', positionNumber: 1 }, { driverId: 'eighth', positionNumber: 8 }]],
    ['q2', [{ driverId: 'eighth', positionNumber: 1 }, { driverId: 'fastest', positionNumber: 2 }]]
  ]);
  const opening = academyRaceGridContext(sessions[2], sessions, results, 2026);
  const reverse = academyRaceGridContext(sessions[3], sessions, results, 2026);
  const feature = academyRaceGridContext(sessions[4], sessions, results, 2026);
  assert.equal(academyRaceDisplayName(sessions[2]), 'Opening Race');
  assert.equal(opening.gridByDriver.get('eighth'), 1);
  assert.equal(opening.gridByDriver.get('fastest'), 2);
  assert.equal(reverse.gridByDriver.get('eighth'), 1);
  assert.equal(reverse.gridByDriver.get('fastest'), 8);
  assert.equal(feature.gridByDriver.get('fastest'), 1);
  assert.equal(academyRaceAwardsPole(sessions[2], sessions, 2026), false);
  assert.equal(academyRaceAwardsPole(sessions[3], sessions, 2026), false);
  assert.equal(academyRaceAwardsPole(sessions[4], sessions, 2026), true);
  const carryoverSessions = [
    { id: 'q1', name: 'Qualifying', isRace: false },
    { id: 'race1', name: 'Race 1', isRace: true },
    { id: 'race2', name: 'Race 2', isRace: true },
    { id: 'race3', name: 'Race 3', isRace: true }
  ];
  const carryover = academyRaceGridContext(carryoverSessions[1], carryoverSessions, results, 2025);
  assert.match(carryover.gridNote, /final Miami Race 2 grid/);
});

test('F1 Academy chassis record covers every technical section', () => {
  assert.equal(academyChassis.length, 1);
  const chassis = academyChassis[0];
  const required = [
    'name', 'generation', 'manufacturer', 'designer', 'chassisConstruction', 'frontSuspension',
    'rearSuspension', 'lengthMm', 'widthMm', 'heightMm', 'wheelbaseMm', 'engineName',
    'engineConfiguration', 'engineLayout', 'transmission', 'powerHp', 'powerKw', 'powerRpm',
    'torqueNm', 'weightKg', 'fuel', 'lubricants', 'tyres', 'wheelRimInches', 'topSpeedKph',
    'lateralAccelerationG', 'brakingDecelerationG', 'zeroTo100Seconds', 'zeroTo200Seconds',
    'aero', 'electronics', 'debut', 'sourceUrl', 'manufacturerSourceUrl'
  ];
  assert.deepEqual(required.filter(field => chassis[field] === null || chassis[field] === undefined || chassis[field] === ''), []);
  assert.equal(chassis.name, 'Tatuus T-421-F1A');
  assert.equal(chassis.powerHp, 174);
  assert.equal(chassis.topSpeedKph, 240);
  assert.equal(chassis.wheelRimInches, 13);
});
