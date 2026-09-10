const test = require('node:test');
const assert = require('node:assert/strict');
const { applySeo, canonicalPath, entityPageTitle, metadataFor, publicEntityName, renderRobots, renderSitemap, renderStructuredData } = require('../backend/seo');

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
    assert.match(metadataFor('/f2/season-analysis').description, /championship progression race by race/);
    assert.match(metadataFor('/f3/race-analysis').description, /grid movement, finishing positions, attrition and team performance/);
    assert.match(metadataFor('/academy/circuit-analysis').description, /circuit specialists, winner trends, reliability/);
    assert.doesNotMatch(metadataFor('/f2/season-analysis').description, /across the Formula 2 archive/);
});

test('detail canonicals retain only their identity parameter', () => {
    assert.equal(canonicalPath('/seasons/2025', { source: 'share' }), '/seasons/2025');
    assert.equal(canonicalPath('/drivers/max-verstappen', { utm_source: 'test' }), '/drivers/max-verstappen');
    assert.equal(canonicalPath('/races', { year: '2025' }), '/races');
    assert.equal(canonicalPath('/championship-builder', { id: 'shared-id', source: 'share' }), '/championship-builder?id=shared-id');
    assert.equal(canonicalPath('/chassis', { id: 'ferrari-sf-25' }), '/chassis?id=ferrari-sf-25');
});

test('detail slugs produce useful server-rendered sharing titles', () => {
    assert.equal(metadataFor('/drivers/max-verstappen').title, 'Max Verstappen — Formula 1 Driver · Racelytic');
    assert.equal(metadataFor('/f3/circuits/spa-francorchamps').title, 'Spa Francorchamps — Formula 3 Circuit · Racelytic');
});

test('dynamic entity titles prefer the public racing name', () => {
    const name = publicEntityName({ name: 'Lewis Hamilton', fullName: 'Lewis Carl Davidson Hamilton' });
    assert.equal(name, 'Lewis Hamilton');
    assert.equal(entityPageTitle(name, 'Formula 1', 'Driver'), 'Lewis Hamilton — Formula 1 Driver · Racelytic');
});

test('SEO injection replaces stale tags and adds canonical, Open Graph and Twitter metadata', () => {
    const html = applySeo(fixture, '/f2/races');
    assert.match(html, /<title>Races · Formula 2 · Racelytic<\/title>/);
    assert.equal((html.match(/name="description"/g) || []).length, 1);
    assert.match(html, /rel="canonical" href="https:\/\/racelytic\.com\/f2\/races"/);
    assert.match(html, /property="og:title"/);
    assert.match(html, /property="og:image" content="https:\/\/racelytic\.com\/assets\/social-card\.png"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /name="twitter:image:alt"/);
    assert.match(html, /type="application\/ld\+json" data-racelytic-seo/);
    assert.match(html, /"@type":"BreadcrumbList"/);
});

test('structured data describes prerendered archive entities without allowing script injection', () => {
    const html = renderStructuredData(metadataFor('/drivers/test-driver', {}, {
        title: 'Test Driver · Formula 1 · Racelytic',
        initialContent: { kind: 'driver', driver: {
            name: 'Test Driver', fullName: 'Test </script><script>alert(1)</script>',
            nationalityCountryName: 'Netherlands', dateOfBirth: '1997-09-30'
        } }
    }));
    assert.match(html, /"@type":"ProfilePage"/);
    assert.match(html, /"@type":"Person"/);
    assert.match(html, /"name":"Test Driver"/);
    assert.match(html, /"nationality":\{"@type":"Country","name":"Netherlands"\}/);
    assert.doesNotMatch(html, /<\/script><script>/);
    assert.match(html, /\\u003c\/script\\u003e/);
});

test('race structured data exposes an event, circuit and date', () => {
    const html = renderStructuredData(metadataFor('/races/1139/hungarian-grand-prix', {}, {
        initialContent: { kind: 'race', race: {
            year: 2025, displayName: 'Hungarian Grand Prix', date: '2025-08-03',
            circuitName: 'Hungaroring', countryName: 'Hungary'
        } }
    }));
    assert.match(html, /"@type":"SportsEvent"/);
    assert.match(html, /"startDate":"2025-08-03"/);
    assert.match(html, /"name":"Hungaroring"/);
    assert.match(html, /"name":"Races","item":"https:\/\/racelytic\.com\/races"/);
});

test('project-level metadata stays series neutral', () => {
    assert.equal(metadataFor('/terms').title, 'Terms of Service · Racelytic');
    assert.equal(metadataFor('/privacy').title, 'Privacy Notice · Racelytic');
    assert.doesNotMatch(metadataFor('/data-sources').description, /Formula 1 archive/);
    assert.equal(metadataFor('/community').title, 'Community · Racelytic');
});

test('ratings subpages have distinct canonical metadata', () => {
    assert.equal(metadataFor('/ratings/leaderboard').title, 'Ratings Leaderboard · Racelytic');
    assert.equal(metadataFor('/ratings/compare').canonical, 'https://racelytic.com/ratings/compare');
    assert.equal(metadataFor('/ratings/driver').title, 'Driver Rating Profile · Racelytic');
    assert.equal(metadataFor('/ratings/methodology').title, 'Ratings Methodology · Racelytic');
});

test('unverified shared championships retain their URL but remain noindex', () => {
    const metadata = metadataFor('/championship-builder', { id: '550e8400-e29b-41d4-a716-446655440000' });
    assert.equal(metadata.canonical, 'https://racelytic.com/championship-builder?id=550e8400-e29b-41d4-a716-446655440000');
    assert.equal(metadata.robots, 'noindex, follow');
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
    assert.match(renderSitemap(['/driver?id=max-verstappen']), /\/driver\?id=max-verstappen/);
});
