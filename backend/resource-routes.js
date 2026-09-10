const RESOURCE_ROUTES = Object.freeze({
    season: Object.freeze({ collection: 'seasons', parameter: 'year' }),
    race: Object.freeze({ collection: 'races', parameter: 'id', slug: true }),
    driver: Object.freeze({ collection: 'drivers', parameter: 'id' }),
    constructor: Object.freeze({ collection: 'constructors', parameter: 'id' }),
    team: Object.freeze({ collection: 'teams', parameter: 'id' }),
    circuit: Object.freeze({ collection: 'circuits', parameter: 'id' }),
    chassis: Object.freeze({ collection: 'chassis', parameter: 'id' })
});

const COLLECTION_TO_RESOURCE = Object.freeze(Object.fromEntries(
    Object.entries(RESOURCE_ROUTES).map(([resource, config]) => [config.collection, resource])
));

function seriesBase(series) {
    const key = typeof series === 'string' ? series : series?.key;
    return !key || key === 'f1' ? '' : `/${key}`;
}

function slugify(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100);
}

function resourcePath(series, resource, id, label = '') {
    const config = RESOURCE_ROUTES[resource];
    if (!config || id === null || id === undefined || id === '') return '';
    const path = `${seriesBase(series)}/${config.collection}/${encodeURIComponent(String(id))}`;
    const slug = config.slug ? slugify(label) : '';
    return slug ? `${path}/${slug}` : path;
}

function matchResourcePath(pathname) {
    const clean = String(pathname || '/').replace(/\/+$/, '') || '/';
    const match = clean.match(/^\/(?:((?:f2|f3|academy))\/)?(seasons|races|drivers|constructors|teams|circuits|chassis)\/([^/]+)(?:\/([^/]+))?$/);
    if (!match) return null;
    const resource = COLLECTION_TO_RESOURCE[match[2]];
    if (!resource || (match[4] && !RESOURCE_ROUTES[resource].slug)) return null;
    try {
        return { series: match[1] || 'f1', resource, id: decodeURIComponent(match[3]), slug: match[4] || '' };
    } catch {
        return null;
    }
}

module.exports = { COLLECTION_TO_RESOURCE, RESOURCE_ROUTES, matchResourcePath, resourcePath, seriesBase, slugify };
