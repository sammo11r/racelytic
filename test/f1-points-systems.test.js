const test = require('node:test');
const assert = require('node:assert/strict');
const systems = require('../frontend/js/f1-points-systems');

test('official presets cover every Formula One points-system era', () => {
    assert.equal(Object.keys(systems).length, 33);
    assert.deepEqual(systems['1950-1953'].race, [8, 6, 4, 3, 2]);
    assert.equal(systems['1950-1953'].fastestLapBonus, 1);
    assert.equal(systems['1950-1953'].countBest, 4);
    assert.deepEqual(systems[1961].constructorRace, [8, 6, 4, 3, 2, 1]);
    assert.deepEqual(systems[1961].race, [9, 6, 4, 3, 2, 1]);
    assert.deepEqual(systems['2003-2009'].race, [10, 8, 6, 5, 4, 3, 2, 1]);
    assert.equal(systems[2014].doublePointsFinalRound, true);
    assert.deepEqual(systems[2021].sprint, [3, 2, 1]);
    assert.deepEqual(systems['2022-2024'].sprint, [8, 7, 6, 5, 4, 3, 2, 1]);
    assert.equal(systems['2022-2024'].fastestLapMaxPosition, 10);
    assert.equal(systems['2025-present'].fastestLapBonus, undefined);
});

test('segmented championship eras encode their actual counting windows', () => {
    assert.deepEqual(
        [systems[1967].bestFirstRounds, systems[1967].firstRoundsWindow, systems[1967].bestLastRounds, systems[1967].lastRoundsWindow],
        [5, 6, 4, 5]
    );
    assert.deepEqual(
        [systems[1977].bestFirstRounds, systems[1977].firstRoundsWindow, systems[1977].bestLastRounds, systems[1977].lastRoundsWindow],
        [8, 9, 7, 8]
    );
    assert.equal(systems[1979].constructorCountBest, Infinity);
    assert.equal(systems[1980].constructorCountBest, Infinity);
});
