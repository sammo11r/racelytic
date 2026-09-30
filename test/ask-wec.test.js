const test = require('node:test');
const assert = require('node:assert/strict');
const { classFromQuestion, executeWecQuestion, planWecQuestion } = require('../backend/ask-wec');

test('WEC question planning preserves class, metric and season in follow-ups', () => {
    assert.equal(classFromQuestion('LMGTE Pro podiums'), 'LMGTE PRO');
    const first = planWecQuestion('Who has the most WEC overall wins?');
    const since = planWecQuestion('Only since 2020', first);
    const classChange = planWecQuestion('LMP2?', since);
    assert.equal(classChange.intent, 'record_leader');
    assert.equal(classChange.metric, 'wins');
    assert.equal(classChange.classCode, 'LMP2');
    assert.equal(classChange.fromYear, 2020);
    const title = planWecQuestion('Who won the 2025 Hypercar drivers championship?');
    assert.equal(title.intent, 'season_standings');
    assert.equal(title.targetSeason, 2025);
    assert.equal(title.classCode, 'HYPERCAR');
    const p1 = planWecQuestion('Who came P1 at Le Mans in 2025?');
    assert.equal(p1.intent, 'race_result');
    assert.equal(p1.targetSeason, 2025);
});

test('WEC championship answer uses the recorded title flag', async () => {
    const connection = { query: async sql => sql.includes('FROM wec_championships')
        ? [{ id: 'hypercar-driver-2025', name: 'Hypercar drivers' }]
        : [{ position: 1, entityId: 'driver-one', name: 'Driver One', points: 200, championshipWon: 'true' }] };
    const result = await executeWecQuestion(connection, 'Who won the 2025 Hypercar drivers championship?');
    assert.match(result.answer, /Driver One won/);
});

test('WEC record answers use the returned class results and disclose the scope', async () => {
    const calls = [];
    const connection = { query: async (sql, params) => {
        calls.push({ sql, params });
        return [{ id: 'driver-one', name: 'Driver One', starts: 12, wins: 5, podiums: 7, firstYear: 2020, lastYear: 2024 }];
    } };
    const result = await executeWecQuestion(connection, 'Who has the most WEC Hypercar wins since 2020?');
    assert.equal(result.answer, 'Driver One leads HYPERCAR WEC since 2020 race wins with 5.');
    assert.equal(result.wecEvidence.rows[0][2], 5);
    assert.match(calls[0].sql, /results\.classPosition/);
    assert.deepEqual(calls[0].params, ['HYPERCAR', 2020]);
    assert.equal(result.grounding.evidenceItems, 1);
});

test('WEC refuses questions outside its calculable archive tools', async () => {
    await assert.rejects(() => executeWecQuestion({}, 'What will happen next season?'), error => {
        assert.equal(error.statusCode, 422);
        assert.match(error.message, /calculate WEC race results/);
        return true;
    });
});

test('WEC record scope keeps circuit and season filters in the calculation', async () => {
    const calls = [];
    const connection = { query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('FROM wec_circuits')) return [{ id: 'spa', name: 'Circuit de Spa-Francorchamps' }];
        return [{ id: 'one', name: 'Driver One', starts: 4, wins: 2, podiums: 3, firstYear: 2024, lastYear: 2024 }];
    } };
    const result = await executeWecQuestion(connection, 'Who has the most Hypercar wins at Spa in 2024?');
    assert.match(result.answer, /at Circuit de Spa-Francorchamps/);
    assert.deepEqual(calls.at(-1).params, ['HYPERCAR', 2024, 2024, 'spa']);
    assert.match(calls.at(-1).sql, /events\.circuitId = \?/);
    assert.equal(result.interpretation.placeName, 'Circuit de Spa-Francorchamps');
    await assert.rejects(() => executeWecQuestion(connection, 'Most Hypercar wins at an unknown track'), /place filter|match/);
});

test('WEC round standings use the requested snapshot and never call its leader champion', async () => {
    const calls = [];
    const connection = { query: async (sql, params) => {
        calls.push({ sql, params });
        return sql.includes('FROM wec_championships')
            ? [{ id: 'hypercar-driver-2025', name: 'Hypercar drivers' }]
            : [{ position: 1, entityId: 'one', name: 'Driver One', points: 90, championshipWon: 'true' }];
    } };
    const result = await executeWecQuestion(connection, 'Hypercar driver standings after round 3 in 2025');
    assert.match(result.answer, /after round 3/);
    assert.doesNotMatch(result.answer, /won the/);
    assert.equal(calls.at(-1).params.at(-1), 3);
    assert.equal(result.interpretation.standingRound, 3);
});

test('WEC comparisons and summaries return both calculated numbers and evidence', async () => {
    for (const phrase of ['versus', 'against', 'compared with']) {
        assert.equal(planWecQuestion(`Alice Driver ${phrase} Bob Driver for Hypercar wins`).intent, 'head_to_head');
    }
    const connection = { query: async (sql, params) => {
        if (sql.includes('FROM wec_drivers')) return [{ id: 'alice', name: 'Alice Driver' }, { id: 'bob', name: 'Bob Driver' }];
        const alice = params.includes('alice');
        return [{ id: alice ? 'alice' : 'bob', name: alice ? 'Alice Driver' : 'Bob Driver',
            starts: alice ? 8 : 9, wins: alice ? 3 : 2, podiums: alice ? 5 : 4, firstYear: 2024, lastYear: 2024 }];
    } };
    const comparison = await executeWecQuestion(connection, 'Alice Driver versus Bob Driver for Hypercar wins in 2024');
    assert.equal(comparison.wecEvidence.rows.length, 2);
    assert.match(comparison.answer, /3 wins.*2 wins/);
    const summary = await executeWecQuestion(connection, 'Alice Driver Hypercar season summary in 2024');
    assert.match(summary.answer, /8 starts, 3 wins and 5 podiums/);
    assert.deepEqual(summary.wecEvidence.rows[0].slice(1, 4), [8, 3, 5]);
});

test('WEC follow-ups replace one structured slot and retain the others', () => {
    const first = planWecQuestion('Most Hypercar wins at Spa in 2024');
    const second = planWecQuestion('What about manufacturers?', first);
    assert.equal(second.entity, 'manufacturers');
    assert.equal(second.placeName, 'Spa');
    assert.equal(second.fromYear, 2024);
    const third = planWecQuestion('Only since 2020', second);
    assert.equal(third.fromYear, 2020);
    assert.equal(third.toYear, null);
    assert.equal(third.placeName, 'Spa');
    const fourth = planWecQuestion('At Le Mans instead', third);
    assert.equal(fourth.placeName, 'Le Mans');
    assert.equal(fourth.entity, 'manufacturers');
});

test('WEC rejects unsupported scopes and missing comparison subjects', async () => {
    await assert.rejects(() => executeWecQuestion({}, 'Who has the most Hypercar wins in wet qualifying?'), /modifier is not supported/);
    await assert.rejects(() => executeWecQuestion({}, 'Who has the most Hypercar wins between 2020 and 2024?'), /year range is not supported/);
    await assert.rejects(() => executeWecQuestion({}, 'Hypercar driver standings at Spa in 2025'), /circuit filter cannot be applied/);
    const connection = { query: async () => [{ id: 'one', name: 'Alice Driver' }] };
    await assert.rejects(() => executeWecQuestion(connection, 'Alice Driver versus Unknown Driver for wins'), /exactly two/);
});

test('WEC chronology questions return event, driver and team evidence', async () => {
    const calls = [];
    const connection = { query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('FROM wec_drivers ORDER BY')) return [{ id: 'kubica', name: 'Robert Kubica' }];
        if (sql.includes('FROM wec_teams ORDER BY')) return [{ id: 'toyota', name: 'Toyota Gazoo Racing' }];
        return [{ id: 'wec-2025-r1', name: '6 Hours of Imola', year: 2025, round: 1,
            date: new Date(2025, 3, 20), circuitId: 'imola', circuitName: 'Autodromo Enzo e Dino Ferrari',
            placeName: 'Imola', points: 25 }];
    } };
    const opener = await executeWecQuestion(connection, 'Where was the first WEC race of 2025 held?');
    assert.equal(opener.intent, 'season_opener');
    assert.match(opener.answer, /Imola/);
    assert.match(opener.answer, /2025-04-20/);
    assert.deepEqual(calls[0].params, [2025]);
    const debut = await executeWecQuestion(connection, 'When did Robert Kubica make his WEC debut?');
    assert.equal(debut.intent, 'driver_debut');
    assert.match(debut.answer, /first recorded WEC race start/);
    const latest = await executeWecQuestion(connection, 'When did Toyota Gazoo Racing last score WEC points?');
    assert.equal(latest.intent, 'latest_team_points');
    assert.match(latest.answer, /25 WEC points/);
    assert.equal(latest.wecEvidence.rows.length, 4);
    const classPoints = await executeWecQuestion(connection, 'When did Toyota Gazoo Racing last score Hypercar points?');
    assert.match(classPoints.answer, /HYPERCAR WEC points/);
    assert.deepEqual(calls.at(-1).params.slice(-2), ['HYPERCAR', 'HYPERCAR']);
    await assert.rejects(() => executeWecQuestion(connection, 'When did Toyota Gazoo Racing last score WEC points in 2024?'), /season filter/);
});

test('WEC inventory questions preserve class and require a defined standings championship', async () => {
    const { WEC_INTENT_CATALOG } = require('../backend/ask-intents');
    for (const definition of WEC_INTENT_CATALOG.slice(0, 8)) {
        for (const question of definition.examples) assert.equal(planWecQuestion(question).intent, definition.id, question);
    }
    const calls = [];
    const connection = { query: async (sql, params) => {
        calls.push({ sql, params });
        return [
            { year: 2025, championshipId: 'wec-2025-hypercar-drivers', championshipName: 'Hypercar drivers',
                classCode: 'HYPERCAR', position: 1, points: 100, id: 'one', name: 'Driver One' },
            { year: 2025, championshipId: 'wec-2025-hypercar-drivers', championshipName: 'Hypercar drivers',
                classCode: 'HYPERCAR', position: 2, points: 90, id: 'two', name: 'Driver Two' },
            { year: 2025, championshipId: 'wec-2025-hypercar-drivers', championshipName: 'Hypercar drivers',
                classCode: 'HYPERCAR', position: 3, points: 80, id: 'three', name: 'Driver Three' },
            { year: 2025, championshipId: 'wec-2025-hypercar-drivers', championshipName: 'Hypercar drivers',
                classCode: 'HYPERCAR', position: 4, points: 76, id: 'four', name: 'Driver Four' }
        ];
    } };
    const gap = await executeWecQuestion(connection, 'Smallest points gap between P3 and P4 in final Hypercar standings?');
    assert.match(gap.answer, /P3–P4.*4 points/);
    const oneSeason = await executeWecQuestion(connection, 'What was the P3 to P4 points gap in the 2025 final Hypercar standings?');
    assert.match(oneSeason.answer, /P3–P4.*4 points/);
    assert.equal(oneSeason.scope.targetSeason, 2025);
    assert.deepEqual(calls[0].params, ['HYPERCAR', 'driver']);
    const topFour = await executeWecQuestion(connection, 'Which Hypercar season had the tightest top four?');
    assert.equal(topFour.fact.rows.length, 4);
    await assert.rejects(() => executeWecQuestion(connection, 'Smallest gap between P3 and P4 in final WEC standings?'), /Choose a WEC class/);
    await assert.rejects(() => executeWecQuestion(connection, 'Smallest gap between P3 and P4 in final Hypercar team standings?'), /entry based/);
});
