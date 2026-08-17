const crypto = require('node:crypto');
const express = require('express');
const { pool, sendError } = require('../route-helpers');
const { ensureAuthSchema, getUserFromRequest, requireUser } = require('../auth');
const { serialize, validatePointsSystem } = require('../points-system');

const router = express.Router();
const SELECT_FIELDS = `
    ps.id, ps.user_id AS userId, u.display_name AS ownerName, ps.name,
    ps.race_points AS racePoints, ps.sprint_points AS sprintPoints,
    ps.qualifying_points AS qualifyingPoints,
    ps.pole_bonus AS poleBonus, ps.fastest_lap_bonus AS fastestLapBonus,
    ps.fastest_lap_max_position AS fastestLapMaxPosition,
    ps.count_best_rounds AS countBestRounds,
    ps.best_first_rounds AS bestFirstRounds, ps.first_rounds_window AS firstRoundsWindow,
    ps.best_last_rounds AS bestLastRounds, ps.last_rounds_window AS lastRoundsWindow,
    ps.sprint_counts_toward_round AS sprintCountsTowardRound,
    ps.visibility, ps.tie_breaker AS tieBreaker,
    ps.created_at AS createdAt, ps.updated_at AS updatedAt
`;

function invalid(res, error) {
    return res.status(400).json({ error: error.message });
}

router.use('/api/points-systems', (req, res, next) => {
    if (req.method === 'GET') return next();
    const origin = req.get('origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
        return res.status(403).json({ error: 'Invalid request origin.' });
    }
    next();
});

router.get('/api/points-systems', async (req, res) => {
    try {
        await ensureAuthSchema();
        const user = await getUserFromRequest(req);
        const rows = user
            ? await pool.query(`SELECT ${SELECT_FIELDS} FROM app_points_systems ps JOIN app_users u ON u.id = ps.user_id WHERE ps.visibility = 'public' OR ps.user_id = ? ORDER BY ps.user_id = ? DESC, ps.name`, [user.id, user.id])
            : await pool.query(`SELECT ${SELECT_FIELDS} FROM app_points_systems ps JOIN app_users u ON u.id = ps.user_id WHERE ps.visibility = 'public' ORDER BY ps.name`);
        res.json(rows.map(row => ({ ...serialize(row), owned: user?.id === row.userId })));
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/api/points-systems', requireUser, async (req, res) => {
    let system;
    try { system = validatePointsSystem(req.body); }
    catch (error) { return invalid(res, error); }

    try {
        const id = crypto.randomUUID();
        await pool.query(`
            INSERT INTO app_points_systems (
                id, user_id, name, race_points, sprint_points, qualifying_points, pole_bonus,
                fastest_lap_bonus, fastest_lap_max_position, count_best_rounds,
                best_first_rounds, first_rounds_window, best_last_rounds, last_rounds_window,
                sprint_counts_toward_round, visibility, tie_breaker
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, req.user.id, system.name, JSON.stringify(system.racePoints), JSON.stringify(system.sprintPoints),
            JSON.stringify(system.qualifyingPoints), system.poleBonus, system.fastestLapBonus, system.fastestLapMaxPosition, system.countBestRounds,
            system.bestFirstRounds, system.firstRoundsWindow, system.bestLastRounds, system.lastRoundsWindow,
            system.sprintCountsTowardRound ? 1 : 0, system.visibility, system.tieBreaker
        ]);
        const rows = await pool.query(`SELECT ${SELECT_FIELDS} FROM app_points_systems ps JOIN app_users u ON u.id = ps.user_id WHERE ps.id = ?`, [id]);
        res.status(201).json({ ...serialize(rows[0]), owned: true });
    } catch (error) {
        sendError(res, error);
    }
});

router.put('/api/points-systems/:id', requireUser, async (req, res) => {
    let system;
    try { system = validatePointsSystem(req.body); }
    catch (error) { return invalid(res, error); }

    try {
        const result = await pool.query(`
            UPDATE app_points_systems SET name = ?, race_points = ?, sprint_points = ?, qualifying_points = ?, pole_bonus = ?,
                fastest_lap_bonus = ?, fastest_lap_max_position = ?, count_best_rounds = ?,
                best_first_rounds = ?, first_rounds_window = ?, best_last_rounds = ?, last_rounds_window = ?,
                sprint_counts_toward_round = ?, visibility = ?, tie_breaker = ?
            WHERE id = ? AND user_id = ?
        `, [
            system.name, JSON.stringify(system.racePoints), JSON.stringify(system.sprintPoints), JSON.stringify(system.qualifyingPoints), system.poleBonus,
            system.fastestLapBonus, system.fastestLapMaxPosition, system.countBestRounds,
            system.bestFirstRounds, system.firstRoundsWindow, system.bestLastRounds, system.lastRoundsWindow,
            system.sprintCountsTowardRound ? 1 : 0, system.visibility, system.tieBreaker,
            req.params.id, req.user.id
        ]);
        if (!result.affectedRows) return res.status(404).json({ error: 'Points system not found.' });
        const rows = await pool.query(`SELECT ${SELECT_FIELDS} FROM app_points_systems ps JOIN app_users u ON u.id = ps.user_id WHERE ps.id = ?`, [req.params.id]);
        res.json({ ...serialize(rows[0]), owned: true });
    } catch (error) {
        sendError(res, error);
    }
});

router.delete('/api/points-systems/:id', requireUser, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM app_points_systems WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!result.affectedRows) return res.status(404).json({ error: 'Points system not found.' });
        res.status(204).end();
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;
