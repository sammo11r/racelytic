const fs = require('node:fs');
const path = require('node:path');
const { all: series } = require('../frontend/js/series-config');
const { SERIES_PAGE_TEMPLATES, SHARED_PAGE_TEMPLATES, seriesPageRoutes } = require('../backend/series-pages');
const { renderPageShell } = require('../backend/page-shell');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');
const outputDirectory = path.join(frontend, 'generated');
const outputFile = path.join(outputDirectory, 'page-manifest.json');

function buildManifest() {
    const routes = seriesPageRoutes().map(({ series: config, slug, file, route }) => {
        const source = fs.readFileSync(path.join(frontend, file), 'utf8');
        const rendered = renderPageShell(source);
        if (!rendered.includes('/css/components.css')) throw new Error(`${route || '/'} did not compile through the shared page shell.`);
        return { series: config.key, slug, route: route || '/', template: file };
    });
    return `${JSON.stringify({
        version: 1,
        series: Object.fromEntries(Object.entries(series).map(([key, config]) => [key, {
            name: config.name, shortName: config.shortName, path: config.path,
            modeClass: config.modeClass, favicon: config.favicon, entity: config.entity,
        }])),
        sharedTemplates: SHARED_PAGE_TEMPLATES,
        routes,
    }, null, 2)}\n`;
}

function buildFrontend({ check = false } = {}) {
    const output = buildManifest();
    if (check) {
        const current = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : '';
        if (current !== output) throw new Error('Frontend build output is stale. Run npm run build:frontend.');
        console.log(`Verified ${JSON.parse(output).routes.length} generated series routes and shared page shell.`);
        return;
    }
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(outputFile, output);
    console.log(`Built ${path.relative(root, outputFile)} with ${JSON.parse(output).routes.length} series routes.`);
}

if (require.main === module) {
    try {
        buildFrontend({ check: process.argv.includes('--check') });
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { buildFrontend, buildManifest };
