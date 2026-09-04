const express = require('express');
const { pool, sendError } = require('../route-helpers');
const { ensureAuthSchema } = require('../auth');
const { configuredItems, filterItems, pointItems } = require('../community');

const router = express.Router();
const TYPES = new Set(['all', 'points', 'records', 'championships']);
const SERIES = new Set(['all', 'f1', 'f2', 'f3', 'academy']);
const SORTS = new Set(['newest', 'updated', 'oldest', 'name']);

router.get('/api/community', async (req, res) => {
    const type = TYPES.has(req.query.type) ? req.query.type : 'all';
    const series = SERIES.has(req.query.series) ? req.query.series : 'all';
    const sort = SORTS.has(req.query.sort) ? req.query.sort : 'newest';
    const query = String(req.query.q || '').slice(0, 80);
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.max(6, Math.min(48, Number.parseInt(req.query.limit, 10) || 12));

    try {
        await ensureAuthSchema();
        const requested = type === 'all' ? ['points', 'records', 'championships'] : [type];
        const queries = [];
        if (requested.includes('points')) queries.push(pool.query(`
            SELECT ps.id, ps.name, u.display_name AS ownerName,
                ps.race_points AS racePoints, ps.sprint_points AS sprintPoints,
                ps.qualifying_points AS qualifyingPoints, ps.pole_bonus AS poleBonus,
                ps.fastest_lap_bonus AS fastestLapBonus, ps.count_best_rounds AS countBestRounds,
                ps.created_at AS createdAt, ps.updated_at AS updatedAt
            FROM app_points_systems ps JOIN app_users u ON u.id = ps.user_id
            WHERE ps.visibility = 'public' ORDER BY ps.updated_at DESC LIMIT 500
        `).then(pointItems));
        if (requested.includes('records')) queries.push(pool.query(`
            SELECT records.id, records.name, users.display_name AS ownerName,
                records.configuration, records.created_at AS createdAt, records.updated_at AS updatedAt
            FROM app_saved_records records JOIN app_users users ON users.id = records.user_id
            WHERE records.visibility = 'public' ORDER BY records.updated_at DESC LIMIT 500
        `).then(rows => configuredItems(rows, 'records')));
        if (requested.includes('championships')) queries.push(pool.query(`
            SELECT c.id, c.name, c.description, u.display_name AS ownerName,
                c.configuration, c.created_at AS createdAt, c.updated_at AS updatedAt
            FROM app_custom_championships c JOIN app_users u ON u.id = c.user_id
            WHERE c.visibility = 'public' ORDER BY c.updated_at DESC LIMIT 500
        `).then(rows => configuredItems(rows, 'championships')));

        const items = filterItems((await Promise.all(queries)).flat(), { type, series, query, sort });
        const start = (page - 1) * limit;
        res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
        res.json({ items: items.slice(start, start + limit), total: items.length, page, limit, hasMore: start + limit < items.length });
    } catch (error) { sendError(res, error); }
});

module.exports = router;
