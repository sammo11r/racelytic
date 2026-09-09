const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTitleCounts, executeAskQuery, resolveNamedSubject, resolvePointsSystem } = require('../backend/ask-engine');
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
            : [{ id: 'fernando-alonso', name: 'Fernando Alonso' }, { id: 'alex-albon', name: 'Alexander Albon' }, { id: 'lewis-hamilton', name: 'Lewis Hamilton' }]
    };
    assert.deepEqual(await resolveNamedSubject(connection, 'Alonso'), {
        id: 'fernando-alonso', name: 'Fernando Alonso', entity: 'drivers', score: 95
    });
    assert.deepEqual(await resolveNamedSubject(connection, 'Ferrari'), {
        id: 'ferrari', name: 'Ferrari', entity: 'constructors', score: 100
    });
    assert.equal((await resolveNamedSubject(connection, 'Hamlton')).name, 'Lewis Hamilton');
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
    assert.equal(interpretLocally('Who won the 1982 Monaco Grand Prix?').intent, 'unsupported');
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
