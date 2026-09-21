const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const model = require('../frontend/js/wec-simulate-season-model');
const root = path.join(__dirname, '..');

const fixture = {
  season: { year: 2025 },
  events: [
    { id: 'r1', round: 1, pointsScale: 'standard' },
    { id: 'r2', round: 2, pointsScale: 'extended' },
    { id: 'r3', round: 3, pointsScale: 'le-mans' }
  ],
  championships: [{
    id: 'hypercar-drivers', name: 'Hypercar drivers', entityType: 'driver', classIds: ['hypercar'],
    entities: [
      { id: 'a', name: 'A', finalPosition: 1, finalPoints: 100, results: { r1: { position: 1, status: 'classified' }, r2: { position: 2, status: 'classified' }, r3: { position: 2, status: 'classified' } } },
      { id: 'b', name: 'B', finalPosition: 2, finalPoints: 90, results: { r1: { position: 2, status: 'classified' }, r2: { position: 1, status: 'classified' }, r3: { position: 1, status: 'classified' } } },
      { id: 'c', name: 'C', finalPosition: 3, finalPoints: 10, results: { r1: { position: 3, status: 'retired' }, r2: { position: null, status: 'not-classified' } } }
    ]
  }, { id: 'overall', classIds: ['hypercar', 'lmgt3'], entities: [{ id: 'x' }] }]
};

test('WEC scoring inputs reject invalid point lists', () => {
  assert.deepEqual(model.parsePoints('25, 18.5, 0'), [25, 18.5, 0]);
  for (const value of ['', '0, 0', '25, -1', '25, nope', '25, 1.234', '1001']) {
    assert.equal(model.parsePoints(value), null, value);
  }
});

test('WEC settings reject malformed saved arrays and over-precise multipliers', () => {
  const defaults = model.presets.weighted;
  assert.deepEqual(model.settings({ points: Array(31).fill(1) }).points, defaults.points);
  assert.deepEqual(model.settings({ points: [0, 0] }).points, defaults.points);
  assert.deepEqual(model.settings({ points: [25, 1.234] }).points, defaults.points);
  assert.equal(model.settings({ extended: 1.234 }).extended, defaults.extended);
});

test('WEC simulator only offers single-class championships', () => {
  assert.deepEqual(model.eligibleChampionships(fixture).map(item => item.id), ['hypercar-drivers']);
  assert.equal(model.simulate(fixture, 'overall', model.settings()), null);
});

test('WEC simulator weights longer races and ignores unclassified cars', () => {
  const result = model.simulate(fixture, 'hypercar-drivers', model.settings());
  assert.equal(result.rows[0].id, 'b');
  assert.equal(result.rows[0].points, 105.5);
  assert.equal(result.rows[0].change, 1);
  assert.equal(result.rows.find(row => row.id === 'c').points, 0);
  assert.equal(result.changed, 2);
  assert.deepEqual(result.rows[0].rounds.map(round => round.points), [18, 37.5, 50]);
});

test('equal-weight preset changes totals without changing race results', () => {
  const result = model.simulate(fixture, 'hypercar-drivers', model.settings({ preset: 'equal' }));
  assert.equal(result.rows.find(row => row.id === 'b').points, 68);
  assert.equal(result.rows.find(row => row.id === 'a').points, 61);
});

test('equal points use finish countback, with equal records shown as ties', () => {
  const tied = structuredClone(fixture);
  tied.championships[0].entities = [
    { id: 'a', name: 'A', finalPosition: 1, results: { r1: { position: 1, status: 'classified' } } },
    { id: 'b', name: 'B', finalPosition: 2, results: { r1: { position: 2, status: 'classified' }, r2: { position: 2, status: 'classified' } } },
    { id: 'd', name: 'D', finalPosition: 3, results: { r1: { position: 2, status: 'classified' }, r2: { position: 2, status: 'classified' } } }
  ];
  const result = model.simulate(tied, 'hypercar-drivers', model.settings({ preset: 'equal', points: [10, 5] }));
  assert.equal(result.rows[0].id, 'a');
  assert.equal(result.rows[1].position, 2);
  assert.equal(result.rows[2].position, 2);
});

test('WEC simulator pages are mounted and linked in the series navigation', () => {
  const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
  const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
  const hub = fs.readFileSync(path.join(root, 'frontend/wec-simulator.html'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'frontend/wec-simulate-season.html'), 'utf8');
  assert.match(server, /app\.get\('\/wec\/simulator'/);
  assert.match(server, /app\.get\('\/wec\/simulate-season'/);
  assert.match(navigation, /'WEC SIMULATOR'/);
  assert.match(hub, /preset=equal/);
  assert.match(page, /wec-simulate-season-model\.js/);
});
