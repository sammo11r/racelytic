const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { optionalInteger } = require('../validation');
const { f2SessionType, f3SessionType, academySessionType } = require('./seasons');
const { isJuniorSeries, minimumSeasonYear, seriesPrefix } = require('../series-config');
const { academyRaceAwardsPole, academyRaceDisplayName, academyRaceGridContext } = require('../academy-race-analysis');
const { juniorRaceGridContext } = require('../junior-race-analysis');
const { juniorClassificationPosition, juniorClassificationStatus, juniorClassificationTime } = require('../junior-classification');

const router = express.Router();

// ============================================================
// Races
// ============================================================

router.get('/api/races/:id', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
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
                const sessionType = series === 'academy' ? academySessionType : series === 'f3' ? f3SessionType : f2SessionType;
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
                        status: juniorClassificationStatus(row.status, row.positionNumber, isRace),
                        time: juniorClassificationTime(row.time) || (!isRace ? juniorClassificationTime(row.fastestLapTime) : null),
                        timeMillis: row.timeMillis || (!isRace ? row.fastestLapTimeMillis : null),
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
                    sessions: sessionRows.flatMap(session => {
                        const normalizedSessions = sessionRows.map(candidate => ({ ...candidate, isRace: isTrue(candidate.isRace) }));
                        const raceSession = isTrue(session.isRace);
                        const raceType = raceTypeBySession.get(String(session.id)) || null;
                        const context = raceSession
                            ? series === 'academy'
                                ? academyRaceGridContext({ ...session, isRace: true }, normalizedSessions, resultsBySession, raceRows[0].year)
                                : juniorRaceGridContext(series, session, normalizedSessions, resultsBySession, raceType, raceRows[0].year)
                            : null;
                        const results = (resultsBySession.get(String(session.id)) || []).map(result => !context ? result : ({
                            ...result,
                            qualificationPositionNumber: juniorClassificationPosition(context.qualificationByDriver.get(String(result.driverId))),
                            gridPositionNumber: juniorClassificationPosition(context.gridByDriver.get(String(result.driverId))),
                            polePosition: series === 'academy' ? Boolean(
                                academyRaceAwardsPole({ ...session, isRace: true }, normalizedSessions, raceRows[0].year)
                                && context.gridByDriver.get(String(result.driverId)) === 1
                            ) : result.polePosition
                        }));
                        const renderedSession = {
                            ...session,
                            sessionNumber: Number(session.sessionNumber || 0),
                            isRace: raceSession,
                            cancelled: isTrue(session.cancelled),
                            raceType,
                            displayName: series === 'academy'
                                ? academyRaceDisplayName(session)
                                : raceLabelBySession.get(String(session.id)) || session.name,
                            gridNote: context?.gridNote || null,
                            results
                        };
                        if (!raceSession || series === 'academy' || context?.source !== 'derived' || !context.gridByDriver.size) {
                            return [renderedSession];
                        }
                        const gridResults = results
                            .filter(result => context.gridByDriver.has(String(result.driverId)))
                            .map(result => ({
                                ...result,
                                positionNumber: context.gridByDriver.get(String(result.driverId)),
                                positionDisplayOrder: context.gridByDriver.get(String(result.driverId)),
                                points: null,
                                polePosition: false,
                                fastestLap: false,
                                laps: null,
                                time: null,
                                timeMillis: null,
                                gapMillis: null,
                                gapLaps: null
                            }))
                            .sort((first, second) => Number(first.positionNumber) - Number(second.positionNumber));
                        return [{
                            id: `${session.id}__derived-grid`,
                            sessionNumber: Number(session.sessionNumber || 0) - 0.1,
                            code: null,
                            name: 'Starting Grid',
                            displayName: `${renderedSession.displayName} Grid`,
                            startTimeUtc: null,
                            endTimeUtc: null,
                            isRace: false,
                            cancelled: false,
                            raceType: null,
                            derived: true,
                            gridNote: context.gridNote,
                            results: gridResults
                        }, renderedSession];
                    })
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
                    SELECT r.*, COALESCE(NULLIF(gp.fullName, ''), r.officialName) AS name,
                        gp.shortName, COALESCE(NULLIF(c.fullName, ''), c.name) AS circuitName, co.name AS countryName
                    FROM races r
                    LEFT JOIN grands_prix gp ON gp.id = r.grandPrixId
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
                        rr.driverNumber,
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
        const juniorSeries = isJuniorSeries(series);
        const year = optionalInteger(req.query.year, { min: minimumSeasonYear(series), max: 9999 });

        if (hasYear && year === null) {
            return res.status(400).json({ error: 'Invalid year.' });
        }

        if (juniorSeries) {
            const prefix = seriesPrefix(series);
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
                        COUNT(DISTINCT sessions.id) AS sessionCount,
                        COUNT(DISTINCT CASE WHEN LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true') THEN sessions.id END) AS raceSessionCount,
                        COUNT(DISTINCT CASE WHEN LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                            AND LOWER(COALESCE(CAST(sessions.cancelled AS CHAR), 'false')) NOT IN ('1', 'true') THEN sessions.id END) AS activeRaceSessionCount,
                        COUNT(DISTINCT CASE WHEN LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                            AND winnerResult.sessionId IS NOT NULL THEN sessions.id END) AS completedRaceSessionCount,
                        COUNT(DISTINCT CASE WHEN LOWER(CAST(sessions.cancelled AS CHAR)) IN ('1', 'true') THEN sessions.id END) AS cancelledSessionCount,
                        GROUP_CONCAT(DISTINCT winnerDriver.name ORDER BY sessions.sessionNumber, winnerDriver.name SEPARATOR ' / ') AS winnerName,
                        GROUP_CONCAT(DISTINCT winnerConstructor.name ORDER BY sessions.sessionNumber, winnerConstructor.name SEPARATOR ' / ') AS winnerConstructorName
                    FROM ${prefix}races races
                    LEFT JOIN ${prefix}circuits circuits ON circuits.id = races.circuitId
                    LEFT JOIN ${prefix}sessions sessions ON sessions.raceId = races.id
                    LEFT JOIN ${prefix}session_results winnerResult
                        ON winnerResult.sessionId = sessions.id
                        AND winnerResult.raceId = races.id
                        AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                        AND winnerResult.positionNumber = 1
                        AND UPPER(COALESCE(winnerResult.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC')
                    LEFT JOIN ${prefix}drivers winnerDriver ON winnerDriver.id = winnerResult.driverId
                    LEFT JOIN ${prefix}constructors winnerConstructor ON winnerConstructor.id = winnerResult.constructorId
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
                activeRaceSessionCount: Number(row.activeRaceSessionCount || 0),
                completedRaceSessionCount: Number(row.completedRaceSessionCount || 0),
                cancelledSessionCount: Number(row.cancelledSessionCount || 0)
            })));
        }


        const rows = await withConnection(connection => {
            const conditions = [];
            const values = [];
            if (year) { conditions.push('r.year = ?'); values.push(year); }
            if (req.query.circuit) { conditions.push('r.circuitId = ?'); values.push(String(req.query.circuit)); }
            if (req.query.search) {
                conditions.push('(r.officialName LIKE ? OR gp.fullName LIKE ? OR gp.shortName LIKE ? OR c.name LIKE ? OR co.name LIKE ?)');
                const search = `%${String(req.query.search).trim()}%`;
                values.push(search, search, search, search, search);
            }
            return connection.query(`
                SELECT
                    r.id,
                    r.year,
                    r.round,
                    r.date,
                    COALESCE(NULLIF(gp.fullName, ''), r.officialName) AS name,
                    gp.shortName,
                    r.officialName,
                    r.circuitId,
                    r.laps,
                    r.distance,
                    r.sprintRaceDate,
                    COALESCE(NULLIF(c.fullName, ''), c.name) AS circuitName,
                    co.name AS countryName,
                    winner.driverIds AS winnerDriverId,
                    winner.driverNames AS winnerName,
                    winner.constructorIds AS winnerConstructorId,
                    winner.constructorNames AS winnerConstructorName

                FROM races r

                LEFT JOIN grands_prix gp
                    ON gp.id = r.grandPrixId

                LEFT JOIN circuits c
                    ON c.id = r.circuitId

                LEFT JOIN countries co
                    ON co.id = c.countryId

                LEFT JOIN (
                    SELECT winnerResult.raceId,
                        GROUP_CONCAT(DISTINCT winnerResult.driverId ORDER BY winnerResult.positionDisplayOrder, winnerResult.driverId SEPARATOR ',') AS driverIds,
                        GROUP_CONCAT(DISTINCT winnerDriver.name ORDER BY winnerResult.positionDisplayOrder, winnerDriver.name SEPARATOR ' / ') AS driverNames,
                        GROUP_CONCAT(DISTINCT winnerResult.constructorId ORDER BY winnerResult.positionDisplayOrder, winnerResult.constructorId SEPARATOR ',') AS constructorIds,
                        GROUP_CONCAT(DISTINCT winnerConstructor.name ORDER BY winnerResult.positionDisplayOrder, winnerConstructor.name SEPARATOR ' / ') AS constructorNames
                    FROM races_race_results winnerResult
                    JOIN drivers winnerDriver ON winnerDriver.id = winnerResult.driverId
                    LEFT JOIN constructors winnerConstructor ON winnerConstructor.id = winnerResult.constructorId
                    WHERE winnerResult.positionNumber = 1
                        AND UPPER(COALESCE(winnerResult.positionText, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC')
                    GROUP BY winnerResult.raceId
                ) winner ON winner.raceId = r.id

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
