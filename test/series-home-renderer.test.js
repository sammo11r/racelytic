const test = require('node:test');
const assert = require('node:assert/strict');
const { SERIES_HOME_CONFIG, renderSeriesHome } = require('../backend/series-home-renderer');

test('all championship landing pages use the shared template configuration', () => {
    assert.deepEqual(Object.keys(SERIES_HOME_CONFIG), ['f1', 'f2', 'f3', 'academy']);

    for (const [key, config] of Object.entries(SERIES_HOME_CONFIG)) {
        assert.equal(config.key, key);
        assert.equal(config.features.length, 4);
        assert.equal(config.tools.length, 3);
        assert.ok(config.features.every(feature => feature[4].startsWith(config.path || '/')));
    }
});

test('shared landing template renders the complete product structure for every series', () => {
    for (const key of Object.keys(SERIES_HOME_CONFIG)) {
        const html = renderSeriesHome(key);
        assert.match(html, new RegExp(`data-series-home="${key}"`));
        assert.match(html, /class="container series-snapshot"/);
        assert.match(html, /id="series-explore"/);
        assert.match(html, /class="container series-tools"/);
        assert.match(html, /id="series-archive"/);
        assert.match(html, /\/js\/series-home\.js/);
        assert.equal((html.match(/class="home-path-card/g) || []).length, 4);
        assert.equal((html.match(/class="series-tool-card/g) || []).length, 3);
    }
});

test('series-specific capabilities and identity stay distinct', () => {
    const f1 = renderSeriesHome('f1');
    const f2 = renderSeriesHome('f2');
    const f3 = renderSeriesHome('f3');
    const academy = renderSeriesHome('academy');

    assert.match(f1, /href="\/simulate-race"/);
    assert.doesNotMatch(f2 + f3 + academy, /href="\/simulate-race"/);
    assert.match(f2, /class="f2-mode"/);
    assert.match(f3, /class="f3-mode"/);
    assert.match(academy, /class="academy-mode"/);
    assert.match(academy, /href="\/account\?series=academy"/);
});
