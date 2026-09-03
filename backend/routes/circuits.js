const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { f2SessionType, f3SessionType, academySessionType } = require('./seasons');
const { isJuniorSeries, seriesPrefix } = require('../series-config');
const { juniorCircuitArchiveRow } = require('../circuit-archive');
const { buildCircuitDetail, buildJuniorCircuitDetail } = require('../circuit-detail');
const { buildJuniorCircuitAnalysis } = require('../junior-circuit-analysis');

const router = express.Router();

function withF1CircuitDisplayName(circuit) {
    return {
        ...circuit,
        shortName: circuit.name,
        name: circuit.fullName || circuit.name
    };
}

// ============================================================
// Circuits
// ============================================================

router.get('/api/circuits', async (req, res) => {

    try {

        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const rows = await withConnection(async connection => {
                const [circuits, layouts] = await Promise.all([
                    connection.query(`
                        SELECT c.id, c.name, c.type, c.direction, c.placeName, c.lengthMeters, c.turns,
                            appearances.calendarYears, appearances.firstYear, appearances.lastYear,
                            appearances.firstHeldYear, appearances.lastHeldYear, appearances.recordedRacesHeld,
                            (SELECT MAX(year) FROM ${prefix}races) AS currentSeason
                        FROM ${prefix}circuits c
                        LEFT JOIN (
                            SELECT r.circuitId,
                                GROUP_CONCAT(DISTINCT r.year ORDER BY r.year DESC SEPARATOR ',') AS calendarYears,
                                MIN(r.year) AS firstYear, MAX(r.year) AS lastYear,
                                MIN(CASE WHEN completed.raceId IS NOT NULL THEN r.year END) AS firstHeldYear,
                                MAX(CASE WHEN completed.raceId IS NOT NULL THEN r.year END) AS lastHeldYear,
                                SUM(COALESCE(completed.raceCount, 0)) AS recordedRacesHeld
                            FROM ${prefix}races r
                            LEFT JOIN (
                                SELECT s.raceId, COUNT(*) AS raceCount
                                FROM ${prefix}sessions s
                                WHERE LOWER(CAST(s.isRace AS CHAR)) IN ('1', 'true')
                                    AND (s.cancelled IS NULL OR LOWER(CAST(s.cancelled AS CHAR)) NOT IN ('1', 'true'))
                                    AND EXISTS (SELECT 1 FROM ${prefix}session_results results WHERE results.sessionId = s.id)
                                GROUP BY s.raceId
                            ) completed ON completed.raceId = r.id
                            GROUP BY r.circuitId
                        ) appearances ON appearances.circuitId = c.id
                        ORDER BY c.name
                    `),
                    connection.query(`SELECT cl.id AS layoutId, c.name, c.previousNames, co.name AS countryName
                        FROM circuits_layouts cl JOIN circuits c ON c.id = cl.circuitId
                        LEFT JOIN countries co ON co.id = c.countryId`)
                ]);
                const byLayout = new Map(layouts.map(row => [row.layoutId, row]));
                return circuits.map(row => juniorCircuitArchiveRow(row, byLayout));
            });
            return res.json(rows);
        }

        const search = String(req.query.search || '').trim();
        const q = `%${search}%`;
        const rows = await withConnection(connection => connection.query(`
            SELECT c.*, co.name AS countryName, layouts.layoutId,
                appearances.calendarYears, appearances.firstYear, appearances.lastYear,
                appearances.firstHeldYear, appearances.lastHeldYear,
                COALESCE(appearances.recordedRacesHeld, 0) AS recordedRacesHeld,
                (SELECT MAX(year) FROM races) AS currentSeason
            FROM circuits c
            LEFT JOIN countries co ON co.id = c.countryId
            LEFT JOIN (
                SELECT circuitId, MAX(id) AS layoutId FROM circuits_layouts
                WHERE effective = 1 GROUP BY circuitId
            ) layouts ON layouts.circuitId = c.id
            LEFT JOIN (
                SELECT r.circuitId,
                    GROUP_CONCAT(DISTINCT r.year ORDER BY r.year DESC SEPARATOR ',') AS calendarYears,
                    MIN(r.year) AS firstYear, MAX(r.year) AS lastYear,
                    MIN(CASE WHEN completed.raceId IS NOT NULL THEN r.year END) AS firstHeldYear,
                    MAX(CASE WHEN completed.raceId IS NOT NULL THEN r.year END) AS lastHeldYear,
                    COUNT(completed.raceId) AS recordedRacesHeld
                FROM races r
                LEFT JOIN (SELECT DISTINCT raceId FROM races_race_results) completed ON completed.raceId = r.id
                GROUP BY r.circuitId
            ) appearances ON appearances.circuitId = c.id
            ${search ? 'WHERE c.name LIKE ? OR c.fullName LIKE ? OR c.previousNames LIKE ? OR c.placeName LIKE ? OR co.name LIKE ?' : ''}
            ORDER BY c.name
        `, search ? [q, q, q, q, q] : []));
        res.json(rows.map(row => ({
            ...withF1CircuitDisplayName(row),
            totalRacesHeld: Number(row.recordedRacesHeld),
            seasons: String(row.calendarYears || '').split(',').map(Number).filter(year => year > 0),
            currentSeason: Number(row.currentSeason) || null
        })));

    } catch (error) {

        sendError(res, error);
    }
});


// ============================================================
// Circuit Details
// ============================================================

router.get('/api/circuits/:id/analysis', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const data = await withConnection(async connection => {
                const [circuits, rows] = await Promise.all([
                    connection.query(`SELECT id, name, name AS fullName, placeName, type, direction, lengthMeters, turns
                        FROM ${prefix}circuits WHERE id = ?`, [req.params.id]),
                    connection.query(`SELECT sessions.id AS sessionId, races.id AS raceId,
                        sessions.sessionNumber, sessions.name AS sessionName, sessions.isRace, sessions.cancelled, sessions.startTimeUtc,
                        races.name AS raceName, races.year, races.round, races.date,
                        results.driverId, drivers.name AS driverName, results.constructorId, constructors.name AS constructorName,
                        results.positionNumber, results.status AS positionText, results.laps, results.gapMillis, results.gapLaps,
                        results.polePosition, results.fastestLap, results.points
                        FROM ${prefix}races races JOIN ${prefix}sessions sessions ON sessions.raceId = races.id
                        LEFT JOIN ${prefix}session_results results ON results.sessionId = sessions.id
                        LEFT JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
                        LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
                        WHERE races.circuitId = ?
                        ORDER BY races.year, races.round, sessions.sessionNumber, results.positionDisplayOrder`, [req.params.id])
                ]);
                if (!circuits.length) return null;
                const sessionType = series === 'academy' ? academySessionType : series === 'f3' ? f3SessionType : f2SessionType;
                return buildJuniorCircuitAnalysis(circuits[0], rows, series, sessionType);
            });
            if (!data) return res.status(404).json({ error: `${series.toUpperCase()} circuit not found.` });
            return res.json(data);
        }
        const data = await withConnection(async connection => {
            const [circuits, rows] = await Promise.all([
                connection.query(`SELECT c.id, c.name, c.fullName, c.countryId, c.placeName, c.type, c.direction,
                    co.name AS countryName, cl.id AS layoutId, cl.length AS layoutLength, cl.turns AS layoutTurns
                    FROM circuits c LEFT JOIN countries co ON co.id = c.countryId
                    LEFT JOIN circuits_layouts cl ON cl.circuitId = c.id AND cl.effective = 1 WHERE c.id = ?`, [req.params.id]),
                connection.query(`SELECT r.id AS raceId, r.year, r.round, r.date,
                    COALESCE(NULLIF(gp.fullName, ''), r.officialName) AS name, gp.shortName, r.officialName, r.laps AS raceLaps,
                    rr.driverId, d.name AS driverName, rr.constructorId, k.name AS constructorName,
                    rr.positionNumber, rr.positionText, rr.gridPositionNumber, rr.qualificationPositionNumber,
                    rr.laps, rr.gap, rr.gapMillis, rr.gapLaps, rr.reasonRetired, rr.polePosition, rr.fastestLap, rr.points
                    FROM races r JOIN races_race_results rr ON rr.raceId = r.id
                    LEFT JOIN grands_prix gp ON gp.id = r.grandPrixId
                    JOIN drivers d ON d.id = rr.driverId LEFT JOIN constructors k ON k.id = rr.constructorId
                    WHERE r.circuitId = ? ORDER BY r.year, r.round, rr.positionDisplayOrder, rr.positionNumber`, [req.params.id])
            ]);
            if (!circuits.length) return null;
            const races = new Map();
            rows.forEach(row => {
                if (!races.has(String(row.raceId))) races.set(String(row.raceId), {
                    id: row.raceId, year: Number(row.year), round: Number(row.round), date: row.date,
                    name: row.name, shortName: row.shortName, officialName: row.officialName, laps: Number(row.raceLaps || 0), results: []
                });
                races.get(String(row.raceId)).results.push({
                    driverId: row.driverId, driverName: row.driverName, constructorId: row.constructorId,
                    constructorName: row.constructorName, position: row.positionNumber === null ? null : Number(row.positionNumber),
                    positionText: row.positionText, grid: row.gridPositionNumber === null ? null : Number(row.gridPositionNumber),
                    qualifying: row.qualificationPositionNumber === null ? null : Number(row.qualificationPositionNumber),
                    laps: Number(row.laps || 0), gap: row.gap,
                    gapMillis: row.gapMillis == null ? null : Number(row.gapMillis),
                    gapLaps: row.gapLaps == null ? null : Number(row.gapLaps), reasonRetired: row.reasonRetired,
                    polePosition: Boolean(row.polePosition), fastestLap: Boolean(row.fastestLap), points: Number(row.points || 0)
                });
            });
            return { circuit: withF1CircuitDisplayName(circuits[0]), races: [...races.values()] };
        });
        if (!data) return res.status(404).json({ error: 'Circuit not found.' });
        res.json(data);
    } catch (error) { sendError(res, error); }
});

router.get('/api/circuits/:id', async (req, res) => {

    try {

        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const data = await withConnection(async connection => {
                const [circuitRows, races, sessions, layouts] = await Promise.all([
                    connection.query(`
                        SELECT circuits.id, circuits.name, circuits.type, circuits.direction,
                            circuits.placeName, circuits.lengthMeters, circuits.turns,
                            COUNT(DISTINCT races.id) AS totalRacesHeld,
                            MIN(races.year) AS firstYear, MAX(races.year) AS lastYear
                        FROM ${prefix}circuits circuits
                        LEFT JOIN ${prefix}races races ON races.circuitId = circuits.id
                        WHERE circuits.id = ?
                        GROUP BY circuits.id, circuits.name, circuits.type, circuits.direction,
                            circuits.placeName, circuits.lengthMeters, circuits.turns
                    `, [req.params.id]),
                    connection.query(`
                        SELECT id, year, round, DATE_FORMAT(date, '%Y-%m-%d') AS date,
                            DATE_FORMAT(endDate, '%Y-%m-%d') AS endDate, name, code
                        FROM ${prefix}races
                        WHERE circuitId = ?
                        ORDER BY year DESC, round DESC
                    `, [req.params.id]),
                    connection.query(`
                        SELECT sessions.raceId, sessions.id, sessions.name,
                            sessions.sessionNumber, sessions.isRace, sessions.cancelled,
                            CAST(sessions.startTimeUtc AS CHAR) AS startTimeUtc,
                            completed.sessionId IS NOT NULL AS hasResults, completed.laps,
                            results.driverId AS winnerDriverId, drivers.name AS winnerName,
                            results.constructorId AS winnerConstructorId,
                            constructors.name AS winnerConstructorName
                        FROM ${prefix}sessions sessions
                        JOIN ${prefix}races races ON races.id = sessions.raceId
                        LEFT JOIN (SELECT sessionId, MAX(laps) AS laps FROM ${prefix}session_results GROUP BY sessionId) completed
                            ON completed.sessionId = sessions.id
                        LEFT JOIN ${prefix}session_results results
                            ON results.sessionId = sessions.id AND results.positionNumber = 1
                        LEFT JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
                        LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
                        WHERE races.circuitId = ?
                        ORDER BY races.year DESC, races.round DESC, sessions.sessionNumber
                    `, [req.params.id]),
                    connection.query(`SELECT cl.id AS layoutId, c.name, c.previousNames, c.latitude, c.longitude, co.name AS countryName
                        FROM circuits_layouts cl JOIN circuits c ON c.id = cl.circuitId
                        LEFT JOIN countries co ON co.id = c.countryId`)
                ]);
                if (!circuitRows.length) return null;
                const byLayout = new Map(layouts.map(row => [row.layoutId, row]));
                const circuit = juniorCircuitArchiveRow(circuitRows[0], byLayout);
                const location = byLayout.get(circuit.layoutId);
                circuit.latitude = location?.latitude ?? null;
                circuit.longitude = location?.longitude ?? null;
                return buildJuniorCircuitDetail(circuit, races, sessions, series, series === 'academy' ? academySessionType : series === 'f3' ? f3SessionType : f2SessionType);
            });
            if (!data) return res.status(404).json({ error: `${series.toUpperCase()} circuit not found.` });
            return res.json(data);
        }

        const data = await withConnection(async connection => {

            const [
                circuitRows,
                races
            ] = await Promise.all([

                connection.query(`
                    SELECT
                        c.*,
                        co.name AS countryName,
                        cl.id AS layoutId, cl.length AS layoutLength, cl.turns AS layoutTurns

                    FROM circuits c

                    LEFT JOIN countries co
                        ON co.id = c.countryId

                    LEFT JOIN circuits_layouts cl
                        ON cl.id = (SELECT MAX(active.id) FROM circuits_layouts active WHERE active.circuitId = c.id AND active.effective = 1)

                    WHERE c.id = ?
                `, [req.params.id]),


                connection.query(`
                    SELECT
                        r.id,
                        r.year,
                        r.round,
                        DATE_FORMAT(r.date, '%Y-%m-%d') AS date,
                        COALESCE(NULLIF(gp.fullName, ''), r.officialName) AS name,
                        gp.shortName,
                        r.officialName,
                        r.laps,
                        r.distance,
                        completed.raceId IS NOT NULL AS hasResults,
                        winner.driverId AS winnerDriverId,
                        winner.constructorId AS winnerConstructorId,
                        d.name AS winnerName,
                        k.name AS winnerConstructorName

                    FROM races r

                    LEFT JOIN grands_prix gp
                        ON gp.id = r.grandPrixId

                    LEFT JOIN races_race_results winner
                        ON winner.raceId = r.id
                        AND winner.positionNumber = 1

                    LEFT JOIN (SELECT DISTINCT raceId FROM races_race_results) completed
                        ON completed.raceId = r.id

                    LEFT JOIN drivers d
                        ON d.id = winner.driverId

                    LEFT JOIN constructors k
                        ON k.id = winner.constructorId

                    WHERE r.circuitId = ?

                    ORDER BY
                        r.year DESC,
                        r.round DESC
                `, [req.params.id])

            ]);


            if (!circuitRows.length) {
                return null;
            }


            return buildCircuitDetail(withF1CircuitDisplayName(circuitRows[0]), races);
        });


        if (!data) {

            return res.status(404).json({
                error: 'Circuit not found.'
            });
        }


        res.json(data);

    } catch (error) {

        sendError(res, error);
    }
});

module.exports = router;
