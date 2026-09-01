const test = require('node:test');
const assert = require('node:assert/strict');
const { SERIES_HOME_CONFIG, SERIES_HOME_PREVIEWS, renderSeriesHome } = require('../backend/series-home-renderer');
const { seriesPageRoutes } = require('../backend/series-pages');

test('all championship landing pages use the shared template configuration', () => {
    assert.deepEqual(Object.keys(SERIES_HOME_CONFIG), ['f1', 'f2', 'f3', 'academy']);

    for (const [key, config] of Object.entries(SERIES_HOME_CONFIG)) {
        assert.equal(config.key, key);
        assert.ok(config.headline && config.subheadline && config.introduction);
        assert.ok(SERIES_HOME_PREVIEWS[key].href.startsWith(config.path || '/'));
    }
});

test('shared landing template renders the complete product structure for every series', () => {
    for (const key of Object.keys(SERIES_HOME_CONFIG)) {
        const html = renderSeriesHome(key);
        assert.match(html, new RegExp(`data-series-home="${key}"`));
        assert.match(html, /class="container series-snapshot"/);
        assert.match(html, /id="series-explore"/);
        assert.match(html, /class="container home-questions"/);
        assert.match(html, /id="series-archive"/);
        assert.match(html, /\/js\/series-home\.js/);
        assert.doesNotMatch(html, /home-path-card|series-tool-card|Start somewhere interesting/);
        assert.equal((html.match(/<article class="home-question-card[^\"]*">\s*<h3>/g) || []).length, 3);
        assert.match(html, /\/css\/home-questions\.css/);
    }
});

test('series-specific capabilities and identity stay distinct', () => {
    const f1 = renderSeriesHome('f1');
    const f2 = renderSeriesHome('f2');
    const f3 = renderSeriesHome('f3');
    const academy = renderSeriesHome('academy');

    assert.match(f1, /href="\/simulator\?year=2008&amp;points=1991-2002"/);
    assert.doesNotMatch(f2 + f3 + academy, /href="\/simulate-race"/);
    assert.match(f2, /class="f2-mode"/);
    assert.match(f3, /class="f3-mode"/);
    assert.match(academy, /class="academy-mode"/);
    assert.match(academy, /href="\/account\?series=academy"/);
    assert.match(f2, /href="\/f2\/champions-quiz"/);
    assert.match(f3, /href="\/f3\/lights-out"/);
    assert.match(academy, /href="\/academy\/lights-out"/);
    assert.doesNotMatch(f3 + academy, /champions-quiz|home-quiz-preview/);
});

test('F1 question cards replace the category grid and link directly to their examples', () => {
    const html = renderSeriesHome('f1');
    assert.equal((html.match(/<article class="home-question-card/g) || []).length, 3);
    assert.match(html, /Start with a question/);
    assert.match(html, /\/css\/home-questions\.css/);
    assert.match(html, /href="\/simulator\?year=2008&amp;points=1991-2002"/);
    assert.match(html, /href="\/driver-comparison\?first=ayrton-senna&amp;second=alain-prost"/);
    assert.match(html, /href="\/world-champions-quiz"/);
    assert.doesNotMatch(html, /Choose how you want to explore/);
    assert.doesNotMatch(html, /home-question-category|↗|Start somewhere interesting|id="series-tools-title"/);
    assert.equal((html.match(/<article class="home-question-card[^\"]*">\s*<h3>/g) || []).length, 3);
});

test('every hero leads with its own two-tone motto and no eyebrow or buttons', () => {
    const hero = key => renderSeriesHome(key).match(/<section class="hero[\s\S]*?<\/section>/)[0];
    const f1Hero = hero('f1');
    assert.doesNotMatch(f1Hero, /class="eyebrow"|class="hero-actions"|latest-season-link/);
    assert.match(f1Hero, /<h1>.*<span>.*<\/span><\/h1>/);
    for (const key of ['f2', 'f3', 'academy']) {
        assert.doesNotMatch(hero(key), /class="eyebrow"|class="hero-actions"|latest-season-link/);
        assert.ok(hero(key).includes(SERIES_HOME_CONFIG[key].headline));
        assert.ok(hero(key).includes(SERIES_HOME_CONFIG[key].subheadline));
    }
});

test('every current-season section uses its accent label as the accessible heading', () => {
    const f1 = renderSeriesHome('f1');
    assert.match(f1, /<h2 class="eyebrow" id="season-snapshot-title">CURRENT SEASON<\/h2>/);
    assert.doesNotMatch(f1, /The championship at a glance/);
    for (const key of ['f2', 'f3', 'academy']) {
        assert.match(renderSeriesHome(key), /<h2 class="eyebrow" id="season-snapshot-title">CURRENT SEASON<\/h2>/);
        assert.doesNotMatch(renderSeriesHome(key), /The championship at a glance/);
    }
});

test('hero artwork shares a viewport-based anchor, independent of championship copy height', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname, '../frontend/css/polish.css'), 'utf8');
    const artworkRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector]) => selector.includes('.series-home-hero::after'));
    assert.ok(artworkRules.length > 0);
    for (const [, selector, declarations] of artworkRules) {
        assert.doesNotMatch(selector, /data-series-home/);
        assert.doesNotMatch(declarations, /top:\s*[\d.]+%/);
    }
    assert.match(artworkRules[0][2], /top:\s*calc\(146\.55px \+ clamp\(80\.64px, 9\.36vw, 112\.32px\)\)/);
});

test('every series closes with a compact account invitation preserving its championship', () => {
    const f1 = renderSeriesHome('f1');
    assert.match(f1, /home-community home-community-compact/);
    assert.match(f1, /Keep what you create/);
    assert.match(f1, /href="\/account\?series=f1&amp;tab=register">Create an account/);
    assert.match(f1, /class="home-account-signin" href="\/account\?series=f1">Sign in/);
    assert.doesNotMatch(f1, /YOUR RACELYTIC|One account\. Every series/);
    for (const key of ['f2', 'f3', 'academy']) {
        const html = renderSeriesHome(key);
        assert.match(html, /home-community-compact/);
        assert.doesNotMatch(html, /One account\. Every series|YOUR RACELYTIC/);
        assert.ok(html.includes(`href="/account?series=${key}&amp;tab=register">Create an account`));
        assert.ok(html.includes(`href="/account?series=${key}">Sign in`));
    }
});

test('junior preview links use real routes and include the featured season and drivers', () => {
    const routes = new Set(seriesPageRoutes().map(page => page.route));
    for (const key of ['f2', 'f3', 'academy']) {
        const html = renderSeriesHome(key);
        const preview = SERIES_HOME_PREVIEWS[key];
        const links = [...html.matchAll(/class="home-question-link" href="([^"]+)"/g)].map(match => new URL(match[1].replaceAll('&amp;', '&'), 'https://racelytic.test'));
        assert.equal(links.length, 3);
        for (const link of links) assert.ok(routes.has(link.pathname), link.pathname);
        assert.equal(links[0].searchParams.get('year'), String(preview.year));
        assert.equal(links[1].searchParams.get('first'), preview.drivers[0].id);
        assert.equal(links[1].searchParams.get('second'), preview.drivers[1].id);
        assert.match(html, /<ul><li>/); // Wins compare the contenders, not a separate ranking.
        assert.doesNotMatch(html, /NaN|Infinity/);
        assert.match(html, new RegExp(`${key === 'academy' ? 'F1 ACADEMY' : key.toUpperCase()} CAREERS`));
    }
    assert.match(renderSeriesHome('f3'), /--preview-fill:0%/);
});

test('championship snapshot still loads without the removed latest-season button', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const vm = require('node:vm');
    const elements = new Map();
    const errors = [];
    const context = {
        document: {
            body: { dataset: { seriesHome: 'f1' } },
            querySelectorAll: () => [],
            getElementById: id => {
                if (id === 'latest-season-link') return null;
                if (!elements.has(id)) elements.set(id, {});
                return elements.get(id);
            }
        },
        getJSON: async () => ({ latestSeason: 2026, currentSeason: { rounds: 23, leader: { name: 'Test driver', points: 100 } } }),
        fmtNumber: String,
        console: { error: (...args) => errors.push(args) }
    };
    await vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../frontend/js/series-home.js'), 'utf8'), context);
    assert.deepEqual(errors, []);
    assert.equal(elements.get('snapshot-season-link').href, '/season?year=2026');
    assert.equal(elements.get('snapshot-season').textContent, 2026);
    assert.equal(elements.get('snapshot-leader').textContent, 'Test driver');
});
