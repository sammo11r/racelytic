const test = require('node:test');
const assert = require('node:assert/strict');
const { consolidate } = require('../scripts/consolidate-css');

test('CSS consolidation keeps the final exact duplicate rule', () => {
    const source = '.card { color: red; }\n.other { color: blue; }\n.card { color: red; }\n';
    const output = consolidate(source);
    assert.equal((output.match(/\.card/g) || []).length, 1);
    assert.match(output, /\.other/);
});

test('CSS consolidation does not merge rules with different declarations', () => {
    const source = '.card { color: red; }\n.card { color: blue; }\n';
    assert.equal(consolidate(source), source);
});
