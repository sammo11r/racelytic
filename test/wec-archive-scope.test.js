const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const scope = require('../frontend/js/wec-archive-scope-model');

const root = path.join(__dirname, '..');

test('driver era checks actual seasons, not the span between first and last starts', () => {
  const driver = { firstYear: 2017, lastYear: 2021, classCodes: ['LMP2', 'HYPERCAR'],
    scope: [{ year: 2017, classCode: 'LMP2', podiums: 1 }, { year: 2021, classCode: 'HYPERCAR', podiums: 0 }] };
  assert.equal(scope.matches(driver, { from: 2018, to: 2020 }), false);
  assert.equal(scope.matches(driver, { from: 2021, to: 2025, classCode: 'LMP2' }), false);
  assert.equal(scope.matches(driver, { from: 2021, to: 2025, classCode: 'HYPERCAR' }), true);
  assert.equal(scope.matches(driver, { from: 2021, to: 2025, achievement: 'podiums' }), false);
});

test('team season, class, manufacturer and achievements must share the selected scope', () => {
  const team = { championships: 1, classWins: 1, overallWins: 1, podiums: 1,
    scope: [
      { year: 2017, classCode: 'LMP1', manufacturerId: 'toyota', overallWins: 1, classWins: 1, podiums: 1 },
      { year: 2025, classCode: 'HYPERCAR', manufacturerId: 'toyota', overallWins: 0, classWins: 0, podiums: 0 },
      { year: 2025, classCode: 'HYPERCAR', manufacturerId: 'other', overallWins: 1, classWins: 1, podiums: 1 }
    ], titles: [{ year: 2017, classCode: 'LMP1', championshipId: 'old-title' }] };
  assert.equal(scope.matches(team, { from: 2025, to: 2025, classCode: 'LMP1' }), false);
  assert.equal(scope.matches(team, { from: 2025, to: 2025, classCode: 'HYPERCAR', manufacturerId: 'toyota', achievement: 'class-winners' }), false);
  assert.equal(scope.matches(team, { from: 2025, to: 2025, achievement: 'champions' }), false);
  assert.equal(scope.matches(team, { from: 2017, to: 2017, classCode: 'LMP1', achievement: 'champions' }), true);
});

test('WEC archive pages consume the scoped API data', () => {
  const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
  for (const page of ['drivers', 'teams']) {
    const html = fs.readFileSync(path.join(root, `frontend/wec-${page}.html`), 'utf8');
    const script = fs.readFileSync(path.join(root, `frontend/js/wec-${page}.js`), 'utf8');
    assert.match(html, /wec-archive-scope-model\.js/);
    assert.match(script, /WecArchiveScopeModel\.matches/);
  }
  assert.match(route, /scope: scopeByDriver\.get\(row\.id\) \|\| \[\]/);
  assert.match(route, /scope: scopeByTeam\.get\(row\.id\) \|\| \[\]/);
});
