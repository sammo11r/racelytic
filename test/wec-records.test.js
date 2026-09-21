const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const records = require('../backend/wec-records');

const root = path.join(__dirname, '..');
const result = (entryId, position, options = {}) => ({
  entryId, year: options.year || 2024, circuitId: options.circuitId || 'spa', classCode: options.classCode || 'Hypercar',
  classPosition: position, overallPosition: options.overallPosition ?? position, status: options.status || 'classified',
  laps: options.laps ?? 100, points: options.points ?? 25,
  team: { id: options.team || 'team-a', name: options.team || 'Team A' },
  manufacturer: { id: options.manufacturer || 'maker-a', name: options.manufacturer || 'Maker A' },
  crew: (options.drivers || ['driver-a']).map(id => ({ id, name: id }))
});

test('WEC record configuration validates types, samples and year ranges', () => {
  assert.equal(records.configuration({ type: 'manufacturers', category: 'finishRate', minStarts: 3 }).minStarts, 3);
  assert.equal(records.configuration({ type: 'unknown', category: 'unknown' }).type, 'drivers');
  assert.equal(records.configuration({ type: 'unknown', category: 'unknown' }).category, 'classWins');
  assert.throws(() => records.configuration({ fromYear: 2025, toYear: 2020 }), /end season/);
});

test('driver crews share a class result while teams and manufacturers count the car once', () => {
  const rows = [result('car-1', 1, { drivers: ['one', 'two', 'three'] })];
  const drivers = records.aggregate(rows, [], records.configuration({ type: 'drivers' }));
  const teams = records.aggregate(rows, [], records.configuration({ type: 'teams' }));
  const makers = records.aggregate(rows, [], records.configuration({ type: 'manufacturers' }));
  assert.equal(drivers.length, 3); assert.ok(drivers.every(row => row.value === 1));
  assert.equal(teams[0].starts, 1); assert.equal(makers[0].classWins, 1);
});

test('class, circuit and team filters retain endurance-specific scope', () => {
  const rows = [result('a', 1), result('b', 1, { classCode: 'LMGT3', circuitId: 'le-mans', team: 'team-b', drivers: ['driver-b'] })];
  const config = records.configuration({ type: 'drivers', classCode: 'LMGT3', circuitId: 'le-mans', teamId: 'team-b' });
  assert.deepEqual(records.aggregate(rows, [], config).map(row => row.id), ['driver-b']);
});

test('championship records map competitor titles to teams and preserve class filters', () => {
  const titles = [{ championshipId: '2024-hypercar-teams', year: 2024, classCode: 'Hypercar', type: 'teams', entityId: 'team-a', entityName: 'Team A' },
    { championshipId: '2024-gt-teams', year: 2024, classCode: 'LMGT3', type: 'teams', entityId: 'team-b', entityName: 'Team B' }];
  const rows = records.aggregate([], titles, records.configuration({ type: 'teams', category: 'championships', classCode: 'Hypercar' }));
  assert.deepEqual(rows.map(row => [row.id, row.value]), [['team-a', 1]]);
});

test('WEC records page is routed and discoverable across the analysis surface', () => {
  const page = fs.readFileSync(path.join(root, 'frontend/wec-records.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'frontend/js/wec-records.js'), 'utf8');
  const overview = fs.readFileSync(path.join(root, 'frontend/wec-analysis.html'), 'utf8');
  const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
  assert.match(page, /WEC · RECORD BOOK/); assert.match(page, /Manufacturers/);
  assert.match(script, /\/api\/records\/explore/); assert.match(script, /series: 'wec'/);
  assert.match(overview, /href="\/wec\/records"/); assert.match(navigation, /\['\/wec\/records', 'Records'/);
  assert.match(server, /app\.get\('\/wec\/records'/);
});
