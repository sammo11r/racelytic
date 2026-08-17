const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePointsSystem } = require('../backend/points-system');

test('validates and normalizes a reusable points system', () => {
    assert.deepEqual(validatePointsSystem({
        name: 'My system', racePoints: [10, 6, 4, 0], sprintPoints: [3, 2, 1],
        qualifyingPoints: [2, 1],
        poleBonus: 1, fastestLapBonus: 1, fastestLapMaxPosition: 10,
        countBestRounds: 8, sprintCountsTowardRound: false, visibility: 'public'
    }), {
        name: 'My system', racePoints: [10, 6, 4], sprintPoints: [3, 2, 1], qualifyingPoints: [2, 1],
        poleBonus: 1, fastestLapBonus: 1, fastestLapMaxPosition: 10,
        countBestRounds: 8, bestFirstRounds: null, firstRoundsWindow: null,
        bestLastRounds: null, lastRoundsWindow: null, sprintCountsTowardRound: false,
        visibility: 'public', tieBreaker: 'countback'
    });
});

test('rejects invalid points values', () => {
    assert.throws(() => validatePointsSystem({ name: 'Bad', racePoints: [25, -1] }), /between 0 and 1000/);
});

test('validates segmented best-result rules', () => {
    const system = validatePointsSystem({
        name: 'Segmented', racePoints: [9, 6, 4],
        bestFirstRounds: 5, firstRoundsWindow: 7,
        bestLastRounds: 4, lastRoundsWindow: 6
    });
    assert.equal(system.bestFirstRounds, 5);
    assert.equal(system.firstRoundsWindow, 7);
    assert.equal(system.bestLastRounds, 4);
    assert.equal(system.lastRoundsWindow, 6);
    assert.throws(() => validatePointsSystem({
        name: 'Ambiguous', racePoints: [10], countBestRounds: 8,
        bestFirstRounds: 5, firstRoundsWindow: 7
    }), /either a whole-season/);
});
