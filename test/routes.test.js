const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../backend/server');
const pool = require('../backend/db');

test.after(async () => {
    await pool.end();
});

test('all public API routes remain registered after modularization', () => {
    const routes = [];

    for (const layer of app.router.stack) {
        if (!layer.handle?.stack) continue;
        for (const child of layer.handle.stack) {
            if (child.route) routes.push(child.route.path);
        }
    }

    assert.deepEqual(routes.sort(), [
        '/api/account',
        '/api/account/login',
        '/api/account/logout',
        '/api/account/register',
        '/api/chassis',
        '/api/circuits',
        '/api/circuits/:id',
        '/api/circuits/:id/analysis',
        '/api/constructors',
        '/api/constructors/:id',
        '/api/custom-championships',
        '/api/custom-championships',
        '/api/custom-championships/:id',
        '/api/custom-championships/:id',
        '/api/custom-championships/:id',
        '/api/dashboard',
        '/api/drivers',
        '/api/drivers/:id',
        '/api/drivers/:id/form',
        '/api/drivers/:id/teammates',
        '/api/drivers/compare',
        '/api/games/race-winners',
        '/api/games/race-winners/guess',
        '/api/games/world-champions',
        '/api/games/world-champions/guess',
        '/api/health',
        '/api/points-systems',
        '/api/points-systems',
        '/api/points-systems/:id',
        '/api/points-systems/:id',
        '/api/races',
        '/api/races/:id',
        '/api/records/explore',
        '/api/records/saved',
        '/api/records/saved',
        '/api/records/saved/:id',
        '/api/seasons',
        '/api/seasons/:year'
    ]);
});
