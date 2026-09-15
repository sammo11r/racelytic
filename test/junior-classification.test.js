const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fillTimedClassificationGaps, juniorClassificationPosition, juniorClassificationStatus, juniorClassificationTime } = require('../backend/junior-classification');

test('999 and legacy unclassified markers are not finishing positions', () => {
    for (const value of [999, '999', 1001, null, -1]) assert.equal(juniorClassificationPosition(value), null);
    assert.equal(juniorClassificationPosition(22), 22);
    for (const generic of ['CLA', 'Classified', null]) {
        assert.equal(juniorClassificationStatus(generic, 999, true), 'DNF');
        assert.equal(juniorClassificationStatus(generic, 999, false), 'NC');
    }
    for (const status of ['DNS', 'DSQ', 'DNF', 'RET']) assert.equal(juniorClassificationStatus(status, 999, true), status);
    assert.equal(juniorClassificationStatus(null, 1001, true), 'NC');
});

test('classification codes are never treated as recorded times', () => {
    for (const value of ['CLA', ' cla ', 'Classified', null, '']) assert.equal(juniorClassificationTime(value), null);
    assert.equal(juniorClassificationTime('1:29.137'), '1:29.137');
    assert.equal(juniorClassificationTime('DNF'), 'DNF');
});

test('timed classifications derive missing gaps from their fastest recorded time', () => {
    const results = [
        { timeMillis: 68175, gapMillis: null, gapLaps: null },
        { timeMillis: 68358, gapMillis: null, gapLaps: null },
        { timeMillis: 68400, gapMillis: 210, gapLaps: null },
        { timeMillis: null, gapMillis: null, gapLaps: null }
    ];
    assert.equal(fillTimedClassificationGaps(results), results);
    assert.deepEqual(results.map(result => result.gapMillis), [0, 183, 210, null]);
});

test('race tables and mobile cards suppress invalid grids and classification-code time fallbacks', () => {
    const source = fs.readFileSync(path.join(__dirname, '../frontend/js/junior-race-detail.js'), 'utf8').replace(/loadJuniorRaceDetail\(\);\s*$/, '');
    const context = vm.createContext({ window: { RacelyticJuniorRaceDetail: { path: '/f2', teamPage: 'constructor' } }, esc: String, fmtNumber: String });
    vm.runInContext(source, context);
    const result = { driverId: 'test', driverName: 'Test', positionNumber: 2, status: 'CLA', gridPositionNumber: 999, time: 'CLA', timeMillis: null, points: 0 };
    for (const session of [{ name: 'Race', isRace: true, results: [result] }, { name: 'Qualifying', isRace: false, results: [result] }]) {
        for (const render of [context.renderJuniorDesktopResults, context.renderJuniorMobileResults]) {
            const html = render(session);
            assert.doesNotMatch(html, /999|>CLA</);
        }
    }
    for (const grid of [999, '999', 1001, null, 0, -1]) assert.equal(context.juniorGridValue(grid), '—');
    assert.equal(context.juniorGridValue(22), '22');
    assert.equal(context.juniorGap(result), '—');
    assert.equal(context.juniorGap({ status: 'CLA', gapMillis: 1275 }), '+1.275s');
    assert.equal(context.juniorGap({ status: 'DNF' }), 'DNF');
    assert.equal(context.juniorGap({ status: 'DNS' }), 'DNS');
    assert.equal(context.juniorGap({ status: 'CLA', timeMillis: 89137 }), '1:29.137');
    assert.equal(context.juniorGap({ status: 'CLA', timeMillis: 3661002 }), '1:01:01.002');
    assert.equal(context.juniorGap({ status: 'CLA', timeMillis: 89137 }, false), '—');
    assert.equal(context.juniorGridMovement(result), '—');
});

test('race desktop and mobile results show retirement status, never 999 or bogus movement', () => {
    const source = fs.readFileSync(path.join(__dirname, '../frontend/js/junior-race-detail.js'), 'utf8').replace(/loadJuniorRaceDetail\(\);\s*$/, '');
    const context = vm.createContext({ window: { RacelyticJuniorRaceDetail: { path: '/f2', teamPage: 'constructor' } }, esc: String, fmtNumber: String });
    vm.runInContext(source, context);
    const result = { driverId: 'test', driverName: 'Test', positionNumber: 999, status: 'CLA', gridPositionNumber: 9, points: 0 };
    const session = { name: 'Race', isRace: true, results: [result] };
    for (const render of [context.renderJuniorDesktopResults, context.renderJuniorMobileResults]) {
        const html = render(session);
        assert.match(html, /finish-position retired">DNF</);
        assert.doesNotMatch(html, /999|990/);
    }
    assert.equal(context.juniorGridMovement(result), '—');
    assert.equal(context.juniorResultFinish({ positionNumber: 999, status: 'DSQ' }), 'DSQ');
    assert.equal(context.juniorResultFinish(result, false), 'NC');
});

test('Formula E tabs use weekend order and empty lap columns are omitted', () => {
    const source = fs.readFileSync(path.join(__dirname, '../frontend/js/junior-race-detail.js'), 'utf8').replace(/loadJuniorRaceDetail\(\);\s*$/, '');
    const context = vm.createContext({ window: { RacelyticJuniorRaceDetail: { series: 'fe', path: '/formula-e', teamPage: 'team' } }, esc: String, fmtNumber: String });
    vm.runInContext(source, context);
    context.__sessions = [
        { code: 'race', name: 'Race', sessionNumber: 5 },
        { code: 'free-practice-2', name: 'FP2', sessionNumber: 1 },
        { code: 'grid', name: 'Starting Grid', sessionNumber: 4 },
        { code: 'qualifying', name: 'Qualifying', sessionNumber: 3 },
        { code: 'free-practice-1', name: 'FP1', sessionNumber: 2 }
    ];
    assert.deepEqual(Array.from(vm.runInContext('__sessions.sort((a, b) => juniorSessionOrder(a) - juniorSessionOrder(b)).map(row => row.code)', context)),
        ['free-practice-1', 'free-practice-2', 'qualifying', 'grid', 'race']);
    const result = { driverId: 'test', driverName: 'Test', positionNumber: 1, timeMillis: 68175, gapMillis: 0, laps: null };
    const html = context.renderJuniorDesktopResults({ name: 'FP1', isRace: false, results: [result] });
    assert.match(html, /<th>Time<\/th><th>Gap<\/th>/);
    assert.doesNotMatch(html, /<th>Laps<\/th>/);
});
