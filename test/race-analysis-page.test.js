const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend', 'race-analysis.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'frontend', 'js', 'race-analysis.js'), 'utf8');

test('shared race analysis exposes the upgraded workspace to every championship', () => {
  assert.match(html, /id="race-analysis-view"/);
  assert.match(html, /Grid to finish/);
  assert.match(html, /Qualifying → grid → finish/);
  assert.match(html, /id="race-driver-search"/);
  assert.match(html, /id="race-result-search"/);
  assert.match(html, /id="race-team-filter"/);
  assert.match(html, /css\/race-analysis\.css/);
  assert.match(script, /location\.pathname\.startsWith\('\/f2\/'\)/);
  assert.match(script, /location\.pathname\.startsWith\('\/f3\/'\)/);
  assert.match(script, /location\.pathname\.startsWith\('\/academy\/'\)/);
});

test('race analysis preserves state and separates result statuses', () => {
  for (const key of ['year', 'race', 'view', 'mode', 'drivers']) {
    assert.match(script, new RegExp(`searchParams\\.set\\('${key}'`));
  }
  assert.match(script, /return 'non-starter'/);
  assert.match(script, /return 'disqualified'/);
  assert.match(script, /return 'unclassified'/);
  assert.match(script, /return 'retired'/);
  assert.match(script, /current !== requestId/);
});

test('a championship switch cannot leave the initial flow without drivers', () => {
  assert.match(script, /requested == null \|\| requested\.length === 0 \? valid : requested/);
  assert.match(script, /previousCount > 0 && retained\.length === 0 \? valid : retained/);
  assert.match(script, /if \(selected\.size > 1\) selected\.delete\(id\)/);
  assert.doesNotMatch(html, /data-race-preset="clear"/);
});
test('race-analysis entity links use registered detail routes in every championship', () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/js/race-analysis.js'), 'utf8');
  const functionSource = source.match(/function entityUrl\(type, id\) \{[\s\S]*?\n  \}/)[0];
  for (const [series, base, teamPage] of [['f1', '', 'constructor'], ['f2', '/f2', 'constructor'], ['f3', '/f3', 'team'], ['academy', '/academy', 'team']]) {
    const entityUrl = require('node:vm').runInNewContext(`(${functionSource})`, { series, encodeURIComponent });
    assert.equal(entityUrl('team', 'prema-racing'), `${base}/${teamPage}?id=prema-racing`);
    assert.equal(entityUrl('driver', 'a b'), `${base}/driver?id=a%20b`);
  }
});
