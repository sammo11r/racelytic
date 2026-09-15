const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { all, fromPath } = require('../frontend/js/series-config');
const { FORMULA_E_PAGES, renderFormulaEHtml, renderFormulaEScript } = require('../backend/formula-e-renderer');
const { renderCircuitAnalysisHtml } = require('../backend/circuit-analysis-renderer');
const { renderSeasonAnalysisHtml } = require('../backend/season-analysis-renderer');
const { renderSeasonComparisonHtml } = require('../backend/season-comparison-renderer');
const { renderRecordsHtml } = require('../backend/records-renderer');
const { matchResourcePath, resourcePath } = require('../backend/resource-routes');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Formula E has a distinct public identity and canonical route namespace', () => {
    assert.equal(all.fe.path, '/formula-e');
    assert.equal(fromPath('/formula-e/drivers').key, 'fe');
    assert.equal(resourcePath('fe', 'race', 'london-2025', 'London E-Prix'), '/formula-e/races/london-2025/london-e-prix');
    assert.deepEqual(matchResourcePath('/formula-e/teams/jaguar-tcs-racing'), {
        series: 'fe', resource: 'team', id: 'jaguar-tcs-racing', slug: ''
    });
});

test('Formula E favicon uses the shared slash mark in the series accent', () => {
    const favicon = read('frontend/assets/favicon-fe.svg');
    assert.match(favicon, /<rect width="64" height="64" rx="14" fill="#ffffff"\/>/);
    assert.match(favicon, /<path d="M35 10h14L29 54H15z" fill="#00a9ce"\/>/);
});

test('every imported Formula E circuit has a sourced SVG outline', () => {
    const rows = read('data/fedb-circuits.csv').trim().split(/\r?\n/).slice(1);
    assert.ok(rows.length > 0);
    for (const row of rows) {
        const [id, name] = row.split(',');
        const svg = read(`frontend/assets/circuits/fe-${id}.svg`);
        assert.match(svg, /^<svg[^>]+viewBox="0 0 500 500"/);
        assert.match(svg, new RegExp(`<title[^>]*>${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} Formula E circuit outline<\\/title>`));
        assert.match(svg, /<!-- Simplified from https?:\/\//);
        assert.match(svg, /<path d="M[^\"]+ Q[^\"]+ Z" fill="none"/);
    }
});

test('Formula E circuit builder bootstraps its isolated image dependencies', () => {
    const packageJson = JSON.parse(read('package.json'));
    const launcher = read('scripts/run-formula-e-circuit-builder.js');
    const requirements = read('requirements-formula-e-circuits.txt');
    assert.equal(packageJson.scripts['build:formula-e-circuits'], 'node scripts/run-formula-e-circuit-builder.js');
    assert.match(launcher, /-m', 'venv'/);
    assert.match(launcher, /'pip', 'install'/);
    assert.match(requirements, /opencv-python-headless/);
    assert.match(requirements, /numpy/);
    assert.match(requirements, /Pillow/);
});

test('Formula E circuit endpoints select Formula E SVG asset ids', () => {
    const routes = read('backend/routes/circuits.js');
    const seo = read('backend/seo-data.js');
    assert.match(routes, /juniorCircuitArchiveRow\(row, byLayout, series\)/);
    assert.match(routes, /layoutId: juniorCircuitImageId\(circuits\[0\]\.id, series\)/);
    assert.match(seo, /rows\[0\]\.layoutId = juniorCircuitImageId\(id, series\)/);
});

test('Formula E exposes archive, analysis, simulator and games surfaces', () => {
    for (const page of ['database', 'seasons', 'season', 'races', 'race', 'drivers', 'driver', 'teams', 'team', 'circuits', 'circuit', 'chassis', 'analysis']) {
        assert.ok(FORMULA_E_PAGES[page], `missing ${page}`);
    }
    for (const page of ['simulator', 'simulate-season', 'scenario-calculator', 'championship-builder', 'points-systems']) {
        assert.ok(FORMULA_E_PAGES[page], `missing ${page}`);
    }
    for (const page of ['games', 'idle-racing-manager', 'lights-out', 'quizzes', 'champions-quiz', 'race-winners-quiz', 'constructor-champions-quiz', 'season-race-winners-quiz']) {
        assert.ok(FORMULA_E_PAGES[page], `missing ${page}`);
    }
    assert.equal(FORMULA_E_PAGES.ask, undefined);
});

test('Formula E games retain their namespace, identity and archive-backed quiz contracts', () => {
    for (const file of ['f2-games.html', 'f2-quizzes.html', 'f2-champions-quiz.html', 'f2-race-winners-quiz.html', 'f2-constructor-champions-quiz.html', 'f2-season-race-winners-quiz.html']) {
        const html = renderFormulaEHtml(file, read(`frontend/${file}`));
        assert.match(html, /Formula E|FORMULA E/);
        assert.match(html, /class="fe-mode"/);
        assert.doesNotMatch(html, /Formula 2|\bF2\b|class="f2-mode"|href="\/f2/);
    }
    const games = renderFormulaEHtml('f2-games.html', read('frontend/f2-games.html'));
    assert.match(games, /href="\/formula-e\/idle-racing-manager"/);
    assert.match(games, /href="\/formula-e\/quizzes"/);
    assert.match(games, /href="\/formula-e\/lights-out"/);

    for (const file of ['idle-racing-manager.html', 'lights-out.html']) {
        const html = renderFormulaEHtml(file, read(`frontend/${file}`));
        assert.match(html, /class="fe-mode"/);
        assert.match(html, /href="\/formula-e\/games"/);
        assert.doesNotMatch(html, /\/css\/formula-e\//);
    }

    const scripts = [
        read('frontend/js/world-champions-quiz.js'), read('frontend/js/race-winners-quiz.js'),
        read('frontend/js/constructor-champions-quiz.js'), read('frontend/js/season-race-winners-quiz.js'),
        read('frontend/js/junior-quizzes.js')
    ];
    for (const script of scripts) assert.match(script, /(?:fe-mode|\/formula-e\/).*?'fe'|'fe'.*?(?:fe-mode|\/formula-e\/)/s);
    assert.match(read('backend/routes/games.js'), /series === 'f1' \|\| series === 'f2' \|\| series === 'fe'/);
});

test('Formula E simulator includes every official scoring era', () => {
    const { systems } = require('../frontend/js/formula-e-points-systems');
    assert.deepEqual(Object.keys(systems), ['fe-current', 'fe-2014-15', 'fe-2015-16', 'fe-2016-17', 'fe-2017-18']);
    assert.equal(systems['fe-2014-15'].countBest, 10);
    assert.equal(systems['fe-2015-16'].fastestLapBonus, 2);
    assert.equal(systems['fe-2015-16'].fastestLapMaxPosition, null);
    assert.equal(systems['fe-2016-17'].fastestLapBonus, 1);
    assert.equal(systems['fe-2016-17'].fastestLapMaxPosition, null);
    assert.equal(systems['fe-2017-18'].fastestLapBonus, 1);
    assert.equal(systems['fe-2017-18'].fastestLapMaxPosition, 10);
});

test('Formula E renderer removes Formula 3 identity and points scripts at Formula E data', () => {
    const html = renderFormulaEHtml('f3-races.html', read('frontend/f3-races.html'));
    assert.match(html, /Formula E/);
    assert.match(html, /formula-e-js/);
    assert.doesNotMatch(html, /Formula 3|series=f3|class="f3-mode"/);

    const database = renderFormulaEHtml('f3-database.html', read('frontend/f3-database.html'));
    const analysisDirectory = renderFormulaEHtml('f3-analysis.html', read('frontend/f3-analysis.html'));
    const chassis = renderFormulaEHtml('f3-chassis.html', read('frontend/f3-chassis.html'));
    assert.match(database, /href="\/formula-e\/chassis"/);
    assert.doesNotMatch(analysisDirectory, /analysis-ask-entry|\/formula-e\/ask/);
    assert.match(chassis, /\/formula-e-js\/f3-chassis\.js/);

    const script = renderFormulaEScript("fetch('/api/races?series=f3'); const config = { series: 'f3' }; location.href = '/f3/races';");
    assert.match(script, /series=fe/);
    assert.match(script, /series: 'fe'/);
    assert.match(script, /\/formula-e\/races/);

    const simulator = renderFormulaEHtml('f3-simulate-season.html', read('frontend/f3-simulate-season.html'));
    assert.match(simulator, /\/js\/formula-e-points-systems\.js/);
    assert.match(simulator, /\/js\/simulator\.js/);
});

test('Formula E shared pages retain the public namespace and E-Prix semantics', () => {
    const analysis = renderSeasonAnalysisHtml(read('frontend/season-analysis.html'), '/formula-e/season-analysis');
    const comparison = renderSeasonComparisonHtml(read('frontend/season-comparison.html'), '/formula-e/season-comparison');
    const circuits = renderCircuitAnalysisHtml('', '/formula-e/circuit-analysis');
    const records = renderRecordsHtml('/formula-e/records');
    for (const html of [analysis, comparison, circuits, records]) {
        assert.match(html, /Formula E|FORMULA E/);
        assert.doesNotMatch(html, /min="undefined"|value="undefined/);
    }
    assert.match(analysis, /E-Prix races/);
    assert.match(comparison, /E-Prix races/);
    assert.match(circuits, /min="2015"/);
    assert.match(records, />E-Prix races<\/option>/);
    assert.doesNotMatch(records, />Sprint races<\/option>/);
});

test('Formula E analysis examples use the Formula E accent', () => {
    const styles = read('frontend/css/analysis-overview.css');
    const circuitStyles = read('frontend/css/f1-circuit-analysis.css');
    const simulatorStyles = read('frontend/css/simulator-overview.css');
    assert.match(styles, /\.fe-mode \.analysis-example-card \{ --analysis-example-accent: #00a9ce; \}/);
    assert.match(circuitStyles, /\.fe-mode \.ca-picker-option:is\(:hover, \[aria-selected="true"\]\).*var\(--accent\)/);
    assert.match(simulatorStyles, /\.fe-mode \.simulator-example-card \{ --simulator-example-accent: #00a9ce; \}/);
});

test('shared frontend helpers and analysis scripts recognize Formula E', () => {
    const utils = read('frontend/js/utils.js');
    const raceAnalysis = read('frontend/js/race-analysis.js');
    const seasonModel = read('frontend/js/season-analysis-model.js');
    const seasons = read('frontend/js/seasons.js');
    const seasonDetail = read('frontend/js/f3-season.js');
    const chassis = read('frontend/js/f3-chassis.js');
    const seasonRoutes = read('backend/routes/seasons.js');
    const dataSources = read('frontend/data-sources.html');
    assert.match(utils, /series === 'fe' \? '\/formula-e'/);
    assert.match(utils, /return '#00a9ce'/);
    assert.match(raceAnalysis, /const series = activeSeriesKey\(\)/);
    assert.match(raceAnalysis, /'academy', 'fe'/);
    assert.match(seasonModel, /series === 'fe'\) return 'F'/);
    assert.match(seasons, /seasonSeries === 'fe' \? '\/formula-e'/);
    assert.match(seasons, /fe: 'Formula E champion'/);
    assert.match(seasons, /season\.label \|\| season\.year/);
    assert.match(seasonDetail, /const seasonLabel = data\.label \|\| data\.year/);
    assert.match(seasonDetail, /renderFormulaEManufacturerTable\(data\.manufacturerChampionship \|\| \[\]\)/);
    assert.match(chassis, /technicalSeries === 'fe'/);
    assert.match(chassis, /api\/chassis\?series=\$\{encodeURIComponent\(technicalSeries\)\}/);
    assert.match(seasonRoutes, /series === 'fe' \? ', label' : ''/);
    assert.match(seasonRoutes, /fe_season_manufacturer_standings/);
    assert.match(dataSources, /id="formula-e"/);
    assert.match(dataSources, /official FIA Formula E results archive/);
});

test('Racelytic Ratings supports Formula E routes, seasons and full race weights', () => {
    const ratings = read('frontend/js/ratings.js');
    const overview = read('frontend/js/ratings-overview.js');
    const ratingNavigation = read('frontend/js/ratings-navigation.js');
    const methodology = read('frontend/js/ratings-methodology.js');
    const ratingData = read('backend/rating-data.js');
    const ratingRoutes = read('backend/routes/ratings.js');
    const rebuild = read('scripts/rebuild-ratings.js');
    assert.match(ratings, /fe: 'Formula E'/);
    assert.match(ratings, /ratingState\.series === 'fe' \? '\/formula-e'/);
    assert.match(ratings, /ratingState\.series === 'fe' && type === 'race'\) return 'E-Prix'/);
    assert.match(ratings, /`\$\{value - 1\}–\$\{String\(value\)\.slice\(-2\)\}`/);
    assert.match(overview, /fe: 'Formula E'/);
    assert.match(overview, /querySelectorAll\('a\[href\^="\/ratings"\]'\)[\s\S]*?link\.href = destination/);
    for (const source of [ratingNavigation, methodology, ratingRoutes, rebuild]) assert.match(source, /'fe'/);
    assert.match(ratingData, /if \(series === 'fe'\) return 'R'/);
    assert.match(ratingData, /type === 'R' \? 'race'/);
});

test('Formula E leaderboard removes setup cards and uses its cyan accent throughout', () => {
    const styles = read('frontend/css/ratings.css');
    assert.match(styles, /body\.fe-mode\[data-ratings-view="leaderboard"\] \.ratings-heading,[\s\S]*?body\.fe-mode\[data-ratings-view="leaderboard"\] \.ratings-controls \{ display: none; \}/);
    assert.match(styles, /\.ratings-timeline-heading span \{ color: var\(--accent\); \}/);
    assert.match(styles, /\.ratings-compare-insights span \{ color: var\(--accent\);/);
    assert.match(styles, /\.ratings-hero-note > span \{ color: var\(--accent\); \}/);
    assert.doesNotMatch(styles, /#b41d2a/);
});

test('Formula E season race cards keep the winner in the compact details row', () => {
    const styles = read('frontend/css/season-detail-overview.css');
    assert.match(styles, /\.fe-mode \.junior-season-detail-page \.f2-calendar-race \{[\s\S]*?grid-template-columns: 28px 70px minmax\(0, 1fr\) auto;[\s\S]*?min-height: 56px;/);
    assert.match(styles, /\.fe-mode \.junior-season-detail-page \.f2-calendar-sessions \{[\s\S]*?grid-column: auto;[\s\S]*?flex-wrap: nowrap;/);
});
