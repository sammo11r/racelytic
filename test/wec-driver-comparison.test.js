const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../frontend/js/wec-driver-comparison-model');

const appearance = (eventId, overrides = {}) => ({
  eventId, eventName: `Event ${eventId}`, year: 2025, round: 1, date: '2025-01-01', entryId: `${eventId}-7`,
  carNumber: '7', classCode: 'HYPERCAR', classPosition: 1, overallPosition: 1, status: 'classified', ...overrides
});

test('WEC driver comparison keeps shared events and same-entry crews distinct', () => {
  const rows = model.sharedAppearances([
    appearance('a'), appearance('b', { entryId: 'b-50', classCode: 'LMGT3', classPosition: 2 })
  ], [
    appearance('a', { classPosition: 2 }), appearance('b', { entryId: 'b-51', classCode: 'LMGT3', classPosition: 1 }), appearance('c')
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sameEntry || rows[1].sameEntry, true);
  assert.equal(model.sharedCrew(rows).rows.length, 1);
  assert.deepEqual(model.headToHead(rows), { first: 1, second: 1, ties: 0, compared: 2, excluded: 0 });
});

test('WEC head-to-head excludes cross-class and unclassified results', () => {
  const rows = model.sharedAppearances([
    appearance('a'), appearance('b', { classPosition: 4, status: 'retired' })
  ], [
    appearance('a', { classCode: 'LMGT3', classPosition: 1, overallPosition: 20 }), appearance('b', { classPosition: 3 })
  ]);
  assert.deepEqual(model.headToHead(rows), { first: 0, second: 0, ties: 0, compared: 0, excluded: 2 });
});

test('WEC comparison state validates shareable controls', () => {
  assert.deepEqual(model.readState('?first=driver-a&second=driver-b&view=crew'), { first: 'driver-a', second: 'driver-b', view: 'crew' });
  assert.equal(model.readState('?view=invalid').view, 'overview');
});

test('WEC driver comparison is routed, discoverable and endurance-specific', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'frontend/wec-driver-comparison.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'frontend/js/wec-driver-comparison.js'), 'utf8');
  const overview = fs.readFileSync(path.join(root, 'frontend/wec-analysis.html'), 'utf8');
  const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
  assert.match(html, /Class-aware careers/);
  assert.match(html, /<select id="wec-comparison-driver-one"/);
  assert.doesNotMatch(html, /<datalist/);
  assert.match(script, /Same-class head-to-head/);
  assert.match(script, /same entry/i);
  assert.match(script, /\/api\/wec\/entities\/drivers/);
  assert.match(overview, /href="\/wec\/driver-comparison"/);
  assert.match(navigation, /\['\/wec\/driver-comparison', 'Driver comparison'/);
  assert.match(server, /app\.get\('\/wec\/driver-comparison'/);
});
