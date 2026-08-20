const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { integerOrDefault } = require('../validation');

const router = express.Router();

const f2CountryCodeOverrides = new Map([
    ['james-wharton', 'au'],
    ['laurens-van-hoepen', 'nl'],
    ['nikita-mazepin', 'ru'],
    ['rafael-camara', 'br']
]);

function f2CountryCode(driver) {
    return f2CountryCodeOverrides.get(String(driver.id)) || String(driver.countryCode || '').toLowerCase() || null;
}

// ============================================================
// Drivers
// ============================================================

router.get('/api/drivers', async (req, res) => {

    try {

        const search = String(
            req.query.search || ''
        ).trim();


        const limit = integerOrDefault(req.query.limit, 100, { min: 1, max: 1000 });

        if (String(req.query.series || '').toLowerCase() === 'f2') {
            const q = `%${search}%`;
            const where = search
                ? 'WHERE d.name LIKE ? OR d.firstName LIKE ? OR d.lastName LIKE ? OR d.abbreviation LIKE ?'
                : '';
            const parameters = search ? [q, q, q, q] : [];
            const { rows, championRows } = await withConnection(async connection => {
                const [rows, championRows] = await Promise.all([
                    connection.query(`
                SELECT
                    d.id,
                    d.name,
                    d.firstName,
                    d.lastName,
                    d.abbreviation,
                    d.countryCode,
                    COALESCE(stats.firstSeason, 0) AS firstSeason,
                    COALESCE(stats.lastSeason, 0) AS lastSeason,
                    COALESCE(stats.seasons, 0) AS seasons,
                    COALESCE(stats.bestChampionshipPosition, 0) AS bestChampionshipPosition,
                    0 AS totalChampionshipWins,
                    COALESCE(stats.totalStarts, 0) AS totalStarts,
                    COALESCE(stats.totalRaceWins, 0) AS totalRaceWins,
                    COALESCE(stats.totalPodiums, 0) AS totalPodiums,
                    COALESCE(stats.totalPolePositions, 0) AS totalPolePositions,
                    COALESCE(stats.totalFastestLaps, 0) AS totalFastestLaps,
                    COALESCE(stats.totalPoints, 0) AS totalPoints,
                    latest.constructorId AS latestConstructorId,
                    constructors.name AS latestConstructorName
                FROM f2_drivers d
                LEFT JOIN (
                    SELECT
                        driverId,
                        MIN(year) AS firstSeason,
                        MAX(year) AS lastSeason,
                        COUNT(DISTINCT year) AS seasons,
                        MIN(positionNumber) AS bestChampionshipPosition,
                        SUM(COALESCE(starts, 0)) AS totalStarts,
                        SUM(COALESCE(wins, 0)) AS totalRaceWins,
                        SUM(COALESCE(podiums, 0)) AS totalPodiums,
                        SUM(COALESCE(poles, 0)) AS totalPolePositions,
                        SUM(COALESCE(fastestLaps, 0)) AS totalFastestLaps,
                        SUM(COALESCE(points, 0)) AS totalPoints
                    FROM f2_season_driver_standings
                    GROUP BY driverId
                ) stats ON stats.driverId = d.id
                LEFT JOIN f2_season_driver_standings latest
                    ON latest.driverId = d.id AND latest.year = stats.lastSeason
                LEFT JOIN f2_constructors constructors ON constructors.id = latest.constructorId
                ${where}
                ORDER BY d.name
                LIMIT ${limit}
                    `, parameters),
                    connection.query(`
                        SELECT standings.driverId, COUNT(*) AS totalChampionshipWins
                        FROM f2_season_driver_standings standings
                        LEFT JOIN (
                            SELECT year, MAX(COALESCE(endDate, date)) AS finalDate
                            FROM f2_races
                            GROUP BY year
                        ) calendars ON calendars.year = standings.year
                        WHERE standings.positionNumber = 1
                            AND (
                                LOWER(CAST(standings.championshipWon AS CHAR)) IN ('1', 'true')
                                OR calendars.finalDate < CURRENT_DATE()
                            )
                        GROUP BY standings.driverId
                    `)
                ]);
                return { rows, championRows };
            });
            const titleMap = new Map(championRows.map(row => [String(row.driverId), Number(row.totalChampionshipWins)]));
            return res.json(rows.map(row => ({
                ...row,
                countryCode: f2CountryCode(row),
                totalChampionshipWins: titleMap.get(String(row.id)) || 0
            })));
        }


        const rows = await withConnection(connection => {

            if (search) {

                const q = `%${search}%`;

                return connection.query(`
                    SELECT
                        id,
                        name,
                        firstName,
                        lastName,
                        fullName,
                        abbreviation,
                        permanentNumber,
                        nationalityCountryId,
                        totalRaceWins,
                        totalPodiums,
                        totalPolePositions,
                        totalFastestLaps,
                        totalPoints,
                        totalChampionshipWins

                    FROM drivers

                    WHERE
                        name LIKE ?
                        OR firstName LIKE ?
                        OR lastName LIKE ?
                        OR abbreviation LIKE ?

                    ORDER BY
                        lastName,
                        firstName

                    LIMIT ${limit}
                `, [q, q, q, q]);
            }


            return connection.query(`
                SELECT
                    id,
                    name,
                    firstName,
                    lastName,
                    fullName,
                    abbreviation,
                    permanentNumber,
                    nationalityCountryId,
                    totalRaceWins,
                    totalPodiums,
                    totalPolePositions,
                    totalFastestLaps,
                    totalPoints,
                    totalChampionshipWins

                FROM drivers

                ORDER BY
                    lastName,
                    firstName

                LIMIT ${limit}
            `);
        });


        res.json(rows);

    } catch (error) {

        sendError(res, error);
    }
});


// ============================================================
// Driver Details
// ============================================================

router.get('/api/drivers/compare', async (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length !== 2 || ids[0] === ids[1]) {
        return res.status(400).json({ error: 'Choose two different drivers.' });
    }
    try {
        if (String(req.query.series || '').toLowerCase() === 'f2') {
            const data = await withConnection(async connection => {
                const [drivers, sharedRaces] = await Promise.all([
                    connection.query(`SELECT d.id, d.name, d.countryCode AS nationalityCountryId,
                        COALESCE(SUM(s.wins), 0) AS totalRaceWins, COALESCE(SUM(s.podiums), 0) AS totalPodiums,
                        COALESCE(SUM(s.poles), 0) AS totalPolePositions, COALESCE(SUM(s.fastestLaps), 0) AS totalFastestLaps,
                        COALESCE(SUM(s.points), 0) AS totalPoints,
                        COALESCE(SUM(s.positionNumber = 1 AND (LOWER(CAST(s.championshipWon AS CHAR)) IN ('1','true') OR s.year < YEAR(CURRENT_DATE()))), 0) AS totalChampionshipWins
                        FROM f2_drivers d LEFT JOIN f2_season_driver_standings s ON s.driverId = d.id
                        WHERE d.id IN (?, ?) GROUP BY d.id, d.name, d.countryCode`, ids),
                    connection.query(`SELECT a.sessionId AS raceId, a.year, a.round, races.name AS officialName, races.date,
                        a.constructorId, constructors.name AS constructorName,
                        a.positionNumber AS firstPosition, a.status AS firstPositionText,
                        a.positionNumber AS firstQualifying, a.positionNumber AS firstGrid, a.points AS firstPoints,
                        b.positionNumber AS secondPosition, b.status AS secondPositionText,
                        b.positionNumber AS secondQualifying, b.positionNumber AS secondGrid, b.points AS secondPoints
                        FROM f2_session_results a
                        JOIN f2_session_results b ON b.sessionId = a.sessionId AND b.constructorId = a.constructorId
                        JOIN f2_sessions sessions ON sessions.id = a.sessionId
                        JOIN f2_races races ON races.id = a.raceId
                        LEFT JOIN f2_constructors constructors ON constructors.id = a.constructorId
                        WHERE a.driverId = ? AND b.driverId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1','true')
                        ORDER BY a.year DESC, a.round DESC, sessions.sessionNumber DESC`, ids)
                ]);
                if (drivers.length !== 2) return null;
                return { drivers: ids.map(id => drivers.find(driver => String(driver.id) === id)), sharedRaces };
            });
            if (!data) return res.status(404).json({ error: 'One or both drivers could not be found.' });
            return res.json(data);
        }
        const data = await withConnection(async connection => {
            const [drivers, sharedRaces] = await Promise.all([
                connection.query(`SELECT id, name, fullName, nationalityCountryId, totalRaceWins,
                    totalPodiums, totalPolePositions, totalFastestLaps, totalPoints, totalChampionshipWins
                    FROM drivers WHERE id IN (?, ?)`, ids),
                connection.query(`SELECT a.raceId, a.year, a.round, r.officialName, r.date,
                    a.constructorId, k.name AS constructorName,
                    a.positionNumber AS firstPosition, a.positionText AS firstPositionText,
                    a.qualificationPositionNumber AS firstQualifying, a.gridPositionNumber AS firstGrid, a.points AS firstPoints,
                    b.positionNumber AS secondPosition, b.positionText AS secondPositionText,
                    b.qualificationPositionNumber AS secondQualifying, b.gridPositionNumber AS secondGrid, b.points AS secondPoints
                    FROM races_race_results a
                    JOIN races_race_results b ON b.raceId = a.raceId AND b.constructorId = a.constructorId
                    JOIN races r ON r.id = a.raceId LEFT JOIN constructors k ON k.id = a.constructorId
                    WHERE a.driverId = ? AND b.driverId = ? ORDER BY a.year DESC, a.round DESC`, ids)
            ]);
            if (drivers.length !== 2) return null;
            return { drivers: ids.map(id => drivers.find(driver => String(driver.id) === id)), sharedRaces };
        });
        if (!data) return res.status(404).json({ error: 'One or both drivers could not be found.' });
        res.json(data);
    } catch (error) { sendError(res, error); }
});

router.get('/api/drivers/:id/teammates', async (req, res) => {
    try {
        if (String(req.query.series || '').toLowerCase() === 'f2') {
            const rows = await withConnection(connection => connection.query(`
                SELECT b.driverId AS id, d.name, d.countryCode AS nationalityCountryId,
                    COUNT(*) AS sharedRaces, MIN(a.year) AS firstSeason, MAX(a.year) AS lastSeason
                FROM f2_session_results a
                JOIN f2_session_results b ON b.sessionId = a.sessionId AND b.constructorId = a.constructorId AND b.driverId <> a.driverId
                JOIN f2_sessions sessions ON sessions.id = a.sessionId
                JOIN f2_drivers d ON d.id = b.driverId
                WHERE a.driverId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1','true')
                GROUP BY b.driverId, d.name, d.countryCode ORDER BY sharedRaces DESC, d.name
            `, [req.params.id]));
            return res.json(rows);
        }
        const rows = await withConnection(connection => connection.query(`
            SELECT b.driverId AS id, d.name, d.nationalityCountryId,
                COUNT(*) AS sharedRaces, MIN(a.year) AS firstSeason, MAX(a.year) AS lastSeason
            FROM races_race_results a
            JOIN races_race_results b ON b.raceId = a.raceId
                AND b.constructorId = a.constructorId AND b.driverId <> a.driverId
            JOIN drivers d ON d.id = b.driverId
            WHERE a.driverId = ?
            GROUP BY b.driverId, d.name, d.nationalityCountryId
            ORDER BY sharedRaces DESC, d.name
        `, [req.params.id]));
        res.json(rows);
    } catch (error) { sendError(res, error); }
});

router.get('/api/drivers/:id/form', async (req, res) => {
    try {
        if (String(req.query.series || '').toLowerCase() === 'f2') {
            const data = await withConnection(async connection => {
                const [drivers, results, teammates] = await Promise.all([
                    connection.query('SELECT id, name, countryCode AS nationalityCountryId FROM f2_drivers WHERE id = ?', [req.params.id]),
                    connection.query(`SELECT results.sessionId AS raceId, results.year, results.round, races.date,
                        CONCAT(races.name, ' · ', sessions.name) AS officialName, races.circuitId, circuits.name AS circuitName,
                        results.constructorId, constructors.name AS constructorName, results.positionNumber,
                        results.status AS positionText, results.positionNumber AS qualificationPositionNumber,
                        results.positionNumber AS gridPositionNumber, results.points, results.laps, results.laps AS raceLaps,
                        results.status AS reasonRetired, results.fastestLap, results.polePosition
                        FROM f2_session_results results JOIN f2_sessions sessions ON sessions.id = results.sessionId
                        JOIN f2_races races ON races.id = results.raceId LEFT JOIN f2_circuits circuits ON circuits.id = races.circuitId
                        LEFT JOIN f2_constructors constructors ON constructors.id = results.constructorId
                        WHERE results.driverId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1','true')
                        ORDER BY results.year DESC, results.round DESC, sessions.sessionNumber DESC LIMIT 250`, [req.params.id]),
                    connection.query(`SELECT own.sessionId AS raceId, mate.driverId, drivers.name AS driverName,
                        mate.positionNumber, mate.status AS positionText, mate.positionNumber AS qualificationPositionNumber,
                        mate.positionNumber AS gridPositionNumber, mate.points, mate.status AS reasonRetired
                        FROM f2_session_results own JOIN f2_session_results mate ON mate.sessionId = own.sessionId
                        AND mate.constructorId = own.constructorId AND mate.driverId <> own.driverId
                        JOIN f2_sessions sessions ON sessions.id = own.sessionId JOIN f2_drivers drivers ON drivers.id = mate.driverId
                        WHERE own.driverId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1','true')
                        ORDER BY own.year DESC, own.round DESC`, [req.params.id])
                ]);
                if (!drivers.length) return null;
                const teammateMap = new Map();
                teammates.forEach(row => { const key=String(row.raceId); if(!teammateMap.has(key))teammateMap.set(key,[]); teammateMap.get(key).push({driverId:row.driverId,driverName:row.driverName,position:row.positionNumber===null?null:Number(row.positionNumber),positionText:row.positionText,qualifying:row.qualificationPositionNumber===null?null:Number(row.qualificationPositionNumber),grid:row.gridPositionNumber===null?null:Number(row.gridPositionNumber),points:Number(row.points||0),reasonRetired:row.reasonRetired}); });
                return {driver:drivers[0],results:results.map(row=>({raceId:row.raceId,year:Number(row.year),round:Number(row.round),date:row.date,officialName:row.officialName,circuitId:row.circuitId,circuitName:row.circuitName,constructorId:row.constructorId,constructorName:row.constructorName,position:row.positionNumber===null?null:Number(row.positionNumber),positionText:row.positionText,qualifying:row.qualificationPositionNumber===null?null:Number(row.qualificationPositionNumber),grid:row.gridPositionNumber===null?null:Number(row.gridPositionNumber),points:Number(row.points||0),laps:Number(row.laps||0),raceLaps:Number(row.raceLaps||0),reasonRetired:row.reasonRetired,fastestLap:Boolean(row.fastestLap),polePosition:Boolean(row.polePosition),teammates:teammateMap.get(String(row.raceId))||[]}))};
            });
            if (!data) return res.status(404).json({ error: 'Driver not found.' });
            return res.json(data);
        }
        const data = await withConnection(async connection => {
            const [drivers, results, teammates] = await Promise.all([
                connection.query('SELECT id, name, nationalityCountryId FROM drivers WHERE id = ?', [req.params.id]),
                connection.query(`SELECT rr.raceId, rr.year, rr.round, r.date, r.officialName,
                    r.circuitId, c.name AS circuitName, rr.constructorId, k.name AS constructorName,
                    rr.positionNumber, rr.positionText, rr.qualificationPositionNumber,
                    rr.gridPositionNumber, rr.points, rr.laps, r.laps AS raceLaps,
                    rr.reasonRetired, rr.fastestLap, rr.polePosition
                    FROM races_race_results rr JOIN races r ON r.id = rr.raceId
                    LEFT JOIN circuits c ON c.id = r.circuitId LEFT JOIN constructors k ON k.id = rr.constructorId
                    WHERE rr.driverId = ? ORDER BY rr.year DESC, rr.round DESC LIMIT 250`, [req.params.id]),
                connection.query(`SELECT own.raceId, mate.driverId, d.name AS driverName,
                    mate.positionNumber, mate.positionText, mate.qualificationPositionNumber,
                    mate.gridPositionNumber, mate.points, mate.reasonRetired
                    FROM races_race_results own
                    JOIN races_race_results mate ON mate.raceId = own.raceId
                        AND mate.constructorId = own.constructorId AND mate.driverId <> own.driverId
                    JOIN drivers d ON d.id = mate.driverId
                    WHERE own.driverId = ? ORDER BY own.year DESC, own.round DESC`, [req.params.id])
            ]);
            if (!drivers.length) return null;
            const teammateMap = new Map();
            teammates.forEach(row => {
                const key = String(row.raceId);
                if (!teammateMap.has(key)) teammateMap.set(key, []);
                teammateMap.get(key).push({ driverId: row.driverId, driverName: row.driverName,
                    position: row.positionNumber === null ? null : Number(row.positionNumber), positionText: row.positionText,
                    qualifying: row.qualificationPositionNumber === null ? null : Number(row.qualificationPositionNumber),
                    grid: row.gridPositionNumber === null ? null : Number(row.gridPositionNumber),
                    points: Number(row.points || 0), reasonRetired: row.reasonRetired });
            });
            return { driver: drivers[0], results: results.map(row => ({
                raceId: row.raceId, year: Number(row.year), round: Number(row.round), date: row.date,
                officialName: row.officialName, circuitId: row.circuitId, circuitName: row.circuitName,
                constructorId: row.constructorId, constructorName: row.constructorName,
                position: row.positionNumber === null ? null : Number(row.positionNumber), positionText: row.positionText,
                qualifying: row.qualificationPositionNumber === null ? null : Number(row.qualificationPositionNumber),
                grid: row.gridPositionNumber === null ? null : Number(row.gridPositionNumber), points: Number(row.points || 0),
                laps: Number(row.laps || 0), raceLaps: Number(row.raceLaps || 0), reasonRetired: row.reasonRetired,
                fastestLap: Boolean(row.fastestLap), polePosition: Boolean(row.polePosition), teammates: teammateMap.get(String(row.raceId)) || []
            })) };
        });
        if (!data) return res.status(404).json({ error: 'Driver not found.' });
        res.json(data);
    } catch (error) { sendError(res, error); }
});

router.get('/api/drivers/:id', async (req, res) => {

    try {

        if (String(req.query.series || '').toLowerCase() === 'f2') {
            const data = await withConnection(async connection => {
                const [driverRows, standings, results] = await Promise.all([
                    connection.query(`
                        SELECT d.id, d.name, d.firstName, d.lastName, d.abbreviation, d.countryCode,
                            (SELECT entry.driverNumber
                                FROM f2_entries entry
                                WHERE entry.driverId = d.id
                                ORDER BY entry.year DESC, entry.round DESC
                                LIMIT 1) AS latestNumber
                        FROM f2_drivers d
                        WHERE d.id = ?
                    `, [req.params.id]),
                    connection.query(`
                        SELECT standings.year, standings.positionNumber, standings.points,
                            standings.championshipWon,
                            calendars.finalDate AS seasonFinalDate,
                            standings.starts, standings.wins,
                            standings.podiums, standings.poles, standings.fastestLaps,
                            standings.retirements, standings.constructorId,
                            constructors.name AS constructorName
                        FROM f2_season_driver_standings standings
                        LEFT JOIN f2_constructors constructors ON constructors.id = standings.constructorId
                        LEFT JOIN (
                            SELECT year, MAX(COALESCE(endDate, date)) AS finalDate
                            FROM f2_races
                            GROUP BY year
                        ) calendars ON calendars.year = standings.year
                        WHERE standings.driverId = ?
                        ORDER BY standings.year DESC
                    `, [req.params.id]),
                    connection.query(`
                        SELECT results.sessionId, results.raceId, results.year, results.round,
                            results.positionNumber, results.positionDisplayOrder, results.points,
                            results.status, results.driverNumber, results.constructorId,
                            results.laps, results.time, results.gapMillis, results.gapLaps,
                            results.fastestLap, results.polePosition,
                            sessions.name AS sessionName, sessions.sessionNumber,
                            races.name AS raceName, races.code AS raceCode, races.date,
                            constructors.name AS constructorName
                        FROM f2_session_results results
                        JOIN f2_sessions sessions ON sessions.id = results.sessionId
                        JOIN f2_races races ON races.id = results.raceId
                        LEFT JOIN f2_constructors constructors ON constructors.id = results.constructorId
                        WHERE results.driverId = ?
                            AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                            AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
                        ORDER BY results.year DESC, results.round DESC, sessions.sessionNumber DESC
                        LIMIT 300
                    `, [req.params.id])
                ]);

                if (!driverRows.length) return null;
                const isTrue = value => value === true || Number(value) === 1 || String(value).toLowerCase() === 'true';
                return {
                    driver: {
                        ...driverRows[0],
                        countryCode: f2CountryCode(driverRows[0])
                    },
                    standings: standings.map(row => ({
                        ...row,
                        year: Number(row.year),
                        positionNumber: row.positionNumber === null ? null : Number(row.positionNumber),
                        points: Number(row.points || 0),
                        championshipWon: Number(row.positionNumber) === 1 && (
                            isTrue(row.championshipWon)
                            || (row.seasonFinalDate && new Date(row.seasonFinalDate) < new Date())
                        ),
                        starts: Number(row.starts || 0),
                        wins: Number(row.wins || 0),
                        podiums: Number(row.podiums || 0),
                        poles: Number(row.poles || 0),
                        fastestLaps: Number(row.fastestLaps || 0),
                        retirements: Number(row.retirements || 0)
                    })),
                    results: results.map(row => ({
                        ...row,
                        year: Number(row.year),
                        round: Number(row.round),
                        positionNumber: row.positionNumber === null ? null : Number(row.positionNumber),
                        points: Number(row.points || 0),
                        laps: Number(row.laps || 0),
                        fastestLap: isTrue(row.fastestLap),
                        polePosition: isTrue(row.polePosition)
                    }))
                };
            });

            if (!data) return res.status(404).json({ error: 'F2 driver not found.' });
            return res.json(data);
        }

        const data = await withConnection(async connection => {

            const [
                driverRows,
                standings,
                results
            ] = await Promise.all([

                connection.query(`
                    SELECT
                        d.*,
                        cb.name AS birthCountryName,
                        cn.name AS nationalityCountryName

                    FROM drivers d

                    LEFT JOIN countries cb
                        ON cb.id = d.countryOfBirthCountryId

                    LEFT JOIN countries cn
                        ON cn.id = d.nationalityCountryId

                    WHERE d.id = ?
                `, [req.params.id]),


                connection.query(`
                    SELECT
                        s.year,
                        s.positionNumber,
                        s.points,
                        s.championshipWon,
                        (SELECT GROUP_CONCAT(DISTINCT k.name ORDER BY k.name SEPARATOR '||')
                            FROM races_race_results rr
                            JOIN constructors k ON k.id = rr.constructorId
                            WHERE rr.driverId = s.driverId AND rr.year = s.year) AS teams

                    FROM seasons_driver_standings s

                    WHERE s.driverId = ?

                    ORDER BY s.year DESC
                `, [req.params.id]),


                connection.query(`
                    SELECT
                        rr.raceId,
                        rr.year,
                        rr.round,
                        rr.positionNumber,
                        rr.positionText,
                        rr.gridPositionNumber,
                        rr.points,
                        rr.laps,
                        rr.pitStops,
                        rr.fastestLap,
                        rr.positionsGained,

                        r.officialName,
                        r.date,

                        c.name AS circuitName,

                        k.name AS constructorName

                    FROM races_race_results rr

                    JOIN races r
                        ON r.id = rr.raceId

                    LEFT JOIN circuits c
                        ON c.id = r.circuitId

                    LEFT JOIN constructors k
                        ON k.id = rr.constructorId

                    WHERE rr.driverId = ?

                    ORDER BY
                        rr.year DESC,
                        rr.round DESC

                    LIMIT 200
                `, [req.params.id])

            ]);


            if (!driverRows.length) {
                return null;
            }


            return {
                driver: driverRows[0],
                standings,
                results
            };
        });


        if (!data) {

            return res.status(404).json({
                error: 'Driver not found.'
            });
        }


        res.json(data);

    } catch (error) {

        sendError(res, error);
    }
});

module.exports = router;
