const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
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
        '/api/analytics/heartbeat',
        '/api/analytics/report',
        '/api/analytics/visit',
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
        '/api/search',
        '/api/seasons',
        '/api/seasons/:year',
        '/api/series-equivalent'
    ]);
});

test('same-origin writes accept HTTPS forwarded by the local reverse proxy', async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });

    try {
        const { port } = server.address();
        const response = await new Promise((resolve, reject) => {
            const request = http.request({
                hostname: '127.0.0.1',
                port,
                path: '/api/account/register',
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    host: 'racelytic.com',
                    origin: 'https://racelytic.com',
                    'x-forwarded-proto': 'https'
                }
            }, incoming => {
                let body = '';
                incoming.setEncoding('utf8');
                incoming.on('data', chunk => { body += chunk; });
                incoming.on('end', () => resolve({ status: incoming.statusCode, body: JSON.parse(body) }));
            });
            request.on('error', reject);
            request.end('{}');
        });

        assert.notEqual(response.body.error, 'Invalid request origin.');
        assert.equal(response.status, 400);
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});

test('public pages use extensionless URLs and preserve legacy query strings', async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });

    const request = (port, path) => new Promise((resolve, reject) => {
        http.get({ hostname: '127.0.0.1', port, path }, response => {
            response.resume();
            response.once('end', () => resolve(response));
        }).once('error', reject);
    });

    try {
        const { port } = server.address();
        const clean = await request(port, '/driver?id=max-verstappen');
        const legacy = await request(port, '/driver.html?id=max-verstappen');
        const privacy = await request(port, '/privacy');
        const terms = await request(port, '/terms');

        assert.equal(clean.statusCode, 200);
        assert.equal(legacy.statusCode, 308);
        assert.equal(legacy.headers.location, '/driver?id=max-verstappen');
        assert.equal(privacy.statusCode, 200);
        assert.equal(terms.statusCode, 200);
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});
