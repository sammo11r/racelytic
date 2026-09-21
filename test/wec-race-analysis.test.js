const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../frontend/js/wec-race-analysis-model');

const root = path.join(__dirname, '..');
const entry = (overrides = {}) => ({
  entryId: 'race-7', competitorId: 'season-hypercar-7', carNumber: '7', overallPosition: 1, classPosition: 1,
  status: 'classified', laps: 100, time: '6:00:00.000', bestLap: '1:40.000', bestLapMillis: 100000, points: 25,
  class: { code: 'HYPERCAR', name: 'Hypercar' }, team: { name: 'Works Team' }, manufacturer: { name: 'Maker' },
  carModel: { name: 'Prototype' }, crew: [{ id: 'driver-a', name: 'Driver A' }], ...overrides
});
const fixture = { classification: [
  entry(),
  entry({ entryId: 'race-8', carNumber: '8', overallPosition: 2, classPosition: 2, laps: 99, bestLap: '1:41.000', bestLapMillis: 101000 }),
  entry({ entryId: 'race-85', carNumber: '85', overallPosition: 20, classPosition: 1, laps: 90, bestLap: '1:59.000', bestLapMillis: 119000, class: { code: 'LMGT3', name: 'LMGT3' } }),
  entry({ entryId: 'race-87', carNumber: '87', overallPosition: null, classPosition: null, laps: 45, status: 'retired', bestLap: null, bestLapMillis: null, class: { code: 'LMGT3', name: 'LMGT3' } })
] };

test('WEC race analysis keeps distance comparisons inside each class', () => {
  const distance = model.distanceRows(fixture, 'LMGT3')[0];
  assert.equal(distance.entries[0].distancePercent, 100);
  assert.equal(distance.entries[1].distancePercent, 50);
});

test('WEC race analysis distinguishes classified cars from retirement statuses', () => {
  const summary = model.summary(fixture, 'LMGT3');
  assert.equal(summary.starters, 2);
  assert.equal(summary.classified, 1);
  assert.equal(summary.attrition, 1);
  assert.equal(summary.winner.carNumber, '85');
});

test('class summaries exclude other classes and never award a retired position a win', () => {
  const data = { classification: [...fixture.classification,
    entry({ entryId: 'innovation', carNumber: '0', overallPosition: 52, classPosition: 1, status: 'retired', class: { code: 'CDNT', name: 'Innovative Car' } })] };
  const gt = model.summary(data, 'LMGT3');
  assert.equal(gt.starters, 2);
  assert.equal(gt.classCount, 1);
  assert.equal(gt.winner.carNumber, '85');
  assert.equal(model.summary(data, 'CDNT').winner, null);
  assert.equal(model.groupsFor(data, 'CDNT')[0].winner, null);
});

test('overall completion rate benchmarks every entry against its own class leader', () => {
  const summary = model.summary(fixture);
  assert.equal(summary.completionRate, 87.25);
});

test('qualifying flow uses each entry last recorded qualifying or Hyperpole result', () => {
  const combined = model.withQualifying(fixture, [
    [{ entryId: 'race-7', classPosition: 3 }, { entryId: 'race-8', classPosition: 2 }],
    [{ entryId: 'race-7', classPosition: 1 }]
  ]);
  assert.equal(combined.classification[0].qualifyingPosition, 1);
  assert.equal(combined.classification[1].qualifyingPosition, 2);
  assert.equal(model.positionChange({ qualifyingPosition: 5, classPosition: 2, status: 'classified' }), 3);
  assert.equal(model.positionChange({ qualifyingPosition: 10, classPosition: 2, status: 'retired' }), null);
});

test('WEC race analysis is routed, discoverable and endurance-specific', () => {
  const page = fs.readFileSync(path.join(root, 'frontend/wec-race-analysis.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'frontend/js/wec-race-analysis.js'), 'utf8');
  const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
  assert.match(page, /Qualifying to finish/);
  assert.match(page, /Race points/);
  assert.match(page, /Race distance/);
  assert.match(page, /data-wec-race-preset="ten"/);
  assert.match(page, /id="wec-race-entry-picker"/);
  assert.match(script, /data-label="Overall"/);
  assert.match(script, /\/api\/wec\/events/);
  assert.match(script, /One result per car|entry\.crew/);
  assert.match(script, /model\.summary\(data, activeClass\)/);
  assert.match(script, /'wec-race-analysis-class'\)\.addEventListener\('change',[^\n]*renderSummary\(\)/);
  assert.match(script, /function validSelectionRows\(\) \{ return currentRows\(\)\.filter\(entry => model\.positionChange\(entry\) !== null\); \}/);
  assert.match(navigation, /'\/race-analysis': '\/wec\/race-analysis'/);
  assert.match(server, /app\.get\('\/wec\/race-analysis'/);
});
