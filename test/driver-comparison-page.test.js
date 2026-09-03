const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend', 'driver-comparison.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'frontend', 'js', 'driver-comparison.js'), 'utf8');

test('driver comparison exposes searchable, responsive, shareable controls', () => {
  assert.match(html, /type="search" list="comparison-driver-options-one"/);
  assert.match(html, /id="swap-drivers"/);
  assert.match(html, /id="copy-comparison-link"/);
  assert.match(html, /css\/driver-comparison\.css/);
  assert.match(script, /searchParams\.set\('first'/);
  assert.match(script, /searchParams\.set\('second'/);
  assert.match(script, /searchParams\.set\('view'/);
  assert.match(script, /current !== requestId/);
});

test('driver comparison adds rates, methodology and shared-race exploration', () => {
  assert.match(script, /Win rate/);
  assert.match(script, /Points per start/);
  assert.match(script, /score\.excluded/);
  assert.match(script, /id="shared-race-search"/);
  assert.match(script, /id="shared-season-filter"/);
  assert.match(script, /id="shared-team-filter"/);
  assert.match(script, /id="shared-teammate-filter"/);
  assert.match(script, /const pageSize = 25/);
});
