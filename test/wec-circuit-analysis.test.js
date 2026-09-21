const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../frontend/js/wec-circuit-analysis-model');

const root = path.join(__dirname, '..');
const result = (id, position, options = {}) => ({
  entryId: id, class: { code: options.classCode || 'Hypercar', name: options.classCode || 'Hypercar', displayOrder: 1 },
  classPosition: position, overallPosition: options.overallPosition ?? position, status: options.status || 'classified',
  laps: options.laps ?? 100, team: { id: options.team || 'team-a', name: options.team || 'Team A' },
  manufacturer: { id: options.manufacturer || 'maker-a', name: options.manufacturer || 'Maker A' },
  crew: (options.drivers || ['driver-a']).map(id => ({ id, name: id }))
});
const event = (id, year, results) => ({ id, year, round: 1, name: id, results });

test('WEC circuit analysis filters years and changing classes without mutating events', () => {
  const events = [event('one', 2014, [result('a', 1, { classCode: 'LMP1' })]), event('two', 2024, [result('b', 1)])];
  assert.deepEqual(model.filter(events, { from: 2021, to: 2026 }).map(row => row.id), ['two']);
  assert.deepEqual(model.filter(events, { classCode: 'LMP1' }).map(row => row.id), ['one']);
  assert.equal(events[0].results.length, 1);
  assert.deepEqual(model.classes(events).map(row => row.code), ['Hypercar', 'LMP1']);
});

test('crew members share entry results while teams and manufacturers count the car once', () => {
  const events = [event('spa', 2024, [result('a', 1, { drivers: ['one', 'two', 'three'] })])];
  assert.equal(model.entities(events, 'driver').length, 3);
  assert.equal(model.entities(events, 'team')[0].wins, 1);
  assert.equal(model.entities(events, 'manufacturer')[0].starts, 1);
});

test('summary and reliability are class-relative and exclude non-starters', () => {
  const events = [event('lemans', 2024, [
    result('a', 1, { laps: 100 }), result('b', null, { laps: 80, status: 'retired', drivers: ['b'] }),
    result('c', null, { laps: 0, status: 'did-not-start', drivers: ['c'] })
  ])];
  const summary = model.summary(events), reliability = model.reliability(events)[0];
  assert.equal(summary.starts, 2); assert.equal(summary.finishRate, 50); assert.equal(summary.completionRate, 90);
  assert.equal(reliability.starts, 2); assert.equal(reliability.completionRate, 90);
});

test('a retired car with a recorded class position is not a class winner or podium', () => {
  const events = [event('lemans', 2012, [
    result('innovation', 1, { classCode: 'CDNT', status: 'retired', overallPosition: 52, team: 'innovation' }),
    result('winner', 1, { classCode: 'LMP1', overallPosition: 1, team: 'winner' })
  ])];
  assert.equal(model.summary(events).classWinners, 1);
  assert.equal(model.entities(events, 'team').find(row => row.id === 'innovation').wins, 0);
  assert.equal(model.entities(events, 'team').find(row => row.id === 'innovation').podiums, 0);
  assert.deepEqual(model.eventRows(events)[0].classWinners.map(row => row.entryId), ['winner']);
});

test('WEC circuit analysis page is wired into its route, navigation and API', () => {
  const page = fs.readFileSync(path.join(root, 'frontend/wec-circuit-analysis.html'), 'utf8');
  const overview = fs.readFileSync(path.join(root, 'frontend/wec-analysis.html'), 'utf8');
  const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
  assert.match(page, /WEC · CIRCUIT ANALYSIS/);
  assert.match(page, /wec-circuit-analysis-model\.js/);
  assert.match(overview, /href="\/wec\/circuit-analysis"/);
  assert.match(navigation, /\['\/wec\/circuit-analysis', 'Circuit analysis'/);
  assert.match(route, /router\.get\('\/api\/wec\/analysis\/circuits\/:circuitId'/);
  assert.match(server, /app\.get\('\/wec\/circuit-analysis'/);
});
