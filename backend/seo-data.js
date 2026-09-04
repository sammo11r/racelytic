const pool = require('./db');
const { routeContext } = require('./seo');

const SERIES_PREFIX = Object.freeze({ f1: '', f2: 'f2_', f3: 'f3_', academy: 'fa_' });
const SITEMAP_CACHE_MS = 5 * 60 * 1000;
let sitemapCache = { expiresAt: 0, routes: [] };
let sitemapPromise;

function queryValue(req, name) {
    const value = Array.isArray(req.query?.[name]) ? req.query[name][0] : req.query?.[name];
    return typeof value === 'string' && value.length <= 160 ? value.trim() : '';
}

function seriesBase(key) {
    return key === 'f1' ? '' : `/${key}`;
}

async function resolveCommunityMetadata(req, context, id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const rows = await pool.query(`
        SELECT c.name, c.description, c.configuration, u.display_name AS ownerName
        FROM app_custom_championships c
        JOIN app_users u ON u.id = c.user_id
        WHERE c.id = ? AND c.visibility = 'public'
    `, [id]);
    if (!rows.length) return null;
    const configuration = typeof rows[0].configuration === 'string'
        ? JSON.parse(rows[0].configuration) : rows[0].configuration;
    if ((configuration?.series || 'f1') !== context.series.key) return null;
    return {
        title: `${rows[0].name} · ${context.series.name} · Racelytic`,
        description: rows[0].description || `A custom ${context.series.name} championship created by ${rows[0].ownerName} on Racelytic.`,
        robots: 'index, follow'
    };
}

async function resolveEntityMetadata(req, context, page, id) {
    const prefix = SERIES_PREFIX[context.series.key];
    const entity = page === 'team' ? 'constructor' : page;
    let sql;
    if (entity === 'season') {
        if (!/^\d{4}$/.test(id)) return null;
        sql = `SELECT CAST(year AS CHAR) AS name FROM ${prefix}seasons WHERE year = ?`;
    } else if (entity === 'race' && context.series.key === 'f1') {
        sql = `SELECT CONCAT(r.year, ' ', COALESCE(NULLIF(gp.fullName, ''), r.officialName)) AS name
            FROM races r LEFT JOIN grands_prix gp ON gp.id = r.grandPrixId WHERE r.id = ?`;
    } else if (entity === 'race') {
        sql = `SELECT CONCAT(year, ' ', name) AS name FROM ${prefix}races WHERE id = ?`;
    } else if (['driver', 'constructor', 'circuit', 'chassis'].includes(entity)) {
        const table = entity === 'chassis' ? `${prefix}chassis` : `${prefix}${entity}s`;
        const name = context.series.key === 'f1' ? "COALESCE(NULLIF(fullName, ''), name)" : 'name';
        sql = `SELECT ${name} AS name FROM ${table} WHERE id = ?`;
    } else {
        return null;
    }
    const rows = await pool.query(sql, [id]);
    if (!rows.length) return { robots: 'noindex, follow' };
    const labels = { season: 'Season', race: 'Results', driver: 'Driver', constructor: 'Constructor', team: 'Team', circuit: 'Circuit', chassis: 'Chassis' };
    return {
        title: `${rows[0].name} ${labels[page] || labels[entity]} · ${context.series.name} · Racelytic`
    };
}

async function resolveSeoMetadata(req) {
    const context = routeContext(req.path);
    const parameter = context.page === 'season' ? 'year' : 'id';
    const id = queryValue(req, parameter);
    if (!id) return {};
    try {
        if (context.page === 'championship-builder') {
            return await resolveCommunityMetadata(req, context, id) || {};
        }
        return await resolveEntityMetadata(req, context, context.page, id) || {};
    } catch (error) {
        console.error('Unable to resolve dynamic SEO metadata:', error.message);
        return {};
    }
}

async function buildDynamicSitemapRoutes() {
    const specs = [
        ['f1', '', 'seasons', 'season', 'year', 'year'], ['f1', '', 'drivers', 'driver', 'id', 'id'],
        ['f1', '', 'constructors', 'constructor', 'id', 'id'], ['f1', '', 'circuits', 'circuit', 'id', 'id'],
        ['f1', '', 'races', 'race', 'id', 'id'], ['f1', '', 'chassis', 'chassis', 'id', 'id'],
        ...['f2', 'f3', 'academy'].flatMap(series => {
            const prefix = SERIES_PREFIX[series];
            const base = seriesBase(series);
            const teamPage = series === 'f2' ? 'constructor' : 'team';
            return [
                [series, base, `${prefix}seasons`, 'season', 'year', 'year'],
                [series, base, `${prefix}drivers`, 'driver', 'id', 'id'],
                [series, base, `${prefix}constructors`, teamPage, 'id', 'id'],
                [series, base, `${prefix}circuits`, 'circuit', 'id', 'id'],
                [series, base, `${prefix}races`, 'race', 'id', 'id'],
                [series, base, `${prefix}chassis`, 'chassis', 'id', 'id']
            ];
        })
    ];
    const groups = await Promise.all(specs.map(async ([, base, table, page, column, parameter]) => {
        const rows = await pool.query(`SELECT ${column} AS value FROM ${table}`);
        return rows.map(row => `${base}/${page}?${parameter}=${encodeURIComponent(row.value)}`);
    }));
    let community = [];
    try {
        const rows = await pool.query("SELECT id, configuration FROM app_custom_championships WHERE visibility = 'public'");
        community = rows.map(row => {
            const configuration = typeof row.configuration === 'string' ? JSON.parse(row.configuration) : row.configuration;
            const base = seriesBase(configuration?.series || 'f1');
            return `${base}/championship-builder?id=${encodeURIComponent(row.id)}`;
        });
    } catch (error) {
        if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    }
    return [...groups.flat(), ...community];
}

async function dynamicSitemapRoutes() {
    if (sitemapCache.expiresAt > Date.now()) return sitemapCache.routes;
    if (!sitemapPromise) {
        sitemapPromise = buildDynamicSitemapRoutes().then(routes => {
            sitemapCache = { expiresAt: Date.now() + SITEMAP_CACHE_MS, routes };
            return routes;
        }).finally(() => { sitemapPromise = null; });
    }
    return sitemapPromise;
}

module.exports = { dynamicSitemapRoutes, resolveSeoMetadata };
