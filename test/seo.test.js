const test = require('node:test');
const assert = require('node:assert/strict');
const { applySeo, canonicalPath, metadataFor, renderRobots, renderSitemap } = require('../backend/seo');

const fixture = `<!doctype html><html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Old description">
  <title>Racelytic</title>
</head><body></body></html>`;

test('SEO metadata creates descriptive series-aware titles', () => {
    assert.equal(metadataFor('/f2/season-analysis').title, 'Season Analysis · Formula 2 · Racelytic');
    assert.match(metadataFor('/academy/drivers').description, /F1 Academy archive/);
    assert.notEqual(metadataFor('/analysis').title, 'Racelytic');
});

test('detail canonicals retain only their identity parameter', () => {
    assert.equal(canonicalPath('/season', { year: '2025', source: 'share' }), '/season?year=2025');
    assert.equal(canonicalPath('/driver', { id: 'max-verstappen', utm_source: 'test' }), '/driver?id=max-verstappen');
    assert.equal(canonicalPath('/races', { year: '2025' }), '/races');
});

test('detail slugs produce useful server-rendered sharing titles', () => {
    assert.equal(metadataFor('/driver', { id: 'max-verstappen' }).title, 'Max Verstappen Driver · Formula 1 · Racelytic');
    assert.equal(metadataFor('/f3/circuit', { id: 'spa-francorchamps' }).title, 'Spa Francorchamps Circuit · Formula 3 · Racelytic');
});

test('SEO injection replaces stale tags and adds canonical, Open Graph and Twitter metadata', () => {
    const html = applySeo(fixture, '/f2/races');
    assert.match(html, /<title>Races · Formula 2 · Racelytic<\/title>/);
    assert.equal((html.match(/name="description"/g) || []).length, 1);
    assert.match(html, /rel="canonical" href="https:\/\/racelytic\.com\/f2\/races"/);
    assert.match(html, /property="og:title"/);
    assert.match(html, /property="og:image" content="https:\/\/racelytic\.com\/assets\/social-card\.png"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
});

test('empty detail and utility pages are not indexed', () => {
    assert.equal(metadataFor('/race').robots, 'noindex, follow');
    assert.equal(metadataFor('/account').robots, 'noindex, follow');
    assert.equal(metadataFor('/race', { id: '1139' }).robots, 'index, follow');
});

test('robots and sitemap advertise crawlable canonical pages only', () => {
    assert.match(renderRobots(), /Sitemap: https:\/\/racelytic\.com\/sitemap\.xml/);
    const sitemap = renderSitemap(['/', '/races', '/race', '/account', '/f2/races']);
    assert.match(sitemap, /<loc>https:\/\/racelytic\.com\/f2\/races<\/loc>/);
    assert.doesNotMatch(sitemap, /\/account<\/loc>/);
    assert.doesNotMatch(sitemap, /\/race<\/loc>/);
});
