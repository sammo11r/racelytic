const test = require('node:test');
const assert = require('node:assert/strict');
const { matchResourcePath, resourcePath, slugify } = require('../backend/resource-routes');

test('resource paths are readable, series-aware and safely encoded', () => {
    assert.equal(resourcePath('f1', 'driver', 'max-verstappen'), '/drivers/max-verstappen');
    assert.equal(resourcePath('f2', 'season', 2025), '/f2/seasons/2025');
    assert.equal(resourcePath('academy', 'team', 'mp motorsport'), '/academy/teams/mp%20motorsport');
    assert.equal(resourcePath('f1', 'race', 1139, 'Hungarian Grand Prix'), '/races/1139/hungarian-grand-prix');
});

test('resource route parsing preserves stable IDs and optional race slugs', () => {
    assert.deepEqual(matchResourcePath('/drivers/max-verstappen'), {
        series: 'f1', resource: 'driver', id: 'max-verstappen', slug: ''
    });
    assert.deepEqual(matchResourcePath('/f3/races/42/monaco-feature-race'), {
        series: 'f3', resource: 'race', id: '42', slug: 'monaco-feature-race'
    });
    assert.equal(matchResourcePath('/drivers/id/unexpected'), null);
});

test('race slugs normalize punctuation and accents deterministically', () => {
    assert.equal(slugify('São Paulo Grand Prix'), 'sao-paulo-grand-prix');
    assert.equal(slugify('  Race #2 — Feature  '), 'race-2-feature');
});
