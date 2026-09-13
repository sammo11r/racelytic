const express = require('express');
const { sendError, withConnection } = require('../route-helpers');
const { requireMonitorAuth } = require('../monitor-auth');
const { integerOrDefault } = require('../validation');
const { MemoryRateLimiter } = require('../rate-limit');

const router = express.Router();
let schemaPromise;
let lastRetentionCleanup = 0;
const ingestionLimiter = new MemoryRateLimiter({ windowMs: 60 * 1000, limit: 120, maxEntries: 20000 });
const RETENTION_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;
const SERIES_RACE_QUERIES = Object.freeze({
    f1: `SELECT 'f1' AS series, races.id, races.officialName AS name, races.date, races.year, races.round
        FROM races WHERE EXISTS (SELECT 1 FROM races_race_results results WHERE results.raceId = races.id)
        ORDER BY races.date DESC, races.round DESC LIMIT 1`,
    f2: latestJuniorRaceQuery('f2'),
    f3: latestJuniorRaceQuery('f3'),
    academy: latestJuniorRaceQuery('fa')
});

function latestJuniorRaceQuery(prefix) {
    const series = prefix === 'fa' ? 'academy' : prefix;
    return `SELECT '${series}' AS series, races.id, races.name, races.date, races.year, races.round
        FROM ${prefix}_races races WHERE EXISTS (
            SELECT 1 FROM ${prefix}_sessions sessions
            JOIN ${prefix}_session_results results ON results.sessionId = sessions.id
            WHERE sessions.raceId = races.id
              AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
              AND LOWER(COALESCE(CAST(sessions.cancelled AS CHAR), 'false')) NOT IN ('1', 'true')
        ) ORDER BY races.date DESC, races.round DESC LIMIT 1`;
}

function protectIngestion(req, res, next) {
    const origin = req.get('origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).end();
    if (ingestionLimiter.consume(req.ip)) return res.status(429).end();
    next();
}

router.use('/api/analytics', protectIngestion);

function ensureAnalyticsSchema() {
    if (!schemaPromise) schemaPromise = withConnection(connection => connection.query(`
        CREATE TABLE IF NOT EXISTS app_analytics_visits (
            id CHAR(36) PRIMARY KEY,
            visitor_id CHAR(36) NOT NULL,
            path VARCHAR(500) NOT NULL,
            referrer_host VARCHAR(255) NULL,
            started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
            INDEX analytics_started_at (started_at),
            INDEX analytics_visitor_id (visitor_id),
            INDEX analytics_path (path(191))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)).catch(error => { schemaPromise = null; throw error; });
    return schemaPromise;
}

function validId(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function normalizedPath(value) {
    const path = String(value || '').split(/[?#]/, 1)[0].slice(0, 500);
    return path.startsWith('/') ? path : '';
}

async function applyRetention(connection) {
    if (Date.now() - lastRetentionCleanup < RETENTION_CLEANUP_INTERVAL) return;
    await connection.query('DELETE FROM app_analytics_visits WHERE started_at < CURRENT_DATE - INTERVAL 13 MONTH');
    lastRetentionCleanup = Date.now();
}

async function optionalOperationalQuery(connection, sql, params = []) {
    try { return await connection.query(sql, params); }
    catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE' || Number(error.errno) === 1146) return [];
        throw error;
    }
}

async function operationalStatus(connection) {
    const [raceRows, syncRows, ratingRows] = await Promise.all([
        Promise.all(Object.values(SERIES_RACE_QUERIES).map(query => optionalOperationalQuery(connection, query))),
        optionalOperationalQuery(connection, `SELECT id, started_at AS startedAt, finished_at AS finishedAt, status, series, error_message AS errorMessage
            FROM app_data_sync_runs ORDER BY started_at DESC LIMIT 1`),
        optionalOperationalQuery(connection, `SELECT series, MAX(calculated_at) AS calculatedAt
            FROM app_rating_runs GROUP BY series ORDER BY series`)
    ]);
    return {
        database: 'healthy',
        latestRaces: raceRows.flat(),
        latestSync: syncRows[0] || null,
        ratingRuns: ratingRows,
        checkedAt: new Date().toISOString()
    };
}

router.post('/api/analytics/visit', async (req, res) => {
    const { id, visitorId } = req.body || {};
    const path = normalizedPath(req.body?.path);
    const referrerHost = String(req.body?.referrerHost || '').slice(0, 255) || null;
    if (!validId(id) || !validId(visitorId) || !path.startsWith('/') || path.startsWith('/monitor')) return res.status(400).end();
    try {
        await ensureAnalyticsSchema();
        await withConnection(async connection => {
            await applyRetention(connection);
            await connection.query(
                'INSERT IGNORE INTO app_analytics_visits (id, visitor_id, path, referrer_host) VALUES (?, ?, ?, ?)',
                [id, visitorId, path, referrerHost]
            );
        });
        res.status(204).end();
    } catch (error) { sendError(res, error); }
});

router.post('/api/analytics/heartbeat', async (req, res) => {
    const id = req.body?.id;
    const duration = integerOrDefault(req.body?.duration, 0, { min: 0, max: 86400 });
    if (!validId(id)) return res.status(400).end();
    try {
        await ensureAnalyticsSchema();
        await withConnection(connection => connection.query(
            'UPDATE app_analytics_visits SET last_seen_at = CURRENT_TIMESTAMP(3), duration_seconds = GREATEST(duration_seconds, ?) WHERE id = ?',
            [duration, id]
        ));
        res.status(204).end();
    } catch (error) { sendError(res, error); }
});

router.get('/api/analytics/report', requireMonitorAuth, async (req, res) => {
    const days = integerOrDefault(req.query.days, 30, { min: 1, max: 365 });
    try {
        await ensureAnalyticsSchema();
        const data = await withConnection(async connection => {
            await applyRetention(connection);
            const params = [days];
            const summarySql = `SELECT COUNT(*) AS visits, COUNT(DISTINCT visitor_id) AS visitors,
                    COALESCE(ROUND(AVG(duration_seconds)), 0) AS averageDuration,
                    COALESCE(SUM(duration_seconds), 0) AS totalDuration,
                    COALESCE(SUM(duration_seconds >= 10), 0) AS engagedVisits,
                    COUNT(DISTINCT CASE WHEN last_seen_at >= CURRENT_TIMESTAMP - INTERVAL 5 MINUTE THEN visitor_id END) AS activeNow
                    FROM app_analytics_visits`;
            const [summary, previousSummary, daily, pages, referrers, recent, operations] = await Promise.all([
                connection.query(`SELECT COUNT(*) AS visits, COUNT(DISTINCT visitor_id) AS visitors,
                    COALESCE(ROUND(AVG(duration_seconds)), 0) AS averageDuration,
                    COALESCE(SUM(duration_seconds), 0) AS totalDuration,
                    COALESCE(SUM(duration_seconds >= 10), 0) AS engagedVisits,
                    COUNT(DISTINCT CASE WHEN last_seen_at >= CURRENT_TIMESTAMP - INTERVAL 5 MINUTE THEN visitor_id END) AS activeNow
                    FROM app_analytics_visits WHERE started_at >= CURRENT_TIMESTAMP - INTERVAL ? DAY`, params),
                connection.query(`${summarySql} WHERE started_at >= CURRENT_TIMESTAMP - INTERVAL ? DAY
                    AND started_at < CURRENT_TIMESTAMP - INTERVAL ? DAY`, [days * 2, days]),
                connection.query(`SELECT DATE(started_at) AS date, COUNT(*) AS visits,
                    COUNT(DISTINCT visitor_id) AS visitors, COALESCE(ROUND(AVG(duration_seconds)), 0) AS averageDuration
                    FROM app_analytics_visits WHERE started_at >= CURRENT_TIMESTAMP - INTERVAL ? DAY
                    GROUP BY DATE(started_at) ORDER BY date`, params),
                connection.query(`SELECT path, COUNT(*) AS visits, COUNT(DISTINCT visitor_id) AS visitors,
                    COALESCE(ROUND(AVG(duration_seconds)), 0) AS averageDuration,
                    COALESCE(SUM(duration_seconds >= 10), 0) AS engagedVisits
                    FROM app_analytics_visits WHERE started_at >= CURRENT_TIMESTAMP - INTERVAL ? DAY
                    GROUP BY path ORDER BY visits DESC LIMIT 50`, params),
                connection.query(`SELECT COALESCE(NULLIF(referrer_host, ''), 'Direct') AS referrerHost,
                    COUNT(*) AS visits, COUNT(DISTINCT visitor_id) AS visitors,
                    COALESCE(ROUND(AVG(duration_seconds)), 0) AS averageDuration
                    FROM app_analytics_visits WHERE started_at >= CURRENT_TIMESTAMP - INTERVAL ? DAY
                    GROUP BY COALESCE(NULLIF(referrer_host, ''), 'Direct') ORDER BY visits DESC LIMIT 25`, params),
                connection.query(`SELECT path, referrer_host AS referrerHost, started_at AS startedAt,
                    last_seen_at AS lastSeenAt, duration_seconds AS durationSeconds FROM app_analytics_visits
                    ORDER BY started_at DESC LIMIT 100`),
                operationalStatus(connection)
            ]);
            return { summary: summary[0], previousSummary: previousSummary[0], daily, pages, referrers, recent, operations };
        });
        res.json({ days, ...data });
    } catch (error) { sendError(res, error); }
});

module.exports = router;
module.exports.latestJuniorRaceQuery = latestJuniorRaceQuery;
module.exports.operationalStatus = operationalStatus;
