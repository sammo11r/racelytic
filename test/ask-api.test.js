const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { createAskRouter } = require('../backend/routes/ask');
const { pool } = require('../backend/route-helpers');

test.after(async () => {
    await pool.end();
});

function post(server, path, body, headers = {}) {
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const request = http.request({
            hostname: '127.0.0.1',
            port: server.address().port,
            path,
            method: 'POST',
            headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers }
        }, response => {
            let text = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { text += chunk; });
            response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(text) }));
        });
        request.on('error', reject);
        request.end(payload);
    });
}

async function withAskApi(options, callback) {
    const app = express();
    app.use(express.json());
    app.use(createAskRouter({ limiter: { consume: () => false }, connect: task => task({}), ...options }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    try {
        await callback(server);
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}

test('Ask API returns a stable record response and applies confirmed edits', async () => {
    let executed;
    await withAskApi({
        execute: async (connection, interpretation) => {
            executed = interpretation;
            return {
                intent: 'record_leader', entity: interpretation.entity, entityLabel: 'Constructors',
                answer: 'Ferrari leads.', assumptions: [],
                record: { label: 'Podiums', total: 1, entries: [] }
            };
        }
    }, async server => {
        const response = await post(server, '/api/ask', {
            query: 'Who has the most Formula 1 race wins?',
            interpretation: { entity: 'drivers', recordCategory: 'podiums', constructorName: 'Ferrari', fromYear: 2024, toYear: 2024 }
        });
        assert.equal(response.status, 200);
        assert.equal(executed.recordCategory, 'podiums');
        assert.equal(executed.constructorName, 'Ferrari');
        assert.equal(executed.fromYear, 2024);
        assert.equal(response.body.interpretation.entity, 'drivers');
        assert.equal(response.body.interpretation.constructorName, 'Ferrari');
        assert.deepEqual(response.body.options.recordCategories.map(category => category.id), [
            'wins', 'podiums', 'poles', 'fastestLaps', 'starts', 'points', 'gridGain',
            'averageFinish', 'finishRate', 'winRate', 'podiumRate', 'dnfs', 'championships'
        ]);

        const preserved = await post(server, '/api/ask', {
            query: 'Who has the most wins since 2010?',
            interpretation: { entity: 'constructors', recordCategory: 'wins' }
        });
        assert.equal(preserved.status, 200);
        assert.equal(executed.fromYear, 2010);

        const clearedFormat = await post(server, '/api/ask', {
            query: 'Who has the most wins in sprint races only?',
            interpretation: { entity: 'drivers', recordCategory: 'wins', raceFormat: '' }
        });
        assert.equal(clearedFormat.status, 200);
        assert.equal(executed.raceFormat, null);
    });
});

test('Ask API carries the selected championship into execution', async () => {
    let executed;
    await withAskApi({
        execute: async (connection, interpretation) => {
            executed = interpretation;
            return { intent: 'record_leader', entity: 'drivers', entityLabel: 'Drivers', answer: 'Answer', assumptions: [], record: { label: 'Wins', total: 0, entries: [] } };
        }
    }, async server => {
        const response = await post(server, '/api/ask', { query: 'Who has the most Formula 2 race wins?', series: 'f2' });
        assert.equal(response.status, 200);
        assert.equal(executed.series, 'f2');
        assert.equal(response.body.interpretation.series, 'Formula 2');
        assert.deepEqual(response.body.options.pointsSystems, []);

        const unsupported = await post(server, '/api/ask', { query: 'Who wins the 2020 championship under 1991 rules?', series: 'f2' });
        assert.equal(unsupported.status, 422);
        assert.match(unsupported.body.error, /Formula 2 archive record questions/);
        assert.equal(unsupported.body.suggestedAction.url, '/f2/simulate-season?year=2020');
    });
});

test('Ask API rejects invalid ranges, cross-origin requests and excess traffic', async () => {
    await withAskApi({ execute: async () => { throw new Error('executor should not run'); } }, async server => {
        const range = await post(server, '/api/ask', {
            query: 'Who has the most wins from 2020 to 2025?',
            interpretation: { entity: 'drivers', recordCategory: 'wins', fromYear: 2025, toYear: 2020 }
        });
        assert.equal(range.status, 400);
        assert.match(range.body.error, /end season/);

        const crossOrigin = await post(server, '/api/ask', { query: 'Who has the most race wins?' }, { origin: 'https://example.com' });
        assert.equal(crossOrigin.status, 403);
    });

    let attempts = 0;
    await withAskApi({
        limiter: { consume: () => ++attempts > 1 },
        execute: async (connection, interpretation) => ({
            intent: interpretation.intent, entity: 'drivers', entityLabel: 'Drivers', answer: 'Answer', assumptions: [],
            record: { label: 'Wins', total: 0, entries: [] }
        })
    }, async server => {
        assert.equal((await post(server, '/api/ask', { query: 'Who has the most race wins?' })).status, 200);
        const limited = await post(server, '/api/ask', { query: 'Who has the most race wins?' });
        assert.equal(limited.status, 429);
        assert.equal(limited.headers['retry-after'], '300');
    });
});

test('Ask API detects series mismatches and carries follow-up context', async () => {
    let executed;
    let executions = 0;
    await withAskApi({ execute: async (connection, interpretation) => {
        executions++;
        executed = interpretation;
        return { intent: 'record_leader', entity: interpretation.entity, entityLabel: 'Drivers', answer: 'Answer', assumptions: [], record: { label: 'Wins', total: 0, entries: [] } };
    } }, async server => {
        const mismatch = await post(server, '/api/ask', { query: 'Who has the most Formula 3 wins?', series: 'f2' });
        assert.equal(mismatch.status, 409);
        assert.equal(mismatch.body.seriesMismatch.requested, 'f3');
        assert.match(mismatch.body.seriesMismatch.url, /^\/f3\/ask\?/);

        const followUp = await post(server, '/api/ask', {
            query: 'Only since 2022', series: 'f2',
            context: { intent: 'record_leader', entity: 'drivers', recordCategory: 'wins', fromYear: null, toYear: null }
        });
        assert.equal(followUp.status, 200);
        assert.equal(executed.recordCategory, 'wins');
        assert.equal(executed.fromYear, 2022);
        assert.equal(executed.confidence, 'contextual');

        const formatFollowUp = await post(server, '/api/ask', {
            query: 'Only sprint races', series: 'f2',
            context: { intent: 'record_leader', entity: 'drivers', recordCategory: 'wins', raceFormat: null }
        });
        assert.equal(formatFollowUp.status, 200);
        assert.equal(executed.raceFormat, 'S');

        const unrelated = await post(server, '/api/ask', {
            query: 'What is the weather tomorrow?', series: 'f2',
            context: { intent: 'record_leader', entity: 'drivers', recordCategory: 'wins' }
        });
        assert.equal(unrelated.status, 422);
        assert.equal(executions, 2);
    });
});

test('Ask API accepts editable comparison slots and returns slot-aware suggestions', async () => {
    let executed;
    await withAskApi({ execute: async (connection, interpretation) => {
        executed = interpretation;
        return {
            intent: 'driver_head_to_head', entity: 'drivers', entityLabel: 'Drivers', answer: 'Alonso leads.', assumptions: [],
            comparison: { drivers: [], meetings: null, scope: interpretation.comparisonScope, metric: interpretation.comparisonMetric, details: [] }
        };
    } }, async server => {
        const response = await post(server, '/api/ask', {
            query: 'Who has more podiums, Alonso or Vettel?',
            interpretation: {
                intent: 'driver_head_to_head', subjectNames: ['Fernando Alonso', 'Sebastian Vettel'],
                comparisonMetric: 'podiums', comparisonScope: 'career', fromYear: 2010, toYear: 2020
            }
        });
        assert.equal(response.status, 200);
        assert.deepEqual(executed.subjectNames, ['Fernando Alonso', 'Sebastian Vettel']);
        assert.equal(executed.comparisonMetric, 'podiums');
        assert.equal(executed.comparisonScope, 'career');
        assert.deepEqual([executed.fromYear, executed.toYear], [2010, 2020]);
    });

    const ambiguous = new Error('“Smith” matches more than one name.');
    ambiguous.statusCode = 422;
    ambiguous.suggestions = [{ id: 'a-smith', name: 'Alex Smith', entity: 'drivers' }];
    ambiguous.suggestionField = 'subjectNames';
    ambiguous.suggestionIndex = 1;
    ambiguous.originalName = 'Smith';
    await withAskApi({ execute: async () => { throw ambiguous; } }, async server => {
        const response = await post(server, '/api/ask', { query: 'Compare Jones and Smith' });
        assert.equal(response.status, 422);
        assert.deepEqual(response.body.suggestionContext, { field: 'subjectNames', index: 1, originalName: 'Smith' });
    });
});

test('Ask API carries comparison context through natural follow-up refinements', async () => {
    let executed;
    await withAskApi({ execute: async (connection, interpretation) => {
        executed = interpretation;
        return {
            intent: 'driver_head_to_head', entity: 'drivers', entityLabel: 'Drivers', answer: 'Answer', assumptions: [],
            comparison: {
                drivers: [], meetings: 0, scope: interpretation.comparisonScope, metric: interpretation.comparisonMetric, details: [],
                filters: {
                    circuit: interpretation.circuitName ? { name: interpretation.circuitName } : null,
                    venueCountry: interpretation.venueCountryName ? { name: interpretation.venueCountryName } : null
                }
            }
        };
    } }, async server => {
        const context = {
            intent: 'driver_head_to_head', entity: 'drivers', subjectNames: ['Lewis Hamilton', 'Max Verstappen'],
            comparisonMetric: 'wins', comparisonScope: 'career', fromYear: null, toYear: null
        };
        const qualifying = await post(server, '/api/ask', { query: 'Now compare qualifying', context });
        assert.equal(qualifying.status, 200);
        assert.deepEqual(executed.subjectNames, context.subjectNames);
        assert.equal(executed.comparisonMetric, 'qualifying');

        const circuit = await post(server, '/api/ask', { query: 'At Monaco', context });
        assert.equal(circuit.status, 200);
        assert.equal(executed.circuitName, 'Monaco');

        const replacement = await post(server, '/api/ask', { query: 'What about Fernando Alonso?', context });
        assert.equal(replacement.status, 200);
        assert.deepEqual(executed.subjectNames, ['Lewis Hamilton', 'Fernando Alonso']);
    });
});

test('Ask API refuses a broader answer when execution drops a requested scope', async () => {
    await withAskApi({ execute: async () => ({
        intent: 'record_leader', entity: 'drivers', entityLabel: 'Drivers', answer: 'Unscoped answer',
        scope: {}, assumptions: [], record: { entries: [] }
    }) }, async server => {
        const response = await post(server, '/api/ask', { query: 'Who has the most wins at Monaco?' });
        assert.equal(response.status, 422);
        assert.match(response.body.error, /requested circuit scope/);
        assert.match(response.body.error, /broader answer was not returned/);
    });
});
