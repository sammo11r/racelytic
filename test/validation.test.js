const test = require('node:test');
const assert = require('node:assert/strict');
const { optionalInteger, integerOrDefault } = require('../backend/validation');

test('optionalInteger accepts bounded integers', () => {
    assert.equal(optionalInteger('2025', { min: 1950, max: 9999 }), 2025);
});

test('optionalInteger rejects fractions, text, and out-of-range values', () => {
    assert.equal(optionalInteger('1.5'), null);
    assert.equal(optionalInteger('abc'), null);
    assert.equal(optionalInteger('1949', { min: 1950 }), null);
});

test('integerOrDefault uses a safe default for invalid input', () => {
    assert.equal(integerOrDefault('1.5', 100, { min: 1, max: 500 }), 100);
    assert.equal(integerOrDefault('500', 100, { min: 1, max: 500 }), 500);
});
