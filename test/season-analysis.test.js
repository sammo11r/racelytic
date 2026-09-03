const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../frontend/js/season-analysis-model');
const fs = require('node:fs');
const path = require('node:path');
const { seasonAnalysisDrivers } = require('../backend/routes/seasons');
test.after(async () => require('../backend/db').end());

test('full analysis field includes unranked and sprint-only participants without inventing standings', () => {
  const data = fixture();
  const raceMap = new Map([['c', { 1: { position: 12, points: 0 } }], ['d', { 3: { sprintPosition: 8, sprintPoints: 1 } }]]);
  data.analysisDrivers = seasonAnalysisDrivers(data.driverChampionship, [
    { driverId: 'a', driverName: 'A' }, { driverId: 'c', driverName: 'C' },
    { driverId: 'c', driverName: 'C' }, { driverId: 'd', driverName: 'D' }
  ], raceMap);
  assert.equal(data.driverChampionship.length, 2);
  assert.equal(data.analysisDrivers.length, 4);
  assert.equal(data.analysisDrivers[2].points, null);
  assert.equal(data.analysisDrivers[2].position, null);
  assert.equal(data.analysisDrivers[2].raceResults[1].position, 12);
  assert.equal(model.series(data).length, 4);
  assert.equal(model.seasonState(data).roundStatus(data.calendar[2]), 'sprint-only');
  assert.equal(model.series(data).at(-1).values.at(-1).points, 1);
});
function fixture(year = 2026) {
  return { year, summary: { completed: false }, calendar: [1, 2, 3].map(round => ({ round, date: round === 3 ? '2099-01-01' : '2020-01-01' })),
    driverChampionship: [{ driverId: 'a', name: 'A', points: 43, raceResults: { 1: { position: 1, points: 25 }, 2: { position: 2, points: 18 } } },
      { driverId: 'b', name: 'B', points: 43, raceResults: { 1: { position: 2, points: 18 }, 2: { position: 1, points: 25 } } }] };
}
test('future rounds do not extend cumulative lines and incomplete seasons stay incomplete', () => {
  const data = fixture();
  const state = model.seasonState(data);
  assert.equal(state.complete, false);
  assert.equal(state.recorded.length, 2);
  assert.equal(state.roundStatus(data.calendar[2]), 'upcoming');
  assert.deepEqual(model.series(data)[0].values.map(value => value.points), [25, 43]);
  data.summary.completed = true; // A clinched title alone is not a completed calendar.
  assert.equal(model.seasonState(data).complete, false);
});
test('historical dropped scores differ from total earned and use existing rules', () => {
  const rules = model.rulesFor(1988);
  const senna = [...Array(8).fill(9), ...Array(3).fill(6), 4, 0, 0, 0, 0];
  const prost = [...Array(7).fill(9), ...Array(7).fill(6), 0, 0];
  assert.equal(model.countedPoints(senna, rules), 90);
  assert.equal(model.countedPoints(prost, rules), 87);
  const data = fixture(1988);
  data.calendar = senna.map((_, index) => ({ round: index + 1, date: '1988-01-01' }));
  data.driverChampionship = [senna, prost].map((values, index) => ({ driverId: String(index), raceResults: Object.fromEntries(values.map((points, round) => [round + 1, { positionText: points ? '1' : 'DNF', points }])) }));
  assert.deepEqual(model.series(data, 'counted').map(driver => driver.values.at(-1).points), [90, 87]);
  assert.deepEqual(model.series(data, 'scored').map(driver => driver.values.at(-1).points), [94, 105]);
});
test('scoring choice is only relevant to dropped-score seasons', () => {
  for (const year of [1950, 1967, 1979, 1988, 1990]) assert.equal(model.hasDroppedScores(year), true);
  for (const year of [1991, 2000, 2021, 2026]) assert.equal(model.hasDroppedScores(year), false);
  assert.deepEqual(model.series(fixture(), 'counted'), model.series(fixture(), 'scored'));
});

test('page removes back navigation and hides season status after loading', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/season-analysis.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../frontend/js/season-analysis.js'), 'utf8');
  assert.doesNotMatch(html, /class="back-link"/);
  assert.doesNotMatch(js, /Incomplete season data|Data through R/);
  assert.match(js, /\$\('analysis-status'\)\.hidden = true/);
  assert.match(js, /\$\('analysis-status'\)\.hidden = false/);
  assert.match(js, /model.hasDroppedScores\(data.year, seriesKey\)/);
});

test('analysis navigation and content share one connected panel', () => {
  const css = fs.readFileSync(path.join(__dirname, '../frontend/css/season-analysis.css'), 'utf8');
  assert.match(css, /#season-analysis-workspace \{[^}]*border: 1px solid var\(--border\)/);
  assert.match(css, /\.analysis-visualization-menu \{ margin: 0;/);
  assert.match(css, /\.analysis-visualization-workspace \{ margin-top: 0;/);
  assert.match(css, /button\[aria-selected="true"\] \{[^}]*border-bottom-color: #fff/);
});
test('split-season dropped-score windows never move during progression', () => {
  const rules = model.rulesFor(1979);
  assert.equal(model.countedPoints([9, 9, 9, 9, 9, 9, 9, 6], rules), 42);
  assert.equal(model.countedPoints([9, 9, 9], rules), 27);
});
test('missing rounds leave a gap and sprint-only rounds stay distinguished', () => {
  const data = fixture();
  delete data.driverChampionship[0].raceResults[2];
  delete data.driverChampionship[1].raceResults[2];
  data.driverChampionship[0].raceResults[3] = { sprintPoints: 8, sprintPosition: 1, position: null };
  const state = model.seasonState(data);
  assert.equal(state.roundStatus(data.calendar[1]), 'missing');
  assert.equal(state.roundStatus(data.calendar[2]), 'sprint-only');
  assert.equal(state.recorded.length, 1);
  assert.deepEqual(model.series(data)[0].values.map(value => value.available), [true, false, true]);
});
test('lead changes identify ties rather than inventing countback', () => {
  const leaders = model.leaders(model.series(fixture()));
  assert.equal(leaders[0].gap, 7);
  assert.equal(leaders[0].leader.name, 'A');
  assert.equal(leaders[1].gap, 0);
  assert.equal(leaders[1].tied.length, 2);
});
test('heatmap colours use awarded points and separate disqualification', () => {
  assert.equal(model.heatClass({ position: 7, points: 0 }), 'finish');
  assert.equal(model.heatClass({ position: 7, points: 6 }), 'points');
  assert.equal(model.heatClass({ position: 1, positionText: 'DSQ', points: 0 }), 'disqualified');
  assert.equal(model.heatClass({ positionText: 'DNF' }), 'retired');
  assert.equal(model.heatClass({ sprintPoints: 8 }), 'absent');
});
test('averages expose independent sample counts, spread and retirement denominator', () => {
  const values = model.averages({ raceResults: {
    1: { position: 2, qualifyingPosition: 1 }, 2: { position: 4, qualifyingPosition: null },
    3: { positionText: 'DNF', qualifyingPosition: 3, reasonRetired: 'Engine' },
    4: { positionText: 'DNS', qualifyingPosition: 5 },
    5: { positionText: 'DSQ', reasonRetired: 'Technical infringement' }
  } });
  assert.equal(values.averageFinish, 3);
  assert.equal(values.spread, 1);
  assert.equal(values.finishes, 2);
  assert.equal(values.qualifyingCount, 3);
  assert.equal(values.averageQualifying, 3);
  assert.equal(values.starts, 4);
  assert.equal(values.retirements, 1);
  assert.equal(values.retirementRate, 25);
  assert.equal(model.averages({ raceResults: {} }).retirementRate, null);
  assert.equal(model.averages({ raceResults: { 1: { position: 5 } } }).spread, null);
});
test('share state preserves empty selections and validates view/scoring', () => {
  assert.deepEqual(model.readState('?year=1988&view=margin&scoring=scored&drivers=a,b'), { year: '1988', view: 'margin', scoring: 'scored', drivers: ['a', 'b'] });
  assert.deepEqual(model.readState('?drivers=&view=invalid&scoring=invalid'), { year: null, view: 'progression', scoring: 'counted', drivers: [] });
  assert.equal(model.readState('').drivers, null);
});
test('shared season page includes responsive controls and scoring model', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/season-analysis.html'), 'utf8');
  for (const id of ['analysis-status', 'analysis-view', 'analysis-scoring', 'driver-search', 'analysis-season', 'lead-changes']) assert.ok(html.includes('id="' + id + '"'));
  assert.ok(html.indexOf('/js/f1-points-systems.js') < html.indexOf('/js/season-analysis-model.js'));
  const js = fs.readFileSync(path.join(__dirname, '../frontend/js/season-analysis.js'), 'utf8');
  assert.doesNotMatch(js, /slice\(0, 15\)/);
  assert.match(js, /current !== requestId/);
  assert.match(js, /history.replaceState/);
});

test('season selection is inline and labelled, with URL sharing but no copy button', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/season-analysis.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../frontend/js/season-analysis.js'), 'utf8');
  assert.match(html, /class="eyebrow">FORMULA 1 · SEASON <select id="analysis-season" aria-label="Season"/);
  assert.doesNotMatch(html + js, /share-analysis|share-status|navigator.clipboard/);
  assert.match(js, /history.replaceState/);
  assert.match(js, /\$\('analysis-season'\)\.addEventListener\('change'/);
});

test('inline season picker uses a custom chevron and soft rounded treatment', () => {
  const css = fs.readFileSync(path.join(__dirname, '../frontend/css/season-analysis.css'), 'utf8');
  const rule = css.match(/#analysis-season \{([^}]+)\}/)[1];
  assert.match(rule, /appearance: none/);
  assert.match(rule, /border-radius: 9px/);
  assert.match(rule, /data:image\/svg\+xml/);
  assert.doesNotMatch(rule, /border-bottom:/);
});
