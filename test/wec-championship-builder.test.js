const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../frontend/js/wec-championship-builder-model');
const scoring = require('../frontend/js/wec-simulate-season-model');
const { configuredItems } = require('../backend/community');
const { configuration } = require('../backend/custom-championship');

const raceData = {
  spa: { event: { pointsScale: 'standard' }, coverage: { classifications: true }, classification: [
    { class: { code: 'HYPERCAR', name: 'Hypercar' }, status: 'classified', classPosition: 1, crew: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], team: { id: 'red', name: 'Red' }, manufacturer: { id: 'm', name: 'M' } },
    { class: { code: 'HYPERCAR', name: 'Hypercar' }, status: 'classified', classPosition: 2, crew: [{ id: 'c', name: 'C' }], team: { id: 'red', name: 'Red' }, manufacturer: { id: 'm', name: 'M' } },
    { class: { code: 'HYPERCAR', name: 'Hypercar' }, status: 'retired', classPosition: 3, crew: [{ id: 'd', name: 'D' }], team: { id: 'blue', name: 'Blue' }, manufacturer: { id: 'n', name: 'N' } },
    { class: { code: 'LMGT3', name: 'LMGT3' }, status: 'classified', classPosition: 1, crew: [{ id: 'e', name: 'E' }], team: { id: 'gt', name: 'GT' }, manufacturer: { id: 'g', name: 'G' } }
  ] },
  leMans: { event: { pointsScale: 'le-mans' }, coverage: { classifications: true }, classification: [
    { class: { code: 'HYPERCAR', name: 'Hypercar' }, status: 'classified', classPosition: 1, crew: [{ id: 'c', name: 'C' }], team: { id: 'blue', name: 'Blue' }, manufacturer: { id: 'n', name: 'N' } }
  ] }
};
const calendar = [{ id: 'spa', pointsScale: 'standard' }, { id: 'leMans', pointsScale: 'le-mans' }];
const all = { drivers: new Set(['a', 'b', 'c', 'd']), teams: new Set(['red', 'blue']), manufacturers: new Set(['m', 'n']) };

test('builder discovers the selected class and its independent eligible fields', () => {
  assert.deepEqual(model.classOptions(calendar, raceData).map(item => item.code), ['HYPERCAR', 'LMGT3']);
  const field = model.discoveredField(calendar, raceData, 'HYPERCAR');
  assert.deepEqual([...field.drivers.keys()], ['a', 'b', 'c', 'd']);
  assert.deepEqual([...field.teams.keys()], ['red', 'blue']);
  assert.equal(field.manufacturers.size, 2);
});

test('builder awards one car result to every crew driver and only the best car to a team and manufacturer', () => {
  const result = model.calculate(calendar, raceData, 'HYPERCAR', all, scoring.settings());
  assert.equal(result.drivers.find(row => row.id === 'a').points, 25);
  assert.equal(result.drivers.find(row => row.id === 'b').points, 25);
  assert.equal(result.drivers.find(row => row.id === 'c').points, 68);
  assert.equal(result.drivers.some(row => row.id === 'd'), false);
  assert.equal(result.teams.find(row => row.id === 'red').points, 25);
  assert.equal(result.manufacturers.find(row => row.id === 'm').points, 25);
  assert.equal(result.teams.find(row => row.id === 'blue').points, 50);
});

test('calendar weights and eligible field change standings without mutating classification', () => {
  const changed = [{ id: 'spa', pointsScale: 'extended' }, { id: 'leMans', pointsScale: 'standard' }];
  const eligible = { drivers: new Set(['a', 'b']), teams: new Set(['red']), manufacturers: new Set(['m']) };
  const result = model.calculate(changed, raceData, 'HYPERCAR', eligible, scoring.settings());
  assert.equal(result.drivers.length, 2);
  assert.equal(result.drivers[0].points, 37.5);
  assert.equal(result.teams[0].points, 37.5);
  assert.equal(raceData.spa.event.pointsScale, 'standard');
});

test('builder assigns the same championship position to exact countback ties', () => {
  const result = model.calculate([{ id: 'spa', pointsScale: 'standard' }], raceData, 'HYPERCAR', all, scoring.settings());
  const a = result.drivers.find(row => row.id === 'a');
  const b = result.drivers.find(row => row.id === 'b');
  assert.equal(a.points, b.points);
  assert.deepEqual(a.finishes, b.finishes);
  assert.equal(a.position, 1);
  assert.equal(b.position, 1);
});

test('saved championship validation rejects damaged scoring snapshots', () => {
  const base = { series: 'wec', raceIds: ['race'], classCode: 'HYPERCAR', driverIds: ['driver'], pointsSystem: { race: [25, 18], sprint: [], qualifying: [] } };
  assert.deepEqual(configuration(base).pointsSystem.race, [25, 18]);
  assert.throws(() => configuration({ ...base, pointsSystem: { ...base.pointsSystem, race: [] } }), /at least one race position/);
  assert.throws(() => configuration({ ...base, pointsSystem: { ...base.pointsSystem, race: [25, 'broken', 18] } }), /between 0 and 1000/);
  assert.throws(() => configuration({ ...base, pointsSystem: { ...base.pointsSystem, extended: 1.234 } }), /two decimal places/);
  assert.throws(() => configuration({ ...base, classCode: '' }), /Choose a WEC class/);
  assert.throws(() => configuration({ ...base, driverIds: [] }), /eligible WEC competitor/);
  assert.throws(() => configuration(null), /must be an object/);
});

test('WEC builder route, navigation and account configuration are wired', () => {
  const root = path.join(__dirname, '..');
  const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
  const nav = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
  const hub = fs.readFileSync(path.join(root, 'frontend/wec-simulator.html'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'backend/routes/custom-championships.js'), 'utf8');
  const validator = fs.readFileSync(path.join(root, 'backend/custom-championship.js'), 'utf8');
  const builder = fs.readFileSync(path.join(root, 'frontend/js/wec-championship-builder.js'), 'utf8');
  assert.match(server, /app\.get\('\/wec\/championship-builder'/);
  assert.match(nav, /'\/wec\/championship-builder', 'Championship builder'/);
  assert.match(hub, /href="\/wec\/championship-builder"/);
  assert.match(api, /require\('\.\.\/custom-championship'\)/);
  assert.match(validator, /'wec'\].includes\(input.series\)/);
  assert.match(validator, /raceWeights/);
  assert.match(builder, /sourceId:/);
  assert.match(builder, /restoreSaved\(savedId\); await restoreDraft\(savedId\)/);
  assert.equal(configuredItems([{ id: 'saved', name: 'Custom WEC', configuration: JSON.stringify({ series: 'wec' }) }], 'championships')[0].series, 'wec');
});
