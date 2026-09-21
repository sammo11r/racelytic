const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../frontend/js/wec-scenario-model');
const scoring = require('../frontend/js/wec-simulate-season-model');

const fixture = {
  events: [
    { id: 'r1', round: 1, pointsScale: 'standard' },
    { id: 'r2', round: 2, pointsScale: 'extended' },
    { id: 'r3', round: 3, pointsScale: 'le-mans' }
  ],
  championships: [{ id: 'drivers', entityType: 'driver', classIds: ['hypercar'], entities: [
    { id: 'a', name: 'A', rounds: [{ round: 1, position: 1, points: 26 }], results: { r1: { position: 1, status: 'classified' }, r2: { position: 2, status: 'classified' } } },
    { id: 'b', name: 'B', rounds: [{ round: 1, position: 2, points: 18 }], results: { r1: { position: 2, status: 'classified' }, r2: { position: 2, status: 'classified' } } },
    { id: 'c', name: 'C', rounds: [{ round: 1, position: 3, points: 15 }], results: { r1: { position: 3, status: 'classified' }, r2: { position: 1, status: 'retired' } } }
  ] }]
};

test('WEC scenario starts from official cutoff points and seeds archived finishes', () => {
  const championship = fixture.championships[0];
  assert.deepEqual(model.cutoffRounds(fixture, championship), [1]);
  const predictions = model.initialPredictions(fixture, championship, 1);
  assert.deepEqual(predictions.r2, { a: 2, b: 2, c: 0 });
  assert.deepEqual(predictions.r3, { a: null, b: null, c: null });
  const result = model.project(fixture, 'drivers', 1, predictions, scoring.settings());
  assert.equal(result.rows.find(row => row.id === 'a').points, 53);
  assert.equal(result.rows.find(row => row.id === 'a').officialPoints, 26);
  assert.equal(result.rows.find(row => row.id === 'c').predictedPoints, 0);
  assert.equal(result.unassignedEvents, 1);
  assert.equal(result.unassignedEntries, 3);
});

test('scenario maximum uses the largest available positional award', () => {
  const predictions = model.initialPredictions(fixture, fixture.championships[0], 1);
  const result = model.project(fixture, 'drivers', 1, predictions, scoring.settings({ points: [0, 100, 5] }));
  assert.equal(result.maximum, 350);
  assert.equal(result.rows.find(row => row.id === 'a').maximum, 376);
});

test('Le Mans predictions use event multiplier and can change the leader', () => {
  const predictions = model.initialPredictions(fixture, fixture.championships[0], 1);
  assert.equal(model.setPrediction(predictions, 'r3', 'c', 1, 'driver'), true);
  assert.equal(model.setPrediction(predictions, 'r3', 'b', 2, 'driver'), true);
  const result = model.project(fixture, 'drivers', 1, predictions, scoring.settings());
  assert.equal(result.rows.find(row => row.id === 'c').predictedPoints, 50);
  assert.equal(result.rows[0].id, 'b');
  assert.equal(result.unassignedEvents, 0);
});

test('finish editing swaps occupied places while only crewmates share them', () => {
  const predictions = { r2: { a: 1, b: 2, c: null } };
  model.setPrediction(predictions, 'r2', 'b', 1, 'competitor');
  assert.deepEqual(predictions.r2, { a: 2, b: 1, c: null });
  model.setPrediction(predictions, 'r2', 'c', 1, 'driver');
  assert.equal(predictions.r2.b, null);
  assert.equal(predictions.r2.c, 1);
  assert.equal(model.setPrediction(predictions, 'r2', 'missing', 1, 'driver'), false);
  assert.equal(model.setPrediction(predictions, 'r2', 'c', 101, 'driver'), false);
});

test('driver scenario moves a car crew together and swaps a rival car', () => {
  const data = { events: [{ id: 'r1' }, { id: 'r2' }], championships: [{ entityType: 'driver', entities: [
    { id: 'a', results: { r1: { competitorId: 'car-7' } } },
    { id: 'b', results: { r1: { competitorId: 'car-7' } } },
    { id: 'c', results: { r1: { competitorId: 'car-8' } } }
  ] }] };
  const groups = model.crewGroups(data, data.championships[0], 'r2');
  assert.deepEqual(groups, { a: 'car-7', b: 'car-7', c: 'car-8' });
  const predictions = { r2: { a: 2, b: 2, c: 1 } };
  assert.equal(model.setPrediction(predictions, 'r2', 'a', 1, 'driver', groups), true);
  assert.deepEqual(predictions.r2, { a: 1, b: 1, c: 2 });
  model.setPrediction(predictions, 'r2', 'b', null, 'driver', groups);
  assert.deepEqual(predictions.r2, { a: null, b: null, c: 2 });
});

test('recorded driver changes do not pull absent former crewmates into the same car', () => {
  const data = { events: [{ id: 'r1' }, { id: 'r2' }], championships: [{ entityType: 'driver', entities: [
    { id: 'former', results: { r1: { competitorId: 'car-7' } } },
    { id: 'current', results: { r2: { competitorId: 'car-7' } } }
  ] }] };
  assert.deepEqual(model.crewGroups(data, data.championships[0], 'r2'), { former: 'former', current: 'car-7' });
});

test('WEC scenario is routed and discoverable from the simulator', () => {
  const root = path.join(__dirname, '..');
  const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
  const nav = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
  const hub = fs.readFileSync(path.join(root, 'frontend/wec-simulator.html'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'frontend/wec-scenario-calculator.html'), 'utf8');
  assert.match(server, /app\.get\('\/wec\/scenario-calculator'/);
  assert.match(nav, /'\/wec\/scenario-calculator', 'Scenario calculator'/);
  assert.match(hub, /href="\/wec\/scenario-calculator"/);
  assert.match(page, /wec-scenario-model\.js/);
});
