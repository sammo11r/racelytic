const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const analysis = require('../frontend/js/season-analysis-model');
const comparison = require('../frontend/js/f1-season-comparison-model');
const { renderSeasonComparisonHtml } = require('../backend/season-comparison-renderer');
const { SERIES_PAGE_TEMPLATES } = require('../backend/series-pages');

function fixture(year = 2025, count = 2) {
  const calendar = [1, 2].map(round => ({ round, name: 'Weekend ' + round, date: year + '-01-01',
    sessions: Array.from({ length: count }, (_, index) => ({ id: `${round}-${index}`, sessionNumber: 4 + index * 2, name: 'Race', type: index === count - 1 ? 'F' : 'S' })) }));
  return { year, summary: { completed: true }, calendar, constructorChampionship: [], championship: [
    { driverId: 'a', name: 'A', position: 1, points: count * 20, championshipWon: true, raceResults: Object.fromEntries(calendar.flatMap(race => race.sessions.map(session => [session.id, { position: 1, points: 10, constructorId: 'team-a' }]))) },
    { driverId: 'b', name: 'B', position: 2, points: count * 16, championshipWon: false, raceResults: Object.fromEntries(calendar.flatMap(race => race.sessions.map(session => [session.id, { position: 2, points: 8, constructorId: 'team-b' }]))) }
  ] };
}

for (const series of ['f2', 'f3', 'academy']) {
  test(`${series} shares the compact comparison with series-specific server copy`, () => {
    assert.equal(SERIES_PAGE_TEMPLATES[series]['season-comparison'], 'season-comparison.html');
    const html = renderSeasonComparisonHtml(fs.readFileSync(path.join(__dirname, '../frontend/season-comparison.html'), 'utf8'), `/${series}/season-comparison`);
    assert.ok(html.includes(`class="${series}-mode"`));
    assert.ok(html.includes(`/assets/favicon-${series}.svg`));
    assert.ok(html.includes('season-comparison-page'));
    assert.ok(html.includes('Through the same weekend'));
    assert.ok(html.includes('Unclassified rate'));
    assert.ok(html.includes(series === 'academy' ? 'reverse-grid and standard races' : 'sprint and feature races'));
    assert.doesNotMatch(html, /FORMULA 1 ·|across Formula 1|Grands Prix only|Historical dropped|Grand Prix|Copy link|back-link|id="compare-seasons"/);
  });

  test(`${series} compares whole weekends across two- and three-session formats`, () => {
    const first = analysis.adaptJunior(fixture(2025, 2), series), second = analysis.adaptJunior(fixture(2021, 3), series);
    const pair = comparison.compare([first, second], 'matched', 1);
    assert.equal(pair.maxRound, 2);
    assert.equal(pair.cutoff, 1);
    assert.deepEqual(pair.snapshots.map(row => row.metrics.races), [2, 3]);
    assert.deepEqual(pair.snapshots.map(row => row.leader.points), [20, 30]);
    for (const snapshot of pair.snapshots) {
      assert.equal(snapshot.progress.at(-1).value, 100);
      assert.equal(snapshot.progress.at(-1).x, 100);
      assert.equal(snapshot.progress.at(-1).race.weekendRound, 1);
      assert.equal(snapshot.leader.championshipWon, false);
      assert.equal(snapshot.metrics.teams, 1);
      assert.equal(snapshot.fields[0].featureCount, 1);
      assert.equal(snapshot.fields[0].feature, 1);
    }
    assert.equal(pair.snapshots[1].fields[0].sprintCount, 2);
  });

  test(`${series} cancellation is excluded without blocking the next recorded weekend`, () => {
    const raw = fixture();
    raw.calendar[0].sessions[1].cancelled = true;
    raw.championship.forEach(driver => { driver.points -= driver.raceResults['1-1'].points; });
    const adapted = analysis.adaptJunior(raw, series);
    const snapshot = comparison.snapshot(adapted);
    assert.equal(snapshot.complete, true);
    assert.equal(snapshot.metrics.races, 3);
    assert.equal(snapshot.metrics.starts, 6);
    assert.equal(snapshot.progress[1].available, false);
    assert.equal(snapshot.leader.points, 30);
    assert.deepEqual(snapshot.mismatches, []);
    assert.equal(comparison.commonRounds(adapted, analysis.adaptJunior(fixture(), series)), 2);
  });

  test(`${series} a partial weekend or missing schedule constrains the shared cutoff`, () => {
    const raw = fixture();
    raw.championship.forEach(driver => { delete driver.raceResults['2-1']; driver.championshipWon = false; driver.champion = true; });
    const partial = analysis.adaptJunior(raw, series), complete = analysis.adaptJunior(fixture(), series);
    assert.equal(comparison.commonRounds(partial, complete), 1);
    const available = comparison.snapshot(partial);
    assert.equal(available.complete, false);
    assert.equal(available.leader.championshipWon, false);
    assert.equal(available.progress.at(-1).x, 75);
    assert.equal(available.metrics.races, 3);
    raw.calendar[0].sessions = [];
    const missing = analysis.adaptJunior(raw, series);
    assert.equal(comparison.commonRounds(missing, complete), 0);
    assert.equal(comparison.compare([missing, complete], 'matched', 2).snapshots[0].leader, undefined);
  });
}

test('junior unclassified rate distinguishes non-starts, DSQ and NC without claiming retirements', () => {
  const raw = fixture();
  const statuses = ['NC', 'DSQ', 'DNS', 'DNQ', 'WD', 'DNF'];
  raw.championship = statuses.map((status, index) => ({ driverId: String(index), name: status, points: 0, position: index + 1,
    raceResults: { '1-0': { position: 1000 + index, status, points: 0 } } }));
  const snapshot = comparison.snapshot(analysis.adaptJunior(raw, 'f2'));
  assert.equal(snapshot.metrics.starts, 3);
  assert.equal(snapshot.metrics.nonStarts, 3);
  assert.equal(snapshot.metrics.disqualifications, 1);
  assert.equal(snapshot.metrics.unclassified, 3);
  assert.equal(snapshot.metrics.unclassifiedRate, 100);
  assert.equal(snapshot.metrics.retirements, 1);
  assert.ok(snapshot.fields.every(row => row.finishCount === 0 && row.sprintCount === 0));
});

test('junior recorded bonus points, separate samples and sorting are preserved', () => {
  const raw = fixture();
  raw.championship[0].raceResults['1-0'].points = 12;
  raw.championship[0].points += 2;
  const snapshot = comparison.snapshot(analysis.adaptJunior(raw, 'academy'));
  assert.equal(snapshot.progress.at(-1).points, 42);
  assert.equal(snapshot.progress.at(-1).value, 100);
  assert.deepEqual(snapshot.mismatches, []);
  assert.equal(snapshot.fields[0].sprintCount, 2);
  assert.equal(snapshot.fields[0].featureCount, 2);
  assert.equal(comparison.sortedField(snapshot, 'all', 'feature', -1)[0].name, 'B');
  assert.equal(comparison.readState('?sort=sprint').sort, 'sprint');
  const script = fs.readFileSync(path.join(__dirname, '../frontend/js/f1-season-comparison.js'), 'utf8');
  assert.match(script, /analysis.adaptJunior\(response, seriesKey\)/);
  assert.match(script, /seriesPageUrl\('season'/);
  assert.match(script, /seriesPageUrl\('driver'/);
  assert.match(script, /activeSeriesAccent\(\)/);
});
