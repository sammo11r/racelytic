const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, parseCookies, tokenHash } = require('../backend/auth');
const pool = require('../backend/db');

test.after(async () => pool.end());

test('password hashes are salted and verifiable', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');
    assert.notEqual(first, second);
    assert.equal(await verifyPassword('correct horse battery staple', first), true);
    assert.equal(await verifyPassword('incorrect password', first), false);
});

test('session tokens are stored as deterministic hashes', () => {
    assert.equal(tokenHash('secret'), tokenHash('secret'));
    assert.notEqual(tokenHash('secret'), 'secret');
});

test('cookie parser reads named cookies', () => {
    assert.deepEqual(parseCookies('theme=dark; racelytics_session=abc123'), {
        theme: 'dark',
        racelytics_session: 'abc123'
    });
});
