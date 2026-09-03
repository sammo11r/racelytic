require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { requireMonitorAuth } = require('./monitor-auth');
const { ACADEMY_PAGES, renderAcademyHtml, renderAcademyScript } = require('./academy-renderer');
const { renderSeriesHome } = require('./series-home-renderer');
const { applySeo, renderRobots, renderSitemap } = require('./seo');
const { renderPageShell } = require('./page-shell');
const { seriesPageRoutes } = require('./series-pages');
const { renderSeasonAnalysisHtml } = require('./season-analysis-renderer');
const { renderSeasonComparisonHtml } = require('./season-comparison-renderer');
const { renderCircuitAnalysisHtml } = require('./circuit-analysis-renderer');
const { renderRecordsHtml } = require('./records-renderer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const frontendDirectory = path.join(__dirname, '../frontend');

function sendSeoPage(req, res, next, file, transform = content => content) {
    fs.readFile(path.join(frontendDirectory, file), 'utf8', (error, content) => {
        if (error) return next(error);
        const rendered = file === 'season-analysis.html' ? renderSeasonAnalysisHtml(content, req.path)
            : file === 'season-comparison.html' ? renderSeasonComparisonHtml(content, req.path)
            : file === 'circuit-analysis.html' ? renderCircuitAnalysisHtml(transform(content), req.path)
            : file === 'records.html' ? renderRecordsHtml(req.path) : transform(content);
        res.type('html').send(applySeo(renderPageShell(rendered), req.path, req.query));
    });
}

// Nginx terminates HTTPS locally and forwards the original protocol. Trust only
// loopback proxies so origin checks see https without accepting spoofed headers
// from direct external connections.
app.set('trust proxy', 'loopback');

app.use(express.json());

app.get('/monitor', requireMonitorAuth, (req, res, next) => sendSeoPage(req, res, next, 'monitor.html'));

const publicPages = require('node:fs').readdirSync(frontendDirectory)
    .filter(file => file.endsWith('.html') && !['index.html', 'f2.html', 'f3.html'].includes(file));

for (const file of publicPages) {
    const route = `/${file.slice(0, -'.html'.length)}`;
    const juniorMatch = route.match(/^\/(f[23])-(.+)$/);
    const canonicalRoute = juniorMatch ? `/${juniorMatch[1]}/${juniorMatch[2]}` : route;

    if (canonicalRoute !== route) {
        app.get(route, (req, res) => {
            const queryIndex = req.originalUrl.indexOf('?');
            const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
            res.redirect(308, `${canonicalRoute}${query}`);
        });
    } else {
        app.get(route, (req, res, next) => sendSeoPage(req, res, next, file));
    }
    app.get(`/${file}`, (req, res) => {
        const queryIndex = req.originalUrl.indexOf('?');
        const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
        res.redirect(308, `${canonicalRoute}${query}`);
    });
}

const juniorPages = seriesPageRoutes(['f2', 'f3']);

for (const { route, file } of juniorPages) {
    app.get(route, (req, res, next) => sendSeoPage(req, res, next, file));
}

for (const [route, series] of [['/', 'f1'], ['/f2', 'f2'], ['/f3', 'f3'], ['/academy', 'academy']]) {
    app.get(route, (req, res) => res.type('html').send(applySeo(renderPageShell(renderSeriesHome(series)), req.path, req.query)));
}

for (const [legacy, target] of [['/index.html', '/'], ['/f2.html', '/f2'], ['/f3.html', '/f3']]) {
    app.get(legacy, (req, res) => res.redirect(308, target));
}

Object.entries(ACADEMY_PAGES).forEach(([slug, file]) => {
    app.get(slug ? `/academy/${slug}` : '/academy', (req, res, next) => {
        sendSeoPage(req, res, next, file, content => renderAcademyHtml(file, content));
    });
});

const sitemapRoutes = [
    '/', '/f2', '/f3', '/academy',
    ...publicPages.map(file => `/${file.slice(0, -'.html'.length)}`).filter(route => !/^\/f[23]-/.test(route)),
    ...juniorPages.map(({ route }) => route),
    ...Object.keys(ACADEMY_PAGES).filter(Boolean).map(slug => `/academy/${slug}`),
];

app.get('/robots.txt', (req, res) => res.type('text/plain').send(renderRobots()));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(renderSitemap(sitemapRoutes)));

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
    setHeaders(res, filePath) {
        const replayRoot = path.join(frontendDirectory, 'data', 'replays');
        if (!filePath.startsWith(replayRoot)) return;
        if (path.basename(filePath) === 'index.json') res.setHeader('Cache-Control', 'no-cache');
        else if (filePath.endsWith('.json')) res.setHeader('Cache-Control', 'public, max-age=300');
    }
}));

for (const route of ['core', 'seasons', 'drivers', 'circuits', 'constructors', 'chassis', 'races', 'records', 'games', 'account', 'points-systems', 'custom-championships', 'analytics']) {
    app.use(require(`./routes/${route}`));
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

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Racelytic running at http://localhost:${PORT}`);
    });
}

module.exports = app;
