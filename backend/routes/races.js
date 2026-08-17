const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { optionalInteger } = require('../validation');

const router = express.Router();

// ============================================================
// Races
// ============================================================

router.get('/api/races/:id', async (req, res) => {
    try {
        const data = await withConnection(async connection => {
            const sessionQuery = (table, columns) => connection.query(`
                SELECT sr.positionNumber, sr.positionText, sr.positionDisplayOrder,
                    sr.driverNumber, sr.driverId, sr.constructorId, ${columns},
                    d.name AS driverName, k.name AS constructorName
                FROM ${table} sr
                JOIN drivers d ON d.id = sr.driverId
                LEFT JOIN constructors k ON k.id = sr.constructorId
                WHERE sr.raceId = ?
                ORDER BY sr.positionDisplayOrder, sr.positionNumber
            `, [req.params.id]);

            const [raceRows, results, sprint, qualifying, qualifying1, qualifying2,
                sprintQualifying, preQualifying, practice1, practice2, practice3,
                practice4, warmingUp] = await Promise.all([
                connection.query(`
                    SELECT r.*, c.name AS circuitName, co.name AS countryName
                    FROM races r
                    LEFT JOIN circuits c ON c.id = r.circuitId
                    LEFT JOIN countries co ON co.id = c.countryId
                    WHERE r.id = ?
                `, [req.params.id]),
                connection.query(`
                    SELECT
                        rr.positionNumber,
                        rr.positionText,
                        rr.positionDisplayOrder,
                        rr.gridPositionNumber,
                        rr.qualificationPositionNumber,
                        rr.driverId,
                        rr.constructorId,
                        rr.laps,
                        rr.time,
                        rr.gap,
                        rr.reasonRetired,
                        rr.fastestLap,
                        rr.polePosition,
                        rr.points,
                        d.name AS driverName,
                        k.name AS constructorName
                    FROM races_race_results rr
                    JOIN drivers d ON d.id = rr.driverId
                    LEFT JOIN constructors k ON k.id = rr.constructorId
                    WHERE rr.raceId = ?
                    ORDER BY rr.positionDisplayOrder, rr.positionNumber
                `, [req.params.id]),
                sessionQuery('races_sprint_race_results', 'sr.gridPositionNumber, sr.laps, sr.time, sr.gap, sr.reasonRetired, sr.points'),
                sessionQuery('races_qualifying_results', 'sr.time, sr.q1, sr.q2, sr.q3, sr.gap, sr.laps'),
                sessionQuery('races_qualifying_1_results', 'sr.time, sr.q1, sr.q2, sr.q3, sr.gap, sr.laps'),
                sessionQuery('races_qualifying_2_results', 'sr.time, sr.q1, sr.q2, sr.q3, sr.gap, sr.laps'),
                sessionQuery('races_sprint_qualifying_results', 'sr.time, sr.q1, sr.q2, sr.q3, sr.gap, sr.laps'),
                sessionQuery('races_pre_qualifying_results', 'sr.time, sr.q1, sr.q2, sr.q3, sr.gap, sr.laps'),
                sessionQuery('races_free_practice_1_results', 'sr.time, sr.gap, sr.interval, sr.laps'),
                sessionQuery('races_free_practice_2_results', 'sr.time, sr.gap, sr.interval, sr.laps'),
                sessionQuery('races_free_practice_3_results', 'sr.time, sr.gap, sr.interval, sr.laps'),
                sessionQuery('races_free_practice_4_results', 'sr.time, sr.gap, sr.interval, sr.laps'),
                sessionQuery('races_warming_up_results', 'sr.time, sr.gap, sr.interval, sr.laps')
            ]);

            if (!raceRows.length) return null;
            return {
                race: raceRows[0],
                sessions: {
                    race: results, sprint,
                    qualifying: { qualifying, qualifying1, qualifying2, sprintQualifying, preQualifying },
                    practice: { practice1, practice2, practice3, practice4, warmingUp }
                }
            };
        });

        if (!data) return res.status(404).json({ error: 'Race not found.' });
        res.json(data);
    } catch (error) {
        sendError(res, error);
    }
});

router.get('/api/races', async (req, res) => {

    try {

        const hasYear = req.query.year !== undefined;
        const year = optionalInteger(req.query.year, { min: 1950, max: 9999 });

        if (hasYear && year === null) {
            return res.status(400).json({ error: 'Invalid year.' });
        }


        const rows = await withConnection(connection => {
            const conditions = [];
            const values = [];
            if (year) { conditions.push('r.year = ?'); values.push(year); }
            if (req.query.circuit) { conditions.push('r.circuitId = ?'); values.push(String(req.query.circuit)); }
            if (req.query.search) {
                conditions.push('(r.officialName LIKE ? OR c.name LIKE ? OR co.name LIKE ?)');
                const search = `%${String(req.query.search).trim()}%`;
                values.push(search, search, search);
            }
            return connection.query(`
                SELECT
                    r.id,
                    r.year,
                    r.round,
                    r.date,
                    r.officialName,
                    r.circuitId,
                    r.laps,
                    r.distance,
                    r.sprintRaceDate,
                    c.name AS circuitName,
                    co.name AS countryName

                FROM races r

                LEFT JOIN circuits c
                    ON c.id = r.circuitId

                LEFT JOIN countries co
                    ON co.id = c.countryId

                ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
                ORDER BY r.year DESC, r.round DESC
            `, values);
        });


        res.json(rows);

    } catch (error) {

        sendError(res, error);
    }
});

module.exports = router;
