const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderPageShell } = require('../backend/page-shell');

const frontend = path.join(__dirname, '../frontend');

test('shared page shell preserves page assets and body attributes', () => {
    const input = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page</title><link rel="stylesheet" href="/css/style.css"></head><body class="f2-mode"><div id="header"></div><main>Content</main><footer class="footer"><div class="container">Racelytic</div></footer><script src="/js/page.js"></script></body></html>';
    const output = renderPageShell(input);
    assert.equal((output.match(/meta name="viewport"/g) || []).length, 1);
    assert.match(output, /<html lang="en">/);
    assert.match(output, /<body class="f2-mode">/);
    assert.match(output, /href="\/css\/components\.css"/);
    assert.match(output, /<main>Content<\/main>/);
    assert.match(output, /src="\/js\/page\.js"/);
    assert.match(output, /<div id="header">\s*<header class="site-header">/);
    assert.match(output, /<footer class="footer">\s*<div class="container footer-content">/);
    assert.ok(output.indexOf('class="footer-content"') < output.indexOf('src="/js/page.js"'));
    assert.doesNotMatch(output, /<div id="header"><\/div>/);
    assert.doesNotMatch(output, /<footer class="footer"><div class="container">Racelytic<\/div><\/footer>/);
    assert.doesNotMatch(output, /\{\{year\}\}/);
});

test('shared page shell does not duplicate its component stylesheet', () => {
    const input = '<html><head><title>Page</title><link rel="stylesheet" href="/css/components.css"></head><body></body></html>';
    const output = renderPageShell(input);
    assert.equal((output.match(/\/css\/components\.css/g) || []).length, 1);
});

test('shared page shell emits one copy of the global chrome', () => {
    const input = '<html><head><title>Page</title></head><body><div id="header"></div><main>Content</main><footer class="footer"><div>Fallback</div></footer></body></html>';
    const output = renderPageShell(input);
    assert.equal((output.match(/class="site-header"/g) || []).length, 1);
    assert.equal((output.match(/\bfooter-content\b/g) || []).length, 1);
});

test('every page receives global chrome without runtime component fetches', () => {
    const pageFiles = [
        ...fs.readdirSync(frontend).filter(file => file.endsWith('.html')).map(file => path.join(frontend, file)),
        ...fs.readdirSync(path.join(frontend, 'templates'))
            .filter(file => file.endsWith('.html') && file !== 'page-shell.html')
            .map(file => path.join(frontend, 'templates', file))
    ];

    for (const file of pageFiles) {
        const output = renderPageShell(fs.readFileSync(file, 'utf8'));
        assert.equal((output.match(/class="site-header"/g) || []).length, 1, path.basename(file));
        assert.equal((output.match(/\bfooter-content\b/g) || []).length, 1, path.basename(file));
    }

    const navigation = fs.readFileSync(path.join(frontend, 'js/navigation.js'), 'utf8');
    const privacy = fs.readFileSync(path.join(frontend, 'js/privacy.js'), 'utf8');
    assert.doesNotMatch(navigation, /fetch\(['"]\/components\/header\.html/);
    assert.doesNotMatch(privacy, /fetch\(['"]\/components\/footer\.html/);
});
