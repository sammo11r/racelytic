const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { comparisonRaceGroups } = require('../backend/driver-comparison');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend', 'teammate-battles.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'frontend', 'js', 'teammate-battles.js'), 'utf8');

test('teammate battles searches the first driver and limits the second dropdown to teammates', () => {
  assert.match(html, /id="battle-driver-search"[^>]+list="battle-driver-options"/);
  assert.match(html, /<select id="battle-teammate" disabled>/);
  assert.match(html, /id="swap-battle-drivers"/);
  assert.match(html, /id="reset-battle-drivers"/);
  assert.doesNotMatch(html, /back-link|id="load-battle"|<select id="battle-driver"|battle-teammate-search|battle-teammate-options/);
  assert.match(html, /css\/teammate-battles\.css/);
});

test('teammate battles consumes only same-team races', () => {
  const grouped = comparisonRaceGroups([
    { raceId: 'same', sameTeam: 1 },
    { raceId: 'different', sameTeam: 0 }
  ]);
  assert.equal(grouped.sharedRaces.length, 2);
  assert.deepEqual(grouped.teammateRaces.map(race => race.raceId), ['same']);
  assert.match(script, /battleData\?\.teammateRaces \|\| \[\]/);
  assert.match(script, /displayCountryName\(first\.nationalityCountryId\)/);
  assert.doesNotMatch(script, /battleData\.sharedRaces/);
});

test('battle scores disclose ties, exclusions and status categories', () => {
  for (const category of ['classified', 'retired', 'nonstarter', 'disqualified', 'unclassified']) {
    assert.match(script, new RegExp(`'${category}'`));
  }
  assert.match(script, /score\.ties\+\+/);
  assert.match(script, /score\.excluded\+\+/);
  assert.match(script, /comparable/);
  assert.match(script, /missing qualifying positions remain missing/);
});

test('battle state, requests and race exploration are robust', () => {
  for (const key of ['first', 'second', 'view']) assert.match(script, new RegExp(`query\\.set\\('${key}'`));
  assert.match(script, /battleController\?\.abort\(\)/);
  assert.match(script, /request !== battleRequest/);
  assert.match(script, /request !== teammateRequest/);
  assert.match(script, /data-battle-sort/);
  assert.match(script, /battle-race-status/);
  assert.match(script, /renderPagination\('battle-results-region'/);
  assert.match(script, /battle-mobile-card/);
});
