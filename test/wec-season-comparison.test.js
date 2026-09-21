const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../frontend/js/wec-season-comparison-model');

function season(year, points = [15, 30]) {
  const events = [1, 2].map(round => ({ id: `wec-${year}-r${round}`, round, name: `Round ${round}`, date: `${year}-0${round}-01` }));
  const entity = (id, name, finalPosition, values, results, champion = false) => ({ id, name, finalPosition, finalPoints: values.at(-1), championshipWon: champion,
    rounds: values.map((value, index) => ({ round: index + 1, position: index + 1 === values.length ? finalPosition : value >= points[0] / 2 ? 1 : 2, points: value, championshipWon: champion && index + 1 === values.length })),
    results: Object.fromEntries(results.map((position, index) => [events[index].id, { position, status: position ? 'classified' : 'retired', laps: 100 }])) });
  return { season: { year, status: 'completed' }, events, championships: [{ id: `wec-${year}-hypercar-manufacturers`, name: 'Hypercar Manufacturers Championship', entityType: 'manufacturer', classCode: 'HYPERCAR',
    entities: [entity('alpha', 'Alpha', 1, points, [1, 2], true), entity('beta', 'Beta', 2, [Math.max(0, points[0] - 3), Math.max(0, points[1] - 6)], [2, 1]), entity('gamma', 'Gamma', 3, [4, 8], [3, null])] }] };
}

test('WEC comparison state validates shareable controls', () => {
  assert.deepEqual(model.readState('?first=2025&second=2024&view=competition&basis=matched&round=3&field=ten&sort=spread&direction=desc'), {
    first: '2025', second: '2024', firstChampionship: null, secondChampionship: null, view: 'competition', basis: 'matched', round: 3, field: 'ten', sort: 'spread', direction: -1
  });
  assert.equal(model.readState('?view=nope&round=-1&sort=nope').view, 'overview');
});

test('WEC comparison keeps championships separate and computes endurance metrics', () => {
  const data = season(2025), snapshot = model.snapshot(data, data.championships[0].id);
  assert.equal(snapshot.leader.name, 'Alpha');
  assert.equal(snapshot.leader.championshipWon, true);
  assert.equal(snapshot.metrics.rounds, 2);
  assert.equal(snapshot.metrics.fieldSize, 3);
  assert.equal(snapshot.metrics.winners, 2);
  assert.equal(snapshot.metrics.podiumEntities, 3);
  assert.equal(snapshot.metrics.margin, 6);
  assert.equal(snapshot.fields.find(row => row.name === 'Gamma').unclassifiedRate, 50);
  assert.deepEqual(snapshot.progress.map(row => row.value), [50, 100]);
});

test('retired and not-classified cars with recorded positions are not counted as finishes', () => {
  const data = season(2025), championship = data.championships[0];
  championship.entities[0].results[data.events[0].id] = { position: 1, status: 'retired', laps: 50 };
  championship.entities[2].results[data.events[1].id] = { position: 1, status: 'not-classified', laps: 60 };
  const snapshot = model.snapshot(data, championship.id);
  assert.equal(snapshot.metrics.winners, 1);
  assert.equal(snapshot.metrics.unclassified, 2);
  assert.equal(snapshot.fields.find(row => row.id === 'alpha').finishCount, 1);
  assert.equal(snapshot.fields.find(row => row.id === 'gamma').unclassifiedRate, 50);
  assert.equal(model.classified({ position: 1, status: 'retired' }), false);
});

test('matched-round WEC comparisons use the same official standings cutoff', () => {
  const first = season(2025), second = season(2024, [20, 40]);
  const comparison = model.compare([first, second], first.championships.concat(second.championships).map(row => row.id), 'matched', 1);
  assert.equal(comparison.cutoff, 1);
  assert.deepEqual(comparison.snapshots.map(snapshot => snapshot.round), [1, 1]);
  assert.deepEqual(comparison.snapshots.map(snapshot => snapshot.events.length), [1, 1]);
  assert.equal(comparison.snapshots[0].leader.championshipWon, false);
});

test('joint WEC driver leaders measure the margin to the next standing position', () => {
  const data = season(2025), championship = data.championships[0];
  championship.entityType = 'driver';
  championship.entities.push({ ...structuredClone(championship.entities[0]), id: 'alpha-codriver', name: 'Alpha Co-driver' });
  const snapshot = model.snapshot(data, championship.id);
  assert.deepEqual(snapshot.tiedLeaders.map(row => row.name), ['Alpha', 'Alpha Co-driver']);
  assert.equal(snapshot.runnerUp.name, 'Beta');
  assert.equal(snapshot.metrics.margin, 6);
});

test('WEC comparison page is routed, discoverable and class-aware', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'frontend/wec-season-comparison.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'frontend/js/wec-season-comparison.js'), 'utf8');
  const overview = fs.readFileSync(path.join(root, 'frontend/wec-analysis.html'), 'utf8');
  const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
  assert.match(html, /Two endurance seasons, side by side/);
  assert.match(html, /id="comparison-championship-one"/);
  assert.match(html, /id="comparison-championship-two"/);
  assert.match(html, /For manufacturers, each round uses that manufacturer’s best classified car/);
  assert.match(script, /\/api\/wec\/analysis\/seasons\/\$\{encodeURIComponent\(key\)\}/);
  assert.match(route, /Number\(right\.status === 'classified'\) - Number\(left\.status === 'classified'\)/);
  assert.match(overview, /href="\/wec\/season-comparison"/);
  assert.match(navigation, /\['\/wec\/season-comparison', 'Season comparison'/);
  assert.match(server, /app\.get\('\/wec\/season-comparison'/);
});
