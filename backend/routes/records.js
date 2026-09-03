const express = require('express');
const crypto = require('node:crypto');
const { withConnection, sendError, pool } = require('../route-helpers');
const { ensureAuthSchema, requireUser } = require('../auth');
const f1Records = require('../f1-records');
const juniorRecords = require('../junior-records');

const router = express.Router();
const { isJuniorSeries } = require('../series-config');

function recordConfiguration(input = {}) {
    return isJuniorSeries(input.series) ? juniorRecords.configuration(input) : f1Records.configuration(input);
}

router.use('/api/records/saved', (req, res, next) => {
    if (req.method === 'GET') return next();
    const origin = req.get('origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error: 'Invalid request origin.' });
    next();
});

router.get('/api/records/saved', requireUser, async (req, res) => {
    try {
        await ensureAuthSchema();
        const rows = await pool.query(`
            SELECT records.id, records.user_id AS userId, users.display_name AS ownerName,
                records.name, records.configuration, records.visibility,
                records.created_at AS createdAt, records.updated_at AS updatedAt
            FROM app_saved_records records
            JOIN app_users users ON users.id = records.user_id
            WHERE records.visibility = 'public' OR records.user_id = ?
            ORDER BY records.user_id = ? DESC, records.updated_at DESC
        `, [req.user.id, req.user.id]);
        res.json(rows.map(row => ({
            ...row,
            owned: row.userId === req.user.id,
            configuration: typeof row.configuration === 'string' ? JSON.parse(row.configuration) : row.configuration
        })));
    } catch (error) { sendError(res, error); }
});

router.post('/api/records/saved', requireUser, async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Record name must be 2–100 characters.' });
    try {
        await ensureAuthSchema();
        const id = crypto.randomUUID(), configuration = recordConfiguration(req.body.configuration);
        const visibility = req.body.visibility === 'public' ? 'public' : 'private';
        await pool.query('INSERT INTO app_saved_records (id, user_id, name, configuration, visibility) VALUES (?, ?, ?, ?, ?)', [id, req.user.id, name, JSON.stringify(configuration), visibility]);
        res.status(201).json({ id, name, configuration, visibility, owned: true });
    } catch (error) { if (error.status === 400) return res.status(400).json({ error: error.message }); sendError(res, error); }
});

router.delete('/api/records/saved/:id', requireUser, async (req, res) => {
    try {
        await ensureAuthSchema();
        const result = await pool.query('DELETE FROM app_saved_records WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!result.affectedRows) return res.status(404).json({ error: 'Saved record not found.' });
        res.status(204).end();
    } catch (error) { sendError(res, error); }
});

router.get('/api/records/explore', async (req, res) => {
    try {
        const records = isJuniorSeries(req.query.series) ? juniorRecords : f1Records;
        return res.json(await withConnection(connection => records.explore(connection, req.query)));
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ error: error.message });
        sendError(res, error);
    }
});

module.exports = router;
