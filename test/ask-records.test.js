const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRecordLeader, calculateRecordSubjectTotal } = require('../backend/ask-engine');
const { INTENT_CATALOG, RECORD_CATEGORIES, intentDefinition, missingRequiredSlots, supportedIntentIds } = require('../backend/ask-intents');
const { interpretLocally } = require('../backend/ask-interpreter');

test.after(async () => {
    if (require.cache[require.resolve('../backend/junior-records')]) {
        await require('../backend/route-helpers').pool.end();
    }
});

test('Ask intent catalogue declares execution requirements centrally', () => {
    assert.ok(INTENT_CATALOG.length >= 6);
    assert.deepEqual(intentDefinition('record_leader').requiredSlots, ['recordCategory']);
    assert.ok(supportedIntentIds().has('compare_points_systems'));
    assert.ok(supportedIntentIds().has('record_leader'));
    assert.ok(supportedIntentIds().has('record_subject_total'));
    assert.deepEqual(RECORD_CATEGORIES.map(category => category.id), [
        'wins', 'podiums', 'poles', 'fastestLaps', 'starts', 'points', 'gridGain',
        'averageFinish', 'finishRate', 'winRate', 'podiumRate', 'dnfs', 'championships'
    ]);
    assert.deepEqual(intentDefinition('race_result').requiredSlots, ['targetSeason', 'eventName']);
    assert.deepEqual(intentDefinition('season_standings').requiredSlots, ['targetSeason']);
    assert.deepEqual(missingRequiredSlots('record_subject_total', { recordCategory: 'wins' }), ['subjectName']);
    assert.deepEqual(missingRequiredSlots('compare_points_systems', { comparisonPointsSystemYears: [1982] }), ['comparisonPointsSystemYears']);
});

test('record questions understand season, circuit, nationality and race-format filters', () => {
    const singleSeason = interpretLocally('Who had the most GP victories in 2024?');
    assert.equal(singleSeason.intent, 'record_leader');
    assert.equal(singleSeason.recordCategory, 'wins');
    assert.deepEqual([singleSeason.fromYear, singleSeason.toYear], [2024, 2024]);

    const circuit = interpretLocally('Who has the most wins at Monaco?');
    assert.equal(circuit.intent, 'record_leader');
    assert.equal(circuit.circuitName, 'Monaco');
    const circuitWithIn = interpretLocally('Who has scored the most points in Silverstone?');
    assert.equal(circuitWithIn.intent, 'record_leader');
    assert.equal(circuitWithIn.recordCategory, 'points');
    assert.equal(circuitWithIn.circuitName, null);
    assert.equal(circuitWithIn.venueCountryName, 'Silverstone');
    const hostCountry = interpretLocally('Who has scored the most points in England?');
    assert.equal(hostCountry.intent, 'record_leader');
    assert.equal(hostCountry.circuitName, null);
    assert.equal(hostCountry.venueCountryName, 'England');
    const nationality = interpretLocally('Which British driver has the most wins?');
    assert.equal(nationality.intent, 'record_leader');
    assert.equal(nationality.nationalityName, 'british');
    assert.equal(interpretLocally('Who has the most wins in sprint races only?').raceFormat, 'S');
    assert.equal(interpretLocally('Who has the most wins including sprints?').raceFormat, 'all');
    assert.equal(interpretLocally('Which driver won the most races?').recordCategory, 'wins');
    assert.equal(interpretLocally('Show top 20 drivers by wins').resultLimit, 20);
    assert.equal(interpretLocally('Who is the top driver for pole positions?').intent, 'record_leader');
    assert.equal(interpretLocally('Who has the most wins at the moment?').intent, 'record_leader');
    const historicalCutoff = interpretLocally('Who had the most wins at the end of 2020?');
    assert.equal(historicalCutoff.intent, 'record_leader');
    assert.equal(historicalCutoff.toYear, 2020);

    const teamRecord = interpretLocally('Which driver has the most pole positions with ferrari?');
    assert.equal(teamRecord.intent, 'record_leader');
    assert.equal(teamRecord.entity, 'drivers');
    assert.equal(teamRecord.recordCategory, 'poles');
    assert.equal(teamRecord.constructorName, 'ferrari');
    assert.equal(interpretLocally('Which driver scored the most Ferrari podiums?').constructorName, 'Ferrari');
    assert.equal(interpretLocally('Which Ferrari driver has the most poles?').constructorName, 'Ferrari');
    const compound = interpretLocally('Who has the most wins with Ferrari at Monaco?');
    assert.equal(compound.constructorName, 'Ferrari');
    assert.equal(compound.circuitName, 'Monaco');

    assert.equal(interpretLocally('Only sprint races').raceFormat, 'S');
    assert.equal(interpretLocally('Now include sprints').raceFormat, 'all');
    assert.equal(interpretLocally('Only at Monaco').circuitName, 'Monaco');
    assert.equal(interpretLocally('Who scored the most points per race?').intent, 'unsupported');
    assert.match(interpretLocally('Who had the most wins last season?').reason, /relative seasons/);
    assert.match(interpretLocally('Who has the most championships at Monaco?').reason, /circuit for championship totals/);
});

test('official championship questions use archive records without requiring a counterfactual rulebook', () => {
    const leaders = interpretLocally('Who has the most Formula 2 championships?');
    assert.equal(leaders.intent, 'record_leader');
    assert.equal(leaders.recordCategory, 'championships');
    const season = interpretLocally('Who won the 2020 Formula 2 championship?');
    assert.equal(season.intent, 'record_leader');
    assert.equal(season.recordCategory, 'championships');
    assert.deepEqual([season.fromYear, season.toYear], [2020, 2020]);
    const named = interpretLocally('How many titles does Lewis Hamilton have?');
    assert.equal(named.intent, 'record_subject_total');
    assert.equal(named.recordCategory, 'championships');
});

test('record leader execution resolves and applies a constructor scope', async () => {
    const calls = [];
    const connection = {
        async query(sql, parameters = []) {
            calls.push({ sql, parameters });
            if (sql === 'SELECT id, name FROM constructors ORDER BY name') return [{ id: 'ferrari', name: 'Ferrari' }];
            return [{ id: 'michael-schumacher', name: 'Michael Schumacher', value: 58, starts: 180, firstYear: 1996, lastYear: 2006 }];
        }
    };
    const result = await calculateRecordLeader(connection, {
        intent: 'record_leader', entity: 'drivers', recordCategory: 'poles', constructorName: 'ferrari', fromYear: null, toYear: null
    });
    assert.equal(result.constructorFilter.name, 'Ferrari');
    assert.match(result.answer, /Michael Schumacher has the most Formula 1 pole positions with Ferrari: 58/);
    assert.ok(calls.at(-1).parameters.includes('ferrari'));
    assert.match(result.assumptions.join(' '), /Only results recorded with Ferrari/);
});

test('record execution resolves circuit and nationality filters and discloses race format', async () => {
    const calls = [];
    const connection = { async query(sql, parameters = []) {
        calls.push({ sql, parameters });
        if (sql === 'SELECT id, name FROM circuits ORDER BY name') return [{ id: 'monaco', name: 'Monaco' }];
        return [{ id: 'lewis-hamilton', name: 'Lewis Hamilton', value: 2, starts: 4, firstYear: 2016, lastYear: 2019 }];
    } };
    const result = await calculateRecordLeader(connection, {
        intent: 'record_leader', series: 'f1', entity: 'drivers', recordCategory: 'wins', circuitName: 'Monaco',
        nationalityName: 'british', raceFormat: 'S', fromYear: null, toYear: null
    });
    assert.match(result.answer, /at Monaco among British drivers/);
    assert.equal(result.scope.circuit.id, 'monaco');
    assert.equal(result.scope.nationality.id, 'united-kingdom');
    assert.equal(result.scope.raceFormat, 'S');
    assert.ok(calls.at(-1).parameters.includes('monaco'));
    assert.ok(calls.at(-1).parameters.includes('united-kingdom'));
    assert.match(result.assumptions.join(' '), /Sprint races only/);
});

test('record execution aggregates every circuit in a named host country', async () => {
    const calls = [];
    const connection = { async query(sql, parameters = []) {
        calls.push({ sql, parameters });
        if (sql === 'SELECT id, name FROM circuits ORDER BY name') return [
            { id: 'aintree', name: 'Aintree' },
            { id: 'silverstone', name: 'Silverstone' }
        ];
        if (sql.includes('JOIN countries ON countries.id = circuits.countryId')) return [
            { circuitId: 'aintree', countryId: 'united-kingdom', countryName: 'United Kingdom' },
            { circuitId: 'silverstone', countryId: 'united-kingdom', countryName: 'United Kingdom' }
        ];
        return [{ id: 'lewis-hamilton', name: 'Lewis Hamilton', value: 400, starts: 24, firstYear: 2007, lastYear: 2026 }];
    } };
    const result = await calculateRecordLeader(connection, {
        intent: 'record_leader', series: 'f1', entity: 'drivers', recordCategory: 'points', venueCountryName: 'England'
    });
    assert.match(result.answer, /points in England: 400/);
    assert.deepEqual(result.scope.venueCountry.circuitIds, ['aintree', 'silverstone']);
    assert.ok(calls.at(-1).parameters.includes('aintree'));
    assert.ok(calls.at(-1).parameters.includes('silverstone'));
    assert.match(result.assumptions.join(' '), /circuits in England/);
});

test('junior record execution resolves a country stored in a compound circuit place', async () => {
    const connection = { async query(sql) {
        if (sql.includes('SELECT id AS circuitId, placeName FROM f2_circuits')) return [
            { circuitId: 'silverstone', placeName: 'Silverstone, Great Britain' }
        ];
        if (sql.includes('FROM f2_sessions sessions')) return [{
            sessionId: 'feature', raceId: 'silverstone-2024', sessionNumber: 3, sessionName: 'Feature Race',
            isRace: 1, cancelled: 0, raceName: 'Silverstone', year: 2024, round: 8
        }];
        if (sql.includes('FROM f2_session_results results')) return [{
            sessionId: 'feature', driverId: 'driver-a', driverName: 'Driver A', constructorId: 'team-a',
            constructorName: 'Team A', positionNumber: 1, positionText: '1', laps: 29, points: 25
        }];
        return [];
    } };
    const result = await calculateRecordLeader(connection, {
        intent: 'record_leader', series: 'f2', entity: 'drivers', recordCategory: 'points', venueCountryName: 'Britain'
    });
    assert.match(result.answer, /points in Britain: 25/);
    assert.deepEqual(result.scope.venueCountry.circuitIds, ['silverstone']);
});

test('record execution rejects an unknown nationality instead of dropping the filter', async () => {
    await assert.rejects(() => calculateRecordLeader({ query: async () => [] }, {
        intent: 'record_leader', series: 'f2', entity: 'drivers', recordCategory: 'wins', nationalityName: 'Martian'
    }), error => error.statusCode === 422 && /does not recognise the nationality/.test(error.message));
});

test('named record totals map natural questions to subject, metric and range slots', () => {
    const cases = [
        ['How many wins does Alonso have?', 'Alonso', 'wins', null, null],
        ['How many podiums did Ferrari score between 2000 and 2010?', 'Ferrari', 'podiums', 2000, 2010],
        ['How many poles did Hamilton have by the end of 2020?', 'Hamilton', 'poles', null, 2020]
    ];
    for (const [query, subjectName, recordCategory, fromYear, toYear] of cases) {
        const result = interpretLocally(query);
        assert.equal(result.intent, 'record_subject_total', query);
        assert.equal(result.subjectName, subjectName, query);
        assert.equal(result.recordCategory, recordCategory, query);
        assert.equal(result.fromYear, fromYear, query);
        assert.equal(result.toYear, toYear, query);
    }
});

test('record questions map natural metrics, entities and season ranges to stable slots', () => {
    const cases = [
        ['Who has the most Formula 1 race wins?', 'drivers', 'wins', null, null],
        ['Which constructor has the most podiums since 2000?', 'constructors', 'podiums', 2000, null],
        ['Who holds the all-time pole position record?', 'drivers', 'poles', null, null],
        ['Which driver has the most fastest laps?', 'drivers', 'fastestLaps', null, null],
        ['Rank drivers by starts from 1990 to 2020', 'drivers', 'starts', 1990, 2020]
    ];
    for (const [query, entity, category, fromYear, toYear] of cases) {
        const interpretation = interpretLocally(query);
        assert.equal(interpretation.intent, 'record_leader', query);
        assert.equal(interpretation.entity, entity, query);
        assert.equal(interpretation.recordCategory, category, query);
        assert.equal(interpretation.fromYear, fromYear, query);
        assert.equal(interpretation.toYear, toYear, query);
    }
});

test('championship names are treated as scope rather than team filters', () => {
    for (const query of [
        'Who has the most Formula 2 race wins?',
        'Who has the most Formula 3 race wins?',
        'Who has the most F1 Academy race wins?'
    ]) {
        const interpretation = interpretLocally(query);
        assert.equal(interpretation.intent, 'record_leader', query);
        assert.equal(interpretation.recordCategory, 'wins', query);
        assert.equal(interpretation.constructorName, null, query);
    }
});

test('record execution reuses the record explorer and returns Ask-native evidence', async () => {
    const connection = {
        async query() {
            return [
                { id: 'lewis-hamilton', name: 'Lewis Hamilton', value: 105, starts: 380, carStarts: 380, wins: 105, podiums: 210, points: 5200, sample: 380, firstYear: 2007, lastYear: 2026 },
                { id: 'michael-schumacher', name: 'Michael Schumacher', value: 91, starts: 306, carStarts: 306, wins: 91, podiums: 155, points: 1566, sample: 306, firstYear: 1991, lastYear: 2012 }
            ];
        }
    };
    const result = await calculateRecordLeader(connection, {
        intent: 'record_leader', entity: 'drivers', recordCategory: 'wins', fromYear: null, toYear: null
    });
    assert.equal(result.intent, 'record_leader');
    assert.equal(result.constructorFilter, null);
    assert.match(result.answer, /Lewis Hamilton has the most Formula 1 race wins: 105/);
    assert.equal(result.record.entries[0].rank, 1);
    assert.equal(result.record.entries[1].rank, 2);
    assert.ok(result.assumptions.length >= 3);
});

test('identical record questions reuse a short-lived per-connection result', async () => {
    let queries = 0;
    const connection = { async query() { queries += 1; return [{ id: 'driver', name: 'Driver', value: 1 }]; } };
    const interpretation = { intent: 'record_leader', series: 'f1', entity: 'drivers', recordCategory: 'wins', fromYear: 2020, toYear: 2020 };
    await calculateRecordLeader(connection, interpretation);
    await calculateRecordLeader(connection, interpretation);
    assert.equal(queries, 1);
});

test('record cache is shared across live pooled connections', async () => {
    let queries = 0;
    const makeConnection = threadId => ({ threadId, async query() { queries += 1; return [{ id: 'driver', name: 'Driver', value: 1 }]; } });
    const interpretation = { intent: 'record_leader', series: 'f1', entity: 'drivers', recordCategory: 'wins', fromYear: 2031, toYear: 2031 };
    await calculateRecordLeader(makeConnection(9001), interpretation);
    await calculateRecordLeader(makeConnection(9002), interpretation);
    assert.equal(queries, 1);
});

test('record answers describe a single-season scope naturally', async () => {
    const connection = { async query() { return [{ id: 'max-verstappen', name: 'Max Verstappen', value: 9 }]; } };
    const result = await calculateRecordLeader(connection, {
        intent: 'record_leader', entity: 'drivers', recordCategory: 'wins', fromYear: 2024, toYear: 2024
    });
    assert.match(result.answer, /race wins in 2024: 9/);
    assert.doesNotMatch(result.answer, /from 2024 to 2024/);
});

test('record execution explains an empty season range without inventing a leader', async () => {
    const connection = { async query() { return []; } };
    const result = await calculateRecordLeader(connection, {
        intent: 'record_leader', entity: 'constructors', recordCategory: 'wins', fromYear: 2098, toYear: 2099
    });
    assert.equal(result.record.entries.length, 0);
    assert.match(result.answer, /No constructors have recorded any Formula 1 race wins from 2098 to 2099\./);
    assert.doesNotMatch(result.answer, /No one are tied/);
});

test('named record execution resolves the entity and calculates only that archive total', async () => {
    const calls = [];
    const connection = {
        async query(sql, parameters = []) {
            calls.push({ sql, parameters });
            if (sql === 'SELECT id, name FROM drivers ORDER BY name') return [{ id: 'fernando-alonso', name: 'Fernando Alonso' }];
            if (sql === 'SELECT id, name FROM constructors ORDER BY name') return [{ id: 'ferrari', name: 'Ferrari' }];
            return [{ id: 'fernando-alonso', name: 'Fernando Alonso', value: 32, starts: 410, firstYear: 2001, lastYear: 2026 }];
        }
    };
    const result = await calculateRecordSubjectTotal(connection, {
        intent: 'record_subject_total', entity: null, subjectName: 'Alonso', recordCategory: 'wins', fromYear: null, toYear: 2020
    });
    assert.equal(result.entity, 'drivers');
    assert.equal(result.subject.id, 'fernando-alonso');
    assert.equal(result.subject.value, 32);
    assert.match(result.answer, /Fernando Alonso has 32 Formula 1 race wins from 1950 to 2020/);
    assert.ok(calls.at(-1).sql.includes('d.id = ?'));
    assert.ok(calls.at(-1).parameters.includes('fernando-alonso'));
});

test('Ask record execution reads the selected junior championship archive', async () => {
    const calls = [];
    const connection = {
        async query(sql) {
            calls.push(sql);
            if (sql === 'SELECT id, name FROM f2_drivers ORDER BY name') return [{ id: 'charles-leclerc', name: 'Charles Leclerc' }];
            if (sql.includes('FROM f2_sessions sessions')) return [{ sessionId: 'feature', raceId: 'bahrain-2017', sessionNumber: 3,
                sessionName: 'Feature Race', isRace: 1, cancelled: 0, startTimeUtc: '2017-04-15', raceName: 'Bahrain', year: 2017, round: 1, date: '2017-04-15' }];
            if (sql.includes('FROM f2_session_results results')) return [{ sessionId: 'feature', driverId: 'charles-leclerc', driverName: 'Charles Leclerc',
                constructorId: 'prema', constructorName: 'PREMA Racing', positionNumber: 1, positionText: 'CLA', laps: 32, polePosition: 1, fastestLap: 0, points: 25 }];
            return [];
        }
    };
    const result = await calculateRecordSubjectTotal(connection, {
        intent: 'record_subject_total', series: 'f2', entity: 'drivers', subjectName: 'Leclerc', recordCategory: 'wins', fromYear: null, toYear: null
    });
    assert.equal(result.answer, 'Charles Leclerc has 1 Formula 2 race win.');
    assert.equal(result.subject.href, '/f2/drivers/charles-leclerc');
    assert.ok(calls.some(sql => sql.includes('f2_session_results')));
    assert.match(result.assumptions.join(' '), /All race formats/);
});
