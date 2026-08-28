const test = require('node:test');
const assert = require('node:assert/strict');
const { SERIES_PAGE_TEMPLATES, SHARED_PAGE_TEMPLATES, seriesPageRoutes } = require('../backend/series-pages');

test('F2, F3 and Academy reuse the shared analysis page templates', () => {
    for (const page of Object.keys(SHARED_PAGE_TEMPLATES)) {
        assert.equal(SERIES_PAGE_TEMPLATES.f2[page], SHARED_PAGE_TEMPLATES[page]);
        assert.equal(SERIES_PAGE_TEMPLATES.f3[page], SHARED_PAGE_TEMPLATES[page]);
        assert.equal(SERIES_PAGE_TEMPLATES.academy[page], SHARED_PAGE_TEMPLATES[page]);
    }
});

test('series page manifest generates unique canonical routes', () => {
    const routes = seriesPageRoutes();
    assert.equal(new Set(routes.map(page => page.route)).size, routes.length);
    assert.ok(routes.some(page => page.route === '/f2/races' && page.file === 'f2-races.html'));
    assert.ok(routes.some(page => page.route === '/f3/race-analysis' && page.file === 'race-analysis.html'));
    assert.ok(routes.some(page => page.route === '/academy/driver-form' && page.file === 'driver-form.html'));
});
