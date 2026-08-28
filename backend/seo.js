const DEFAULT_SITE_ORIGIN = 'https://racelytic.com';
const SOCIAL_IMAGE_PATH = '/assets/social-card.png';
const { all: SERIES } = require('../frontend/js/series-config');

const PAGE_META = Object.freeze({
    database: ['Database', 'Browse seasons, races, drivers, teams, circuits and championship history.'],
    seasons: ['Seasons', 'Explore every championship season, final standings and race calendar.'],
    season: ['Season', 'Explore championship standings, results and the complete race calendar.'],
    races: ['Races', 'Browse every race weekend by season, circuit and country.'],
    race: ['Race Results', 'Explore the complete race weekend, session classifications and results.'],
    drivers: ['Drivers', 'Browse driver careers, results, victories, podiums and championship records.'],
    driver: ['Driver', 'Explore a driver career, season history, statistics and race results.'],
    constructors: ['Constructors', 'Browse constructor history, drivers, cars, victories and championship records.'],
    constructor: ['Constructor', 'Explore constructor history, drivers, chassis and race results.'],
    teams: ['Teams', 'Browse team history, drivers, results and championship records.'],
    team: ['Team', 'Explore team history, drivers, seasons and race results.'],
    circuits: ['Circuits', 'Browse racing circuits, locations and every event held at each venue.'],
    circuit: ['Circuit', 'Explore circuit details, characteristics and complete race history.'],
    chassis: ['Chassis', 'Explore racing chassis, technical specifications and championship usage.'],
    analysis: ['Analysis', 'Compare eras, follow championship progression and uncover patterns in racing history.'],
    'season-analysis': ['Season Analysis', 'Visualise championship progression, title margins and race-by-race performance.'],
    'season-comparison': ['Season Comparison', 'Compare two championships across competition, reliability and driver performance.'],
    'race-analysis': ['Race Analysis', 'Analyse grid movement, results, attrition and team performance for a race.'],
    'driver-comparison': ['Driver Comparison', 'Compare driver careers, shared races and teammate performance head to head.'],
    'driver-form': ['Driver Form', 'Track recent finishing, qualifying, reliability and teammate performance.'],
    'teammate-battles': ['Teammate Battles', 'Compare drivers who raced for the same team in equal machinery.'],
    'circuit-analysis': ['Circuit Analysis', 'Discover circuit specialists, trends, reliability and grid movement.'],
    records: ['Records', 'Explore all-time driver, team, race and championship records.'],
    simulator: ['Simulator', 'Rewrite championships with alternative points, results, calendars and fields.'],
    'simulator-overview': ['Simulator', 'Explore championship simulations, scenario tools and custom scoring systems.'],
    'simulate-season': ['Season Simulator', 'Recalculate a championship with alternative scoring and result rules.'],
    'simulate-race': ['Race Replay', 'Replay a race with circuit position, timing and classification data.'],
    'scenario-calculator': ['Scenario Calculator', 'Change remaining results and explore possible championship outcomes.'],
    'championship-builder': ['Championship Builder', 'Build a custom championship with your own calendar, field and scoring rules.'],
    'points-systems': ['Points Systems', 'Create and compare reusable race, sprint and bonus-point scoring systems.'],
    games: ['Games', 'Play racing history quizzes, reaction challenges and management games.'],
    quizzes: ['Quizzes', 'Test your knowledge of champions, race winners and racing history.'],
    'world-champions-quiz': ['World Champions Quiz', 'Name every Formula 1 world champion and test your racing knowledge.'],
    'race-winners-quiz': ['Race Winners Quiz', 'Name race winners from championship history.'],
    'champions-quiz': ['Champions Quiz', 'Name every champion and test your racing knowledge.'],
    'idle-racing-manager': ['Idle Racing Manager', 'Build a racing team, develop the car and compete across fictional circuits.'],
    'lights-out': ['Lights Out', 'Test your reaction time against the starting lights.'],
    about: ['About', 'Learn about Racelytic, its racing data and the tools built on top of it.'],
    privacy: ['Privacy Notice', 'Read how Racelytic processes personal data and analytics preferences.'],
    terms: ['Terms of Service', 'Read the terms that apply when using Racelytic.'],
    account: ['Account', 'Sign in to save custom points systems and championships.'],
    search: ['Search', 'Search Racelytic for drivers, teams, seasons, races and circuits.'],
    monitor: ['Traffic Monitor', 'Private Racelytic traffic monitoring.'],
});

const NOINDEX_PAGES = new Set(['account', 'monitor', 'search']);
const DETAIL_PARAMS = Object.freeze({ season: 'year', race: 'id', driver: 'id', constructor: 'id', team: 'id', circuit: 'id' });

function esc(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function siteOrigin() {
    return String(process.env.SITE_URL || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
}

function routeContext(pathname) {
    const cleanPath = pathname === '/' ? '/' : String(pathname || '/').replace(/\/+$/, '');
    const match = cleanPath.match(/^\/(f2|f3|academy)(?:\/(.*))?$/);
    const seriesKey = match?.[1] || 'f1';
    const page = match ? match[2] || 'home' : cleanPath.slice(1) || 'home';
    return { cleanPath, page, series: SERIES[seriesKey] };
}

function queryValue(query, key) {
    const raw = query?.[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' && value.length <= 160 ? value.trim() : '';
}

function humanizeSlug(value) {
    if (!value || /^\d+$/.test(value) || /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)) return '';
    return value.split(/[-_]+/).filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function canonicalPath(pathname, query) {
    const context = routeContext(pathname);
    const parameter = DETAIL_PARAMS[context.page];
    const value = parameter ? queryValue(query, parameter) : '';
    return `${context.cleanPath}${value ? `?${parameter}=${encodeURIComponent(value)}` : ''}`;
}

function metadataFor(pathname, query = {}) {
    const context = routeContext(pathname);
    const canonical = `${siteOrigin()}${canonicalPath(context.cleanPath, query)}`;
    const image = `${siteOrigin()}${SOCIAL_IMAGE_PATH}`;
    const detailParameter = DETAIL_PARAMS[context.page];
    const detailValue = detailParameter ? queryValue(query, detailParameter) : '';
    const detailName = detailParameter === 'year' ? detailValue : humanizeSlug(detailValue);
    const pageMeta = PAGE_META[context.page] || [humanizeSlug(context.page) || 'Racing History', 'Explore racing history, statistics, analysis and simulation tools.'];

    let title;
    let description;
    if (context.page === 'home') {
        title = `${context.series.name} History, Statistics & Analysis · Racelytic`;
        description = `Explore ${context.series.name} history, results, drivers, teams, circuits, analysis, simulators and games with Racelytic.`;
    } else {
        const subject = detailName ? `${detailName} ${pageMeta[0]}` : pageMeta[0];
        title = `${subject} · ${context.series.name} · Racelytic`;
        description = `${pageMeta[1].replace(/\.$/, '')} across the ${context.series.name} archive.`;
    }

    const missingRequiredDetail = Boolean(detailParameter && !detailValue);
    const robots = NOINDEX_PAGES.has(context.page) || missingRequiredDetail ? 'noindex, follow' : 'index, follow';
    return { title, description, canonical, image, robots, page: context.page };
}

function renderSeoTags(metadata) {
    return [
        `<meta name="description" content="${esc(metadata.description)}">`,
        `<meta name="robots" content="${metadata.robots}">`,
        `<link rel="canonical" href="${esc(metadata.canonical)}">`,
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="Racelytic">',
        `<meta property="og:title" content="${esc(metadata.title)}">`,
        `<meta property="og:description" content="${esc(metadata.description)}">`,
        `<meta property="og:url" content="${esc(metadata.canonical)}">`,
        `<meta property="og:image" content="${esc(metadata.image)}">`,
        '<meta property="og:image:type" content="image/png">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="Racelytic racing history, statistics and analysis">',
        '<meta name="twitter:card" content="summary_large_image">',
        `<meta name="twitter:title" content="${esc(metadata.title)}">`,
        `<meta name="twitter:description" content="${esc(metadata.description)}">`,
        `<meta name="twitter:image" content="${esc(metadata.image)}">`,
    ].join('\n  ');
}

function applySeo(html, pathname, query = {}) {
    const metadata = metadataFor(pathname, query);
    const stripped = html
        .replace(/\s*<meta\s+name=["'](?:description|robots)["'][^>]*>/gi, '')
        .replace(/\s*<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, '')
        .replace(/\s*<link\s+rel=["']canonical["'][^>]*>/gi, '')
        .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(metadata.title)}</title>`);
    const tags = renderSeoTags(metadata);
    if (/<meta\s+name=["']viewport["'][^>]*>/i.test(stripped)) {
        return stripped.replace(/(<meta\s+name=["']viewport["'][^>]*>)/i, `$1\n  ${tags}`);
    }
    return stripped.replace(/<head>/i, `<head>\n  ${tags}`);
}

function renderRobots() {
    return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account\nDisallow: /monitor\nSitemap: ${siteOrigin()}/sitemap.xml\n`;
}

function renderSitemap(routes) {
    const urls = [...new Set(routes)]
        .filter(route => metadataFor(route).robots === 'index, follow')
        .sort((a, b) => a.localeCompare(b));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(route => `  <url><loc>${esc(`${siteOrigin()}${route}`)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

module.exports = { applySeo, canonicalPath, metadataFor, renderRobots, renderSitemap, routeContext };
