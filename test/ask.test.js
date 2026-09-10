const test = require('node:test');
const assert = require('node:assert/strict');
const {
    calculateDriverHeadToHead,
    calculateRaceResult,
    calculateSeasonStandings,
    calculateStreakLeader,
    calculateTitleCounts,
    executeAskQuery,
    resolveNamedSubject,
    resolvePointsSystem
} = require('../backend/ask-engine');
const {
    extractSubjectName,
    extractTargetSeason,
    extractPointsSystemYear,
    extractSeasonRange,
    extractSlots,
    interpretLocally,
    pointsSystemExists
} = require('../backend/ask-interpreter');

test('local interpretation distinguishes the three extended MVP question types', () => {
    const season = interpretLocally('Who wins the 2008 championship under 1991 rules?');
    assert.equal(season.intent, 'recalculate_season_champion');
    assert.equal(season.targetSeason, 2008);
    assert.equal(season.pointsSystemYear, 1991);

    const driver = interpretLocally('How many titles would Alonso have under 1982 rules?');
    assert.equal(driver.intent, 'recalculate_entity_titles');
    assert.equal(driver.subjectName, 'Alonso');
    assert.equal(driver.entity, null);

    const changed = interpretLocally('How many seasons have a different champion under 1982 rules?');
    assert.equal(changed.intent, 'list_changed_championships');
    assert.equal(changed.entity, 'drivers');
    assert.equal(extractTargetSeason('Who wins in 2016 under 1991 scoring?'), 2016);
    assert.equal(extractSubjectName('How many championships would Ferrari have using current points?'), 'Ferrari');
});

test('named subjects resolve locally across drivers and constructors', async () => {
    const connection = {
        query: async sql => sql.includes('FROM constructors')
            ? [{ id: 'ferrari', name: 'Ferrari' }]
            : [{ id: 'fernando-alonso', name: 'Fernando Alonso' }, { id: 'alex-albon', name: 'Alexander Albon' },
                { id: 'lewis-hamilton', name: 'Lewis Hamilton' }, { id: 'sergio-perez', name: 'Sergio Perez' },
                { id: 'michael-schumacher', name: 'Michael Schumacher' }]
    };
    assert.deepEqual(await resolveNamedSubject(connection, 'Alonso'), {
        id: 'fernando-alonso', name: 'Fernando Alonso', entity: 'drivers', score: 95
    });
    assert.deepEqual(await resolveNamedSubject(connection, 'Ferrari'), {
        id: 'ferrari', name: 'Ferrari', entity: 'constructors', score: 100
    });
    assert.equal((await resolveNamedSubject(connection, 'Hamlton')).name, 'Lewis Hamilton');
    assert.equal((await resolveNamedSubject(connection, 'Checo')).name, 'Sergio Perez');
    assert.equal((await resolveNamedSubject(connection, 'Schumi')).name, 'Michael Schumacher');
});

test('local interpretation understands the MVP title-count question', () => {
    const result = interpretLocally('Who has the most world championships if every season uses the 1982 points system?');
    assert.equal(result.intent, 'recalculate_title_counts');
    assert.equal(result.entity, 'drivers');
    assert.equal(result.pointsSystemYear, 1982);
    assert.equal(result.fromYear, null);
    assert.equal(result.toYear, null);
});

test('local interpretation separates scoring year from an explicit season range', () => {
    const query = 'Who has the most titles using 2010 points between 1980 and 2020?';
    assert.equal(extractPointsSystemYear(query), 2010);
    assert.deepEqual(extractSeasonRange(query), { fromYear: 1980, toYear: 2020 });
});

test('local interpretation understands common championship and scoring aliases', () => {
    const questions = [
        ['Which driver is the all-time WDC leader with 1991 scoring?', 1991],
        ['Who won the greatest number of world crowns under the rules used in 2003?', 2003],
        ["Rank drivers by world titles using today's points system.", 2025],
        ['Who would be champion most often on the 1982 scoring format?', 1982]
    ];
    questions.forEach(([query, year]) => {
        const result = interpretLocally(query);
        assert.equal(result.intent, 'recalculate_title_counts', query);
        assert.equal(result.pointsSystemYear, year, query);
    });
});

test('slot extraction distinguishes entities and exposes ambiguity without guessing', () => {
    const constructors = interpretLocally('Which team has the most constructors titles under 1991 rules?');
    assert.equal(constructors.intent, 'recalculate_title_counts');
    assert.equal(constructors.entity, 'constructors');
    assert.equal(constructors.confidence, 'high');

    const defaultDrivers = extractSlots('Who has the most world titles using 1982 points?');
    assert.equal(defaultDrivers.entity, 'drivers');
    assert.equal(defaultDrivers.entityExplicit, false);

    const ambiguous = interpretLocally('Rank drivers and constructors by titles using 2010 rules');
    assert.equal(ambiguous.intent, 'unsupported');
    assert.deepEqual(ambiguous.ambiguousFields, ['entity']);
    assert.match(ambiguous.reason, /Drivers.*Constructors/);
});

test('season ranges accept natural variants without mistaking a rules era for a range', () => {
    assert.deepEqual(extractSeasonRange('Most titles during seasons 1980–2020 under 1991 rules?'), { fromYear: 1980, toYear: 2020 });
    assert.deepEqual(extractSeasonRange('Most WDCs since 2000 with the 1982 points system?'), { fromYear: 2000, toYear: null });
    assert.deepEqual(extractSeasonRange('Most titles after 1999 through 2020 using 2010 scoring?'), { fromYear: 2000, toYear: 2020 });
    assert.deepEqual(extractSeasonRange('Most titles using the 1982-1990 points system?'), { fromYear: null, toYear: null });
});

test('local interpretation keeps unsupported questions out of the executor', () => {
    const race = interpretLocally('Who won the 1982 Monaco Grand Prix?');
    assert.equal(race.intent, 'race_result');
    assert.equal(race.targetSeason, 1982);
    assert.equal(race.eventName, 'Monaco');
    assert.equal(interpretLocally('Which constructor has the most titles using 1982 rules?').entity, 'constructors');
    const officialTitles = interpretLocally('Who has the most Drivers’ Championships?');
    assert.equal(officialTitles.intent, 'record_leader');
    assert.equal(officialTitles.recordCategory, 'championships');
    assert.equal(pointsSystemExists(1949), false);
    assert.match(interpretLocally('Most WDCs under the 1949 points system?').reason, /does not have/);
});

test('official system years resolve to the complete historical ruleset', () => {
    const resolved = resolvePointsSystem(1982);
    assert.equal(resolved.key, '1982-1990');
    assert.deepEqual(resolved.system.race, [9, 6, 4, 3, 2, 1]);
    assert.equal(resolved.system.countBest, 11);
    assert.equal(resolvePointsSystem(2026).key, '2025-present');
});

test('comparison language maps metrics and scopes without confusing race lookups', () => {
    const cases = [
        ['Who has more podiums, Alonso or Vettel?', 'podiums', 'career'],
        ['Hamilton vs Schumacher for poles', 'poles', 'career'],
        ['Which driver has more points, Norris or Piastri?', 'points', 'career'],
        ['Who has the better average finish, Russell or Leclerc?', 'averageFinish', 'career'],
        ['Compare Verstappen and Norris in shared races since 2022', 'race', 'shared'],
        ['Compare Hamilton and Rosberg as teammates', 'both', 'teammates']
    ];
    cases.forEach(([query, metric, scope]) => {
        const result = interpretLocally(query);
        assert.equal(result.intent, 'driver_head_to_head', query);
        assert.equal(result.comparisonMetric, metric, query);
        assert.equal(result.comparisonScope, scope, query);
        assert.equal(result.subjectNames.length, 2, query);
        if (/shared races/.test(query)) assert.deepEqual(result.subjectNames, ['Verstappen', 'Norris'], query);
    });

    const naturalSuffix = interpretLocally('Compare Hamilton and Verstappen head to head');
    assert.equal(naturalSuffix.intent, 'driver_head_to_head');
    assert.deepEqual(naturalSuffix.subjectNames, ['Hamilton', 'Verstappen']);
});

test('one historical rulebook applies to a two-driver comparison', () => {
    const result = interpretLocally('Compare Verstappen and Hamilton using the 2022 points system.');
    assert.equal(result.intent, 'driver_head_to_head');
    assert.deepEqual(result.subjectNames, ['Verstappen', 'Hamilton']);
    assert.equal(result.pointsSystemYear, 2022);
    assert.equal(result.comparisonMetric, 'points');
    assert.equal(result.comparisonScope, 'career');

    const shared = interpretLocally('Compare Verstappen and Hamilton in shared races using the 2022 points system.');
    assert.equal(shared.intent, 'driver_head_to_head');
    assert.deepEqual(shared.subjectNames, ['Verstappen', 'Hamilton']);
    assert.equal(shared.comparisonScope, 'shared');
    assert.equal(shared.circuitName, null);
    assert.equal(shared.venueCountryName, null);
    assert.equal(shared.pointsSystemYear, 2022);
});

test('natural record sample thresholds and season-summary language remain supported', () => {
    const rate = interpretLocally('Who has the highest win rate with at least 50 starts?');
    assert.equal(rate.intent, 'record_leader');
    assert.equal(rate.recordCategory, 'winRate');
    assert.equal(rate.minStarts, 50);
    assert.equal(rate.constructorName, null);
    assert.equal(rate.circuitName, null);
    assert.equal(rate.comparisonMetric, 'winRate');
    assert.deepEqual(rate.unsupportedQualifiers, []);

    const summary = interpretLocally('Summarize the 2024 season');
    assert.equal(summary.intent, 'season_standings');
    assert.equal(summary.targetSeason, 2024);
});

test('driver comparisons extract team and circuit refinements without changing driver names', () => {
    const circuit = interpretLocally('Compare Hamilton and Rosberg at Monaco');
    assert.deepEqual(circuit.subjectNames, ['Hamilton', 'Rosberg']);
    assert.equal(circuit.circuitName, 'Monaco');

    const team = interpretLocally('Compare Hamilton and Rosberg with Mercedes');
    assert.deepEqual(team.subjectNames, ['Hamilton', 'Rosberg']);
    assert.equal(team.constructorName, 'Mercedes');
});

test('constructor comparisons, teammate metrics and streak questions map to stable intents', () => {
    const constructors = interpretLocally('Compare constructors Ferrari and McLaren for wins');
    assert.equal(constructors.intent, 'constructor_head_to_head');
    assert.deepEqual(constructors.subjectNames, ['Ferrari', 'McLaren']);
    assert.equal(constructors.comparisonMetric, 'wins');

    const share = interpretLocally('Who has the better points share, Hamilton or Rosberg as teammates?');
    assert.equal(share.comparisonMetric, 'pointsShare');
    assert.equal(share.comparisonScope, 'teammates');

    const streak = interpretLocally('Who has the longest winning streak?');
    assert.equal(streak.intent, 'streak_leader');
    assert.equal(streak.streakCategory, 'wins');
});

test('streak execution ranks consecutive recorded starts and reports its sample', async () => {
    const connection = { query: async () => [
        { driverId: 'a', driverName: 'Driver A', raceId: 'r1', year: 2020, round: 1, raceName: 'One', positionNumber: 1, points: 25 },
        { driverId: 'a', driverName: 'Driver A', raceId: 'r2', year: 2020, round: 2, raceName: 'Two', positionNumber: 1, points: 25 },
        { driverId: 'a', driverName: 'Driver A', raceId: 'r3', year: 2020, round: 3, raceName: 'Three', positionNumber: 2, points: 18 },
        { driverId: 'b', driverName: 'Driver B', raceId: 'r1', year: 2020, round: 1, raceName: 'One', positionNumber: 1, points: 25 }
    ] };
    const result = await calculateStreakLeader(connection, { series: 'f1', streakCategory: 'wins', fromYear: 2020, toYear: 2020 });
    assert.equal(result.streak.ranking[0].name, 'Driver A');
    assert.equal(result.streak.ranking[0].value, 2);
    assert.equal(result.methodology.sample, '4 recorded driver starts.');
});

test('race-result questions resolve an event and return its official winner', async () => {
    const connection = { query: async sql => {
        if (sql === 'SELECT id, name FROM drivers ORDER BY name') return [{ id: 'pironi', name: 'Didier Pironi' }];
        if (/FROM races\s/.test(sql) && !sql.includes('races_race_results')) {
            return [{ id: 'monaco-1982', year: 1982, round: 5, name: 'Monaco Grand Prix', circuitName: 'Monaco' }];
        }
        if (sql.includes('FROM races_race_results results')) return [
            { positionNumber: 1, positionText: '1', driverId: 'patrese', driverName: 'Riccardo Patrese', constructorId: 'brabham', constructorName: 'Brabham', points: 9 },
            { positionNumber: 2, positionText: '2', driverId: 'pironi', driverName: 'Didier Pironi', constructorId: 'ferrari', constructorName: 'Ferrari', points: 6 }
        ];
        throw new Error(`Unexpected query: ${sql}`);
    } };
    const result = await calculateRaceResult(connection, {
        intent: 'race_result', series: 'f1', targetSeason: 1982, eventName: 'Monaco', resultView: 'winner'
    });
    assert.equal(result.race.id, 'monaco-1982');
    assert.equal(result.classifications[0].entries[0].name, 'Riccardo Patrese');
    assert.match(result.answer, /Riccardo Patrese won/);

    const subjectResult = await calculateRaceResult(connection, {
        intent: 'race_result', series: 'f1', targetSeason: 1982, eventName: 'Monaco',
        resultView: 'driver', subjectName: 'Pironi'
    });
    assert.equal(subjectResult.answer, 'Didier Pironi finished 2nd at Monaco Grand Prix in 1982.');
});

test('junior race-result questions keep multiple race sessions separate', async () => {
    const connection = { query: async sql => {
        if (sql.includes('FROM f2_races races')) return [
            { id: 'sakhir-2024', year: 2024, round: 1, name: 'Sakhir', circuitName: 'Bahrain International Circuit' }
        ];
        if (sql.includes('FROM f2_session_results results')) return [
            { sessionId: 'sprint', sessionName: 'Race', sessionNumber: 3, positionNumber: 1, driverId: 'maloney', driverName: 'Zane Maloney', constructorId: 'rodin', constructorName: 'Rodin', points: 10 },
            { sessionId: 'feature', sessionName: 'Race', sessionNumber: 4, positionNumber: 1, driverId: 'martins', driverName: 'Victor Martins', constructorId: 'art', constructorName: 'ART', points: 25 }
        ];
        throw new Error(`Unexpected query: ${sql}`);
    } };
    const result = await calculateRaceResult(connection, {
        intent: 'race_result', series: 'f2', targetSeason: 2024, eventName: 'Bahrain', resultView: 'winner'
    });
    assert.deepEqual(result.classifications.map(session => session.name), ['Race 1', 'Race 2']);
    assert.match(result.answer, /Zane Maloney won the Race 1; Victor Martins won the Race 2/);
});

test('season-standings questions expose official final positions', async () => {
    const connection = { query: async sql => {
        if (sql.includes('FROM seasons_driver_standings')) return [
            { id: 'verstappen', name: 'Max Verstappen', position: 1, points: 575, wins: 0 },
            { id: 'perez', name: 'Sergio Pérez', position: 2, points: 285, wins: 0 }
        ];
        throw new Error(`Unexpected query: ${sql}`);
    } };
    const result = await calculateSeasonStandings(connection, {
        intent: 'season_standings', series: 'f1', entity: 'drivers', targetSeason: 2023
    });
    assert.equal(result.standings[0].name, 'Max Verstappen');
    assert.match(result.answer, /leads the 2023 drivers’ standings/);
});

test('driver head-to-head questions compare shared race starts', async () => {
    const connection = { query: async sql => {
        if (sql === 'SELECT id, name FROM drivers ORDER BY name') return [
            { id: 'duncan-hamilton', name: 'Duncan Hamilton' },
            { id: 'hamilton', name: 'Lewis Hamilton' },
            { id: 'verstappen', name: 'Max Verstappen' }
        ];
        if (sql.includes('COUNT(DISTINCT raceId) AS appearances')) return [
            { driverId: 'duncan-hamilton', appearances: 5, lastYear: 1958 },
            { driverId: 'hamilton', appearances: 22, lastYear: 2021 }
        ];
        if (sql.includes('FROM races_race_results results')) return [
            { raceId: 'race-1', year: 2021, round: 1, raceName: 'Bahrain Grand Prix', sessionName: 'Grand Prix', driverId: 'hamilton', constructorId: 'mercedes', positionNumber: 1, qualificationPositionNumber: 2, points: 25 },
            { raceId: 'race-1', year: 2021, round: 1, raceName: 'Bahrain Grand Prix', sessionName: 'Grand Prix', driverId: 'verstappen', constructorId: 'red-bull', positionNumber: 2, qualificationPositionNumber: 1, points: 18 },
            { raceId: 'race-2', year: 2021, round: 2, raceName: 'Emilia Romagna Grand Prix', sessionName: 'Grand Prix', driverId: 'hamilton', constructorId: 'mercedes', positionNumber: 2, qualificationPositionNumber: 1, points: 18 },
            { raceId: 'race-2', year: 2021, round: 2, raceName: 'Emilia Romagna Grand Prix', sessionName: 'Grand Prix', driverId: 'verstappen', constructorId: 'red-bull', positionNumber: 1, qualificationPositionNumber: 3, points: 25 }
        ];
        throw new Error(`Unexpected query: ${sql}`);
    } };
    const result = await calculateDriverHeadToHead(connection, {
        intent: 'driver_head_to_head', series: 'f1', subjectNames: ['Hamilton', 'Verstappen'], fromYear: 2021, toYear: 2021
    });
    assert.equal(result.comparison.meetings, 2);
    assert.equal(result.comparison.drivers[0].raceWins, 1);
    assert.equal(result.comparison.drivers[1].qualifyingWins, 1);
    assert.match(result.answer, /tied 1–1/);

    const natural = interpretLocally('Who won more races, Verstappen or Hamilton?');
    assert.equal(natural.intent, 'driver_head_to_head');
    assert.deepEqual(natural.subjectNames, ['Verstappen', 'Hamilton']);
    assert.equal(natural.comparisonMetric, 'wins');
    const surnameResult = await calculateDriverHeadToHead(connection, { ...natural, series: 'f1', comparisonScope: 'shared' });
    assert.equal(surnameResult.comparison.drivers[1].driver.name, 'Lewis Hamilton');
    assert.deepEqual(surnameResult.comparison.drivers.map(score => score.victories), [1, 1]);
    assert.match(surnameResult.answer, /tied at 1 each for race wins/);
});

test('driver comparisons recalculate both careers with one complete points system', async () => {
    const connection = { async query(sql) {
        if (sql === 'SELECT id, name FROM drivers ORDER BY name') return [
            { id: 'max-verstappen', name: 'Max Verstappen' },
            { id: 'lewis-hamilton', name: 'Lewis Hamilton' }
        ];
        if (sql.includes('FROM races_sprint_race_results')) return [];
        if (/FROM races\s+WHERE year BETWEEN/.test(sql)) return [{ year: 2022, round: 1 }, { year: 2022, round: 2 }];
        if (sql.includes('FROM races_race_results results')) return [
            { raceId: 'one', year: 2022, round: 1, circuitId: 'bahrain', driverId: 'max-verstappen', constructorId: 'red-bull', positionNumber: 2, officialPoints: 18, sharedCar: 0, fastestLap: 0, polePosition: 0 },
            { raceId: 'one', year: 2022, round: 1, circuitId: 'bahrain', driverId: 'lewis-hamilton', constructorId: 'mercedes', positionNumber: 1, officialPoints: 25, sharedCar: 0, fastestLap: 0, polePosition: 1 }
        ];
        return [];
    } };
    const result = await calculateDriverHeadToHead(connection, {
        intent: 'driver_head_to_head', series: 'f1', subjectNames: ['Verstappen', 'Hamilton'],
        comparisonMetric: 'points', comparisonScope: 'career', pointsSystemYear: 2022
    });
    assert.equal(result.pointsSystem.id, '2022-2024');
    assert.equal(result.comparison.drivers[0].metricValue, 18);
    assert.equal(result.comparison.drivers[1].metricValue, 25);
    assert.equal(result.comparison.drivers[0].officialPoints, 18);
    assert.equal(result.comparison.drivers[1].officialPoints, 25);
    assert.match(result.answer, /Lewis Hamilton scores more points/);
    assert.match(result.assumptions.join(' '), /complete 2022–2024 rule set/);

    const finaleSystem = await calculateDriverHeadToHead(connection, {
        intent: 'driver_head_to_head', series: 'f1', subjectNames: ['Verstappen', 'Hamilton'],
        comparisonMetric: 'points', comparisonScope: 'career', pointsSystemYear: 2014
    });
    assert.deepEqual(finaleSystem.comparison.drivers.map(driver => driver.metricValue), [18, 25]);
});

test('title-count calculation aggregates deterministic simulated champions', async () => {
    const rows = {
        champions: [
            { year: 2000, driverId: 'alpha', driverName: 'Alpha Driver' },
            { year: 2001, driverId: 'beta', driverName: 'Beta Driver' }
        ],
        standings: [
            { year: 2000, driverId: 'alpha', driverName: 'Alpha Driver', positionNumber: 1, officialPoints: 20 },
            { year: 2000, driverId: 'beta', driverName: 'Beta Driver', positionNumber: 2, officialPoints: 12 },
            { year: 2001, driverId: 'beta', driverName: 'Beta Driver', positionNumber: 1, officialPoints: 20 },
            { year: 2001, driverId: 'alpha', driverName: 'Alpha Driver', positionNumber: 2, officialPoints: 18 }
        ],
        calendar: [
            { year: 2000, round: 1 }, { year: 2000, round: 2 },
            { year: 2001, round: 1 }, { year: 2001, round: 2 }
        ],
        races: [
            { year: 2000, round: 1, driverId: 'alpha', driverName: 'Alpha Driver', positionNumber: 1 },
            { year: 2000, round: 1, driverId: 'beta', driverName: 'Beta Driver', positionNumber: 2 },
            { year: 2000, round: 2, driverId: 'alpha', driverName: 'Alpha Driver', positionNumber: 1 },
            { year: 2000, round: 2, driverId: 'beta', driverName: 'Beta Driver', positionNumber: 2 },
            { year: 2001, round: 1, driverId: 'alpha', driverName: 'Alpha Driver', positionNumber: 1 },
            { year: 2001, round: 1, driverId: 'beta', driverName: 'Beta Driver', positionNumber: 2 },
            { year: 2001, round: 2, driverId: 'alpha', driverName: 'Alpha Driver', positionNumber: 2 },
            { year: 2001, round: 2, driverId: 'beta', driverName: 'Beta Driver', positionNumber: 3 }
        ]
    };
    const connection = {
        query: async sql => {
            if (sql.includes('championshipWon')) return rows.champions;
            if (sql.includes('FROM seasons_driver_standings')) return rows.standings;
            if (sql.includes('FROM races_race_results')) return rows.races;
            if (sql.includes('FROM races_sprint_race_results')) return [];
            if (sql.includes('FROM races')) return rows.calendar;
            throw new Error(`Unexpected query: ${sql}`);
        }
    };
    const result = await calculateTitleCounts(connection, {
        pointsSystemYear: 1982, fromYear: 2000, toYear: 2001
    });
    assert.equal(result.seasonsEvaluated, 2);
    assert.equal(result.ranking[0].name, 'Alpha Driver');
    assert.equal(result.ranking[0].titles, 2);
    assert.equal(result.changedChampionships.length, 1);
    assert.equal(result.changedChampionships[0].year, 2001);
    assert.match(result.answer, /Alpha Driver would have the most/);
});

test('title-count calculation executes constructor questions with constructor standings', async () => {
    const connection = {
        query: async sql => {
            if (sql.includes('FROM seasons_constructor_standings') && sql.includes('championshipWon')) {
                return [{ year: 2000, constructorId: 'works', constructorName: 'Works' }];
            }
            if (sql.includes('FROM seasons_constructor_standings')) {
                return [
                    { year: 2000, constructorId: 'works', constructorName: 'Works', positionNumber: 1, officialPoints: 14 },
                    { year: 2000, constructorId: 'rival', constructorName: 'Rival', positionNumber: 2, officialPoints: 4 }
                ];
            }
            if (sql.includes('FROM races_race_results')) {
                return [
                    { year: 2000, round: 1, driverId: 'a', driverName: 'A', constructorId: 'works', constructorName: 'Works', positionNumber: 1 },
                    { year: 2000, round: 1, driverId: 'b', driverName: 'B', constructorId: 'works', constructorName: 'Works', positionNumber: 2 },
                    { year: 2000, round: 1, driverId: 'c', driverName: 'C', constructorId: 'rival', constructorName: 'Rival', positionNumber: 3 }
                ];
            }
            if (sql.includes('FROM races')) return [{ year: 2000, round: 1 }];
            throw new Error(`Unexpected query: ${sql}`);
        }
    };
    const result = await calculateTitleCounts(connection, {
        entity: 'constructors', pointsSystemYear: 1958, fromYear: 2000, toYear: 2000
    });
    assert.equal(result.entity, 'constructors');
    assert.equal(result.entityLabel, 'Constructors’ Championships');
    assert.equal(result.ranking[0].name, 'Works');
    assert.equal(result.ranking[0].titles, 1);
    assert.match(result.answer, /Works would have the most Constructors’ Championships/);
});

test('ask execution shapes season, named-subject, and changed-history answers', async () => {
    const connection = {
        query: async sql => {
            if (sql === 'SELECT id, name FROM drivers ORDER BY name') {
                return [{ id: 'alpha', name: 'Alpha Driver' }, { id: 'beta', name: 'Beta Driver' }];
            }
            if (sql === 'SELECT id, name FROM constructors ORDER BY name') return [];
            if (sql.includes('championshipWon')) return [{ year: 2005, driverId: 'beta', driverName: 'Beta Driver' }];
            if (sql.includes('FROM seasons_driver_standings')) {
                return [
                    { year: 2005, driverId: 'beta', driverName: 'Beta Driver', positionNumber: 1, officialPoints: 10 },
                    { year: 2005, driverId: 'alpha', driverName: 'Alpha Driver', positionNumber: 2, officialPoints: 8 }
                ];
            }
            if (sql.includes('FROM races_race_results')) {
                return [
                    { year: 2005, round: 1, driverId: 'alpha', driverName: 'Alpha Driver', positionNumber: 1 },
                    { year: 2005, round: 1, driverId: 'beta', driverName: 'Beta Driver', positionNumber: 2 }
                ];
            }
            if (sql.includes('FROM races_sprint_race_results')) return [];
            if (sql.includes('FROM races')) return [{ year: 2005, round: 1 }];
            throw new Error(`Unexpected query: ${sql}`);
        }
    };

    const singleSeason = await executeAskQuery(connection, {
        intent: 'recalculate_season_champion', entity: 'drivers', pointsSystemYear: 1982, targetSeason: 2005
    });
    assert.equal(singleSeason.intent, 'recalculate_season_champion');
    assert.match(singleSeason.answer, /Alpha Driver would win the 2005 Drivers’ Championship/);
    assert.equal(singleSeason.seasonExplanations[0].changed, true);
    assert.equal(singleSeason.seasonExplanations[0].standings[0].name, 'Alpha Driver');
    assert.equal(singleSeason.seasonExplanations[0].decisiveRounds[0].swing, 3);

    const changed = await executeAskQuery(connection, {
        intent: 'list_changed_championships', entity: 'drivers', pointsSystemYear: 1982, fromYear: 2005, toYear: 2005
    });
    assert.match(changed.answer, /1 championship would change hands/);

    const named = await executeAskQuery(connection, {
        intent: 'recalculate_entity_titles', entity: null, subjectName: 'Alpha Driver', pointsSystemYear: 1982,
        fromYear: 2005, toYear: 2005
    });
    assert.equal(named.focus.name, 'Alpha Driver');
    assert.equal(named.focus.titles, 1);
    assert.match(named.answer, /Alpha Driver would have 1 Drivers’ Championship title/);

    const comparison = await executeAskQuery(connection, {
        intent: 'compare_points_systems', entity: null, subjectName: 'Alpha Driver',
        comparisonPointsSystemYears: [1982, 1991], fromYear: 2005, toYear: 2005
    });
    assert.equal(comparison.intent, 'compare_points_systems');
    assert.equal(comparison.comparison.systems.length, 2);
    assert.equal(comparison.comparison.systems[0].focus.name, 'Alpha Driver');
    assert.match(comparison.answer, /under both/);
});
