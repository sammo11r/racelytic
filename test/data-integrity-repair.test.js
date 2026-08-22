const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { markFastestLap } = require('../scripts/import-f3-2026-fia');
const { consolidateDriverStandings } = require('../scripts/collect-f3-data');
const { repairEntries } = require('../scripts/repair-junior-data');

function readData(filename) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path.join(__dirname, '../data', filename))
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

test('FIA importer awards fastest lap only to an eligible top-ten finisher', () => {
  const results = [
    { driverId: 'overall-fastest', positionNumber: 16, fastestLapTimeMillis: 79000, fastestLap: 'False', status: 'CLA' },
    { driverId: 'disqualified', positionNumber: 5, fastestLapTimeMillis: 79500, fastestLap: 'False', status: 'DSQ' },
    { driverId: 'eligible-fastest', positionNumber: 7, fastestLapTimeMillis: 80000, fastestLap: 'False', status: 'CLA' }
  ];
  markFastestLap(results);
  assert.equal(results[0].fastestLap, 'False');
  assert.equal(results[1].fastestLap, 'False');
  assert.equal(results[2].fastestLap, 'True');
});

test('consolidates standings split across multiple teams', () => {
  const standings = [
    { year: 2025, positionNumber: 27, driverId: 'driver', constructorId: 'first-team', points: 10, championshipWon: 'False', starts: 2, wins: 0, podiums: 1, poles: 0, fastestLaps: 0, retirements: 0 },
    { year: 2025, positionNumber: 27, driverId: 'driver', constructorId: 'second-team', points: 0, championshipWon: 'False', starts: 2, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, retirements: 0 }
  ];
  const rows = consolidateDriverStandings(standings, [
    { year: '2025', round: '1', driverId: 'driver', constructorId: 'first-team' },
    { year: '2025', round: '10', driverId: 'driver', constructorId: 'second-team' }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].points, 10);
  assert.equal(rows[0].starts, 4);
  assert.equal(rows[0].constructorId, 'second-team');
});

test('backfills an entry for every result driver and team combination', () => {
  const repair = repairEntries([
    { raceId: 'race-1', year: '2026', round: '1', driverNumber: '1', driverId: 'first', constructorId: 'team', chassisId: 'chassis', engineId: 'engine' }
  ], [
    { raceId: 'race-1', year: '2026', round: '1', driverNumber: '1', driverId: 'first', constructorId: 'team' },
    { raceId: 'race-1', year: '2026', round: '1', driverNumber: '2', driverId: 'second', constructorId: 'team' }
  ]);
  assert.equal(repair.added, 1);
  assert.deepEqual(repair.rows.find(row => row.driverId === 'second'), {
    raceId: 'race-1', year: '2026', round: '1', driverNumber: '2', driverId: 'second',
    constructorId: 'team', chassisId: 'chassis', engineId: 'engine'
  });
});

test('2026 F1 calendar contains all 23 current rounds including Sepang', async () => {
  const races = (await readData('f1db-races.csv')).filter(race => race.year === '2026');
  assert.equal(races.length, 23);
  assert.deepEqual(races.map(race => Number(race.round)).sort((a, b) => a - b), Array.from({ length: 23 }, (_, index) => index + 1));
  const sepang = races.find(race => race.circuitId === 'sepang');
  assert.equal(sepang.round, '16');
  assert.equal(sepang.grandPrixId, 'bahrain');
  assert.equal(races.find(race => race.grandPrixId === 'abu-dhabi').round, '23');
});

test('post-race penalties and fastest-lap eligibility remain applied', async () => {
  const [f2Results, f2Standings, f3Results] = await Promise.all([
    readData('f2db-session-results.csv'),
    readData('f2db-season-driver-standings.csv'),
    readData('f3db-session-results.csv')
  ]);
  const montreal = f2Results.filter(result => result.sessionId === 'fia-formula-2-championship_2026_montreal_race-2');
  const tsolov = montreal.find(result => result.driverId === 'nikola-tsolov');
  assert.deepEqual([tsolov.positionNumber, tsolov.points, tsolov.gapMillis], ['12', '0', '11859']);
  assert.equal(montreal.find(result => result.driverId === 'sebastian-montoya').points, '12');
  assert.equal(montreal.find(result => result.driverId === 'ritomo-miyata').time, '55:47.074');

  assert.ok(f2Standings.some(row => row.year === '2026' && row.driverId === 'emerson-fanucchi-fittipaldi-jr' && row.points === '10'));
  assert.ok(!f2Standings.some(row => row.year === '2026' && row.driverId === 'enzo-fittipaldi'));

  const melbourne = f3Results.filter(result => result.sessionId === 'fia-formula-3-championship_2026_melbourne_race');
  const sharp = melbourne.find(result => result.driverId === 'louis-sharp');
  const wharton = melbourne.find(result => result.driverId === 'james-wharton');
  assert.deepEqual([sharp.points, sharp.fastestLap], ['0', 'False']);
  assert.deepEqual([wharton.points, wharton.fastestLap], ['1', 'True']);
});
