const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderAcademyHtml, renderAcademyScript } = require('../backend/academy-renderer');

const frontend = path.join(__dirname, '../frontend');
const route = fs.readFileSync(path.join(__dirname, '../backend/routes/seasons.js'), 'utf8');
const mapScript = fs.readFileSync(path.join(frontend, 'js/junior-season-map.js'), 'utf8');

for (const series of ['f2', 'f3']) {
  test(`${series.toUpperCase()} season detail uses the approved summary, standings, map and calendar layout`, () => {
    const html = fs.readFileSync(path.join(frontend, `${series}-season.html`), 'utf8');
    assert.match(html, /class="container page season-detail-page junior-season-detail-page"/);
    assert.doesNotMatch(html, /class="detail-hero"/);
    assert.match(html, /CHAMPIONSHIP SUMMARY/);
    for (const suffix of ['first-label', 'second-label', 'third-label', 'constructor-label', 'constructor', 'races', 'laps']) {
      assert.match(html, new RegExp(`id="${series}-season-${suffix}"`), suffix);
    }
    assert.match(html, /aria-label="Team standings legend"/);
    assert.match(html, /Winner[\s\S]*?Podium[\s\S]*?Points finish[\s\S]*?Classified/);
    assert.match(html, new RegExp(`id="${series}-season-map"`));
    assert.match(html, /\/js\/junior-season-map\.js/);
  });
}

test('Academy inherits the junior detail layout without Formula 3 identity leaks', () => {
  const sourceHtml = fs.readFileSync(path.join(frontend, 'f3-season.html'), 'utf8');
  const sourceScript = fs.readFileSync(path.join(frontend, 'js/f3-season.js'), 'utf8');
  const html = renderAcademyHtml('f3-season.html', sourceHtml);
  const script = renderAcademyScript(sourceScript);
  assert.match(html, /2024|F1 Academy season/);
  assert.match(html, /F1 ACADEMY|F1 Academy/);
  assert.doesNotMatch(html, /Formula 3|\bF3\b/);
  assert.match(script, /seriesName = academy \? 'F1 Academy' : 'F1 Academy'/);
  assert.match(script, /series=academy/);
});

test('junior season API supplies summary totals, team leader and mapped circuit coordinates', () => {
  assert.match(route, /completed: seasonCompleted[\s\S]*?races: completedSessions\.length[\s\S]*?laps: completedSessions\.reduce/);
  assert.match(route, /constructorLeader: constructorChampionship\.find\(constructor => constructor\.champion\)/);
  assert.match(route, /SELECT name, fullName, placeName, latitude, longitude[\s\S]*?FROM circuits/);
  assert.match(route, /const coordinates = coordinatesForRace\(race\)/);
  assert.match(route, /latitude: coordinates\?\.latitude/);
  assert.match(route, /longitude: coordinates\?\.longitude/);
});

test('junior team standings aggregate and classify winner, podium, points and classified sessions', () => {
  assert.match(route, /bestPosition: null,[\s\S]*?classified: 0/);
  assert.match(route, /constructorResult\.points \+= constructorPoints/);
  assert.match(route, /Math\.min\(constructorResult\.bestPosition, position\)/);
  for (const series of ['f2', 'f3']) {
    const script = fs.readFileSync(path.join(frontend, `js/${series}-season.js`), 'utf8');
    assert.match(script, new RegExp(`function ${series}ConstructorResultClass\\(result\\)`));
    assert.match(script, /bestPosition === 1[\s\S]*?bestPosition <= 3[\s\S]*?result-points[\s\S]*?result-finish/);
  }
});

test('shared junior map has accessible bounded zoom and ignores missing coordinates', () => {
  assert.match(mapScript, /race\.latitude !== null[\s\S]*?race\.longitude !== null/);
  assert.match(mapScript, /aria-label="Map zoom controls"/);
  assert.match(mapScript, /scaleExtent\(\[1, 8\]\)/);
  assert.match(mapScript, /event\.type !== 'wheel'/);
  assert.match(mapScript, /const inverseScale = 1 \/ currentTransform\.k/);
  assert.match(mapScript, /scrollIntoView/);
});
