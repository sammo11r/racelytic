const test = require('node:test');
const assert = require('node:assert/strict');
const {
    compareCountback,
    countRounds,
    scoreResult,
    simulateConstructors,
    simulateDrivers
} = require('../backend/championship-simulator');
const { inferRacePointsMultiplier } = require('../backend/ask-engine');

const classic = { race: [9, 6, 4, 3, 2, 1], sprint: [], countBest: 11 };
const modern = { race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [], countBest: Infinity };

test('1982 rules drop scores beyond a driver’s best eleven results', () => {
    const rounds = [9, 6, 4, 3].map(points => ({ racePoints: points, sprintPoints: 0, points }));
    assert.equal(countRounds(rounds, { ...classic, countBest: 2 }), 15);
});

test('segmented historical rules keep the best result from each calendar segment', () => {
    const rounds = [9, 6, 4, 3].map(points => ({ racePoints: points, sprintPoints: 0, points }));
    const rules = {
        race: classic.race, sprint: [], countOnlySegments: true,
        bestFirstRounds: 1, firstRoundsWindow: 2,
        bestLastRounds: 1, lastRoundsWindow: 2
    };
    assert.equal(countRounds(rounds, rules), 13);
});

test('1950s shared-car finishes split placement points between the recorded drivers', () => {
    assert.equal(scoreResult({ position: 1, positionShare: 2 }, classic).points, 4.5);
});

test('1952-style tied fastest laps divide the bonus before adding it to race points', () => {
    const rules = { race: [8, 6, 4, 3, 2], sprint: [], fastestLapBonus: 1 };
    assert.equal(scoreResult({ position: 2, fastestLap: true, fastestLapShare: 2 }, rules).points, 6.5);
});

test('1975, 1984 and other reduced-points races retain their historical multiplier', () => {
    const raceRows = [
        { positionNumber: 1, officialPoints: 4.5 },
        { positionNumber: 4, officialPoints: 1.5 },
        { positionNumber: 6, officialPoints: 0.5 }
    ];
    const multiplier = inferRacePointsMultiplier(raceRows, classic);
    assert.equal(multiplier, 0.5);
    assert.equal(scoreResult({ position: 1, racePointsMultiplier: multiplier }, classic).points, 4.5);
});

test('2014 final-round double points are applied to the complete race score', () => {
    const rules = { ...modern, doublePointsFinalRound: true };
    assert.equal(scoreResult({ position: 1 }, rules, { isFinalRound: false }).points, 25);
    assert.equal(scoreResult({ position: 1 }, rules, { isFinalRound: true }).points, 50);
});

test('2019 fastest-lap bonus is limited to top-ten finishers', () => {
    const rules = { ...modern, fastestLapBonus: 1, fastestLapMaxPosition: 10 };
    assert.equal(scoreResult({ position: 10, fastestLap: true }, rules).points, 2);
    assert.equal(scoreResult({ position: 11, fastestLap: true }, rules).points, 0);
});

test('equal totals use race finishes for countback and ignore sprint finishing positions', () => {
    const data = {
        calendar: [{ round: 1 }],
        driverChampionship: [
            { driverId: 'alpha', name: 'Alpha', raceResults: { 1: { position: 2, sprintResults: [{ position: 1 }] } } },
            { driverId: 'beta', name: 'Beta', raceResults: { 1: { position: 1, sprintResults: [{ position: 2 }] } } }
        ]
    };
    const result = simulateDrivers(data, { race: [1], sprint: [1], countBest: Infinity });
    assert.equal(result[0].name, 'Beta');
    assert.equal(result[0].points, result[1].points);
    assert.ok(compareCountback(result[0], result[1]) <= 0);
});

test('1958 constructor rules score only the best-placed car', () => {
    const data = {
        calendar: [{ round: 1 }],
        constructorChampionship: [
            { constructorId: 'works', name: 'Works', position: 1 },
            { constructorId: 'rival', name: 'Rival', position: 2 }
        ],
        driverChampionship: [
            { raceResults: { 1: { constructorId: 'works', position: 1 } } },
            { raceResults: { 1: { constructorId: 'works', position: 2 } } },
            { raceResults: { 1: { constructorId: 'rival', position: 3 } } }
        ]
    };
    const standings = simulateConstructors(data, {
        race: [8, 6, 4], sprint: [], countBest: 1,
        constructorCountBest: 1, constructorScoringCars: 1
    });
    assert.equal(standings[0].name, 'Works');
    assert.equal(standings[0].points, 8);
    assert.equal(standings[1].points, 4);
});

test('1961 constructor rules use their separate race scale', () => {
    const data = {
        calendar: [{ round: 1 }],
        constructorChampionship: [{ constructorId: 'works', name: 'Works', position: 1 }],
        driverChampionship: [{ raceResults: { 1: { constructorId: 'works', position: 1 } } }]
    };
    const standings = simulateConstructors(data, {
        race: [9, 6, 4], constructorRace: [8, 6, 4], sprint: [],
        countBest: 1, constructorCountBest: 1, constructorScoringCars: 1
    });
    assert.equal(standings[0].points, 8);
});
