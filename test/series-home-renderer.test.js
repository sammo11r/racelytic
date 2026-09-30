const test = require('node:test');
const assert = require('node:assert/strict');
const { SERIES_HOME_CONFIG, SERIES_HOME_PREVIEWS, renderSeriesHome } = require('../backend/series-home-renderer');
const { seriesPageRoutes } = require('../backend/series-pages');

test('all championship landing pages use the shared template configuration', () => {
    assert.deepEqual(Object.keys(SERIES_HOME_CONFIG), ['f1', 'f2', 'f3', 'academy', 'fe', 'wec']);

    for (const [key, config] of Object.entries(SERIES_HOME_CONFIG)) {
        assert.equal(config.key, key);
        assert.ok(config.askExample);
        assert.ok(SERIES_HOME_PREVIEWS[key].href.startsWith(config.path || '/'));
    }
});

test('shared landing template renders the complete product structure for every series', () => {
    for (const key of Object.keys(SERIES_HOME_CONFIG)) {
        const html = renderSeriesHome(key);
        assert.match(html, new RegExp(`data-series-home="${key}"`));
        assert.match(html, /class="container series-snapshot"/);
        assert.match(html, /class="home-season-strip/);
        assert.match(html, /class="container home-ask-entry"/);
        assert.match(html, /id="series-explore"/);
        assert.match(html, /class="container home-questions"/);
        assert.match(html, /id="series-archive"/);
        assert.match(html, /\/js\/series-home\.js/);
        assert.doesNotMatch(html, /home-path-card|series-tool-card|Start somewhere interesting/);
        assert.equal((html.match(/<article class="home-question-card[^\"]*">\s*<h3>/g) || []).length, 3);
        assert.match(html, /class="home-duel-insight"/);
        assert.match(html, /\/css\/home-questions\.css/);
        assert.doesNotMatch(html, /class="hero home-hero|class="series-snapshot-grid"/);
        assert.ok(html.indexOf('class="container series-snapshot"') < html.indexOf('class="container home-ask-entry"'));
        assert.ok(html.indexOf('class="container home-ask-entry"') < html.indexOf('class="container home-questions"'));
    }
});

test('series-specific capabilities and identity stay distinct', () => {
    const f1 = renderSeriesHome('f1');
    const f2 = renderSeriesHome('f2');
    const f3 = renderSeriesHome('f3');
    const academy = renderSeriesHome('academy');
    const fe = renderSeriesHome('fe');
    const wec = renderSeriesHome('wec');

    assert.match(f1, /href="\/simulator\?year=2008&amp;points=1991-2002"/);
    assert.doesNotMatch(f2 + f3 + academy, /href="\/simulate-race"/);
    assert.match(f2, /class="f2-mode"/);
    assert.match(f3, /class="f3-mode"/);
    assert.match(academy, /class="academy-mode"/);
    assert.match(fe, /class="fe-mode"/);
    assert.match(fe, /href="\/formula-e\/seasons"/);
    assert.match(fe, /href="\/formula-e\/champions-quiz"/);
    assert.match(fe, /\/formula-e\/ask/);
    assert.match(wec, /class="wec-mode"/);
    assert.match(wec, /href="\/wec\/season-analysis\?year=2025"/);
    assert.match(wec, /href="\/wec\/driver-comparison\?first=sebastien-buemi&amp;second=brendon-hartley"/);
    assert.match(wec, /href="\/wec\/lights-out"/);
    assert.match(wec, /\/wec\/ask/);
    assert.ok(new Set(seriesPageRoutes().map(page => page.route)).has('/formula-e/simulator'));
    assert.match(academy, /href="\/account\?series=academy"/);
    assert.match(f2, /href="\/f2\/champions-quiz"/);
    assert.match(f3, /href="\/f3\/lights-out"/);
    assert.match(academy, /href="\/academy\/lights-out"/);
    assert.doesNotMatch(f3 + academy, /champions-quiz|home-quiz-preview/);
});

test('landing page Ask forms give every championship a clear starting point', () => {
    for (const [key, config] of Object.entries(SERIES_HOME_CONFIG)) {
        const html = renderSeriesHome(key);
        const form = html.match(/<form action="([^"]*\/ask)" method="get">[\s\S]*?<\/form>/)?.[0] || '';
        const askCard = html.match(/<section class="container home-ask-entry"[\s\S]*?<\/section>/)?.[0] || '';
        assert.match(form, /name="q"/);
        assert.match(form, new RegExp(`action="${config.path || ''}/ask"`));
        assert.doesNotMatch(askCard, /ASK RACELYTIC|class="eyebrow"|home-ask-example-note/);
        assert.match(askCard, /Your .* question, answered/);
        assert.match(askCard, /Get a direct answer with the evidence behind it/);
        assert.match(form, new RegExp(`value="${config.askExample.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
        assert.match(form, /minlength="8"/);
        assert.doesNotMatch(form, /placeholder=/);
        assert.match(form, /type="submit">Ask/);
        assert.match(askCard, /class="home-ask-examples"/);
        assert.match(askCard, new RegExp(`href="${config.path || ''}/ask\\?q=`));
        if (key !== 'f1') assert.doesNotMatch(askCard, /alternate points systems/);
    }
});

test('F1 question cards replace the category grid and link directly to their examples', () => {
    const html = renderSeriesHome('f1');
    assert.equal((html.match(/<article class="home-question-card/g) || []).length, 3);
    assert.match(html, /aria-label="Explore Racelytic"/);
    assert.doesNotMatch(html, /TAKE THE WHEEL|Start with a question|Real history\. Different perspectives|See where your curiosity takes you/);
    assert.match(html, /\/css\/home-questions\.css/);
    assert.match(html, /href="\/simulator\?year=2008&amp;points=1991-2002"/);
    assert.match(html, /href="\/driver-comparison\?first=ayrton-senna&amp;second=alain-prost"/);
    assert.match(html, /World titles/);
    assert.match(html, /Prost leads in wins and titles; Senna leads in pole positions/);
    assert.match(html, /href="\/world-champions-quiz"/);
    assert.doesNotMatch(html, /Choose how you want to explore/);
    assert.doesNotMatch(html, /home-question-category|↗|Start somewhere interesting|id="series-tools-title"/);
    assert.equal((html.match(/<article class="home-question-card[^\"]*">\s*<h3>/g) || []).length, 3);
});

test('every championship starts with its season and Ask, with WEC using its own standings', () => {
    for (const key of Object.keys(SERIES_HOME_CONFIG)) {
        const html = renderSeriesHome(key);
        assert.match(html, /<main>\s*<section class="container series-snapshot"/);
        assert.match(html, /id="snapshot-completed-races"/);
        assert.match(html, /id="snapshot-event-link"/);
        assert.doesNotMatch(html, /class="hero home-hero|More than results|A different way to experience F1|Welcome to Racelytic/);
        if (key === 'wec') {
            assert.match(html, /home-season-strip-wec|Hypercar manufacturers’ leader/);
            assert.doesNotMatch(html, /id="snapshot-runner-up"/);
        } else {
            assert.match(html, /id="snapshot-runner-up"/);
            assert.match(html, /id="snapshot-third"/);
        }
    }
});

test('every season strip uses a subtle accessible heading', () => {
    for (const key of Object.keys(SERIES_HOME_CONFIG)) {
        const html = renderSeriesHome(key);
        assert.match(html, /<h1 class="home-season-eyebrow" id="season-snapshot-title"><span id="snapshot-season-label">Current season<\/span> <span aria-hidden="true">·<\/span> <span id="snapshot-season">—<\/span><\/h1>/);
        assert.doesNotMatch(html, /The championship at a glance/);
    }
});

test('the decorative shape is shared by every championship landing page', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname, '../frontend/css/home-questions.css'), 'utf8');
    assert.match(css, /body\[data-series-home\] \.series-snapshot::before/);
    assert.match(css, /top: 244px/);
    assert.match(css, /pointer-events: none/);
});

test('every series closes with a compact account invitation preserving its championship', () => {
    const f1 = renderSeriesHome('f1');
    assert.match(f1, /home-community home-community-compact/);
    assert.match(f1, /Keep what you create/);
    assert.match(f1, /href="\/account\?series=f1&amp;tab=register">Create an account/);
    assert.match(f1, /class="home-account-signin" href="\/account\?series=f1">Sign in/);
    assert.doesNotMatch(f1, /YOUR RACELYTIC|One account\. Every series/);
    for (const key of ['f2', 'f3', 'academy', 'wec']) {
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
const { resourceUrl } = require('./frontend-resource-routes');
    const elements = new Map();
    const errors = [];
    const context = {
        document: {
            body: { dataset: { seriesHome: 'f1' } },
            querySelectorAll: () => [],
            getElementById: id => {
                if (id === 'latest-season-link') return null;
                if (!elements.has(id)) elements.set(id, { style: {}, addEventListener() {}, setAttribute(name, value) { this[name] = value; } });
                return elements.get(id);
            }
        },
        getJSON: async () => ({ latestSeason: 2026, currentSeason: {
            rounds: 23, completedRaces: 15, leader: { name: 'Test driver', points: 100 },
            topDrivers: [{ name: 'Test driver', points: 100 }, { name: 'Second driver', points: 95 }, { name: 'Third driver', points: 88 }],
            constructorLeader: { name: 'Test team', points: 195 },
            latestEvent: { id: 'test-race', name: 'Test Grand Prix', round: 15, date: '2026-09-01' },
            nextEvent: { id: 'next-race', name: 'Next Grand Prix', round: 16, date: '2026-10-01' }
        } }),
        fmtNumber: String, fmtDate: value => value, displayRaceName: event => event.name, resourceUrl,
        console: { error: (...args) => errors.push(args) }
    };
    await vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../frontend/js/series-home.js'), 'utf8'), context);
    assert.deepEqual(errors, []);
    assert.equal(elements.get('snapshot-season-link').href, '/seasons/2026');
    assert.equal(elements.get('snapshot-season').textContent, 2026);
    assert.equal(elements.get('snapshot-leader').textContent, 'Test driver');
    assert.equal(elements.get('snapshot-runner-up').textContent, 'Second driver');
    assert.equal(elements.get('snapshot-third').textContent, 'Third driver');
    assert.equal(elements.get('snapshot-constructor').textContent, 'Test team');
    assert.equal(elements.get('snapshot-completed-races').textContent, '15');
    assert.equal(elements.get('snapshot-rounds').textContent, '23');
    assert.equal(elements.get('snapshot-event-label').textContent, 'Next race');
    assert.equal(elements.get('snapshot-event').textContent, 'Next Grand Prix');
});

test('WEC snapshot keeps endurance labels and routes in the shared landing script', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const vm = require('node:vm');
    const { resourceUrl } = require('./frontend-resource-routes');
    const elements = new Map();
    const stats = Array.from({ length: 4 }, () => ({}));
    const requests = [];
    const context = {
        document: {
            body: { dataset: { seriesHome: 'wec' } },
            querySelectorAll: selector => selector === '#series-stats .metric strong' ? stats : [],
            getElementById: id => {
                if (id === 'latest-season-link') return null;
                if (!elements.has(id)) elements.set(id, { addEventListener() {} });
                return elements.get(id);
            }
        },
        getJSON: async url => {
            requests.push(url);
            return {
                seasons: 14, drivers: 916, constructors: 235, circuits: 16, latestSeason: 2026,
                currentSeason: {
                    rounds: 8,
                    leader: { name: 'René Rast / Robin Frijns', points: 75, label: 'Drivers’ championship leaders' },
                    manufacturerLeader: { name: 'Toyota', points: 140 },
                    completedRaces: 5,
                    latestEvent: { id: 'wec-2026-r5-cota', name: 'Lone Star Le Mans', round: 5, date: '2026-09-06' }
                }
            };
        },
        fmtNumber: String,
        fmtDate: value => value,
        displayRaceName: event => event.name,
        resourceUrl,
        console: { error: assert.fail }
    };
    await vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../frontend/js/series-home.js'), 'utf8'), context);
    assert.deepEqual(requests, ['/api/dashboard?series=wec']);
    assert.equal(elements.get('snapshot-season-link').href, '/wec/seasons/2026');
    assert.equal(elements.get('snapshot-season-label').textContent, 'Latest season');
    assert.equal(elements.get('snapshot-leader-label').textContent, 'Drivers’ championship leaders');
    assert.equal(elements.get('snapshot-constructor').textContent, 'Toyota');
    assert.equal(elements.get('snapshot-completed-races').textContent, '5');
    assert.match(elements.get('snapshot-event-link').href, /^\/wec\/races\/wec-2026-r5-cota\//);
    assert.deepEqual(stats.map(item => item.textContent), ['14', '916', '235', '16']);
});
