const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend', 'driver-form.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'frontend', 'js', 'driver-form.js'), 'utf8');
const route = fs.readFileSync(path.join(root, 'backend', 'routes', 'drivers.js'), 'utf8');

test('driver form uses a connected responsive workspace', () => {
  assert.doesNotMatch(html, /back-link|Choose an analysis|FORM VIEW/);
  assert.match(html, /id="form-driver-search"/);
  assert.match(html, /list="form-driver-options"/);
  assert.match(html, /id="form-driver" type="hidden"/);
  assert.doesNotMatch(html, /<select id="form-driver"/);
  assert.match(script, /map\(driver => `<option value="\$\{esc\(driver\.name\)\}"><\/option>`/);
  assert.match(script, /if \(!query\) \{ search\.setCustomValidity\(''\); return false; \}/);
  assert.match(html, /id="form-view"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /css\/driver-form\.css/);
});

test('driver form preserves core state and protects race changes', () => {
  for (const key of ['driver', 'range', 'window', 'metric', 'view']) {
    assert.match(script, new RegExp(`query\\.set\\('${key}'`));
  }
  assert.match(script, /formController\?\.abort\(\)/);
  assert.match(script, /request !== formRequest/);
  assert.match(script, /localStorage\.setItem/);
});

test('driver form keeps statuses and missing positions explicit', () => {
  for (const category of ['nonstarter', 'disqualified', 'unclassified', 'retired', 'classified']) {
    assert.match(script, new RegExp(`'${category}'`));
  }
  assert.match(script, /Classified rate/);
  assert.match(script, /Time \/ gap/);
  assert.match(script, /positionLabel\(result\.qualifying\)/);
  assert.match(route, /rr\.time, rr\.gap/);
  assert.match(route, /results\.gapMillis, results\.gapLaps/);
});

test('driver form offers auditable comparisons and sortable results', () => {
  assert.match(script, /raceCompared/);
  assert.match(script, /qualiCompared/);
  assert.match(script, /form-circuit-minimum/);
  assert.match(script, /data-form-sort/);
  assert.match(script, /form-result-status/);
  assert.match(script, /data-form-point/);
});
