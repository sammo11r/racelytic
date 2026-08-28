const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPageShell } = require('../backend/page-shell');

test('shared page shell preserves page assets and body attributes', () => {
    const input = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page</title><link rel="stylesheet" href="/css/style.css"></head><body class="f2-mode"><main>Content</main><script src="/js/page.js"></script></body></html>';
    const output = renderPageShell(input);
    assert.equal((output.match(/meta name="viewport"/g) || []).length, 1);
    assert.match(output, /<html lang="en">/);
    assert.match(output, /<body class="f2-mode">/);
    assert.match(output, /href="\/css\/components\.css"/);
    assert.match(output, /<main>Content<\/main>/);
    assert.match(output, /src="\/js\/page\.js"/);
});

test('shared page shell does not duplicate its component stylesheet', () => {
    const input = '<html><head><title>Page</title><link rel="stylesheet" href="/css/components.css"></head><body></body></html>';
    const output = renderPageShell(input);
    assert.equal((output.match(/\/css\/components\.css/g) || []).length, 1);
});
