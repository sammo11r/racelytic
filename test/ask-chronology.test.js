const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSeasonOpener, calculateDriverDebut, calculateLatestTeamPoints } = require('../backend/ask-engine');
const { interpretLocally } = require('../backend/ask-interpreter');

test('opening race answers use the first round with recorded classifications and show location', async () => {
    const calls = [];
    const connection = { query: async (sql, params) => {
        calls.push({ sql, params });
        return [{ id: 'australia-2025', name: 'Australian Grand Prix', year: 2025, round: 1,
            date: '2025-03-16', circuitId: 'albert-park', circuitName: 'Albert Park',
            placeName: 'Melbourne', countryName: 'Australia' }];
    } };
    const result = await calculateSeasonOpener(connection, { series: 'f1', targetSeason: 2025 });
    assert.match(result.answer, /Albert Park in Melbourne, Australia on 2025-03-16/);
    assert.deepEqual(calls[0].params, [2025]);
    assert.match(calls[0].sql, /EXISTS \(SELECT 1 FROM races_race_results/);
    assert.equal(result.fact.rows[0].value, 'Australian Grand Prix');
});

test('driver debut resolves identity then uses the first race start', async () => {
    const calls = [];
    const connection = { query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('FROM drivers ORDER BY name')) return [{ id: 'michael-schumacher', name: 'Michael Schumacher' }];
        return [{ id: 'belgium-1991', name: 'Belgian Grand Prix', year: 1991, round: 11,
            date: '1991-08-25', circuitName: 'Spa-Francorchamps' }];
    } };
    const result = await calculateDriverDebut(connection, { series: 'f1', subjectName: 'Michael Schumacher' });
    assert.match(result.answer, /first recorded Formula 1 race start.*Belgian Grand Prix in 1991/);
    assert.deepEqual(calls.at(-1).params, ['michael-schumacher']);
    assert.match(calls.at(-1).sql, /NOT IN \('DNS','DNQ','DNPQ','WD'\)/);
    assert.equal(result.fact.rows[2].value, 'Spa-Francorchamps');
});

test('ambiguous Schumacher surname requests a full driver name', async () => {
    const connection = { query: async () => [
        { id: 'michael-schumacher', name: 'Michael Schumacher' },
        { id: 'ralf-schumacher', name: 'Ralf Schumacher' }
    ] };
    await assert.rejects(
        () => calculateDriverDebut(connection, { series: 'f1', subjectName: 'Schumacher' }),
        error => error.statusCode === 422 && /more than one name/.test(error.message)
    );
});

test('latest team points includes sprint and Grand Prix results and reports the latest session', async () => {
    const calls = [];
    const connection = { query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('FROM constructors ORDER BY name')) return [{ id: 'alpine', name: 'Alpine' }];
        return [{ id: 'miami-2025', name: 'Miami Grand Prix', year: 2025, round: 6,
            date: '2025-05-04', sessionName: 'Sprint', points: 3 }];
    } };
    const result = await calculateLatestTeamPoints(connection, { series: 'f1', subjectName: 'Alpine' });
    assert.match(result.answer, /Alpine last scored 3 Formula 1 points in the sprint at the Miami Grand Prix/);
    assert.deepEqual(calls.at(-1).params, ['alpine', 'alpine']);
    assert.match(calls.at(-1).sql, /races_sprint_race_results/);
    assert.match(calls.at(-1).sql, /races\.sprintRaceDate/);
    assert.equal(result.fact.rows.find(row => row.label === 'Points').value, 3);
});

test('latest Alpine answer uses the database calendar day and natural Grand Prix wording', async () => {
    const connection = { query: async sql => sql.includes('FROM constructors ORDER BY name')
        ? [{ id: 'alpine', name: 'Alpine' }]
        : [{ id: 'spain-2026', name: 'Spanish Grand Prix', year: 2026, round: 14,
            date: new Date(2026, 8, 13), sessionDate: new Date(2026, 8, 13),
            sessionName: 'Grand Prix', points: 6 }] };
    const result = await calculateLatestTeamPoints(connection, { series: 'f1', subjectName: 'Alpine' });
    assert.equal(result.answer, 'Alpine last scored 6 Formula 1 points at the Spanish Grand Prix on 2026-09-13.');
    assert.equal(result.fact.rows.find(row => row.label === 'Date').value, '2026-09-13');
});

test('latest sprint points use the sprint date rather than the Grand Prix date', async () => {
    const connection = { query: async sql => sql.includes('FROM constructors ORDER BY name')
        ? [{ id: 'alpine', name: 'Alpine' }]
        : [{ id: 'miami-2025', name: 'Miami Grand Prix', year: 2025, round: 6,
            date: new Date(2025, 4, 4), sessionDate: new Date(2025, 4, 3),
            sessionName: 'Sprint', points: 1 }] };
    const result = await calculateLatestTeamPoints(connection, { series: 'f1', subjectName: 'Alpine' });
    assert.match(result.answer, /in the sprint at the Miami Grand Prix on 2025-05-03\./);
});

test('new chronology questions preserve the requested calculation and reject a dropped circuit filter', () => {
    for (const [query, intent] of [
        ['Where was the first grand prix of 2025 held', 'season_opener'],
        ['When did schumacher make his debut', 'driver_debut'],
        ['what was the last time alpine scored points', 'latest_team_points']
    ]) assert.equal(interpretLocally(query).intent, intent, query);
    const scoped = interpretLocally('When did Alpine last score points at Monaco?');
    assert.equal(scoped.intent, 'unsupported');
    assert.ok(scoped.unsupportedQualifiers.length);
    const season = interpretLocally('When did Alpine last score points in 2024?');
    assert.equal(season.intent, 'unsupported');
    assert.ok(season.unsupportedQualifiers.includes('a season filter'));
});

test('semantic debut fallback retains a driver name across different wording', () => {
    for (const query of [
        'When did Prost debut?',
        'Prost debut date',
        'When was Prost’s debut?',
        'When did Prost first race?',
        'When did Prost first appear?',
        'When did Alain Prost debut?'
    ]) {
        const result = interpretLocally(query);
        assert.equal(result.intent, 'driver_debut', query);
        assert.equal(result.subjectName, query.includes('Alain') ? 'Alain Prost' : 'Prost', query);
    }
    assert.equal(interpretLocally('Where was the first Grand Prix of 2025 held?').intent, 'season_opener');
});

test('semantic debut fallback asks for a name and refuses unapplied qualifiers', () => {
    const missing = interpretLocally('When was the debut?');
    assert.equal(missing.intent, 'unsupported');
    assert.ok(missing.missingFields.includes('subjectName'));
    assert.equal(interpretLocally('Which driver debuted first?').intent, 'unsupported');
    assert.equal(interpretLocally('When did the first race start?').subjectName, null);
    for (const [query, qualifier] of [
        ['When did Prost debut at Spa?', 'a circuit or country filter'],
        ['When did Prost debut in 2024?', 'a season filter'],
        ['When did Prost make his debut for McLaren?', 'a team, time, or condition filter'],
        ['When did Prost first appear on a Sunday?', 'a team, time, or condition filter']
    ]) {
        const result = interpretLocally(query);
        assert.equal(result.intent, 'unsupported', query);
        assert.ok(result.unsupportedQualifiers.includes(qualifier), query);
    }
});

test('semantic fallback also maps latest team points wording to a named team', () => {
    for (const query of ["Alpine's latest points finish?", 'Latest points for Alpine?', 'When did Alpine most recently score points?']) {
        const result = interpretLocally(query);
        assert.equal(result.intent, 'latest_team_points', query);
        assert.equal(result.subjectName, 'Alpine', query);
    }
    const scoped = interpretLocally("Alpine's latest points finish at Spa?");
    assert.equal(scoped.intent, 'unsupported');
    assert.ok(scoped.unsupportedQualifiers.includes('a circuit or country filter'));
});

test('a debut surname from the semantic fallback still goes through identity resolution', async () => {
    const parsed = interpretLocally('When did Schumacher debut?');
    const connection = { query: async () => [
        { id: 'michael-schumacher', name: 'Michael Schumacher' },
        { id: 'ralf-schumacher', name: 'Ralf Schumacher' }
    ] };
    await assert.rejects(
        () => calculateDriverDebut(connection, { series: 'f1', subjectName: parsed.subjectName }),
        error => error.statusCode === 422 && /more than one name/.test(error.message)
    );
});
