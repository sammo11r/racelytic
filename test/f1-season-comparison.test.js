const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../frontend/js/f1-season-comparison-model');
const { SERIES_PAGE_TEMPLATES } = require('../backend/series-pages');

function fixture(year = 2025, completed = true) {
  return { year, summary: { completed }, calendar: [1,2,3].map(round => ({ round, name: 'Race ' + round, date: '2025-01-01' })),
    driverChampionship: [
      { driverId: 'a', name: 'A', position: 1, points: 68, championshipWon: completed, raceResults: {
        1: { position: 1, points: 25, qualifyingPosition: 2, constructorId: 'team-a' },
        2: { position: 2, points: 18, qualifyingPosition: 3, constructorId: 'team-a' },
        3: { position: 1, points: 25, qualifyingPosition: 1, constructorId: 'team-a' }
      } },
      { driverId: 'b', name: 'B', position: 2, points: 61, raceResults: {
        1: { position: 2, points: 18, qualifyingPosition: 1, constructorId: 'team-b' },
        2: { position: 1, points: 25, qualifyingPosition: 1, constructorId: 'team-b' },
        3: { position: 2, points: 18, qualifyingPosition: 2, constructorId: 'team-b' }
      } }
    ] };
}

test('historical progression uses the same counted numerator and denominator', () => {
  const data = fixture(1988);
  const senna = [...Array(8).fill(9), ...Array(3).fill(6), 4, 0, 0, 0, 0];
  const prost = [...Array(7).fill(9), ...Array(7).fill(6), 0, 0];
  data.calendar = senna.map((_, index) => ({ round: index + 1 }));
  data.driverChampionship.forEach((driver, index) => {
    driver.points = index ? 87 : 90;
    driver.raceResults = Object.fromEntries((index ? prost : senna).map((points, i) => [i + 1, { positionText: points ? '1' : 'DNF', points }]));
  });
  const snapshot = model.snapshot(data);
  assert.equal(snapshot.progress.at(-1).points, 90);
  assert.equal(snapshot.progress.at(-1).value, 100);
  assert.ok(snapshot.progress.every(point => point.value <= 100));
  assert.equal(snapshot.metrics.margin, 3);
});

test('partial calendars do not extend progression or count future races', () => {
  const data = fixture(2026, false);
  for (const driver of data.driverChampionship) delete driver.raceResults[3];
  const snapshot = model.snapshot(data);
  assert.equal(snapshot.metrics.races, 2);
  assert.equal(snapshot.progress.length, 2);
  assert.equal(snapshot.progress.at(-1).x, 2 / 3 * 100);
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.leader.championshipWon, false);
});

test('matched cutoff uses recorded rounds in both seasons and reconstructs standings', () => {
  const first = fixture(), second = fixture(2026, false);
  for (const driver of second.driverChampionship) delete driver.raceResults[3];
  const compared = model.compare([first, second], 'matched', 99);
  assert.equal(compared.cutoff, 2);
  assert.equal(compared.maxRound, 2);
  for (const snapshot of compared.snapshots) {
    assert.equal(snapshot.leader.points, 43);
    assert.equal(snapshot.leader.tied, true);
    assert.equal(snapshot.metrics.margin, 0);
    assert.equal(snapshot.progress.at(-1).x, 100);
    assert.equal(snapshot.metrics.races, 2);
  }
});

test('missing rounds constrain matched scope and remain gaps in available charts', () => {
  const first = fixture(), second = fixture();
  for (const driver of first.driverChampionship) delete driver.raceResults[2];
  assert.equal(model.commonRounds(first, second), 1);
  assert.equal(model.snapshot(first).progress[1].available, false);
  assert.equal(model.snapshot(first).complete, false);
});

test('retirements exclude non-starts and disqualifications, and NC alone is unknown', () => {
  const data = fixture();
  const results = [{ positionText: 'DNF' }, { positionText: 'DNS', reasonRetired: 'Engine' }, { positionText: 'DNQ' },
    { positionText: 'DSQ', reasonRetired: 'Technical infringement' }, { positionText: 'NC' }, { position: 5, reasonRetired: 'Finished' }, { position: 12, reasonRetired: 'Engine' }];
  data.analysisDrivers = results.map((result, i) => ({ driverId: 'x' + i, name: 'Driver ' + i, raceResults: { 1: result } }));
  const snapshot = model.snapshot(data);
  assert.equal(snapshot.metrics.starts, 5);
  assert.equal(snapshot.metrics.retirements, 2);
  assert.equal(snapshot.metrics.retirementRate, 40);
  assert.equal(snapshot.metrics.nonStarts, 2);
  assert.equal(snapshot.metrics.disqualifications, 1);
});

test('full-field samples and sorting retain drivers absent from standings', () => {
  const data = fixture();
  data.analysisDrivers = [...data.driverChampionship, { driverId: 'extra', name: 'Extra', points: null, position: null, raceResults: { 1: { position: 5, points: 0 }, 2: { positionText: 'DSQ' } } }];
  const snapshot = model.snapshot(data);
  assert.equal(snapshot.fields.length, 3);
  assert.equal(snapshot.fields[2].finishCount, 1);
  assert.equal(snapshot.fields[2].qualifyingCount, 0);
  assert.equal(snapshot.fields[2].spread, null);
  assert.equal(snapshot.fields[2].position, null);
  assert.equal(model.sortedField(snapshot, 'all', 'position', -1).at(-1).driverId, 'extra');
  assert.equal(model.sortedField(snapshot, 'ten', 'position', 1).length, 2);
});

test('matched driver fields exclude future-only participants and zero common data is safe', () => {
  const data = fixture();
  data.analysisDrivers = [...data.driverChampionship, { driverId: 'late', name: 'Late', raceResults: { 3: { position: 5, points: 0 } } }];
  assert.equal(model.snapshot(data, 1).fields.length, 2);
  const empty = fixture();
  empty.driverChampionship.forEach(driver => { driver.raceResults = {}; });
  const comparison = model.compare([data, empty], 'matched', 1);
  assert.equal(comparison.cutoff, 0);
  assert.equal(comparison.snapshots[0].leader, undefined);
  assert.equal(comparison.snapshots[1].metrics.retirementRate, null);
});

test('half points stay fractional and adjustments are flagged rather than normalized away', () => {
  const data = fixture();
  data.driverChampionship[0].points = 70.5;
  const snapshot = model.snapshot(data);
  assert.equal(snapshot.metrics.margin, 9.5);
  assert.deepEqual(snapshot.mismatches, ['A']);
  assert.equal(snapshot.progress.at(-1).value, 100);
});

test('URL state validates views, cutoffs and field sorting', () => {
  const state = model.readState('?first=1988&second=2025&view=field&basis=matched&round=12&field=ten&sort=finish&direction=desc');
  assert.deepEqual(state, { first: '1988', second: '2025', view: 'field', basis: 'matched', round: 12, field: 'ten', sort: 'finish', direction: -1 });
  const invalid = model.readState('?view=bad&round=-3&sort=bad&basis=bad');
  assert.equal(invalid.view, 'overview'); assert.equal(invalid.round, null); assert.equal(invalid.sort, 'position'); assert.equal(invalid.basis, 'available');
});

test('comparison removes clutter and shares its layout across championships', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/season-comparison.html'), 'utf8');
  assert.doesNotMatch(html, /back-link|id="compare-seasons"|Copy link|competition-index/);
  for (const id of ['swap-seasons', 'comparison-basis', 'comparison-round', 'comparison-view', 'comparison-fields']) assert.ok(html.includes(`id="${id}"`));
  const js = fs.readFileSync(path.join(__dirname, '../frontend/js/f1-season-comparison.js'), 'utf8');
  assert.match(js, /current !== requestId/); assert.match(js, /history.replaceState/); assert.match(js, /seasonState\(candidate\).complete/);
  for (const series of ['f2', 'f3', 'academy']) {
    const file = SERIES_PAGE_TEMPLATES[series]['season-comparison'];
    assert.equal(file, 'season-comparison.html');
    const junior = fs.readFileSync(path.join(__dirname, '../frontend', file), 'utf8');
    assert.ok(junior.includes('/js/f1-season-comparison.js'));
    assert.ok(junior.includes('id="swap-seasons"'));
  }
});
