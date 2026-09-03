const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderAcademyHtml } = require('../backend/academy-renderer');

const frontend = path.join(__dirname, '../frontend');
const f1 = fs.readFileSync(path.join(frontend, 'scenario-calculator.html'), 'utf8');
const f3 = fs.readFileSync(path.join(frontend, 'f3-scenario-calculator.html'), 'utf8');
const script = fs.readFileSync(path.join(frontend, 'js/scenario-calculator.js'), 'utf8');
const css = fs.readFileSync(path.join(frontend, 'css/scenario-calculator.css'), 'utf8');

test('scenario templates use the compact live workspace without a back button', () => {
  for (const page of [f1, f3, renderAcademyHtml('f3-scenario-calculator.html', f3)]) {
    assert.doesNotMatch(page, /class="back-link"/);
    assert.match(page, /class="scenario-page-heading"/);
    assert.match(page, /id="scenario-summary"/);
    assert.match(page, /class="scenario-workspace"/);
    assert.match(page, /id="reset-scenario"/);
    assert.match(page, /\/css\/scenario-calculator\.css/);
  }
});

test('scenario predictions distinguish missing entries from DNFs and can be reset per race', () => {
  assert.match(script, />Unassigned<\/option><option value="dnf"/);
  assert.match(script, /value === 0 \? 'Predicted DNF'/);
  assert.match(script, /data-scenario-action="clear"/);
  assert.match(script, /data-scenario-action="dnf"/);
  assert.match(script, /data-scenario-action="official"/);
  assert.match(script, /Unassigned entries score zero for now/);
});

test('scenario state is refresh-safe, shareable and exposes editable bonuses', () => {
  assert.match(script, /sessionStorage\.setItem\(scenarioStorageKey\(\)/);
  assert.match(script, /sessionStorage\.getItem\(scenarioStorageKey\(\)/);
  assert.match(script, /history\.replaceState/);
  assert.match(script, /data-scenario-bonus="pole"/);
  assert.match(script, /data-scenario-bonus="fastest"/);
  assert.match(script, /data-scenario-bonus="sprint-fastest"/);
  assert.match(script, /current\.points \+ maximum/);
});

test('scenario layout keeps the outlook beside the editor and stacks responsively', () => {
  assert.match(css, /grid-template-columns: minmax\(0, 1\.5fr\) minmax\(340px, \.72fr\)/);
  assert.match(css, /\.scenario-page \.scenario-outlook \{ position: sticky/);
  assert.match(css, /@media \(max-width: 1050px\)/);
  assert.match(css, /\.scenario-workspace \{ grid-template-columns: 1fr; \}/);
});
