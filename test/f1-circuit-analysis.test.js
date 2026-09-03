const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../frontend/js/f1-circuit-analysis-model');
const { renderCircuitAnalysisHtml } = require('../backend/circuit-analysis-renderer');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const result = (id, position, extra = {}) => ({ driverId: id, driverName: id, constructorId: 'team', constructorName: 'Team', position, positionText: String(position || 'DNF'), grid: 10, ...extra });
const race = (year, results) => ({ id: year, year, name: 'Grand Prix', results });

test('historical gaps distinguish seconds, minutes, hours, laps and missing values', () => {
  assert.deepEqual(model.gap({ gap: '+1:07.884' }), { seconds: 67.884, laps: null });
  assert.deepEqual(model.gap({ gap: '+2 laps' }), { seconds: null, laps: 2 });
  assert.equal(model.gap({ gap: '+1:02:03.125' }).seconds, 3723.125);
  assert.equal(model.gap({ gap: '+4,205' }).seconds, 4.205);
  assert.equal(model.gap({ gap: '+4.205', gapMillis: 4206 }).seconds, 4.206);
  assert.equal(model.gap({ gap: '+1 lap', gapMillis: 1234 }).seconds, null);
  assert.equal(model.gap({ gapLaps: 3 }).laps, 3);
  for (const gap of ['', null, 'Unknown', '+1:99.5', '-3.0']) assert.equal(model.gap({ gap }).seconds, null);
  assert.equal(model.gap({ gapMillis: 0 }).seconds, 0);
  assert.equal(model.gap().seconds, null);
});

test('Adelaide 1989 excludes 13 DNQ/DNPQ entries from the 26 starts', () => {
  const results = [
    ...Array.from({ length: 8 }, (_, i) => result(`finisher${i}`, i + 1)),
    ...Array.from({ length: 18 }, (_, i) => result(`retired${i}`, null, { reasonRetired: 'Engine' })),
    ...Array.from({ length: 4 }, (_, i) => result(`dnq${i}`, null, { positionText: 'DNQ' })),
    ...Array.from({ length: 9 }, (_, i) => result(`dnpq${i}`, null, { positionText: 'DNPQ' }))
  ];
  const metrics = model.metrics([race(1989, results)]);
  assert.equal(metrics.starters, 26);
  assert.equal(metrics.retirements, 18);
  assert.equal(metrics.retirementRate.toFixed(1), '69.2');
  assert.equal(model.aggregate([race(1989, results)]).length, 26);
});

test('late retirements count, while DNS and disqualifications do not count as retirements', () => {
  assert.equal(model.retired(result('late', 10, { reasonRetired: 'Engine', laps: 69 })), true);
  assert.equal(model.retired(result('dns', null, { positionText: 'DNS', reasonRetired: 'Engine' })), false);
  assert.equal(model.retired(result('dsq', null, { positionText: 'DSQ', reasonRetired: 'Disqualified' })), false);
  assert.equal(model.starter(result('dsq', null, { positionText: 'DSQ' })), true);
  assert.equal(model.classified(result('dsq', 1, { positionText: 'DSQ' })), false);
  assert.equal(model.retired(result('finish', 2, { reasonRetired: 'Finished' })), false);
  assert.equal(model.metrics([]).retirementRate, null);
  assert.equal(model.metrics([]).poleRate, null);
});

test('specialist rates account for starts and enforce the sample behind averages', () => {
  const races = [race(2000, [result('one-off', 1), result('regular', 2)]), race(2001, [result('regular', 1)]), race(2002, [result('regular', null)])];
  const rows = model.aggregate(races);
  assert.equal(model.rank(rows, 'winRate', 3)[0].id, 'regular');
  assert.equal(model.rank(rows, 'winRate', 1)[0].id, 'one-off');
  assert.equal(model.rank(rows, 'averageFinish', 3).length, 0);
  const regular = rows.find(row => row.id === 'regular');
  assert.equal(regular.averageFinish, 1.5);
  assert.deepEqual(regular.gains, [8, 9]);
  assert.ok(Math.abs(regular.winRate - 100 / 3) < 1e-10);
});

test('team wins and GP starts deduplicate historical shared wins', () => {
  const shared = [race(1955, [result('a', 1), result('b', 1), result('c', 3)])];
  const team = model.aggregate(shared, true)[0];
  assert.equal(team.starts, 1);
  assert.equal(team.carStarts, 3);
  assert.equal(team.wins, 1);
  assert.equal(team.winRate, 100);
});

test('heatmap includes unclassified starters but excludes non-starters and unknown grids', () => {
  const cells = model.heatmap([race(2000, [result('winner', 1, { grid: 1 }), result('dnf', null, { grid: 4 }), result('dnq', null, { positionText: 'DNQ', grid: 20 }), result('pitlane', 5, { grid: 0 })])]);
  assert.equal(cells[0][0].length, 1);
  assert.equal(cells[2][6].length, 1);
  assert.equal(cells.flat(2).length, 2);
});

test('custom year boundaries are inclusive and missing eras stay empty', () => {
  const races = [race(1985, []), race(1990, []), race(1995, [])];
  assert.deepEqual(model.range(races, 1985, 1990).map(row => row.year), [1985, 1990]);
  assert.equal(model.range(races, 2020, '').length, 0);
  assert.equal(model.range(races, '', '').length, 3);
  assert.equal(model.median([2, 4, 100, 1]), 3);
});

test('all championships share the updated view with championship-specific labels and methods', () => {
  const legacy = read('frontend/circuit-analysis.html');
  const f1 = renderCircuitAnalysisHtml(legacy, '/circuit-analysis');
  assert.match(f1, /f1-circuit-analysis-model.js/);
  assert.doesNotMatch(f1, /feature poles/);
  for (const [series, name] of [['f2', 'FORMULA 2'], ['f3', 'FORMULA 3'], ['academy', 'F1 ACADEMY']]) {
    const junior = renderCircuitAnalysisHtml(legacy, `/${series}/circuit-analysis`);
    assert.ok(junior.includes(`${name} · CIRCUIT ANALYSIS`));
    assert.match(junior, /f1-circuit-analysis-model.js/);
    assert.match(junior, /role="combobox"/);
    assert.match(junior, /Grid P1 conversion/);
    assert.doesNotMatch(junior, /ca-breadcrumb|Grands Prix only|FORMULA 1 · CIRCUIT/);
  }
});

function harness(search = '', pathname = '/circuit-analysis') {
  const nodes = new Map(), listeners = new Map(), requests = [], urls = [];
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', hidden: false, innerHTML: '', textContent: '', options: [], dataset: {}, classList: { toggle() {} },
      validityMessage: '', setCustomValidity(message) { this.validityMessage = message; },
      checkValidity() { return !this.validityMessage; }, reportValidity() { return this.checkValidity(); },
      setAttribute() {}, removeAttribute() {}, addEventListener(type, callback) { listeners.set(`${id}:${type}`, callback); }, querySelector(selector) { return id === 'ca-format' ? node(`format-${selector}`) : null; }, querySelectorAll() { return []; }
    });
    return nodes.get(id);
  }
  node('ca-era').options = ['all', '1950-1979', '1980-1999', '2000-2009', '2010-2019', '2020-9999', 'custom'].map(value => ({ value }));
  const context = vm.createContext({ window: { CircuitAnalysisModel: model, addEventListener() {} }, document: { getElementById: node, querySelectorAll() { return []; } },
    params: () => new URLSearchParams(search), URLSearchParams, AbortController, location: { pathname, href: `http://localhost${pathname}` },
    history: { replaceState(a, b, url) { urls.push(url); } }, esc: value => String(value ?? ''), displayRaceName: race => race.name || '',
    getJSON: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })) });
  vm.runInContext(read('frontend/js/f1-circuit-analysis.js'), context);
  return { node, requests, urls, context, listeners };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const circuit = id => ({ id, name: id, totalRacesHeld: 1 });
const data = (id, year = 1990) => ({ circuit: circuit(id), races: [race(year, [result('winner', 1)])] });

test('URL state restores circuit, custom range, active view and sample filters', async () => {
  const page = harness('?id=adelaide&view=movement&from=1985&to=1990&metric=winRate&min=5&movementMin=1');
  page.requests[0].resolve([circuit('adelaide')]); await flush();
  page.requests[1].resolve(data('adelaide')); await flush();
  assert.equal(page.node('ca-era').value, 'custom');
  assert.equal(page.node('ca-from').value, '1985');
  assert.equal(page.node('ca-metric').value, 'winRate');
  assert.match(page.urls.at(-1), /view=movement/);
  assert.match(page.urls.at(-1), /min=5&movementMin=1/);
  assert.equal(page.node('ca-workspace').hidden, false);
});

test('empty era hides all views and reset restores races without showing NaN or dash-percent', async () => {
  const page = harness('?id=adelaide&era=2020-9999');
  page.requests[0].resolve([circuit('adelaide')]); await flush();
  page.requests[1].resolve(data('adelaide')); await flush();
  assert.equal(page.node('ca-empty').hidden, false);
  assert.equal(page.node('ca-workspace').hidden, true);
  assert.doesNotMatch(page.node('ca-summary').innerHTML, /NaN|—%/);
  page.listeners.get('ca-reset:click')();
  assert.equal(page.node('ca-empty').hidden, true);
  assert.equal(page.node('ca-workspace').hidden, false);
});

test('a stale circuit response cannot overwrite a newer selection, and failures clear stale content', async () => {
  const page = harness('?id=adelaide');
  page.requests[0].resolve([circuit('adelaide'), circuit('silverstone')]); await flush();
  vm.runInContext("caId = 'silverstone'; caLoad();", page.context);
  assert.equal(page.requests[1].options.signal.aborted, true);
  page.requests[2].resolve(data('silverstone')); await flush();
  page.requests[1].resolve(data('adelaide')); await flush();
  assert.equal(page.node('ca-title').textContent, 'silverstone');
  vm.runInContext("caId = 'adelaide'; caLoad();", page.context);
  page.requests[3].reject(new Error('Offline')); await flush();
  assert.equal(page.node('ca-workspace').hidden, true);
  assert.equal(page.node('ca-summary').innerHTML, '');
  assert.match(page.node('ca-status').textContent, /Offline.*retry/);
});

test('unfinished year edits do not leak into shared state or change the displayed sample', async () => {
  const page = harness('?id=adelaide');
  page.requests[0].resolve([circuit('adelaide')]); await flush();
  page.requests[1].resolve(data('adelaide')); await flush();
  page.node('ca-from').value = '2020';
  page.listeners.get('ca-from:input')();
  vm.runInContext("caSetView('trends');", page.context);
  assert.doesNotMatch(page.urls.at(-1), /from=2020/);
  assert.equal(vm.runInContext('caRaces().length', page.context), 1);
});

test('an inverted year range reports a validation problem instead of remaining in loading state', async () => {
  const page = harness('?id=adelaide&from=2024&to=2020');
  page.requests[0].resolve([circuit('adelaide')]); await flush();
  page.requests[1].resolve(data('adelaide')); await flush();
  assert.match(page.node('ca-status').textContent, /valid year range/);
  assert.equal(page.node('ca-workspace').hidden, true);
});

for (const series of ['f2', 'f3', 'academy']) test(`${series} scopes API requests, sessions, entity links and format state to its championship`, async () => {
  const page = harness('?id=monza&format=S', `/${series}/circuit-analysis`);
  assert.equal(page.requests[0].url, `/api/circuits?series=${series}`);
  page.requests[0].resolve([circuit('monza')]); await flush();
  assert.match(page.requests[1].url, new RegExp(`analysis\\?series=${series}$`));
  page.requests[1].resolve({ circuit: circuit('monza'), races: [
    { ...race(2024, [result('sprint-driver', 1, { grid: 1 })]), sessionId: 'sprint-1', raceType: 'S' },
    { ...race(2024, [result('feature-driver', 1)]), sessionId: 'feature', raceType: 'F' }
  ] }); await flush();
  assert.equal(vm.runInContext('caRaces().length', page.context), 1);
  assert.match(page.urls.at(-1), /format=S/);
  assert.equal(page.node('ca-format-control').hidden, false);
  assert.equal(page.node('ca-circuit-link').href, `/${series}/circuit?id=monza`);
  assert.equal(vm.runInContext('caRaceLink(caRaces()[0])', page.context), `/${series}/race?id=2024&session=sprint-1`);
  assert.equal(vm.runInContext("caEntityLink(caTeamPage, 'team')", page.context), `/${series}/${series === 'f2' ? 'constructor' : 'team'}?id=team`);
  assert.match(page.node('ca-summary').innerHTML, /Grid P1 conversion/);
  page.listeners.get('ca-reset:click')();
  assert.equal(vm.runInContext('caRaces().length', page.context), 2);
});
