const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { optionalInteger } = require('../validation');

const router = express.Router();

// ============================================================
// Races
// ============================================================

router.get('/api/races/:id', async (req, res) => {
    try {
        if (String(req.query.series || '').toLowerCase() === 'f2') {
            const data = await withConnection(async connection => {
                const [raceRows, sessionRows, resultRows] = await Promise.all([
                    connection.query(`
                        SELECT races.id, races.year, races.round, races.date, races.endDate,
                            races.name, races.code, races.circuitId,
                            circuits.name AS circuitName, circuits.placeName,
                            circuits.type AS circuitType, circuits.direction,
                            circuits.lengthMeters, circuits.turns
                        FROM f2_races races
                        LEFT JOIN f2_circuits circuits ON circuits.id = races.circuitId
                        WHERE races.id = ?
                    `, [req.params.id]),
                    connection.query(`
                        SELECT id, sessionNumber, code, name, startTimeUtc, endTimeUtc,
                            isRace, cancelled
                        FROM f2_sessions
                        WHERE raceId = ?
                        ORDER BY sessionNumber, startTimeUtc
                    `, [req.params.id]),
                    connection.query(`
                        SELECT results.sessionId, results.positionDisplayOrder,
                            results.positionNumber, results.points, results.polePosition,
                            results.status, results.driverNumber, results.driverId,
                            results.constructorId, results.laps, results.time,
                            results.timeMillis, results.gapMillis, results.gapLaps,
                            results.fastestLap, results.fastestLapNumber,
                            results.fastestLapTime, results.fastestLapTimeMillis,
                            results.averageSpeed, drivers.name AS driverName,
                            drivers.abbreviation, constructors.name AS constructorName
                        FROM f2_session_results results
                        LEFT JOIN f2_drivers drivers ON drivers.id = results.driverId
                        LEFT JOIN f2_constructors constructors ON constructors.id = results.constructorId
                        WHERE results.raceId = ?
                        ORDER BY results.sessionId, results.positionDisplayOrder, results.positionNumber
                    `, [req.params.id])
                ]);

                if (!raceRows.length) return null;
                const isTrue = value => value === true || Number(value) === 1 || String(value).toLowerCase() === 'true';
                const resultsBySession = new Map();
                resultRows.forEach(row => {
                    const sessionId = String(row.sessionId);
                    if (!resultsBySession.has(sessionId)) resultsBySession.set(sessionId, []);
                    resultsBySession.get(sessionId).push({
                        ...row,
                        positionNumber: row.positionNumber === null ? null : Number(row.positionNumber),
                        points: row.points === null ? null : Number(row.points),
                        laps: row.laps === null ? null : Number(row.laps),
                        gapMillis: row.gapMillis === null ? null : Number(row.gapMillis),
                        gapLaps: row.gapLaps === null ? null : Number(row.gapLaps),
                        polePosition: isTrue(row.polePosition),
                        fastestLap: isTrue(row.fastestLap)
                    });
                });

                return {
                    race: raceRows[0],
                    sessions: sessionRows.map(session => ({
                        ...session,
                        sessionNumber: Number(session.sessionNumber || 0),
                        isRace: isTrue(session.isRace),
                        cancelled: isTrue(session.cancelled),
                        results: resultsBySession.get(String(session.id)) || []
                    }))
                };
            });

            if (!data) return res.status(404).json({ error: 'F2 race weekend not found.' });
            return res.json(data);
        }

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
        const isF2 = String(req.query.series || '').toLowerCase() === 'f2';
        const year = optionalInteger(req.query.year, { min: isF2 ? 2017 : 1950, max: 9999 });

        if (hasYear && year === null) {
            return res.status(400).json({ error: 'Invalid year.' });
        }

        if (isF2) {
            const rows = await withConnection(connection => {
                const conditions = [];
                const values = [];
                if (year) { conditions.push('races.year = ?'); values.push(year); }
                if (req.query.circuit) { conditions.push('races.circuitId = ?'); values.push(String(req.query.circuit)); }
                if (req.query.search) {
                    conditions.push('(races.name LIKE ? OR circuits.name LIKE ? OR circuits.placeName LIKE ?)');
                    const search = `%${String(req.query.search).trim()}%`;
                    values.push(search, search, search);
                }
                return connection.query(`
                    SELECT races.id, races.year, races.round, races.date, races.endDate,
                        races.name, races.code, races.circuitId,
                        circuits.name AS circuitName, circuits.placeName,
                        COUNT(sessions.id) AS sessionCount,
                        SUM(CASE WHEN LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true') THEN 1 ELSE 0 END) AS raceSessionCount,
                        SUM(CASE WHEN LOWER(CAST(sessions.cancelled AS CHAR)) IN ('1', 'true') THEN 1 ELSE 0 END) AS cancelledSessionCount
                    FROM f2_races races
                    LEFT JOIN f2_circuits circuits ON circuits.id = races.circuitId
                    LEFT JOIN f2_sessions sessions ON sessions.raceId = races.id
                    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
                    GROUP BY races.id, races.year, races.round, races.date, races.endDate,
                        races.name, races.code, races.circuitId, circuits.name, circuits.placeName
                    ORDER BY races.year DESC, races.round DESC
                `, values);
            });
            return res.json(rows.map(row => ({
                ...row,
                year: Number(row.year),
                round: Number(row.round),
                sessionCount: Number(row.sessionCount || 0),
                raceSessionCount: Number(row.raceSessionCount || 0),
                cancelledSessionCount: Number(row.cancelledSessionCount || 0)
            })));
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
