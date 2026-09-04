const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MemoryRateLimiter } = require('../backend/rate-limit');

const root = path.join(__dirname, '..');

test('bounded rate limiter expires windows and enforces its threshold', () => {
    const limiter = new MemoryRateLimiter({ windowMs: 1000, limit: 2, maxEntries: 2 });
    const originalNow = Date.now;
    let now = 100;
    Date.now = () => now;
    try {
        assert.equal(limiter.consume('one'), false);
        assert.equal(limiter.consume('one'), false);
        assert.equal(limiter.consume('one'), true);
        now = 1200;
        assert.equal(limiter.consume('one'), false);
        limiter.consume('two');
        limiter.consume('three');
        assert.ok(limiter.entries.size <= 2);
    } finally {
        Date.now = originalNow;
    }
});

test('chart tooltips never reparse dataset values as HTML', () => {
    const files = ['circuit-analysis.js', 'season-comparison.js', 'f2-season-analysis.js'];
    for (const file of files) {
        const source = fs.readFileSync(path.join(root, 'frontend/js', file), 'utf8');
        assert.doesNotMatch(source, /innerHTML\s*=\s*element\.dataset\.chartTooltip/);
        assert.match(source, /renderChartTooltip/);
    }
    const utilities = fs.readFileSync(path.join(root, 'frontend/js/utils.js'), 'utf8');
    assert.match(utilities, /node\.textContent = value/);
});

test('account bootstrapping uses an external script for strict CSP compatibility', () => {
    const html = fs.readFileSync(path.join(root, 'frontend/account.html'), 'utf8');
    assert.match(html, /src="\/js\/account-context\.js"/);
    assert.doesNotMatch(html, /<script>\s*/);
});
