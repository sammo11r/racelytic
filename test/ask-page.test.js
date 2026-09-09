const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderSeriesHome } = require('../backend/series-home-renderer');
const { renderAskHtml } = require('../backend/ask-renderer');
const { renderAcademyHtml } = require('../backend/academy-renderer');
const { metadataFor } = require('../backend/seo');

const frontend = path.join(__dirname, '../frontend');
const ask = fs.readFileSync(path.join(frontend, 'ask.html'), 'utf8');
const script = fs.readFileSync(path.join(frontend, 'js/ask.js'), 'utf8');
const styles = fs.readFileSync(path.join(frontend, 'css/ask.css'), 'utf8');
const header = fs.readFileSync(path.join(frontend, 'components/header.html'), 'utf8');
const privacy = fs.readFileSync(path.join(frontend, 'privacy.html'), 'utf8');
const analysisOverview = fs.readFileSync(path.join(frontend, 'analysis.html'), 'utf8');
const f2AnalysisOverview = fs.readFileSync(path.join(frontend, 'f2-analysis.html'), 'utf8');
const f3AnalysisOverview = fs.readFileSync(path.join(frontend, 'f3-analysis.html'), 'utf8');
const interpreter = fs.readFileSync(path.join(__dirname, '../backend/ask-interpreter.js'), 'utf8');

test('Ask Racelytic opens directly on its working surface', () => {
    assert.match(ask, /<form class="ask-form" id="ask-form">/);
    assert.match(ask, /<input id="ask-query" name="q" type="search" minlength="8"/);
    assert.match(ask, /<button class="button primary" type="submit">Ask<\/button>/);
    assert.doesNotMatch(ask, /<textarea[^>]+id="ask-query"/);
    const form = ask.slice(ask.indexOf('<form class="ask-form"'), ask.indexOf('</form>', ask.indexOf('<form class="ask-form"')));
    assert.match(form, /class="ask-examples"/);
    assert.match(styles, /\.ask-workspace \{[^}]*padding-top: 28px;/);
    assert.match(styles, /\.ask-example-list \{[^}]*flex-wrap: nowrap;[^}]*overflow: hidden;/);
    assert.equal((ask.match(/data-ask-example=/g) || []).length, 7);
    assert.match(ask, /class="ask-layout"/);
    assert.match(ask, /class="ask-query-panel"/);
    assert.match(ask, /id="ask-refinement"/);
    assert.match(ask, /id="ask-answer-status" aria-live="polite" aria-atomic="true"/);
    assert.match(ask, /id="ask-result" aria-label="Supporting records and calculations"/);
    assert.doesNotMatch(ask, /Get started|Coming soon/i);
    assert.doesNotMatch(ask, /<div class="eyebrow">ASK RACELYTIC<\/div>/);
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
    assert.match(script, /function recordSection/);
    assert.match(script, /name="recordCategory"/);
    assert.match(script, /search\.set\('record', interpretation\.recordCategory\)/);
    assert.match(script, /recordCategory: search\.get\('record'\)/);
    assert.match(script, /Searching the recorded.*askSeriesName.*archive/);
    assert.match(script, /record_subject_total/);
    assert.match(script, /name="subjectName"/);
    assert.match(script, /name="constructorName"/);
    assert.match(script, /search\.set\('team', interpretation\.constructorName\)/);
    assert.match(ask, /Which driver has the most pole positions with Ferrari/);
    assert.match(script, /series: askSeries\.key/);
    assert.match(script, /return `\$\{askSeries\.path\}\/ask/);
    assert.match(script, /seriesMismatch\.url/);
    assert.match(script, /context: askContext/);
    assert.match(script, /function recordScopeSummary/);
    assert.match(script, /name="raceFormat"/);
    assert.match(script, /name="resultLimit"/);
    assert.match(script, /data-ask-followup/);
    assert.match(script, /suggestedAction\.url/);
});

test('every championship discovery surface links to its Ask page', () => {
    assert.match(header, /href="\/ask"><span>Ask Racelytic<\/span>/);
    assert.ok(header.indexOf('href="/analysis"') < header.indexOf('href="/ask"'));
    assert.match(renderSeriesHome('f1'), /class="container home-ask-entry"/);
    for (const series of ['f2', 'f3', 'academy']) {
        const home = renderSeriesHome(series);
        assert.match(home, /class="container home-ask-entry"/);
        assert.match(home, new RegExp(`action="/${series}/ask"`));
    }
});

test('junior Ask pages use their own branding, examples and archive scope', () => {
    for (const [series, name] of [['f2', 'Formula 2'], ['f3', 'Formula 3'], ['academy', 'F1 Academy']]) {
        const html = renderAskHtml(`/${series}/ask`);
        assert.match(html, new RegExp(`data-ask-series="${series}"`));
        assert.match(html, new RegExp(`Ask a ${name} history question`));
        assert.equal((html.match(/data-ask-example=/g) || []).length, 7);
        assert.doesNotMatch(html, /1991 points|1982 rules/);
    }
});

test('analysis overviews end with a series-specific Ask search form instead of a card', () => {
    const pages = [
        [analysisOverview, '/ask', 'Formula 1'],
        [f2AnalysisOverview, '/f2/ask', 'Formula 2'],
        [f3AnalysisOverview, '/f3/ask', 'Formula 3'],
        [renderAcademyHtml('f3-analysis.html', f3AnalysisOverview), '/academy/ask', 'F1 Academy']
    ];
    for (const [html, action, series] of pages) {
        assert.doesNotMatch(html, new RegExp(`class="database-category" href="${action}"`));
        assert.match(html, /class="analysis-ask-entry"/);
        assert.match(html, new RegExp(`form action="${action}" method="get"`));
        assert.match(html, new RegExp(`Ask the ${series} archive`));
        assert.ok(html.indexOf('class="analysis-ask-entry"') > html.indexOf('</nav>'));
    }
    assert.doesNotMatch(analysisOverview, /href="\/ratings"/);
});

test('Ask questions are noindex and interpretation stays on Racelytic infrastructure', () => {
    assert.equal(metadataFor('/ask').robots, 'noindex, follow');
    assert.match(privacy, /question text is not saved in the application database/i);
    assert.match(privacy, /not sent to an external AI service/i);
    assert.doesNotMatch(ask, /Questions are interpreted on Racelytic’s server/i);
    assert.doesNotMatch(interpreter, /OpenAI|api\.openai\.com/i);
});

test('Ask uses a responsive two-column workspace with refinements separate from results', () => {
    assert.match(styles, /\.ask-layout \{[^}]*grid-template-columns: minmax\(330px, \.72fr\) minmax\(0, 1\.28fr\)/);
    assert.match(styles, /\.ask-query-panel \{[^}]*position: sticky/);
    assert.match(styles, /@media \(max-width: 980px\) \{\s*\.ask-layout \{ display: flex; flex-direction: column;/);
    assert.match(styles, /\.ask-answer-status \{ order: 2;/);
    assert.match(styles, /\.ask-refinement \{ order: 3;/);
    assert.match(script, /const askRefinement = document\.getElementById\('ask-refinement'\)/);
    assert.match(script, /askRefinement\.innerHTML =/);
    assert.match(script, /class="ask-refinement-details"/);
    assert.match(script, /data-ask-expand/);
    assert.match(script, /<caption class="visually-hidden">/);
    assert.match(styles, /\.ask-interpretation-after \{ margin-top: 14px; \}/);
    assert.match(styles, /\.ask-answer-card \{ padding: clamp\(20px, 3vw, 30px\)/);
    assert.match(styles, /\.ask-answer-card h2 \{[^}]*margin: 14px 0 8px;[^}]*font-size: clamp\(26px, 3\.4vw, 40px\)/);
});

test('record tables use descriptive titles instead of category-label fragments', () => {
    assert.match(script, /`\$\{label\}s with the most \$\{esc\(record\.label\.toLowerCase\(\)\)\}\$\{teamScope\}`/);
    assert.doesNotMatch(script, /`\$\{esc\(record\.label\)\} leaders\$\{teamScope\}`/);
    assert.match(script, /data\.constructorFilter/);
    assert.doesNotMatch(script, /data\.constructor\?/);
});

test('Ask examples and empty state include constructors', () => {
    assert.match(ask, /Which constructor would have the most championships/);
    assert.match(ask, /Drivers’ or Constructors’ Championships/);
});

test('Ask examples expose each extended MVP question type', () => {
    assert.match(ask, /Who has the most Formula 1 race wins/);
    assert.match(ask, /Who wins the 2008 championship under 1991 rules/);
    assert.match(ask, /How many titles would Alonso have under 1982 rules/);
    assert.match(ask, /Which championships change under 1991 rules/);
    assert.match(ask, /Compare the 1982 and 1991 points systems/);
});
