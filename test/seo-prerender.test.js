const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderInitialSeoContent } = require('../backend/seo-prerender');

const template = fs.readFileSync(path.join(__dirname, '../frontend/driver.html'), 'utf8');
const fixture = name => fs.readFileSync(path.join(__dirname, `../frontend/${name}`), 'utf8');

test('driver SEO prerender uses the existing visible profile markup', () => {
    const html = renderInitialSeoContent(template, {
        kind: 'driver', series: 'f1', driver: {
            name: 'Test Driver', fullName: 'Test Driver', nationalityCountryName: 'Netherlands',
            permanentNumber: 1, firstSeason: 2020, lastSeason: 2026, currentSeason: 2026,
            latestConstructorName: 'Test Racing', totalChampionshipWins: 2, totalRaceStarts: 100,
            totalRaceWins: 25, totalPodiums: 50, totalPolePositions: 12, totalFastestLaps: 10, totalPoints: 1234.5
        }
    });
    assert.match(html, /id="driver-head" aria-busy="false"/);
    assert.match(html, /<h1>Test Driver<\/h1>/);
    assert.match(html, /2× World champion/);
    assert.match(html, /Current constructor Test Racing/);
    assert.match(html, /id="driver-stats"[^>]+aria-busy="false"/);
    assert.match(html, />1,234\.5<\/strong>/);
    assert.match(html, />25\.0%<\/strong>/);
    assert.doesNotMatch(html, /driver-detail-skeleton/);
});

test('driver SEO prerender escapes archive content and leaves unrelated pages unchanged', () => {
    const malicious = renderInitialSeoContent(template, {
        kind: 'driver', series: 'f1', driver: { name: '<img src=x>', fullName: 'A & B' }
    });
    assert.match(malicious, /<h1>&lt;img src=x&gt;<\/h1>/);
    assert.match(malicious, /A &amp; B/);
    assert.doesNotMatch(malicious, /<h1><img/);
    assert.equal(renderInitialSeoContent(template, null), template);
});

test('constructor and circuit prerenders reuse their visible hero and fact layouts', () => {
    const constructor = renderInitialSeoContent(fixture('constructor.html'), {
        kind: 'constructor', series: 'f1', constructor: {
            name: 'Team One', countryName: 'Italy', firstYear: 2000, lastYear: 2020, seasons: 21,
            totalChampionshipWins: 3, totalRaceStarts: 400, totalRaceWins: 50, totalPodiums: 100,
            totalPolePositions: 40, totalPoints: 2000
        },
        lineage: { methodology: 'Records remain separate.', identityScope: { note: 'This constructor identifier also contains results from a separate historical use of the same name.' }, segments: [
            { constructorId: 'old-team', name: 'Old Team', fromYear: 2000, toYear: 2009 },
            { constructorId: 'team-one', name: 'Team One', fromYear: 2010, toYear: null, current: true, sameIdentity: true,
              transition: { label: 'Rebrand', note: 'The team was renamed.' } }
        ], source: { label: 'F1DB', url: 'https://github.com/f1db/f1db' } }
    });
    assert.match(constructor, /id="constructor-head" aria-busy="false"/);
    assert.match(constructor, /<h1>Team One<\/h1>/);
    assert.match(constructor, /3× Constructors’ champion/);
    assert.match(constructor, /class="constructor-stat-strip"/);
    assert.match(constructor, /id="constructor-lineage"/);
    assert.match(constructor, /href="\/constructors\/old-team"/);
    assert.doesNotMatch(constructor, /Records remain separate/);
    assert.match(constructor, /class="constructor-lineage-bar"/);
    assert.match(constructor, /constructor-lineage-years">2010–present/);
    assert.match(constructor, /--lineage-weight:17/);
    assert.match(constructor, /constructor-lineage-scope/);
    assert.match(constructor, /separate historical use/);
    assert.match(constructor, /aria-current="page"/);
    assert.doesNotMatch(constructor, /href="\/constructors\/team-one"/);
    assert.doesNotMatch(constructor, /Chronology source|How Racelytic defines|Same name, separate operation/);

    const circuit = renderInitialSeoContent(fixture('circuit.html'), {
        kind: 'circuit', series: 'f1', circuit: {
            id: 'test', name: 'Test Circuit', placeName: 'Test City', countryName: 'Testland', type: 'race',
            direction: 'clockwise', layoutId: 'test-layout', layoutLength: 5.5, layoutTurns: 18,
            totalRacesHeld: 12, firstHeldYear: 2001, lastHeldYear: 2025
        }
    });
    assert.match(circuit, /id="circuit-head" aria-busy="false"/);
    assert.match(circuit, /<h1>Test Circuit<\/h1>/);
    assert.match(circuit, /Test City · Testland/);
    assert.match(circuit, /Races hosted<\/dt><dd>12/);
    assert.match(circuit, /circuit-analysis\?id=test/);
});

test('season and race prerenders populate existing summaries without adding new sections', () => {
    const season = renderInitialSeoContent(fixture('season.html'), {
        kind: 'season', series: 'f1', year: 2024, completed: true, races: 24, laps: 1444,
        first: { name: 'Champion', points: 400 }, second: { name: 'Runner-up', points: 350 },
        third: { name: 'Third', points: 300 }, constructor: { name: 'Winning Team' }
    });
    assert.match(season, /id="season-year">2024</);
    assert.match(season, /id="season-first">Champion</);
    assert.match(season, /id="season-constructor">Winning Team</);
    assert.match(season, /id="season-races">24</);

    const race = renderInitialSeoContent(fixture('race.html'), {
        kind: 'race', series: 'f1', hasResults: true, winnerName: 'Winning Driver', winnerConstructorName: 'Winning Team',
        race: { id: 'race', year: 2024, round: 1, name: 'Test Grand Prix', displayName: 'Test Grand Prix',
            date: '2024-03-01', circuitId: 'test', circuitName: 'Test Circuit', countryName: 'Testland', laps: 57 }
    });
    assert.match(race, /id="race-head" aria-busy="false"/);
    assert.match(race, /<h1>Test Grand Prix<\/h1>/);
    assert.match(race, /Winning Driver/);
    assert.doesNotMatch(race, /Loading race weekend/);
});
