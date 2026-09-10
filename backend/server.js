require('dotenv').config();
const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { requireMonitorAuth } = require('./monitor-auth');
const { ACADEMY_PAGES, renderAcademyHtml, renderAcademyScript } = require('./academy-renderer');
const { renderSeriesHome } = require('./series-home-renderer');
const { applySeo, renderRobots, renderSitemap } = require('./seo');
const { dynamicSitemapRoutes, resolveSeoMetadata } = require('./seo-data');
const { renderInitialSeoContent } = require('./seo-prerender');
const { renderPageShell } = require('./page-shell');
const { seriesPageRoutes } = require('./series-pages');
const { renderSeasonAnalysisHtml } = require('./season-analysis-renderer');
const { renderSeasonComparisonHtml } = require('./season-comparison-renderer');
const { renderCircuitAnalysisHtml } = require('./circuit-analysis-renderer');
const { renderRecordsHtml } = require('./records-renderer');
const { renderAskHtml } = require('./ask-renderer');
const { RESOURCE_ROUTES, resourcePath } = require('./resource-routes');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const frontendDirectory = path.join(__dirname, '../frontend');

function sendSeoPage(req, res, next, file, transform = content => content) {
    fs.readFile(path.join(frontendDirectory, file), 'utf8', async (error, content) => {
        if (error) return next(error);
        try {
            const rendered = file === 'season-analysis.html' ? renderSeasonAnalysisHtml(content, req.path)
                : file === 'season-comparison.html' ? renderSeasonComparisonHtml(content, req.path)
                : file === 'circuit-analysis.html' ? renderCircuitAnalysisHtml(transform(content), req.path)
                : file === 'records.html' ? renderRecordsHtml(req.path)
                : file === 'ask.html' ? renderAskHtml(req.path) : transform(content);
            const { initialContent, notFound, ...seoOverrides } = await resolveSeoMetadata(req);
            if (notFound) res.status(404);
            if (req.params?.resourceId && initialContent?.kind === 'race') {
                const label = initialContent.race.displayName || initialContent.race.name || initialContent.race.officialName;
                const canonical = resourcePath(initialContent.series, 'race', req.params.resourceId, label);
                if (req.path !== canonical) {
                    const queryIndex = req.originalUrl.indexOf('?');
                    const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
                    return res.redirect(308, `${canonical}${query}`);
                }
            }
            const initialHtml = renderInitialSeoContent(rendered, initialContent);
            res.type('html').send(applySeo(renderPageShell(initialHtml), req.path, req.query, { ...seoOverrides, initialContent }));
        } catch (renderError) {
            next(renderError);
        }
    });
}

// Nginx terminates HTTPS locally and forwards the original protocol. Trust only
// loopback proxies so origin checks see https without accepting spoofed headers
// from direct external connections.
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(compression({ threshold: 1024 }));

app.use((req, res, next) => {
    const policy = [
        "default-src 'self'",
        "base-uri 'self'",
        "connect-src 'self'",
        "font-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "img-src 'self' data:",
        "object-src 'none'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'"
    ];
    if (process.env.NODE_ENV === 'production') policy.push('upgrade-insecure-requests');
    res.set({
        'Content-Security-Policy': policy.join('; '),
        'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
    });
    if (process.env.NODE_ENV === 'production' && req.secure) {
        res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    const privateApi = ['/api/account', '/api/custom-championships', '/api/points-systems', '/api/records/saved']
        .some(route => req.path === route || req.path.startsWith(`${route}/`));
    if (req.path === '/account' || req.path === '/monitor' || privateApi) {
        res.set('Cache-Control', 'no-store');
    }
    next();
});

app.use(express.json({ limit: '100kb' }));

app.get('/monitor', requireMonitorAuth, (req, res, next) => sendSeoPage(req, res, next, 'monitor.html'));

const publicPages = require('node:fs').readdirSync(frontendDirectory)
    .filter(file => file.endsWith('.html')
        && !['index.html', 'f2.html', 'f3.html', 'ratings-methodology.html'].includes(file));

const ratingsPages = {
    '/ratings/leaderboard': ['templates/ratings-explorer.html', 'leaderboard'],
    '/ratings/compare': ['templates/ratings-explorer.html', 'compare'],
    '/ratings/driver': ['templates/ratings-explorer.html', 'driver'],
    '/ratings/methodology': ['ratings-methodology.html', 'methodology']
};

for (const [route, [file, view]] of Object.entries(ratingsPages)) {
    app.get(route, (req, res, next) => sendSeoPage(req, res, next, file,
        content => content.replace('<body>', `<body data-ratings-view="${view}">`)));
}
app.get('/ratings-methodology.html', (req, res) => res.redirect(308, '/ratings/methodology'));

function redirectLegacyPage(req, res, fallback, resource, series = 'f1') {
    const config = RESOURCE_ROUTES[resource];
    if (config) {
        const id = req.query[config.parameter];
        if (id) {
            const extra = new URLSearchParams(req.query);
            extra.delete(config.parameter);
            const query = extra.toString();
            return res.redirect(308, `${resourcePath(series, resource, id)}${query ? `?${query}` : ''}`);
        }
    }
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
    return res.redirect(308, `${fallback}${query}`);
}

for (const file of publicPages) {
    const route = `/${file.slice(0, -'.html'.length)}`;
    const juniorMatch = route.match(/^\/(f[23])-(.+)$/);
    const canonicalRoute = juniorMatch ? `/${juniorMatch[1]}/${juniorMatch[2]}` : route;
    const legacyResource = juniorMatch ? juniorMatch[2] : route.slice(1);
    const legacySeries = juniorMatch?.[1] || 'f1';

    if (canonicalRoute !== route) {
        app.get(route, (req, res) => redirectLegacyPage(req, res, canonicalRoute, legacyResource, legacySeries));
    } else if (!Object.hasOwn(RESOURCE_ROUTES, route.slice(1))) {
        app.get(route, (req, res, next) => sendSeoPage(req, res, next, file));
    } else {
        const resource = route.slice(1), config = RESOURCE_ROUTES[resource];
        app.get(route, (req, res, next) => {
            const id = req.query[config.parameter];
            if (resource === 'chassis' && !id) return sendSeoPage(req, res, next, file);
            if (!id) return res.redirect(308, `/${config.collection}`);
            const extra = new URLSearchParams(req.query);
            extra.delete(config.parameter);
            const query = extra.toString();
            res.redirect(308, `${resourcePath('f1', resource, id)}${query ? `?${query}` : ''}`);
        });
    }
    app.get(`/${file}`, (req, res) => redirectLegacyPage(req, res, canonicalRoute, legacyResource, legacySeries));
}

const juniorPages = seriesPageRoutes(['f2', 'f3']);

for (const { route, file, series, slug } of juniorPages) {
    if (Object.hasOwn(RESOURCE_ROUTES, slug)) {
        const config = RESOURCE_ROUTES[slug];
        app.get(route, (req, res, next) => {
            const id = req.query[config.parameter];
            if (slug === 'chassis' && !id) return sendSeoPage(req, res, next, file);
            if (!id) return res.redirect(308, `${series.path}/${config.collection}`);
            const extra = new URLSearchParams(req.query);
            extra.delete(config.parameter);
            const query = extra.toString();
            res.redirect(308, `${resourcePath(series.key, slug, id)}${query ? `?${query}` : ''}`);
        });
    } else app.get(route, (req, res, next) => sendSeoPage(req, res, next, file));
}

for (const [route, series] of [['/', 'f1'], ['/f2', 'f2'], ['/f3', 'f3'], ['/academy', 'academy']]) {
    app.get(route, (req, res) => res.type('html').send(applySeo(renderPageShell(renderSeriesHome(series)), req.path, req.query)));
}

for (const [legacy, target] of [['/index.html', '/'], ['/f2.html', '/f2'], ['/f3.html', '/f3']]) {
    app.get(legacy, (req, res) => res.redirect(308, target));
}

Object.entries(ACADEMY_PAGES).forEach(([slug, file]) => {
    app.get(slug ? `/academy/${slug}` : '/academy', (req, res, next) => {
        if (Object.hasOwn(RESOURCE_ROUTES, slug)) {
            const config = RESOURCE_ROUTES[slug], id = req.query[config.parameter];
            if (slug === 'chassis' && !id) return sendSeoPage(req, res, next, file, content => renderAcademyHtml(file, content));
            if (!id) return res.redirect(308, `/academy/${config.collection}`);
            const extra = new URLSearchParams(req.query);
            extra.delete(config.parameter);
            const query = extra.toString();
            return res.redirect(308, `${resourcePath('academy', slug, id)}${query ? `?${query}` : ''}`);
        }
        sendSeoPage(req, res, next, file, content => renderAcademyHtml(file, content));
    });
});

const resourceFiles = Object.freeze({
    season: { f1: 'season.html', f2: 'f2-season.html', f3: 'f3-season.html', academy: 'f3-season.html' },
    race: { f1: 'race.html', f2: 'f2-race.html', f3: 'f3-race.html', academy: 'f3-race.html' },
    driver: { f1: 'driver.html', f2: 'f2-driver.html', f3: 'f3-driver.html', academy: 'f3-driver.html' },
    constructor: { f1: 'constructor.html', f2: 'f2-constructor.html' },
    team: { f3: 'f3-team.html', academy: 'f3-team.html' },
    circuit: { f1: 'circuit.html', f2: 'f2-circuit.html', f3: 'f3-circuit.html', academy: 'f3-circuit.html' },
    chassis: { f1: 'chassis.html', f2: 'f2-chassis.html', f3: 'f3-chassis.html', academy: 'f3-chassis.html' }
});

for (const [resource, bySeries] of Object.entries(resourceFiles)) {
    const collection = RESOURCE_ROUTES[resource].collection;
    for (const [series, file] of Object.entries(bySeries)) {
        const base = series === 'f1' ? '' : `/${series}`;
        const handler = (req, res, next) => sendSeoPage(req, res, next, file,
            content => series === 'academy' ? renderAcademyHtml(file, content) : content);
        app.get(`${base}/${collection}/:resourceId`, handler);
        if (resource === 'race') app.get(`${base}/${collection}/:resourceId/:slug`, handler);
    }
}

const sitemapRoutes = [
    '/', '/f2', '/f3', '/academy',
    ...Object.keys(ratingsPages),
    ...publicPages.map(file => `/${file.slice(0, -'.html'.length)}`).filter(route => !/^\/f[23]-/.test(route)),
    ...juniorPages.map(({ route }) => route),
    ...Object.keys(ACADEMY_PAGES).filter(Boolean).map(slug => `/academy/${slug}`),
];

app.get('/robots.txt', (req, res) => res.type('text/plain').send(renderRobots()));
app.get('/sitemap.xml', async (req, res) => {
    let routes = sitemapRoutes;
    try {
        routes = [...routes, ...await dynamicSitemapRoutes()];
    } catch (error) {
        console.error('Unable to add database pages to sitemap:', error.message);
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.type('application/xml').send(renderSitemap(routes));
});

app.get('/academy-js/:file', (req, res, next) => {
    if (!/^f3-[a-z0-9-]+\.js$|^f3\.js$/.test(req.params.file)) return res.sendStatus(404);
    fs.readFile(path.join(frontendDirectory, 'js', req.params.file), 'utf8', (error, content) => {
        if (error) return next(error);
        res.type('application/javascript').send(renderAcademyScript(content));
    });
});

app.get('/data/replays/:replayId/chunks/:chunkName', (req, res, next) => {
    const { replayId, chunkName } = req.params;
    if (!/^[a-z0-9-]+$/.test(replayId) || !/^[0-9]{3}\.[a-f0-9]{12}\.json$/.test(chunkName)) return next();
    const compressedFile = path.join(frontendDirectory, 'data', 'replays', replayId, 'chunks', `${chunkName}.br`);
    fs.stat(compressedFile, (error, stats) => {
        if (error || !stats.isFile()) return next();
        res.type('application/json');
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.vary('Accept-Encoding');
        const source = fs.createReadStream(compressedFile);
        source.on('error', next);
        if (/\bbr\b/.test(req.get('accept-encoding') || '')) {
            res.set('Content-Encoding', 'br');
            res.set('Content-Length', String(stats.size));
            source.pipe(res);
        } else {
            source.pipe(zlib.createBrotliDecompress()).pipe(res);
        }
    });
});

app.use(express.static(frontendDirectory, {
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '5m' : 0,
    setHeaders(res, filePath) {
        const replayRoot = path.join(frontendDirectory, 'data', 'replays');
        if (!filePath.startsWith(replayRoot)) return;
        if (path.basename(filePath) === 'index.json') res.setHeader('Cache-Control', 'no-cache');
        else if (filePath.endsWith('.json')) res.setHeader('Cache-Control', 'public, max-age=300');
    }
}));

for (const route of ['core', 'seasons', 'drivers', 'circuits', 'constructors', 'chassis', 'races', 'records', 'ratings', 'games', 'account', 'points-systems', 'custom-championships', 'community', 'analytics', 'ask']) {
    const exported = require(`./routes/${route}`);
    app.use(exported.router || exported);
}

app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) return next(error);
    res.status(500).json({ error: 'Request failed.' });
});

app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found.' });
    }
    next();
});

app.use((req, res, next) => {
    fs.readFile(path.join(frontendDirectory, '404.html'), 'utf8', (error, content) => {
        if (error) return next(error);
        res.status(404).type('html').send(applySeo(renderPageShell(content), '/404'));
    });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Racelytic running at http://localhost:${PORT}`);
    });
}

module.exports = app;
