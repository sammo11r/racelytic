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
            const [summary, daily, pages, recent] = await Promise.all([
                connection.query(`SELECT COUNT(*) AS visits, COUNT(DISTINCT visitor_id) AS visitors,
                    COALESCE(ROUND(AVG(duration_seconds)), 0) AS averageDuration,
                    COALESCE(SUM(last_seen_at >= CURRENT_TIMESTAMP - INTERVAL 5 MINUTE), 0) AS activeNow
                    FROM app_analytics_visits WHERE started_at >= CURRENT_DATE - INTERVAL ? DAY`, params),
                connection.query(`SELECT DATE(started_at) AS date, COUNT(*) AS visits,
                    COUNT(DISTINCT visitor_id) AS visitors, COALESCE(ROUND(AVG(duration_seconds)), 0) AS averageDuration
                    FROM app_analytics_visits WHERE started_at >= CURRENT_DATE - INTERVAL ? DAY
                    GROUP BY DATE(started_at) ORDER BY date`, params),
                connection.query(`SELECT path, COUNT(*) AS visits, COUNT(DISTINCT visitor_id) AS visitors,
                    COALESCE(ROUND(AVG(duration_seconds)), 0) AS averageDuration
                    FROM app_analytics_visits WHERE started_at >= CURRENT_DATE - INTERVAL ? DAY
                    GROUP BY path ORDER BY visits DESC LIMIT 50`, params),
                connection.query(`SELECT path, referrer_host AS referrerHost, started_at AS startedAt,
                    duration_seconds AS durationSeconds FROM app_analytics_visits
                    ORDER BY started_at DESC LIMIT 100`)
            ]);
            return { summary: summary[0], daily, pages, recent };
        });
        res.json({ days, ...data });
    } catch (error) { sendError(res, error); }
});

module.exports = router;
