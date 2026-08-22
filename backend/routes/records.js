const express = require('express');
const crypto = require('node:crypto');
const { withConnection, sendError, pool } = require('../route-helpers');
const { optionalInteger } = require('../validation');
const { ensureAuthSchema, requireUser } = require('../auth');

const router = express.Router();
const { isJuniorSeries, seriesPrefix } = require('../series-config');
const CATEGORIES = {
    wins: { expression: 'SUM(source.positionNumber = 1)', label: 'Wins' },
    championships: { expression: null, label: 'Championships' },
    podiums: { expression: 'SUM(source.positionNumber BETWEEN 1 AND 3)', label: 'Podiums' },
    poles: { expression: 'SUM(source.polePosition = 1)', label: 'Pole positions' },
    fastestLaps: { expression: 'SUM(source.fastestLap = 1)', label: 'Fastest laps' },
    points: { expression: 'SUM(source.points)', label: 'Points' },
    starts: { expression: 'COUNT(*)', label: 'Starts' },
    gridGain: { expression: 'AVG(CASE WHEN source.gridPositionNumber > 0 AND source.positionNumber > 0 THEN source.gridPositionNumber - source.positionNumber END)', label: 'Average positions gained' }
};

function recordConfiguration(input = {}) {
    const type = input.type === 'constructors' ? 'constructors' : 'drivers';
    const category = CATEGORIES[input.category] ? input.category : 'wins';
    const series = isJuniorSeries(input.series) ? input.series : 'f1';
    const year = value => optionalInteger(value, { min: 1950, max: 2200 });
    return {
        series, type, category, fromYear: year(input.fromYear), toYear: year(input.toYear),
        circuitId: String(input.circuitId || '').slice(0, 100),
        constructorId: type === 'drivers' ? String(input.constructorId || '').slice(0, 100) : '',
        nationality: String(input.nationality || '').slice(0, 20),
        includeSprints: input.includeSprints === true
    };
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
    } catch (error) { sendError(res, error); }
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
    const type = req.query.type === 'constructors' ? 'constructors' : 'drivers';
    const category = CATEGORIES[req.query.category] ? req.query.category : 'wins';
    const fromYear = optionalInteger(req.query.fromYear, { min: 1950, max: 2200 });
    const toYear = optionalInteger(req.query.toYear, { min: 1950, max: 2200 });
    const circuitId = String(req.query.circuitId || '').trim();
    const constructorId = String(req.query.constructorId || '').trim();
    const nationality = String(req.query.nationality || '').trim();
    const includeSprints = req.query.includeSprints === 'true';
    const limit = optionalInteger(req.query.limit, { min: 1, max: 250 }) || 100;

    try {
        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const data = await withConnection(async connection => {
                const params = [];
                const filters = ["LOWER(CAST(sessions.isRace AS CHAR)) IN ('1','true')", "(sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1','true'))"];
                if (!includeSprints) filters.push("LOWER(sessions.name) NOT LIKE '%sprint%'");
                if (category === 'gridGain') filters.push("LOWER(sessions.name) NOT LIKE '%sprint%'");
                if (fromYear) { filters.push('source.year >= ?'); params.push(fromYear); }
                if (toYear) { filters.push('source.year <= ?'); params.push(toYear); }
                if (circuitId) { filters.push('races.circuitId = ?'); params.push(circuitId); }
                if (constructorId) { filters.push('source.constructorId = ?'); params.push(constructorId); }
                if (nationality) { filters.push(type === 'drivers' ? 'drivers.countryCode = ?' : 'constructors.countryCode = ?'); params.push(nationality); }
                const entityJoin = type === 'drivers' ? `JOIN ${prefix}drivers drivers ON drivers.id = source.driverId` : `JOIN ${prefix}constructors constructors ON constructors.id = source.constructorId`;
                const entity = type === 'drivers' ? 'drivers' : 'constructors';
                const standingsTable = type === 'drivers' ? `${prefix}season_driver_standings` : `${prefix}season_constructor_standings`;
                const standingsField = type === 'drivers' ? 'driverId' : 'constructorId';
                let valueExpression = CATEGORIES[category].expression;
                let qualifyingJoin = '';
                if (category === 'gridGain') {
                    valueExpression = 'AVG(CASE WHEN qualifyingPositions.gridPosition BETWEEN 1 AND 99 AND source.positionNumber BETWEEN 1 AND 99 THEN qualifyingPositions.gridPosition - source.positionNumber END)';
                    qualifyingJoin = `LEFT JOIN (
                        SELECT qualifying.raceId, qualifying.driverId, MIN(qualifying.positionNumber) AS gridPosition
                        FROM ${prefix}session_results qualifying
                        JOIN ${prefix}sessions qualifyingSession ON qualifyingSession.id = qualifying.sessionId
                        WHERE LOWER(qualifyingSession.name) LIKE '%qualif%' AND qualifying.positionNumber BETWEEN 1 AND 99
                        GROUP BY qualifying.raceId, qualifying.driverId
                    ) qualifyingPositions ON qualifyingPositions.raceId = source.raceId AND qualifyingPositions.driverId = source.driverId`;
                }
                const valueParams = [];
                if (category === 'championships') {
                    const yearFilters = [];
                    if (fromYear) { yearFilters.push('standing.year >= ?'); valueParams.push(fromYear); }
                    if (toYear) { yearFilters.push('standing.year <= ?'); valueParams.push(toYear); }
                    valueExpression = `(SELECT COUNT(*) FROM ${standingsTable} standing WHERE standing.${standingsField} = ${entity}.id AND standing.positionNumber = 1 AND (LOWER(CAST(standing.championshipWon AS CHAR)) IN ('1','true') OR standing.year < YEAR(CURRENT_DATE()))${yearFilters.length ? ` AND ${yearFilters.join(' AND ')}` : ''})`;
                }
                const rows = await connection.query(`SELECT ${entity}.id, ${entity}.name, ${entity}.countryCode AS nationalityCountryId,
                    ${valueExpression} AS value, COUNT(*) AS starts, SUM(source.positionNumber = 1) AS wins,
                    SUM(source.positionNumber BETWEEN 1 AND 3) AS podiums, SUM(COALESCE(source.points,0)) AS points,
                    MIN(source.year) AS firstYear, MAX(source.year) AS lastYear
                    FROM ${prefix}session_results source JOIN ${prefix}sessions sessions ON sessions.id = source.sessionId
                    JOIN ${prefix}races races ON races.id = source.raceId ${entityJoin} ${qualifyingJoin}
                    WHERE ${filters.join(' AND ')} GROUP BY ${entity}.id, ${entity}.name, ${entity}.countryCode
                    HAVING value IS NOT NULL AND value > 0 ORDER BY value DESC, wins DESC, podiums DESC, name LIMIT ${limit}`, [...valueParams, ...params]);
                return rows.map(row=>({...row,value:Number(row.value),starts:Number(row.starts),wins:Number(row.wins),podiums:Number(row.podiums),points:Number(row.points),firstYear:Number(row.firstYear),lastYear:Number(row.lastYear)}));
            });
            return res.json({type,category,label:CATEGORIES[category].label,includeSprints,entries:data});
        }
        const data = await withConnection(async connection => {
            const params = [];
            const filters = [];
            if (fromYear) { filters.push('source.year >= ?'); params.push(fromYear); }
            if (toYear) { filters.push('source.year <= ?'); params.push(toYear); }
            if (circuitId) { filters.push('source.circuitId = ?'); params.push(circuitId); }
            if (constructorId) { filters.push('source.constructorId = ?'); params.push(constructorId); }
            if (nationality) { filters.push(type === 'drivers' ? 'd.nationalityCountryId = ?' : 'k.countryId = ?'); params.push(nationality); }

            const raceSource = `SELECT rr.driverId, rr.constructorId, rr.year, r.circuitId,
                rr.positionNumber, rr.gridPositionNumber, rr.points, rr.polePosition, rr.fastestLap
                FROM races_race_results rr JOIN races r ON r.id = rr.raceId`;
            const sprintSource = `SELECT sr.driverId, sr.constructorId, sr.year, r.circuitId,
                sr.positionNumber, sr.gridPositionNumber, sr.points, 0 AS polePosition, 0 AS fastestLap
                FROM races_sprint_race_results sr JOIN races r ON r.id = sr.raceId`;
            const source = includeSprints ? `(${raceSource} UNION ALL ${sprintSource})` : `(${raceSource})`;
            const entityJoin = type === 'drivers'
                ? 'JOIN drivers d ON d.id = source.driverId LEFT JOIN constructors k ON k.id = source.constructorId'
                : 'JOIN constructors k ON k.id = source.constructorId';
            const id = type === 'drivers' ? 'd.id' : 'k.id';
            const name = type === 'drivers' ? 'd.name' : 'k.name';
            const nationalityColumn = type === 'drivers' ? 'd.nationalityCountryId' : 'k.countryId';
            const group = type === 'drivers' ? 'd.id, d.name, d.nationalityCountryId' : 'k.id, k.name, k.countryId';
            const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
            const valueParams = [];
            let valueExpression = CATEGORIES[category].expression;
            if (category === 'championships') {
                const table = type === 'drivers' ? 'seasons_driver_standings' : 'seasons_constructor_standings';
                const field = type === 'drivers' ? 'driverId' : 'constructorId';
                const entity = type === 'drivers' ? 'd.id' : 'k.id';
                const yearFilters = [];
                if (fromYear) { yearFilters.push('standing.year >= ?'); valueParams.push(fromYear); }
                if (toYear) { yearFilters.push('standing.year <= ?'); valueParams.push(toYear); }
                valueExpression = `(SELECT COUNT(*) FROM ${table} standing WHERE standing.${field} = ${entity}
                    AND standing.championshipWon = 1${yearFilters.length ? ` AND ${yearFilters.join(' AND ')}` : ''})`;
            }
            const rows = await connection.query(`SELECT ${id} AS id, ${name} AS name,
                ${nationalityColumn} AS nationalityCountryId, ${valueExpression} AS value,
                COUNT(*) AS starts, SUM(source.positionNumber = 1) AS wins,
                SUM(source.positionNumber BETWEEN 1 AND 3) AS podiums, SUM(source.points) AS points,
                MIN(source.year) AS firstYear, MAX(source.year) AS lastYear
                FROM ${source} source ${entityJoin} ${where}
                GROUP BY ${group} HAVING value IS NOT NULL AND value > 0
                ORDER BY value DESC, wins DESC, podiums DESC, name LIMIT ${limit}`, [...valueParams, ...params]);
            return rows.map(row => ({ ...row, value: Number(row.value), starts: Number(row.starts), wins: Number(row.wins), podiums: Number(row.podiums), points: Number(row.points), firstYear: Number(row.firstYear), lastYear: Number(row.lastYear) }));
        });
        res.json({ type, category, label: CATEGORIES[category].label, includeSprints, entries: data });
    } catch (error) { sendError(res, error); }
});

module.exports = router;
