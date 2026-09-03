const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../frontend/js/season-analysis-model');
const { renderSeasonAnalysisHtml } = require('../backend/season-analysis-renderer');
const { SERIES_PAGE_TEMPLATES } = require('../backend/series-pages');
const { f2SessionType, f3SessionType } = require('../backend/routes/seasons');
const { academySessionType } = require('../backend/series-config');
test.after(async () => require('../backend/db').end());

function fixture(year = 2025) {
  return { year, summary: { completed: true }, calendar: [
    { round: 1, name: 'Melbourne', date: '2025-03-15', sessions: [
      { id: 's1', sessionNumber: 4, name: 'Race' }, { id: 's2', sessionNumber: 6, name: 'Race', cancelled: true }
    ] },
    { round: 2, name: 'Bahrain', date: '2025-04-12', sessions: [
      { id: 's3', sessionNumber: 4, name: 'Race' }, { id: 's4', sessionNumber: 6, name: 'Race' }
    ] }
  ], championship: [
    { driverId: 'a', name: 'A', points: 28, champion: true, raceResults: {
      s1: { position: 1, points: 10 }, s2: { position: 1, points: 25 },
      s3: { position: 1001, positionText: 1001, status: 'DSQ', points: 0 }, s4: { position: 2, points: 18 }
    } },
    { driverId: 'b', name: 'B', points: 35, championshipWon: true, raceResults: {
      s1: { position: 2, points: 8 }, s3: { position: 3, points: 6 }, s4: { position: 3, points: 21 }
    } }
  ], constructorChampionship: [{ name: 'Team', champion: true, points: 63 }] };
}

for (const series of ['f2', 'f3', 'academy']) {
  test(`${series} uses the approved shared layout and correct server-rendered copy`, () => {
    assert.equal(SERIES_PAGE_TEMPLATES[series]['season-analysis'], 'season-analysis.html');
    const html = renderSeasonAnalysisHtml(fs.readFileSync(path.join(__dirname, '../frontend/season-analysis.html'), 'utf8'), `/${series}/season-analysis`);
    assert.ok(html.includes(`class="${series}-mode"`));
    assert.ok(html.includes(`/assets/favicon-${series}.svg`));
    assert.ok(html.includes('season-analysis-page'));
    assert.ok(html.includes('/js/season-analysis.js'));
    assert.doesNotMatch(html, /FORMULA 1 · SEASON|Grand Prix classifications|Sprints are excluded|share-analysis|back-link/);
    if (series === 'academy') assert.match(html, /reverse-grid and standard races/);
    else assert.match(html, /sprint and feature races/);
  });
  test(`${series} preserves session points, all drivers and cancellations`, () => {
    const data = model.adaptJunior(fixture(), series);
    const state = model.seasonState(data);
    assert.equal(data.driverChampionship.length, 2);
    assert.equal(state.recorded.length, 3);
    assert.equal(state.expected.length, 3);
    assert.equal(state.complete, true);
    assert.equal(state.roundStatus(data.calendar[1]), 'cancelled');
    assert.equal(data.driverChampionship[0].championshipWon, false);
    assert.equal(data.driverChampionship[1].championshipWon, true);
    assert.equal(data.constructorChampionship[0].championshipWon, false);
    assert.equal(model.series(data)[0].values.at(-1).points, 28);
    assert.equal(model.series(data)[1].values.at(-1).points, 35); // Recorded bonus points stay intact.
    assert.equal(data.driverChampionship[0].raceResults[3].position, null);
    assert.equal(model.heatClass(data.driverChampionship[0].raceResults[3]), 'disqualified');
    assert.equal(model.hasDroppedScores(1988, series), false);
    const averages = model.juniorAverages(data.driverChampionship[0]);
    assert.equal(averages.sprintCount, 1);
    assert.equal(averages.featureCount, 1);
    assert.equal(averages.averageFinish, 1.5);
    assert.equal(averages.starts, 3);
    assert.ok(Math.abs(averages.unclassifiedRate - 100 / 3) < 0.00001);
  });
}

test('historical session categories agree with the championship scoring backend', () => {
  for (const [series, classify, years] of [['f2', f2SessionType, [2017, 2020, 2021, 2025]], ['f3', f3SessionType, [2019, 2020, 2021, 2025]], ['academy', academySessionType, [2023, 2024, 2025, 2026]]]) {
    for (const year of years) for (const count of [2, 3]) for (let index = 0; index < count; index++) {
      const session = { name: 'Race', sessionNumber: 4 + index * 2 };
      assert.equal(model.juniorSessionType(session, index, count, year, series), classify(session, index, count, year));
    }
  }
});

test('three-race weekends retain distinct session labels and order', () => {
  const raw = fixture(2021);
  raw.calendar[0].sessions = [4, 6, 8].map((sessionNumber, index) => ({ id: 's' + index, sessionNumber, name: 'Race' }));
  const data = model.adaptJunior(raw, 'f2');
  assert.deepEqual(data.calendar.slice(0, 3).map(race => race.analysisLabel), ['R1 S1', 'R1 S2', 'R1 F']);
  assert.deepEqual(data.calendar.slice(0, 3).map(race => race.sessionType), ['S', 'S', 'F']);
});

test('future sessions stop charts at recorded results and absent schedules cannot imply completeness', () => {
  const raw = fixture();
  raw.calendar.push({ round: 3, name: 'Future', date: '2099-01-01', sessions: [{ id: 'future', sessionNumber: 4, name: 'Sprint' }] });
  raw.calendar.push({ round: 4, name: 'Missing schedule', date: '2099-02-01', sessions: [] });
  const data = model.adaptJunior(raw, 'f3');
  assert.equal(model.seasonState(data).complete, false);
  assert.equal(model.series(data)[0].values.length, 4);
  assert.equal(model.seasonState(data).roundStatus(data.calendar[4]), 'upcoming');
  assert.equal(data.calendar[5].placeholder, true);
});

test('missing result data is not presented as participation or a completed session', () => {
  const raw = fixture();
  for (const driver of raw.championship) delete driver.raceResults.s3;
  const data = model.adaptJunior(raw, 'f2');
  assert.equal(model.seasonState(data).roundStatus(data.calendar[2]), 'missing');
  assert.equal(model.series(data)[0].values[2].available, false);
});
