const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serialize, validatePointsSystem } = require('../backend/points-system');
const { pointItems } = require('../backend/community');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('WEC rules validate positional points and endurance multipliers', () => {
  const rules = validatePointsSystem({ name: 'Equal distance', series: 'wec', racePoints: [25, 18, 0],
    extendedMultiplier: 1.25, leMansMultiplier: 2 });
  assert.equal(rules.series, 'wec');
  assert.deepEqual(rules.racePoints, [25, 18]);
  assert.equal(rules.extendedMultiplier, 1.25);
  assert.equal(rules.leMansMultiplier, 2);
  assert.throws(() => validatePointsSystem({ name: 'Invalid', series: 'wec', racePoints: [25], leMansMultiplier: 5.01 }), /Le Mans multiplier/);
  assert.throws(() => validatePointsSystem({ name: 'Invalid', series: 'wec', racePoints: [25], extendedMultiplier: 1.234 }), /Extended-race multiplier/);
});

test('saved WEC rules retain their series and multipliers in API and community views', () => {
  const saved = serialize({ id: 'id', name: 'WEC rule', series: 'wec', racePoints: '[25,18]', sprintPoints: '[]',
    qualifyingPoints: '[]', poleBonus: 0, fastestLapBonus: 0, fastestLapMaxPosition: null,
    countBestRounds: null, bestFirstRounds: null, firstRoundsWindow: null, bestLastRounds: null,
    lastRoundsWindow: null, sprintCountsTowardRound: 1, visibility: 'public', tieBreaker: 'countback',
    extendedMultiplier: '1.50', leMansMultiplier: '2.00' });
  assert.equal(saved.series, 'wec');
  assert.equal(saved.extendedMultiplier, 1.5);
  assert.equal(saved.leMansMultiplier, 2);
  const publicItem = pointItems([{ id: 'id', name: 'WEC rule', series: 'wec', racePoints: '[25,18]', sprintPoints: '[]',
    qualifyingPoints: '[]', extendedMultiplier: '1.50', leMansMultiplier: '2.00' }])[0];
  assert.equal(publicItem.series, 'wec');
  assert.equal(publicItem.leMansMultiplier, 2);
});

test('points-system schema and SQL persist WEC-specific fields', () => {
  const schema = read('database/auth.sql');
  const route = read('backend/routes/points-systems.js');
  assert.match(schema, /ADD COLUMN IF NOT EXISTS extended_multiplier/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS le_mans_multiplier/);
  assert.match(route, /ps\.series/);
  assert.match(route, /system\.extendedMultiplier, system\.leMansMultiplier/);
});

test('WEC points page is routed and all three tools accept saved rule selections', () => {
  const server = read('backend/server.js');
  const nav = read('frontend/js/navigation.js');
  const page = read('frontend/wec-points-systems.html');
  const season = read('frontend/js/wec-simulate-season.js');
  const scenario = read('frontend/js/wec-scenario-calculator.js');
  const builder = read('frontend/js/wec-championship-builder.js');
  assert.match(server, /app\.get\('\/wec\/points-systems'/);
  assert.match(nav, /'\/wec\/points-systems', 'Points systems'/);
  assert.match(page, /wec-points-systems\.js/);
  for (const script of [season, scenario, builder]) assert.match(script, /saved:\$\{system\.id\}/);
});
