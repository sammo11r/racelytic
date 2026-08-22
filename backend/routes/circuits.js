const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { f2SessionType, f3SessionType, academySessionType } = require('./seasons');
const { isJuniorSeries, seriesPrefix } = require('../series-config');

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
            const rows = await withConnection(connection => connection.query(`
                SELECT circuits.id, circuits.name, circuits.type, circuits.direction,
                    circuits.placeName, circuits.lengthMeters, circuits.turns,
                    COUNT(DISTINCT races.id) AS totalRacesHeld,
                    MIN(races.year) AS firstYear, MAX(races.year) AS lastYear
                FROM ${prefix}circuits circuits
                LEFT JOIN ${prefix}races races ON races.circuitId = circuits.id
                GROUP BY circuits.id, circuits.name, circuits.type, circuits.direction,
                    circuits.placeName, circuits.lengthMeters, circuits.turns
                ORDER BY circuits.name
            `));
            return res.json(rows);
        }

        const search = String(
            req.query.search || ''
        ).trim();


        const rows = await withConnection(connection => {

            if (search) {

                const q = `%${search}%`;

                return connection.query(`
                    SELECT
                        c.*,
                        co.name AS countryName,
                        cl.id AS layoutId

                    FROM circuits c

                    LEFT JOIN countries co
                        ON co.id = c.countryId

                    LEFT JOIN circuits_layouts cl
                        ON cl.circuitId = c.id
                        AND cl.effective = 1

                    WHERE
                        c.name LIKE ?
                        OR c.fullName LIKE ?
                        OR c.placeName LIKE ?

                    ORDER BY c.name
                `, [q, q, q]);
            }


            return connection.query(`
                SELECT
                    c.*,
                    co.name AS countryName,
                    cl.id AS layoutId

                FROM circuits c

                LEFT JOIN countries co
                    ON co.id = c.countryId

                LEFT JOIN circuits_layouts cl
                    ON cl.circuitId = c.id
                    AND cl.effective = 1

                ORDER BY c.name
            `);
        });


        res.json(rows.map(withF1CircuitDisplayName));

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
                const [circuits, rows, gridRows] = await Promise.all([
                    connection.query(`SELECT id, name, name AS fullName, placeName,
                        NULL AS countryId, NULL AS layoutId
                        FROM ${prefix}circuits WHERE id = ?`, [req.params.id]),
                    connection.query(`SELECT sessions.id AS sessionId, races.id AS raceId,
                        sessions.sessionNumber, sessions.name AS sessionName,
                        races.name AS raceName, races.year, races.round, races.date,
                        results.driverId, drivers.name AS driverName, results.constructorId, constructors.name AS constructorName,
                        results.positionNumber, results.status AS positionText, results.laps, results.gapMillis AS gap,
                        results.status AS reasonRetired, results.polePosition, results.fastestLap, results.points
                        FROM ${prefix}races races JOIN ${prefix}sessions sessions ON sessions.raceId = races.id
                        JOIN ${prefix}session_results results ON results.sessionId = sessions.id
                        JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
                        LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
                        WHERE races.circuitId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1','true')
                        AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1','true'))
                        ORDER BY races.year, races.round, sessions.sessionNumber, results.positionDisplayOrder`, [req.params.id]),
                    connection.query(`SELECT sessions.raceId, sessions.sessionNumber,
                        results.driverId, results.positionNumber
                        FROM ${prefix}races races
                        JOIN ${prefix}sessions sessions ON sessions.raceId = races.id
                        JOIN ${prefix}session_results results ON results.sessionId = sessions.id
                        WHERE races.circuitId = ? AND LOWER(sessions.name) LIKE '%grid%'
                            AND results.positionNumber BETWEEN 1 AND 99
                        ORDER BY races.year, races.round, sessions.sessionNumber DESC,
                            results.positionNumber`, [req.params.id])
                ]);
                if (!circuits.length) return null;
                const sessionType = series === 'academy' ? academySessionType : series === 'f3' ? f3SessionType : f2SessionType;
                const rowSessionType = row => sessionType(
                    { ...row, name: row.sessionName },
                    0,
                    0,
                    row.year
                );
                const gridsByRaceDriver = new Map();
                const featureGridSessionByRace = new Map();
                const poleDriverByRace = new Map();
                const featureRaceSessionByRace = new Map();
                rows.forEach(row => {
                    if (rowSessionType(row) === 'F') {
                        featureRaceSessionByRace.set(String(row.raceId), Number(row.sessionNumber));
                    }
                });
                gridRows.forEach(row => {
                    const raceId = String(row.raceId);
                    const key = `${raceId}:${row.driverId}`;
                    if (!gridsByRaceDriver.has(key)) gridsByRaceDriver.set(key, []);
                    gridsByRaceDriver.get(key).push({
                        sessionNumber: Number(row.sessionNumber),
                        position: Number(row.positionNumber)
                    });
                    const featureSessionNumber = featureRaceSessionByRace.get(raceId);
                    if (!featureSessionNumber || Number(row.sessionNumber) >= featureSessionNumber) return;
                    if (!featureGridSessionByRace.has(raceId)) {
                        featureGridSessionByRace.set(raceId, Number(row.sessionNumber));
                    }
                    if (featureGridSessionByRace.get(raceId) === Number(row.sessionNumber) &&
                        Number(row.positionNumber) === 1) {
                        poleDriverByRace.set(raceId, String(row.driverId));
                    }
                });
                const races = new Map();
                rows.forEach(row => {
                    const raceId = String(row.raceId);
                    const type = rowSessionType(row);
                    const sessionLabel = type === 'F' ? 'Feature' : 'Sprint';
                    const raceKey = String(row.sessionId);
                    if (!races.has(raceKey)) races.set(raceKey, {id:row.raceId,sessionId:row.sessionId,year:Number(row.year),round:Number(row.round),date:row.date,officialName:`${row.raceName} ${sessionLabel}`,raceType:type,laps:0,results:[]});
                    const race = races.get(raceKey);
                    race.laps = Math.max(race.laps, Number(row.laps || 0));
                    const grid = gridsByRaceDriver.get(`${raceId}:${row.driverId}`)
                        ?.find(item => item.sessionNumber < Number(row.sessionNumber))?.position ?? null;
                    race.results.push({driverId:row.driverId,driverName:row.driverName,constructorId:row.constructorId,constructorName:row.constructorName,position:row.positionNumber===null?null:Number(row.positionNumber),positionText:row.positionText,grid,qualifying:type==='F'?grid:null,laps:Number(row.laps||0),gap:row.gap===null?null:Number(row.gap)/1000,reasonRetired:row.reasonRetired,polePosition:type==='F'&&String(row.driverId)===poleDriverByRace.get(raceId),fastestLap:Boolean(row.fastestLap),points:/\b(?:DSQ|DQ|DISQ|DISQUALIFIED|EXC)\b/i.test(String(row.positionText||''))?0:Number(row.points||0)});
                });
                return {circuit:circuits[0],races:[...races.values()]};
            });
            if (!data) return res.status(404).json({ error: `${series.toUpperCase()} circuit not found.` });
            return res.json(data);
        }
        const data = await withConnection(async connection => {
            const [circuits, rows] = await Promise.all([
                connection.query(`SELECT c.id, c.name, c.fullName, c.countryId, co.name AS countryName, cl.id AS layoutId
                    FROM circuits c LEFT JOIN countries co ON co.id = c.countryId
                    LEFT JOIN circuits_layouts cl ON cl.circuitId = c.id AND cl.effective = 1 WHERE c.id = ?`, [req.params.id]),
                connection.query(`SELECT r.id AS raceId, r.year, r.round, r.date, r.officialName, r.laps AS raceLaps,
                    rr.driverId, d.name AS driverName, rr.constructorId, k.name AS constructorName,
                    rr.positionNumber, rr.positionText, rr.gridPositionNumber, rr.qualificationPositionNumber,
                    rr.laps, rr.gap, rr.reasonRetired, rr.polePosition, rr.fastestLap, rr.points
                    FROM races r JOIN races_race_results rr ON rr.raceId = r.id
                    JOIN drivers d ON d.id = rr.driverId LEFT JOIN constructors k ON k.id = rr.constructorId
                    WHERE r.circuitId = ? ORDER BY r.year, r.round, rr.positionDisplayOrder, rr.positionNumber`, [req.params.id])
            ]);
            if (!circuits.length) return null;
            const races = new Map();
            rows.forEach(row => {
                if (!races.has(String(row.raceId))) races.set(String(row.raceId), {
                    id: row.raceId, year: Number(row.year), round: Number(row.round), date: row.date,
                    officialName: row.officialName, laps: Number(row.raceLaps || 0), results: []
                });
                races.get(String(row.raceId)).results.push({
                    driverId: row.driverId, driverName: row.driverName, constructorId: row.constructorId,
                    constructorName: row.constructorName, position: row.positionNumber === null ? null : Number(row.positionNumber),
                    positionText: row.positionText, grid: row.gridPositionNumber === null ? null : Number(row.gridPositionNumber),
                    qualifying: row.qualificationPositionNumber === null ? null : Number(row.qualificationPositionNumber),
                    laps: Number(row.laps || 0), gap: row.gap, reasonRetired: row.reasonRetired,
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
                const [circuitRows, races, sessions] = await Promise.all([
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
                        SELECT id, year, round, date, endDate, name, code
                        FROM ${prefix}races
                        WHERE circuitId = ?
                        ORDER BY year DESC, round DESC
                    `, [req.params.id]),
                    connection.query(`
                        SELECT sessions.raceId, sessions.id, sessions.name,
                            sessions.sessionNumber, sessions.isRace, sessions.cancelled,
                            results.driverId AS winnerDriverId, drivers.name AS winnerName,
                            constructors.name AS winnerConstructorName
                        FROM ${prefix}sessions sessions
                        JOIN ${prefix}races races ON races.id = sessions.raceId
                        LEFT JOIN ${prefix}session_results results
                            ON results.sessionId = sessions.id AND results.positionNumber = 1
                        LEFT JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
                        LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
                        WHERE races.circuitId = ?
                        ORDER BY races.year DESC, races.round DESC, sessions.sessionNumber
                    `, [req.params.id])
                ]);
                if (!circuitRows.length) return null;
                const isTrue = value => value === true || Number(value) === 1 || String(value).toLowerCase() === 'true';
                const sessionsByRace = new Map();
                sessions.forEach(session => {
                    const raceId = String(session.raceId);
                    if (!sessionsByRace.has(raceId)) sessionsByRace.set(raceId, []);
                    sessionsByRace.get(raceId).push({
                        ...session,
                        sessionNumber: Number(session.sessionNumber || 0),
                        isRace: isTrue(session.isRace),
                        cancelled: isTrue(session.cancelled)
                    });
                });
                return {
                    circuit: circuitRows[0],
                    races: races.map(race => ({
                        ...race,
                        sessions: sessionsByRace.get(String(race.id)) || []
                    }))
                };
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
                        cl.id AS layoutId

                    FROM circuits c

                    LEFT JOIN countries co
                        ON co.id = c.countryId

                    LEFT JOIN circuits_layouts cl
                        ON cl.circuitId = c.id
                        AND cl.effective = 1

                    WHERE c.id = ?
                `, [req.params.id]),


                connection.query(`
                    SELECT
                        r.id,
                        r.year,
                        r.round,
                        r.date,
                        r.officialName,
                        r.laps,
                        r.distance,
                        winner.driverId AS winnerDriverId,
                        winner.constructorId AS winnerConstructorId,
                        d.name AS winnerName,
                        k.name AS winnerConstructorName

                    FROM races r

                    LEFT JOIN races_race_results winner
                        ON winner.raceId = r.id
                        AND winner.positionNumber = 1

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


            return {
                circuit: withF1CircuitDisplayName(circuitRows[0]),
                races
            };
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
