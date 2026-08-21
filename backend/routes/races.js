const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { optionalInteger } = require('../validation');
const { f2SessionType, f3SessionType } = require('./seasons');

const router = express.Router();

function juniorClassificationPosition(value) {
    const position = Number(value);
    return Number.isInteger(position) && position > 0 && position < 1000 ? position : null;
}

function juniorClassificationStatus(status, value) {
    return status || (Number(value) >= 1000 ? 'NC' : null);
}

// ============================================================
// Races
// ============================================================

router.get('/api/races/:id', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase();
        if (['f2', 'f3'].includes(series)) {
            const prefix = `${series}_`;
            const data = await withConnection(async connection => {
                const [raceRows, sessionRows, resultRows] = await Promise.all([
                    connection.query(`
                        SELECT races.id, races.year, races.round, races.date, races.endDate,
                            races.name, races.code, races.circuitId,
                            circuits.name AS circuitName, circuits.placeName,
                            circuits.type AS circuitType, circuits.direction,
                            circuits.lengthMeters, circuits.turns
                        FROM ${prefix}races races
                        LEFT JOIN ${prefix}circuits circuits ON circuits.id = races.circuitId
                        WHERE races.id = ?
                    `, [req.params.id]),
                    connection.query(`
                        SELECT id, sessionNumber, code, name, startTimeUtc, endTimeUtc,
                            isRace, cancelled
                        FROM ${prefix}sessions
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
                        FROM ${prefix}session_results results
                        LEFT JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
                        LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
                        WHERE results.raceId = ?
                        ORDER BY results.sessionId, results.positionDisplayOrder, results.positionNumber
                    `, [req.params.id])
                ]);

                if (!raceRows.length) return null;
                const isTrue = value => value === true || Number(value) === 1 || String(value).toLowerCase() === 'true';
                const isDisqualified = row => /\b(?:DSQ|DQ|DISQ|DISQUALIFIED|EXC)\b/i.test(String(row.status || ''));
                const sessionsById = new Map(sessionRows.map(session => [String(session.id), session]));
                const raceSessions = sessionRows.filter(session => isTrue(session.isRace));
                const sessionType = series === 'f3' ? f3SessionType : f2SessionType;
                const raceTypeBySession = new Map(raceSessions.map((session, index) => [
                    String(session.id),
                    sessionType(session, index, raceSessions.length, raceRows[0].year)
                ]));
                const featureSession = raceSessions.find(session => raceTypeBySession.get(String(session.id)) === 'F')
                    || raceSessions.at(-1);
                const sprintSessions = raceSessions.filter(session => raceTypeBySession.get(String(session.id)) === 'S');
                const raceLabelBySession = new Map(raceSessions.map(session => {
                    const type = raceTypeBySession.get(String(session.id));
                    if (type === 'F') return [String(session.id), 'Feature Race'];
                    const sprintIndex = sprintSessions.findIndex(candidate => String(candidate.id) === String(session.id));
                    return [String(session.id), sprintSessions.length > 1 ? `Sprint Race ${sprintIndex + 1}` : 'Sprint Race'];
                }));
                const gridSessions = sessionRows.filter(session => /grid/i.test(session.name));
                const featureGrid = gridSessions.at(-1);
                const qualifyingSessions = sessionRows.filter(session => /qualif/i.test(session.name));
                const classificationWinner = sessionIds => resultRows
                    .filter(row => sessionIds.includes(String(row.sessionId)) && Number(row.positionNumber) === 1)
                    .sort((first, second) => Number(first.timeMillis || Number.MAX_SAFE_INTEGER) - Number(second.timeMillis || Number.MAX_SAFE_INTEGER))[0];
                const poleDriverId = classificationWinner(featureGrid ? [String(featureGrid.id)] : [])?.driverId
                    || classificationWinner(qualifyingSessions.map(session => String(session.id)))?.driverId;
                const fastestLapBySession = new Map();
                const importedFastestBySession = new Map();
                resultRows.forEach(row => {
                    const session = sessionsById.get(String(row.sessionId));
                    const position = Number(row.positionNumber || 0);
                    if (!session || !isTrue(session.isRace) || position < 1 || position > 10 || isDisqualified(row)) return;
                    const sessionId = String(row.sessionId);
                    if (isTrue(row.fastestLap) && !importedFastestBySession.has(sessionId)) {
                        importedFastestBySession.set(sessionId, row.driverId);
                    }
                    const lapTime = Number(row.fastestLapTimeMillis);
                    if (!Number.isFinite(lapTime) || lapTime <= 0) return;
                    const current = fastestLapBySession.get(sessionId);
                    if (!current || lapTime < current.lapTime) {
                        fastestLapBySession.set(sessionId, { driverId: row.driverId, lapTime });
                    }
                });
                importedFastestBySession.forEach((driverId, sessionId) => {
                    if (!fastestLapBySession.has(sessionId)) fastestLapBySession.set(sessionId, { driverId });
                });
                const resultsBySession = new Map();
                resultRows.forEach(row => {
                    const sessionId = String(row.sessionId);
                    const session = sessionsById.get(sessionId);
                    const isRace = session && isTrue(session.isRace);
                    const positionNumber = juniorClassificationPosition(row.positionNumber);
                    if (!resultsBySession.has(sessionId)) resultsBySession.set(sessionId, []);
                    resultsBySession.get(sessionId).push({
                        ...row,
                        positionNumber,
                        status: juniorClassificationStatus(row.status, row.positionNumber),
                        points: isDisqualified(row) ? 0 : row.points === null ? null : Number(row.points),
                        laps: row.laps === null ? null : Number(row.laps),
                        gapMillis: row.gapMillis === null ? null : Number(row.gapMillis),
                        gapLaps: row.gapLaps === null ? null : Number(row.gapLaps),
                        polePosition: Boolean(isRace && featureSession && sessionId === String(featureSession.id)
                            && String(row.driverId) === String(poleDriverId)),
                        fastestLap: Boolean(isRace && String(row.driverId) === String(fastestLapBySession.get(sessionId)?.driverId))
                    });
                });

                return {
                    race: raceRows[0],
                    sessions: sessionRows.map(session => ({
                        ...session,
                        sessionNumber: Number(session.sessionNumber || 0),
                        isRace: isTrue(session.isRace),
                        cancelled: isTrue(session.cancelled),
                        raceType: raceTypeBySession.get(String(session.id)) || null,
                        displayName: raceLabelBySession.get(String(session.id)) || session.name,
                        results: resultsBySession.get(String(session.id)) || []
                    }))
                };
            });

            if (!data) return res.status(404).json({ error: `${series.toUpperCase()} race weekend not found.` });
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
        const series = String(req.query.series || '').toLowerCase();
        const isJuniorSeries = ['f2', 'f3'].includes(series);
        const year = optionalInteger(req.query.year, { min: series === 'f3' ? 2019 : series === 'f2' ? 2017 : 1950, max: 9999 });

        if (hasYear && year === null) {
            return res.status(400).json({ error: 'Invalid year.' });
        }

        if (isJuniorSeries) {
            const prefix = `${series}_`;
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
                    FROM ${prefix}races races
                    LEFT JOIN ${prefix}circuits circuits ON circuits.id = races.circuitId
                    LEFT JOIN ${prefix}sessions sessions ON sessions.raceId = races.id
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
module.exports.juniorClassificationPosition = juniorClassificationPosition;
module.exports.juniorClassificationStatus = juniorClassificationStatus;
