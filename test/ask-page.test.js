const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderSeriesHome } = require('../backend/series-home-renderer');
const { metadataFor } = require('../backend/seo');

const frontend = path.join(__dirname, '../frontend');
const ask = fs.readFileSync(path.join(frontend, 'ask.html'), 'utf8');
const script = fs.readFileSync(path.join(frontend, 'js/ask.js'), 'utf8');
const header = fs.readFileSync(path.join(frontend, 'components/header.html'), 'utf8');
const privacy = fs.readFileSync(path.join(frontend, 'privacy.html'), 'utf8');
const analysisOverview = fs.readFileSync(path.join(frontend, 'analysis.html'), 'utf8');
const interpreter = fs.readFileSync(path.join(__dirname, '../backend/ask-interpreter.js'), 'utf8');

test('Ask Racelytic opens directly on its working surface', () => {
    assert.match(ask, /<form class="ask-form" id="ask-form">/);
    assert.match(ask, /Who has the most world championships/);
    assert.match(ask, /id="ask-result" aria-live="polite"/);
    assert.doesNotMatch(ask, /Get started|Coming soon/i);
});

test('Ask Racelytic renders calculated evidence safely and exposes editable interpretation controls', () => {
    assert.match(script, /fetch\('\/api\/ask'/);
    assert.match(script, /data\.ranking\.slice\(0, 10\)/);
    assert.match(script, /data\.changedChampionships/);
    assert.match(script, /data\.pointsSystem\.rules/);
    assert.match(script, /esc\(data\.answer\)/);
    assert.match(script, /class="ask-interpretation-form"/);
    assert.match(script, /name="entity"/);
    assert.match(script, /name="pointsSystemYear"/);
    assert.match(script, /data\.entity === 'constructors'/);
    assert.match(script, /search\.set\('entity'/);
    assert.match(script, /interpretationFromUrl\(\)/);
    assert.match(script, /name="targetSeason"/);
    assert.match(script, /data\.intent === 'list_changed_championships'/);
    assert.match(script, /data\.focus/);
    assert.match(script, /Auto-detect/);
    assert.match(script, /comparisonPointsSystemYearA/);
    assert.match(script, /How the result was decided/);
    assert.match(script, /Two systems, side by side/);
    assert.match(script, /data-ask-name/);
});

test('F1 discovery surfaces link to Ask Racelytic without changing junior homes', () => {
    assert.match(header, /href="\/ask"><span>Ask Racelytic<\/span>/);
    assert.ok(header.indexOf('href="/analysis"') < header.indexOf('href="/ask"'));
    assert.match(renderSeriesHome('f1'), /class="container home-ask-entry"/);
    assert.doesNotMatch(renderSeriesHome('f2'), /class="container home-ask-entry"/);
});

test('analysis overview presents Ask Racelytic as a standard analysis card without a Ratings card', () => {
    assert.match(analysisOverview, /class="database-category" href="\/ask"/);
    assert.doesNotMatch(analysisOverview, /analysis-ask-card|href="\/ratings"/);
});

test('Ask questions are noindex and interpretation stays on Racelytic infrastructure', () => {
    assert.equal(metadataFor('/ask').robots, 'noindex, follow');
    assert.match(privacy, /question text is not saved in the application database/i);
    assert.match(privacy, /not sent to an external AI service/i);
    assert.match(ask, /not sent to an external AI service/i);
    assert.doesNotMatch(interpreter, /OpenAI|api\.openai\.com/i);
});

test('Ask examples and empty state include constructors', () => {
    assert.match(ask, /Which constructor would have the most championships/);
    assert.match(ask, /Drivers’ or Constructors’ Championships/);
});

test('Ask examples expose each extended MVP question type', () => {
    assert.match(ask, /Who wins the 2008 championship under 1991 rules/);
    assert.match(ask, /How many titles would Alonso have under 1982 rules/);
    assert.match(ask, /Which championships change under 1991 rules/);
    assert.match(ask, /Compare the 1982 and 1991 points systems/);
});
