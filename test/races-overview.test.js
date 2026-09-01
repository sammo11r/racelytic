const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.join(__dirname, '../frontend');
const script = fs.readFileSync(path.join(frontend, 'js/races.js'), 'utf8');
const functionsOnly = script.slice(0, script.indexOf('async function loadRaces()'));
const context = vm.createContext({
    Date,
    URLSearchParams,
    history: { replaceState() {} },
    window: { location: { search: '' }, matchMedia: () => ({ matches: false }) },
    document: { getElementById: () => ({ value: '', innerHTML: '', textContent: '', disabled: false, querySelectorAll: () => [] }) },
    esc: String,
    fmtDate: String,
    fmtNumber: String,
    displayRaceName: race => race.name,
});
vm.runInContext(functionsOnly, context);

const juniorScript = fs.readFileSync(path.join(frontend, 'js/junior-races.js'), 'utf8');
const juniorFunctionsOnly = juniorScript.slice(0, juniorScript.indexOf('async function loadJuniorRaces()'));
const juniorContext = vm.createContext({
    Date,
    URLSearchParams,
    history: { replaceState() {} },
    window: { RacelyticJuniorRaceArchive: { series: 'f2', shortName: 'F2', name: 'Formula 2' }, location: { search: '' }, matchMedia: () => ({ matches: false }) },
    document: { getElementById: () => ({ value: '', innerHTML: '', textContent: '', disabled: false, querySelectorAll: () => [] }) },
    activeSeriesBase: () => '/f2',
    esc: String,
    fmtDate: value => String(value).slice(0, 10),
    fmtNumber: String,
});
vm.runInContext(juniorFunctionsOnly, juniorContext);

test('race archive status prioritises a recorded winner over the calendar date', () => {
    assert.equal(context.raceArchiveStatus({ date: '2999-01-01', winnerName: 'Recorded Winner' }), 'completed');
    assert.equal(context.raceArchiveStatus({ date: '2999-01-01', winnerName: null }), 'upcoming');
    assert.equal(context.raceArchiveStatus({ date: '2000-01-01', winnerName: null }), 'no-result');
});

test('race archive pagination shows exactly one complete season per page', () => {
    const races = [2026, 2025, 2024].flatMap(year => Array.from({ length: 2 }, (_, round) => ({ year, round: round + 1 })));
    const pages = context.groupedRacePages(races);
    assert.equal(pages.length, 3);
    assert.equal(JSON.stringify(pages.map(page => page.map(group => group.year))), JSON.stringify([[2026], [2025], [2024]]));
    assert.ok(pages.every(page => page.length === 1 && page[0].races.length === 2));
});

test('race archive exposes labelled filters, live result counts, loading state and pagination', () => {
    const html = fs.readFileSync(path.join(frontend, 'races.html'), 'utf8');
    assert.match(html, /aria-label="Race archive filters"/);
    assert.match(html, /id="race-browser-heading"[^>]+aria-live="polite"/);
    assert.match(html, /id="races"[^>]+aria-busy="true"/);
    assert.match(html, /id="races-pagination"[^>]+aria-label="Race archive pages"/);
});

test('race archive API includes valid classified winners for archive cards', () => {
    const source = fs.readFileSync(path.join(__dirname, '../backend/routes/races.js'), 'utf8');
    assert.match(source, /winner\.driverNames AS winnerName/);
    assert.match(source, /winnerResult\.positionNumber = 1/);
    assert.match(source, /NOT IN \('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC'\)/);
});

test('junior archive derives complete, live, upcoming and missing-result weekend states', () => {
    assert.equal(juniorContext.juniorWeekendStatus({ raceSessionCount: 2, activeRaceSessionCount: 2, completedRaceSessionCount: 2, endDate: '2000-01-01' }), 'completed');
    assert.equal(juniorContext.juniorWeekendStatus({ raceSessionCount: 2, activeRaceSessionCount: 2, completedRaceSessionCount: 1, endDate: '2999-01-01' }), 'in-progress');
    assert.equal(juniorContext.juniorWeekendStatus({ raceSessionCount: 2, activeRaceSessionCount: 2, completedRaceSessionCount: 0, endDate: '2999-01-01' }), 'upcoming');
    assert.equal(juniorContext.juniorWeekendStatus({ raceSessionCount: 2, activeRaceSessionCount: 2, completedRaceSessionCount: 0, endDate: '2000-01-01' }), 'no-result');
});

test('every junior archive page contains exactly one complete season', () => {
    const races = [2026, 2025, 2024].flatMap(year => Array.from({ length: 3 }, (_, round) => ({ year, round: round + 1 })));
    const pages = juniorContext.juniorRacePages(races);
    assert.equal(pages.length, 3);
    assert.ok(pages.every(page => page.length === 1 && page[0].races.length === 3));
});

test('F2, F3 and Academy archives share the richer filter and pagination surface', () => {
    const { renderAcademyHtml } = require('../backend/academy-renderer');
    for (const series of ['f2', 'f3', 'academy']) {
        const file = series === 'f2' ? 'f2-races.html' : 'f3-races.html';
        const source = fs.readFileSync(path.join(frontend, file), 'utf8');
        const html = series === 'academy' ? renderAcademyHtml(file, source) : source;
        assert.match(html, /class="race-filters junior-race-filters"/);
        assert.match(html, /id="junior-race-status"/);
        assert.match(html, /id="junior-race-format"/);
        assert.match(html, /id="junior-race-sort"/);
        assert.match(html, /id="junior-races-pagination"/);
        assert.match(html, /src="\/js\/junior-races\.js"/);
    }
});

test('junior archive API counts race classifications and limits winners to their weekend', () => {
    const source = fs.readFileSync(path.join(__dirname, '../backend/routes/races.js'), 'utf8');
    assert.match(source, /AS activeRaceSessionCount/);
    assert.match(source, /AS completedRaceSessionCount/);
    assert.match(source, /winnerResult\.raceId = races\.id/);
    assert.match(source, /winnerDriver\.name.+AS winnerName/s);
});
