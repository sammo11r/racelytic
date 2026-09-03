const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderAcademyHtml } = require('../backend/academy-renderer');

const frontend = path.join(__dirname, '../frontend');
const f1 = fs.readFileSync(path.join(frontend, 'simulator.html'), 'utf8');
const f3 = fs.readFileSync(path.join(frontend, 'f3-simulate-season.html'), 'utf8');
const script = fs.readFileSync(path.join(frontend, 'js/simulator.js'), 'utf8');
const css = fs.readFileSync(path.join(frontend, 'css/simulator-season.css'), 'utf8');

test('season simulator starts with a compact automatic workspace', () => {
  assert.doesNotMatch(f1, /class="back-link"/);
  assert.match(f1, /<h1>Recalculate a championship<\/h1>/);
  assert.match(f1, /class="simulator-workspace"/);
  assert.match(f1, /id="simulation-season"/);
  assert.match(f1, /id="simulation-points"/);
  assert.match(f1, /id="simulation-explanation"/);
  assert.match(f1, /id="simulation-changes-only"/);
  assert.doesNotMatch(f1, /simulator-hero|run-simulation/);
  assert.match(f1, /\/css\/simulator-season\.css/);
});

test('all championship templates share structured rule and result controls', () => {
  for (const page of [f1, f3, renderAcademyHtml('f3-simulate-season.html', f3)]) {
    assert.match(page, /class="simulator-page-heading"/);
    assert.match(page, /class="simulator-workspace"/);
    assert.match(page, /id="manage-points-systems"/);
    assert.match(page, /id="simulation-changes-only"/);
    assert.doesNotMatch(page, /class="back-link"/);
    assert.doesNotMatch(page, /id="run-simulation"/);
  }
});

test('simulation state is shareable and comparison rows retain both point totals', () => {
  assert.match(script, /url\.searchParams\.set\('year', year\)/);
  assert.match(script, /url\.searchParams\.set\('points', points\)/);
  assert.match(script, /url\.searchParams\.set\('mode', 'constructors'\)/);
  assert.match(script, /url\.searchParams\.set\('changed', '1'\)/);
  assert.match(script, /requestedPreview\.get\('mode'\)/);
  assert.match(script, /requestedPreview\.get\('changed'\)/);
  assert.match(script, /data-label="Simulated"/);
  assert.match(script, /data-label="Official"/);
  assert.match(script, /simulation-points-change/);
  assert.match(script, /isF2Simulator \? 'f2\/driver'/);
});

test('mobile result cards keep official comparison data visible', () => {
  assert.match(css, /@media \(max-width: 650px\)/);
  assert.match(css, /\.simulation-table td:nth-child\(4\) \{ display: flex; \}/);
  assert.match(css, /\.simulation-table, \.simulation-table tbody \{ display: block; width: 100%; min-width: 0; \}/);
  assert.match(css, /content: attr\(data-label\)/);
});

test('standings header remains in table flow and cannot cover the leader', () => {
  assert.match(css, /\.simulation-table thead th \{ background:/);
  assert.doesNotMatch(css, /\.simulation-table thead th \{[^}]*position: sticky/);
});
