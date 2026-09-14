const test = require('node:test');
const assert = require('node:assert/strict');
const { AskConversationStore, validConversationId } = require('../backend/ask-conversations');
const { evidenceCount, executeAskTool, toolForIntent } = require('../backend/ask-tools');

test('Ask conversations retain bounded structured context without a database', () => {
    const store = new AskConversationStore({ ttlMs: 60_000, maxTurns: 2 });
    const first = store.remember({
        series: 'f1', query: 'Who has the most wins?', answer: 'Hamilton leads.',
        context: { intent: 'record_leader', recordCategory: 'wins' }, tool: 'find_records'
    });
    assert.equal(validConversationId(first.id), true);
    assert.equal(store.get(first.id, 'f1').context.recordCategory, 'wins');
    assert.equal(store.get(first.id, 'f2'), null);

    const second = store.remember({
        id: first.id, series: 'f1', query: 'Only since 2020', answer: 'Verstappen leads.',
        context: { intent: 'record_leader', recordCategory: 'wins', fromYear: 2020 }, tool: 'find_records'
    });
    store.remember({
        id: first.id, series: 'f1', query: 'Show constructors', answer: 'Mercedes leads.',
        context: { intent: 'record_leader', entity: 'constructors', recordCategory: 'wins' }, tool: 'find_records'
    });
    const publicView = store.publicView(second);
    assert.equal(publicView.turns.length, 2);
    assert.equal(publicView.turns.at(-1).query, 'Show constructors');
    assert.equal(Object.hasOwn(publicView, 'context'), false);
    assert.equal(store.delete(first.id), true);
});

test('Ask tools expose a grounded execution trace and evidence count', async () => {
    assert.equal(toolForIntent('race_result').id, 'get_race_result');
    assert.equal(evidenceCount({ classifications: [{ entries: [{}, {}] }, { entries: [{}] }] }), 3);
    const execution = await executeAskTool({}, { intent: 'record_leader' }, async () => ({
        answer: 'Answer', record: { entries: [{}, {}] }
    }));
    assert.equal(execution.grounding.grounded, true);
    assert.equal(execution.grounding.tool, 'find_records');
    assert.equal(execution.grounding.evidenceItems, 2);
});
