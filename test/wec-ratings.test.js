const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { calculateWecRatings, WEC_MODEL_VERSION } = require('../backend/wec-rating-model');
const { evaluateRatings } = require('../backend/rating-evaluation');
const { wecClassScope } = require('../backend/rating-data');
const { classScopeFrom, explanation, latestSourceEventSql, ratingSource } = require('../backend/routes/ratings');
const pool = require('../backend/db');

const root = path.join(__dirname, '..');
test.after(async () => pool.end());

function entry(id, finishOrder, drivers, options = {}) {
  return {
    id, carNumber: id, teamName: `Team ${id}`, manufacturerName: `Make ${id}`,
    finishOrder, positionNumber: finishOrder, status: 'classified', started: true,
    classified: true, disqualified: false, completion: 1,
    drivers: drivers.map((driverId, crewOrder) => ({ id: driverId, name: driverId, crewOrder })),
    ...options
  };
}

function event(id, date, classScope, entries) {
  return {
    id, sourceEventId: id.split(':')[0], date, year: Number(date.slice(0, 4)), round: 1,
    eventSequence: 1, name: id, classId: classScope, classCode: classScope.toUpperCase(),
    className: classScope, classScope, weight: 1, entries
  };
}

test('WEC ratings apply an entry result equally to its crew without multiplying crew strength', () => {
  const result = calculateWecRatings([
    event('race-1:top', '2025-01-01', 'top', [
      entry('7', 1, ['a', 'b', 'c']), entry('8', 2, ['d', 'e'])
    ])
  ]);
  assert.equal(result.modelVersion, WEC_MODEL_VERSION);
  const winners = result.rows.filter(row => row.entryId === '7');
  assert.equal(winners.length, 3);
  assert.ok(winners[0].ratingChange > 0);
  assert.ok(winners.every(row => row.ratingChange === winners[0].ratingChange));
  assert.ok(winners.every(row => row.fieldSize === 2 && row.crewSize === 3));
});

test('WEC rating changes stay zero-sum when crews have different sizes', () => {
  const result = calculateWecRatings([
    event('race-1:top', '2025-01-01', 'top', [
      entry('7', 1, ['a', 'b', 'c']), entry('8', 2, ['d', 'e'])
    ])
  ]);
  const winners = result.rows.filter(row => row.entryId === '7');
  const losers = result.rows.filter(row => row.entryId === '8');
  assert.ok(winners.every(row => row.ratingChange === winners[0].ratingChange));
  assert.ok(losers.every(row => row.ratingChange === losers[0].ratingChange));
  assert.ok(winners[0].ratingChange > 0 && losers[0].ratingChange < 0);
  assert.ok(Math.abs(result.rows.reduce((sum, row) => sum + row.ratingChange, 0)) < 1e-9);
});

test('WEC class pools retain independent rating and experience state', () => {
  const result = calculateWecRatings([
    event('race-1:top', '2025-01-01', 'top', [entry('7', 1, ['a']), entry('8', 2, ['b'])]),
    event('race-2:gt', '2025-02-01', 'gt', [entry('77', 2, ['a']), entry('88', 1, ['c'])]),
    event('race-3:top', '2025-03-01', 'top', [entry('7', 1, ['a']), entry('8', 2, ['b'])])
  ]);
  const driver = result.rows.filter(row => row.driverId === 'a');
  assert.equal(driver.length, 3);
  assert.equal(driver[1].classScope, 'gt');
  assert.equal(driver[1].ratingBefore, 1500);
  assert.equal(driver[2].ratingBefore, driver[0].ratingAfter);
});

test('WEC results expose the finish and uncertainty data used by validation', () => {
  const result = calculateWecRatings([
    event('race-1:top', '2025-01-01', 'top', [entry('7', 1, ['a', 'b']), entry('8', 2, ['c'])])
  ], { collectComparisons: true });
  const evaluation = evaluateRatings(result, { bootstrapSamples: 0 });
  assert.equal(evaluation.positions.predictions, 3);
  assert.equal(evaluation.pairwise.comparisons, 1);
  assert.equal(result.rows[0].finishOrder, 1);
  assert.ok(Number.isFinite(result.comparisons[0].firstUncertainty));
  assert.ok(Number.isFinite(result.comparisons[0].firstEvidence));
});

test('WEC rating routes default to top class and expose the crew model', () => {
  assert.equal(classScopeFrom({ query: {} }, 'wec'), 'top');
  assert.equal(classScopeFrom({ query: { class: 'gt' } }, 'wec'), 'gt');
  assert.equal(classScopeFrom({ query: { class: 'invalid' } }, 'wec'), 'top');
  assert.equal(classScopeFrom({ query: { class: 'gt' } }, 'f1'), '');
  assert.equal(ratingSource({ query: {} }, 'wec').version, WEC_MODEL_VERSION);
  assert.match(latestSourceEventSql('wec', 'gt-pro'), /classes\.code IN \('LMGTE PRO'\)/);
  assert.equal(wecClassScope('HYPERCAR'), 'top');
  assert.equal(wecClassScope('LMGTE AM'), 'gt');
});

test('rating event cutoffs are scoped to the selected WEC class', () => {
  const routes = fs.readFileSync(path.join(root, 'backend/routes/ratings.js'), 'utf8');
  assert.match(routes, /event_id = \?\s+AND \(\? = '' OR class_scope = \?\) LIMIT 1/);
  assert.match(routes, /\[source\.version, series, requestedEventId, classScope, classScope\]/);
});

test('WEC retirement explanations do not claim a classified finish', () => {
  const result = explanation({ series: 'wec', position_number: 10, position_text: 'retired',
    expected_position: 8, rating_change: -12, field_strength: 1500 });
  assert.equal(result.result, 'Retired');
  assert.equal(result.positionDifference, null);
  assert.match(result.summary, /^Retired produced a loss/);
});

test('ratings navigation follows WEC class changes without a reload', () => {
  const source = fs.readFileSync(path.join(root, 'frontend/js/ratings-navigation.js'), 'utf8');
  const location = { origin: 'https://example.test', pathname: '/ratings/leaderboard',
    search: '?series=wec&class=top' };
  const listeners = new Map();
  const links = ['/ratings', '/ratings/compare'].map(pathname => ({
    href: pathname, dataset: { ratingRoute: pathname === '/ratings' ? 'overview' : 'compare' },
    get pathname() { return new URL(this.href, location.origin).pathname; },
    setAttribute() {}
  }));
  vm.runInNewContext(source, { URL, URLSearchParams, location,
    document: { querySelectorAll: () => links },
    window: { addEventListener: (name, handler) => listeners.set(name, handler) } });
  assert.ok(links.every(link => new URL(link.href, location.origin).searchParams.get('class') === 'top'));
  location.search = '?series=wec&class=gt';
  listeners.get('ratings:context-change')();
  assert.ok(links.every(link => new URL(link.href, location.origin).searchParams.get('class') === 'gt'));
});

test('WEC ratings are discoverable and class selection survives every ratings surface', () => {
  const explorer = fs.readFileSync(path.join(root, 'frontend/templates/ratings-explorer.html'), 'utf8');
  const ratings = fs.readFileSync(path.join(root, 'frontend/js/ratings.js'), 'utf8');
  const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
  const overview = fs.readFileSync(path.join(root, 'frontend/js/ratings-overview.js'), 'utf8');
  const methodology = fs.readFileSync(path.join(root, 'frontend/js/ratings-methodology.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'frontend/css/ratings.css'), 'utf8');
  assert.match(explorer, /id="ratings-class"/);
  assert.match(ratings, /query\.set\('class', ratingState\.classScope\)/);
  assert.match(navigation, /WEC RATINGS/);
  assert.match(navigation, /ratings\/leaderboard\?series=wec&class=top/);
  assert.match(overview, /ratings-overview-class/);
  assert.match(methodology, /How WEC crew/);
  assert.match(methodology, /WEC crew 1\.1/);
  assert.match(ratings, /event\.explanation\?\.result/);
  assert.match(ratings, /event\.positionText === 'classified'/);
  assert.match(styles, /data-ratings-view="compare"[^}]+ratings-controls/s);
  assert.doesNotMatch(explorer, /value="other"/);
});
