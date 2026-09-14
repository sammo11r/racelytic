const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { INTENT_CATALOG } = require('../backend/ask-intents');
const { interpretLocally } = require('../backend/ask-interpreter');
const { localModelCandidates, LOCAL_PLANNER_VERSION } = require('../backend/ask-local-fallback');

const wrappers = [
    question => question,
    question => `Please, ${question}`,
    question => `Quick question: ${question}`,
    question => `Racelytic, ${question}`,
    question => `Can you answer this: ${question}`,
    question => `I want to know: ${question}`,
    question => `Could you check this: ${question}`,
    question => `For me, ${question}`,
    question => `History question: ${question}`,
    question => `Just curious: ${question}`,
    question => question.replace(/[?!.]+$/, '.'),
    question => question.toLowerCase(),
    question => question.toUpperCase(),
    question => `  ${question.replace(/\s+/g, '  ')}  `,
    question => question.replace(/\bFormula 1\b/gi, 'F1')
];

const evaluationCorpus = INTENT_CATALOG.flatMap(intent => wrappers.map(transform => ({
    intent: intent.id,
    query: transform(intent.examples[0])
})));

test('local planner evaluation corpus covers 270 conversational questions', () => {
    assert.equal(evaluationCorpus.length, 270);
    evaluationCorpus.forEach(({ intent, query }) => {
        assert.equal(interpretLocally(query).intent, intent, query);
    });
});

test('local statistical model handles flexible language and rejects unrelated requests', () => {
    const flexible = [
        ['Career victory leaderboard', 'record_leader'],
        ['Pull up the season table for 2024', 'season_standings'],
        ['Give me a recap of the 2012 campaign', 'season_summary'],
        ['Career bio for Fernando Alonso', 'driver_profile'],
        ['Define countback in racing', 'motorsport_explanation'],
        ['Put Hamilton against Verstappen', 'driver_head_to_head']
    ];
    flexible.forEach(([query, intent]) => assert.equal(interpretLocally(query).intent, intent, query));
    assert.equal(localModelCandidates('What is the weather forecast tomorrow?').length, 0);
    assert.match(LOCAL_PLANNER_VERSION, /^racelytic-intent-nb-v\d+$/);
});

test('Ask language planning contains no external API client or network call', () => {
    const files = ['ask-local-fallback.js', 'ask-interpreter.js', 'ask-conversations.js', 'ask-tools.js'];
    const source = files.map(file => fs.readFileSync(path.join(__dirname, '../backend', file), 'utf8')).join('\n');
    assert.doesNotMatch(source, /\brequire\(['"]openai['"]\)|\bapi\.openai\.com\b|\bfetch\s*\(|\bhttps?\.request\s*\(/i);
});
