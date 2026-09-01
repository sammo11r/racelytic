const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.join(__dirname, '../frontend');
const html = fs.readFileSync(path.join(frontend, 'season.html'), 'utf8');
const script = fs.readFileSync(path.join(frontend, 'js/season.js'), 'utf8');
const route = fs.readFileSync(path.join(__dirname, '../backend/routes/seasons.js'), 'utf8');

test('F1 season opens with its back link followed immediately by one summary card', () => {
    const main = html.match(/<main[\s\S]*?<\/main>/)[0];
    const back = main.indexOf('class="back-link"');
    const summary = main.indexOf('class="season-overview"');
    assert.ok(back >= 0 && summary > back);
    const contentBetween = main.slice(main.indexOf('</a>', back) + 4, main.lastIndexOf('<section', summary));
    assert.doesNotMatch(contentBetween, /<section|<header|<h1/);
    assert.doesNotMatch(main.slice(0, summary), /detail-hero/);
    assert.match(html, /\/css\/season-detail-overview.css/);
});

test('summary contains the season identity and every requested championship fact', () => {
    const summary = html.match(/<section class="season-overview"[\s\S]*?<\/section>/)[0];
    for (const id of ['season-year', 'season-first', 'season-first-label', 'season-first-points', 'season-second', 'season-second-label', 'season-second-points', 'season-third', 'season-third-label', 'season-third-points', 'season-constructor', 'season-constructor-label', 'season-races', 'season-laps']) {
        assert.match(summary, new RegExp(`id="${id}"`), id);
    }
    for (const label of ['World champion', 'Runner-up', 'Third place', 'Constructors’ champion', 'Races', 'Laps']) {
        assert.ok(summary.includes(label), label);
    }
});

test('summary rendering and API include the constructors champion', () => {
    assert.match(script, /summary\.constructorLeader\?\.name \|\| '—'/);
    assert.match(route, /constructorLeader: constructorChampionship\.find\(constructor => constructor\.championshipWon\)/);
    assert.match(route, /constructorChampionship\.find\(constructor => constructor\.position === 1\)/);
    assert.match(route, /driverStandings\.some\(driver =>[\s\S]*?championshipWon/);
    assert.match(route, /completed: seasonCompleted/);
    assert.match(script, /completed \? 'World champion' : 'Championship leader'/);
    assert.match(script, /completed \? 'Runner-up' : 'Second place'/);
    assert.match(script, /completed \? 'Constructors’ champion' : 'Leading constructor'/);
});

test('season summary adapts from six columns to tablet and mobile grids', () => {
    const css = fs.readFileSync(path.join(frontend, 'css/season-detail-overview.css'), 'utf8');
    assert.match(css, /grid-template-columns: 2fr 1\.25fr 1\.25fr 1\.5fr \.85fr \.85fr/);
    assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(css, /@media \(max-width: 700px\)[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /@media \(max-width: 380px\)[\s\S]*?minmax\(0, 1fr\)/);
});

test('driver standings names use the standard text colour', () => {
    const css = fs.readFileSync(path.join(frontend, 'css/season-detail-overview.css'), 'utf8');
    assert.match(css, /\.season-detail-page #driver-table \.driver-name \{ color: var\(--text\); \}/);
});

test('driver standings distinguish black disqualification cells from retirements', () => {
    const legend = html.match(/<div class="standings-legend" aria-label="Standings legend">[\s\S]*?<\/div>\s*<div class="championship-table-wrap">/)[0];
    assert.match(legend, /legend-swatch result-disqualified"><\/span>Disqualified/);
    const disqualified = script.indexOf("return 'result-disqualified'");
    const retired = script.indexOf("return 'result-retired'");
    assert.ok(disqualified > -1 && disqualified < retired);
    assert.match(script, /DSQ\|DQ\|DISQ\|DISQUALIFIED\|EXC/);
    const css = fs.readFileSync(path.join(frontend, 'css/polish.css'), 'utf8');
    assert.match(css, /\.championship-table \.result-disqualified, \.legend-swatch\.result-disqualified \{ background: #17191f; color: #fff; \}/);
    assert.match(css, /#driver-table \.race-point\.result-disqualified,[\s\S]*?#driver-table \.race-point\.result-disqualified \.result-value,[\s\S]*?#driver-table \.race-point\.result-disqualified \.sprint-points \{ color: #fff; \}/);
});

test('race calendar uses compact three, two and one-column card grids', () => {
    const css = fs.readFileSync(path.join(frontend, 'css/season-detail-overview.css'), 'utf8');
    assert.match(css, /calendar-list[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(css, /calendar-list[\s\S]*?border: 0;[\s\S]*?background: transparent/);
    assert.match(css, /calendar-race[\s\S]*?min-height: 58px[\s\S]*?padding: 8px 10px/);
    assert.match(css, /calendar-name strong,[\s\S]*?text-overflow: ellipsis/);
    assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?calendar-list[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /@media \(max-width: 700px\)[\s\S]*?calendar-list[^}]*minmax\(0, 1fr\)/);
});

test('constructor standings explain and render all four result colours', () => {
    const summary = html.match(/<!-- =================================================\s+CONSTRUCTOR CHAMPIONSHIP[\s\S]*?<!-- =================================================\s+RACE CALENDAR/)[0];
    assert.match(summary, /aria-label="Constructor standings legend"/);
    for (const [className, label] of [['result-win', 'Winner'], ['result-podium', 'Podium'], ['result-points', 'Points finish'], ['result-finish', 'Classified']]) {
        assert.ok(summary.includes(`legend-swatch ${className}`));
        assert.ok(summary.includes(label));
    }
    assert.match(script, /function constructorResultClass\(result\)/);
    assert.match(script, /bestPosition === 1[\s\S]*?bestPosition > 1 && bestPosition <= 3[\s\S]*?result-points[\s\S]*?result-finish/);
    assert.match(script, /constructor-points \$\{constructorResultClass\(result\)\}/);
});

test('constructor race aggregation supplies best finish and classified count', () => {
    assert.match(route, /MIN\(CASE[\s\S]*?rr\.positionNumber > 0[\s\S]*?AS bestPosition/);
    assert.match(route, /SUM\(CASE[\s\S]*?rr\.positionNumber > 0[\s\S]*?AS classified/);
    assert.match(route, /bestPosition: row\.bestPosition === null \? null : Number\(row\.bestPosition\)/);
    assert.match(route, /classified: Number\(row\.classified \|\| 0\)/);
});

test('season map supports bounded pan, pinch zoom and accessible controls without wheel capture', () => {
    assert.match(script, /aria-label="Map zoom controls"/);
    assert.match(script, /data-map-action="zoom-in"/);
    assert.match(script, /data-map-action="zoom-out"/);
    assert.match(script, /data-map-action="reset"/);
    assert.match(script, /Drag to pan · Pinch to zoom/);
    assert.match(script, /window\.d3\.zoom\(\)[\s\S]*?scaleExtent\(\[1, 8\]\)/);
    assert.match(script, /event\.type !== 'wheel'/);
    assert.match(script, /translateExtent\(\[\[0, 0\], \[width, height\]\]\)/);
    assert.match(script, /zoom\.scaleBy, 1\.5/);
    assert.match(script, /zoom\.transform, window\.d3\.zoomIdentity/);
});

test('map zoom separates dense markers while preserving their screen size and hit area', () => {
    assert.match(script, /const inverseScale = 1 \/ currentTransform\.k/);
    assert.match(script, /`\$\{markerPosition\(race\)\} scale\(\$\{inverseScale\}\)`/);
    assert.match(script, /positionMarkers\(\);[\s\S]*?tooltip\.classList\.remove/);
    assert.match(script, /calendar-stop-hit'\)\.attr\('r', 14\)/);
    assert.match(script, /calendar-stop-marker'\)\.attr\('r', 8\)/);
    assert.match(script, /\.on\('click keydown',[\s\S]*?activate\(event, race\);[\s\S]*?scrollIntoView/);
});
