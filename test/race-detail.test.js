const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.join(__dirname, '../frontend');
const script = fs.readFileSync(path.join(frontend, 'js/race.js'), 'utf8');
const functionsOnly = script.slice(0, script.indexOf('async function loadRace()'));
const context = vm.createContext({
    Date,
    URLSearchParams,
    history: { replaceState() {} },
    window: { location: { search: '' } },
    document: { getElementById: () => ({}) },
    esc: String,
    fmtDate: String,
    fmtNumber: String,
    displayRaceName: race => race.name,
});
vm.runInContext(functionsOnly, context);

function setRaceData({ raceResults = [], sprint = [], date = '2999-01-01' } = {}) {
    context.__raceData = {
        race: { date },
        sessions: {
            race: raceResults,
            sprint,
            qualifying: { qualifying: [], qualifying1: [], qualifying2: [], sprintQualifying: [], preQualifying: [] },
            practice: { practice1: [], practice2: [], practice3: [], practice4: [], warmingUp: [] },
        },
    };
    vm.runInContext('raceData = __raceData', context);
}

test('race detail distinguishes completed, active, upcoming and missing-result weekends', () => {
    setRaceData({ raceResults: [{ driverName: 'Winner' }] });
    assert.equal(context.racePageStatus(), 'completed');
    setRaceData({ sprint: [{ driverName: 'Sprint winner' }] });
    assert.equal(context.racePageStatus(), 'in-progress');
    setRaceData();
    assert.equal(context.racePageStatus(), 'upcoming');
    setRaceData({ date: '2000-01-01' });
    assert.equal(context.racePageStatus(), 'no-result');
});

test('race detail normalises single-digit minutes in archived race durations', () => {
    assert.equal(context.normaliseRaceDuration('2:4:44.859'), '2:04:44.859');
    assert.equal(context.normaliseRaceDuration('1:32:10.123'), '1:32:10.123');
    assert.equal(context.normaliseRaceDuration(null), '—');
});

test('race detail has loading, overview, round navigation and accessible result regions', () => {
    const html = fs.readFileSync(path.join(frontend, 'race.html'), 'utf8');
    assert.match(html, /id="race-round-navigation"[^>]+aria-label="Previous and next race"/);
    assert.match(html, /id="race-head"[^>]+aria-busy="true"/);
    assert.match(html, /id="race-overview"[^>]+aria-live="polite"/);
    assert.match(html, /id="race-session-results"[^>]+hidden/);
    assert.match(html, /id="session-tabs"[^>]+role="tablist"/);
    assert.match(html, /id="race-results"[^>]+role="tabpanel"/);
});

test('race detail includes summaries, responsive cards and shareable session state without a weekend schedule', () => {
    assert.match(script, /class="race-summary-grid"/);
    assert.doesNotMatch(script, /race-schedule|weekend-schedule|scheduleEntries|renderSchedule/);
    assert.match(script, /class="session-result-cards"/);
    assert.match(script, /history\.replaceState\(null, '', `\/race\?\$\{query\}`\)/);
    assert.match(script, /event\.key === 'ArrowRight'/);
    assert.match(script, /event\.key === 'Home'/);
});

test('race detail API exposes driver numbers used by classifications', () => {
    const source = fs.readFileSync(path.join(__dirname, '../backend/routes/races.js'), 'utf8');
    assert.match(source, /rr\.qualificationPositionNumber,\s*rr\.driverNumber,/);
    assert.match(source, /sr\.driverNumber, sr\.driverId/);
});

test('junior championships share the upgraded race-detail surface', () => {
    const shared = fs.readFileSync(path.join(frontend, 'js/junior-race-detail.js'), 'utf8');
    for (const file of ['f2-race.html', 'f3-race.html']) {
        const html = fs.readFileSync(path.join(frontend, file), 'utf8');
        assert.match(html, /class="container page race-detail-page junior-race-detail-page"/);
        assert.match(html, /id="junior-race-round-navigation"[^>]+aria-label="Previous and next race"/);
        assert.match(html, /id="junior-race-head"[^>]+aria-busy="true"/);
        assert.match(html, /id="junior-race-overview"[^>]+aria-live="polite"/);
        assert.match(html, /id="junior-race-session-results"[^>]+hidden/);
        assert.match(html, /id="junior-session-tabs"[^>]+role="tablist"/);
        assert.match(html, /id="junior-race-results"[^>]+role="tabpanel"/);
        assert.match(html, /src="\/js\/junior-race-detail\.js"/);
    }
    assert.match(shared, /class="race-summary-grid"/);
    assert.match(shared, /class="session-result-cards"/);
    assert.match(shared, /history\.replaceState/);
    assert.match(shared, /event\.key === 'ArrowRight'/);
    assert.doesNotMatch(shared, /race-schedule|weekend-schedule|scheduleEntries|renderSchedule/);
});

test('F1 Academy inherits the shared race-detail page and its own series configuration', () => {
    const { renderAcademyHtml, renderAcademyScript } = require('../backend/academy-renderer');
    const html = renderAcademyHtml('f3-race.html', fs.readFileSync(path.join(frontend, 'f3-race.html'), 'utf8'));
    const config = renderAcademyScript(fs.readFileSync(path.join(frontend, 'js/f3-race.js'), 'utf8'));
    assert.match(html, /All F1 Academy races/);
    assert.match(html, /src="\/js\/junior-race-detail\.js"/);
    assert.match(config, /series: 'academy'/);
    assert.match(config, /name: 'F1 Academy'/);
    assert.match(config, /path: '\/academy'/);
});

test('modern F2 and F3 grids are derived from qualifying when official grid sessions are absent', () => {
    const { juniorRaceGridContext } = require('../backend/junior-race-analysis');
    const sessions = [
        { id: 'qualifying', name: 'Qualifying', sessionNumber: 2, isRace: false },
        { id: 'sprint', name: 'Race', sessionNumber: 4, isRace: true },
        { id: 'feature', name: 'Race', sessionNumber: 6, isRace: true },
    ];
    const results = new Map([['qualifying', Array.from({ length: 12 }, (_, index) => ({
        driverId: `driver-${index + 1}`, positionNumber: index + 1
    }))]]);
    const f2Sprint = juniorRaceGridContext('f2', sessions[1], sessions, results, 'S', 2026);
    const f3Sprint = juniorRaceGridContext('f3', sessions[1], sessions, results, 'S', 2026);
    const feature = juniorRaceGridContext('f2', sessions[2], sessions, results, 'F', 2026);
    assert.equal(f2Sprint.source, 'derived');
    assert.equal(f2Sprint.gridByDriver.get('driver-1'), 10);
    assert.equal(f2Sprint.gridByDriver.get('driver-10'), 1);
    assert.equal(f3Sprint.gridByDriver.get('driver-1'), 12);
    assert.equal(f3Sprint.gridByDriver.get('driver-12'), 1);
    assert.equal(feature.gridByDriver.get('driver-1'), 1);
});

test('junior race API promotes best laps to practice and qualifying classification times', () => {
    const source = fs.readFileSync(path.join(__dirname, '../backend/routes/races.js'), 'utf8');
    assert.match(source, /time: juniorClassificationTime\(row\.time\) \|\| \(!isRace \? juniorClassificationTime\(row\.fastestLapTime\) : null\)/);
    assert.match(source, /gridPositionNumber: juniorClassificationPosition\(context\.gridByDriver/);
    assert.match(source, /name: 'Starting Grid'/);
});
