const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderAcademyHtml } = require('../backend/academy-renderer');

const frontend = path.join(__dirname, '../frontend');
const f1 = fs.readFileSync(path.join(frontend, 'championship-builder.html'), 'utf8');
const f3 = fs.readFileSync(path.join(frontend, 'f3-championship-builder.html'), 'utf8');
const script = fs.readFileSync(path.join(frontend, 'js/championship-builder.js'), 'utf8');
const css = fs.readFileSync(path.join(frontend, 'css/championship-builder.css'), 'utf8');

test('championship builders use a compact three-stage live workspace', () => {
  for (const page of [f1, f3, renderAcademyHtml('f3-championship-builder.html', f3)]) {
    assert.doesNotMatch(page, /class="back-link"/);
    assert.doesNotMatch(page, /class="simulator-hero/);
    assert.match(page, /class="builder-page-heading"/);
    assert.match(page, /class="builder-summary"/);
    assert.match(page, /1 · CALENDAR/);
    assert.match(page, /2 · CHAMPIONSHIP SETUP/);
    assert.match(page, /3 · LIVE CLASSIFICATION/);
    assert.match(page, /\/css\/championship-builder\.css/);
  }
});

test('calendar tools support fast building, accessible reordering and clear duplicate state', () => {
  assert.match(f1, /id="builder-add-season"/);
  assert.match(script, /async function addBuilderSeason/);
  assert.match(script, /draggable="true"/);
  assert.match(script, /Drag calendar rows to reorder them/);
  assert.match(script, /That race is already in this calendar/);
  assert.match(script, /button\.textContent=added\?'Added':'Add race'/);
  assert.match(script, /aria-label="Move \$\{esc\(eventName\)\} up"/);
});

test('field and scoring changes keep the live classification synchronized', () => {
  assert.match(f1, /id="builder-driver-search"/);
  assert.match(f1, /data-field-action="select"/);
  assert.match(f1, /data-field-action="clear"/);
  assert.match(f1, /id="builder-rule-summary"/);
  assert.match(script, /function updateBuilder\(\)\{calculateBuilder\(\);updateBuilderSummary\(\);saveBuilderDraft\(\);\}/);
  assert.match(script, /builder-points'\)\.addEventListener\('change',updateBuilder\)/);
  assert.match(script, /input\.checked\?selected\.add\(id\):selected\.delete\(id\);updateBuilder\(\)/);
});

test('unfinished builder state survives refreshes and can be reset', () => {
  assert.match(script, /sessionStorage\.setItem\(builderDraftKey/);
  assert.match(script, /sessionStorage\.getItem\(builderDraftKey/);
  assert.match(script, /Recovered your unfinished championship/);
  assert.match(script, /sessionStorage\.removeItem\(builderDraftKey\)/);
  assert.match(f1, /id="builder-reset"/);
});

test('builder layout keeps results in the calendar column and lets setup extend the page', () => {
  assert.match(f1, /class="builder-main"[\s\S]*class="builder-panel builder-results"/);
  assert.match(css, /\.builder-main \{ display: grid/);
  assert.match(css, /\.championship-builder-page \.builder-settings \{ position: static; max-height: none; overflow: visible; \}/);
  assert.doesNotMatch(css, /\.builder-settings \{[^}]*overflow-y: auto/);
  assert.match(css, /@media \(max-width: 1050px\)/);
  assert.match(css, /\.championship-builder-page \.builder-layout \{ grid-template-columns: 1fr; \}/);
});
