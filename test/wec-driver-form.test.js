const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../frontend/js/wec-driver-form-model');

const row = (eventId, overrides = {}) => ({ eventId, date: `2025-0${eventId}-01`, round: Number(eventId), classCode: 'HYPERCAR', classPosition: Number(eventId), status: 'classified', ...overrides });

test('WEC form selects recent events and keeps official statuses explicit', () => {
  const rows = [row('1'), row('2'), row('3', { status: 'retired', classPosition: 8 })];
  assert.deepEqual(model.selectedRows(rows, '2').map(item => item.eventId), ['3', '2']);
  assert.equal(model.category(rows[2]), 'retired');
  assert.deepEqual(model.summary(rows), { starts: 3, classified: 2, averageClassFinish: 1.5, classWins: 1, podiums: 2, classifiedRate: 2 / 3 * 100 });
});

test('WEC rolling form preserves gaps instead of inventing positions', () => {
  const points = model.rolling([row('3', { status: 'retired' }), row('2'), row('1')], 3);
  assert.deepEqual(points.map(point => point.value), [1, 1.5, null]);
});

test('WEC form groups classes and co-drivers inside the selected window', () => {
  const rows = [row('1'), row('2', { classCode: 'LMGT3', classPosition: 1 })];
  assert.deepEqual(model.classBreakdown(rows).map(group => group.code).sort(), ['HYPERCAR', 'LMGT3']);
  const crew = model.crewBreakdown([
    { eventId: '1', entryId: 'a', driverId: 'driver-b', driverName: 'Driver B' },
    { eventId: '2', entryId: 'b', driverId: 'driver-b', driverName: 'Driver B' },
    { eventId: '3', entryId: 'c', driverId: 'driver-c', driverName: 'Driver C' }
  ], rows);
  assert.deepEqual(crew.map(item => [item.id, item.startsTogether]), [['driver-b', 2]]);
});

test('WEC driver form is routed, discoverable and class-aware', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'frontend/wec-driver-form.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'frontend/js/wec-driver-form.js'), 'utf8');
  const overview = fs.readFileSync(path.join(root, 'frontend/wec-analysis.html'), 'utf8');
  const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
  assert.match(html, /Recent class results/);
  assert.match(html, /<select id="wec-form-driver"/);
  assert.match(script, /Recent class-position form/);
  assert.match(script, /\/api\/wec\/entities\/drivers/);
  assert.match(script, /Class positions are compared within each event’s class/);
  assert.match(overview, /href="\/wec\/driver-form"/);
  assert.match(navigation, /\['\/wec\/driver-form', 'Driver form'/);
  assert.match(server, /app\.get\('\/wec\/driver-form'/);
});
