const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { ANSWER_CATALOG, answerForPath } = require('../backend/ask-answer-catalog');
const { applySeo, renderSitemap } = require('../backend/seo');
const { answerMap, readSnapshot, renderAnswerPage } = require('../backend/ask-answer-pages');
const { pool } = require('../backend/route-helpers');

const snapshot = readSnapshot();

test.after(() => pool.end());

function get(server, pathname) {
    return new Promise((resolve, reject) => {
        const request = http.get({ port: server.address().port, path: pathname }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
        });
        request.on('error', reject);
    });
}

test('curated Ask answer catalog has unique, series-aware canonical paths', () => {
    assert.equal(ANSWER_CATALOG.length, 33);
    assert.equal(new Set(ANSWER_CATALOG.map(entry => entry.path)).size, ANSWER_CATALOG.length);
    assert.equal(answerForPath('/answers/who-has-the-most-formula-1-race-wins')?.series, 'f1');
    assert.equal(answerForPath('/f2/answers/who-has-the-most-formula-2-race-wins')?.series, 'f2');
    assert.equal(answerForPath('/answers/not-curated'), null);
});

test('generated Ask answers all contain a direct answer and supporting evidence', () => {
    assert.ok(snapshot.generatedAt);
    assert.equal(snapshot.pages.length, ANSWER_CATALOG.length);
    assert.equal(answerMap(snapshot).size, snapshot.pages.length);
    for (const page of snapshot.pages) {
        assert.ok(page.result.answer.length >= 20, page.path);
        assert.ok(page.result.record.entries.length > 0, page.path);
        assert.ok(page.result.methodology.source, page.path);
    }
});

test('Ask answer renderer emits visible evidence, internal links, and indexable SEO', () => {
    const page = snapshot.pages[0];
    const html = renderAnswerPage(page, snapshot);
    assert.match(html, new RegExp(`<h1>${page.question.replace('?', '\\?')}</h1>`));
    assert.match(html, /Supporting ranking/);
    assert.match(html, /How this answer was calculated/);
    assert.match(html, /Related questions/);
    assert.match(html, /href="\/drivers\//);

    const seo = applySeo(html, page.path, {}, {
        title: `${page.question} · Racelytic`,
        description: page.result.answer,
        robots: 'index, follow',
        initialContent: { kind: 'ask-answer', question: page.question, answer: page.result.answer,
            dateModified: snapshot.generatedAt }
    });
    assert.match(seo, /name="robots" content="index, follow"/);
    assert.match(seo, new RegExp(`rel="canonical" href="https:\\/\\/racelytic\\.com${page.path.replaceAll('/', '\\/')}"`));
    assert.match(seo, /"@type":"Question"/);
    assert.match(seo, /"acceptedAnswer":\{"@type":"Answer"/);
    assert.match(renderSitemap([page.path]), new RegExp(page.path));
});

test('generated Ask answer URL is served without exposing an answer index page', async () => {
    const app = require('../backend/server');
    const server = app.listen(0);
    try {
        const page = snapshot.pages[0];
        const response = await get(server, page.path);
        assert.equal(response.status, 200);
        assert.match(response.headers['cache-control'], /public/);
        assert.match(response.body, new RegExp(`<h1>${page.question.replace('?', '\\?')}</h1>`));

        const index = await get(server, '/answers');
        assert.equal(index.status, 404);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
