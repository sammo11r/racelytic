const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { integerOrDefault } = require('../validation');
const { f2SessionType, f3SessionType, academySessionType } = require('./seasons');
const { isJuniorSeries, seriesPrefix } = require('../series-config');
const { academyComparisonLookups, comparisonRaceGroups } = require('../driver-comparison');
const { driverRaceGridContexts } = require('../driver-race-grids');
const { juniorClassificationPosition, juniorClassificationStatus, juniorClassificationTime } = require('../junior-classification');

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

const F1_DRIVER_RESULTS_SQL = `
    SELECT
        rr.raceId,
        rr.year,
        rr.round,
        rr.positionNumber,
        rr.positionText,
        rr.gridPositionNumber,
        rr.gridPositionText,
        rr.points,
        rr.laps,
        rr.pitStops,
        rr.fastestLap,
        rr.polePosition,
        rr.driverOfTheDay,
        rr.positionsGained,
        rr.reasonRetired,
        rr.constructorId,
        COALESCE(NULLIF(gp.fullName, ''), r.officialName) AS name,
        gp.shortName,
        r.officialName,
        r.date,
        COALESCE(NULLIF(c.fullName, ''), c.name) AS circuitName,
        k.name AS constructorName
    FROM races_race_results rr
    JOIN races r ON r.id = rr.raceId
    LEFT JOIN grands_prix gp ON gp.id = r.grandPrixId
    LEFT JOIN circuits c ON c.id = r.circuitId
    LEFT JOIN constructors k ON k.id = rr.constructorId
    WHERE rr.driverId = ?
    ORDER BY rr.year DESC, rr.round DESC
`;

function juniorClassificationLookups(gridResults, qualifyingResults) {
    const gridsByRaceDriver = new Map();
    const featureGridByRaceDriver = new Map();
    gridResults.forEach(row => {
        const key = `${row.raceId}:${row.driverId}`;
        if (!gridsByRaceDriver.has(key)) gridsByRaceDriver.set(key, []);
        gridsByRaceDriver.get(key).push({
            sessionNumber: Number(row.sessionNumber),
            position: Number(row.positionNumber)
        });
        if (!featureGridByRaceDriver.has(key)) {
            featureGridByRaceDriver.set(key, Number(row.positionNumber));
        }
    });
    const qualifyingSessionsByRace = new Map();
    const qualifyingByRaceDriver = new Map();
    const classifiedQualifyingDriversByRace = new Map();
    qualifyingResults.forEach(row => {
        const raceId = String(row.raceId);
        if (!qualifyingSessionsByRace.has(raceId)) qualifyingSessionsByRace.set(raceId, new Set());
        qualifyingSessionsByRace.get(raceId).add(String(row.sessionId));
        const position = Number(row.positionNumber);
        if (!row.driverId || position < 1 || position > 99) return;
        if (!classifiedQualifyingDriversByRace.has(raceId)) {
            classifiedQualifyingDriversByRace.set(raceId, new Set());
        }
        classifiedQualifyingDriversByRace.get(raceId).add(String(row.driverId));
        qualifyingByRaceDriver.set(`${raceId}:${row.driverId}`, position);
    });
    return {
        gridPosition(row) {
            return gridsByRaceDriver.get(`${row.raceId}:${row.driverId}`)
                ?.find(grid => grid.sessionNumber < Number(row.sessionNumber))?.position ?? null;
        },
        qualifyingPosition(row) {
            const raceId = String(row.raceId);
            const key = `${raceId}:${row.driverId}`;
            const sessionCount = qualifyingSessionsByRace.get(raceId)?.size || 0;
            if (sessionCount === 1) return qualifyingByRaceDriver.get(key) ?? null;
            if (sessionCount > 1 && !classifiedQualifyingDriversByRace.get(raceId)?.has(String(row.driverId))) {
                return null;
            }
            return featureGridByRaceDriver.get(key) ?? null;
        }
    };
}

function juniorRaceSessionLabel(series, row) {
    if (series === 'academy') return String(row.sessionName || 'Race');
    const sessionType = series === 'academy' ? academySessionType : series === 'f3' ? f3SessionType : f2SessionType;
    const type = sessionType({ ...row, name: row.sessionName || row.name }, 0, 0, row.year);
    if (type === 'F') return 'Feature';
    const explicitSprintNumber = String(row.sessionName || '').match(/sprint[^0-9]*([0-9]+)/i)?.[1];
    if (explicitSprintNumber) return `Sprint ${explicitSprintNumber}`;
    if (Number(row.year) === 2021 && Number(row.sessionNumber) === 6) return 'Sprint 2';
    if (Number(row.year) === 2021 && Number(row.sessionNumber) === 4) return 'Sprint 1';
    return 'Sprint';
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

        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
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
                    latest.latestConstructorId,
                    latest.latestConstructorName
                FROM ${prefix}drivers d
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
                    FROM ${prefix}season_driver_standings
                    GROUP BY driverId
                ) stats ON stats.driverId = d.id
                LEFT JOIN (
                    SELECT driverId, constructorId AS latestConstructorId, constructorName AS latestConstructorName
                    FROM (
                        SELECT
                            entry.driverId,
                            entry.constructorId,
                            constructor.name AS constructorName,
                            ROW_NUMBER() OVER (PARTITION BY entry.driverId ORDER BY entry.year DESC, entry.round DESC) AS entryRank
                        FROM ${prefix}entries entry
                        LEFT JOIN ${prefix}constructors constructor ON constructor.id = entry.constructorId
                    ) rankedEntries
                    WHERE entryRank = 1
                ) latest ON latest.driverId = d.id
                ${where}
                ORDER BY d.name
                LIMIT ${limit}
                    `, parameters),
                    connection.query(`
                        SELECT standings.driverId, COUNT(*) AS totalChampionshipWins
                        FROM ${prefix}season_driver_standings standings
                        LEFT JOIN (
                            SELECT year, MAX(COALESCE(endDate, date)) AS finalDate
                            FROM ${prefix}races
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
                        totalChampionshipWins,
                        totalRaceStarts,
                        career.lastYear,
                        career.firstYear,
                        career.bestChampionshipPosition

                    FROM drivers
                    LEFT JOIN (
                        SELECT
                            driverId,
                            MIN(year) AS firstYear,
                            MAX(year) AS lastYear,
                            MIN(positionNumber) AS bestChampionshipPosition
                        FROM seasons_driver_standings
                        GROUP BY driverId
                    ) career ON career.driverId = drivers.id

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
                    totalChampionshipWins,
                    totalRaceStarts,
                    career.lastYear,
                    career.firstYear,
                    career.bestChampionshipPosition

                FROM drivers
                LEFT JOIN (
                    SELECT
                        driverId,
                        MIN(year) AS firstYear,
                        MAX(year) AS lastYear,
                        MIN(positionNumber) AS bestChampionshipPosition
                    FROM seasons_driver_standings
                    GROUP BY driverId
                ) career ON career.driverId = drivers.id

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
        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const data = await withConnection(async connection => {
                const [drivers, sharedRaces, gridResults, qualifyingResults] = await Promise.all([
                    connection.query(`SELECT d.id, d.name, d.countryCode AS nationalityCountryId,
                        COALESCE(SUM(s.wins), 0) AS totalRaceWins, COALESCE(SUM(s.podiums), 0) AS totalPodiums,
                        COALESCE(SUM(s.poles), 0) AS totalPolePositions, COALESCE(SUM(s.fastestLaps), 0) AS totalFastestLaps,
                        COALESCE(SUM(s.points), 0) AS totalPoints, COALESCE(SUM(s.starts), 0) AS totalRaceStarts,
                        MIN(s.year) AS firstYear, MAX(s.year) AS lastYear, COUNT(DISTINCT s.year) AS seasons,
                        MIN(NULLIF(s.positionNumber, 0)) AS bestChampionshipPosition,
                        COALESCE(SUM(s.positionNumber = 1 AND (LOWER(CAST(s.championshipWon AS CHAR)) IN ('1','true') OR s.year < YEAR(CURRENT_DATE()))), 0) AS totalChampionshipWins
                        FROM ${prefix}drivers d LEFT JOIN ${prefix}season_driver_standings s ON s.driverId = d.id
                        WHERE d.id IN (?, ?) GROUP BY d.id, d.name, d.countryCode`, ids),
                    connection.query(`SELECT a.sessionId, a.raceId, sessions.sessionNumber,
                        sessions.name AS sessionName, a.year, a.round, races.name AS raceName, races.date,
                        a.constructorId AS firstConstructorId, firstConstructors.name AS firstConstructorName,
                        b.constructorId AS secondConstructorId, secondConstructors.name AS secondConstructorName,
                        (a.constructorId = b.constructorId) AS sameTeam,
                        a.positionNumber AS firstPosition, a.status AS firstPositionText,
                        a.points AS firstPoints,
                        b.positionNumber AS secondPosition, b.status AS secondPositionText,
                        b.points AS secondPoints
                        FROM ${prefix}session_results a
                        JOIN ${prefix}session_results b ON b.sessionId = a.sessionId
                        JOIN ${prefix}sessions sessions ON sessions.id = a.sessionId
                        JOIN ${prefix}races races ON races.id = a.raceId
                        LEFT JOIN ${prefix}constructors firstConstructors ON firstConstructors.id = a.constructorId
                        LEFT JOIN ${prefix}constructors secondConstructors ON secondConstructors.id = b.constructorId
                        WHERE a.driverId = ? AND b.driverId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1','true')
                        ORDER BY a.year DESC, a.round DESC, sessions.sessionNumber DESC`, ids),
                    connection.query(`SELECT sessions.raceId, sessions.sessionNumber,
                        results.driverId, results.positionNumber
                        FROM ${prefix}sessions sessions
                        JOIN ${prefix}session_results results ON results.sessionId = sessions.id
                        WHERE LOWER(sessions.name) LIKE '%starting grid%'
                            AND results.positionNumber BETWEEN 1 AND 99
                            AND sessions.raceId IN (
                                SELECT DISTINCT own.raceId
                                FROM ${prefix}session_results own
                                JOIN ${prefix}session_results mate ON mate.sessionId = own.sessionId
                                JOIN ${prefix}sessions sharedSession ON sharedSession.id = own.sessionId
                                WHERE own.driverId = ? AND mate.driverId = ?
                                    AND LOWER(CAST(sharedSession.isRace AS CHAR)) IN ('1','true')
                            )
                        ORDER BY sessions.raceId, sessions.sessionNumber DESC`, ids),
                    connection.query(`SELECT sessions.raceId, sessions.id AS sessionId,
                        sessions.name AS sessionName, sessions.sessionNumber,
                        results.driverId, results.positionNumber
                        FROM ${prefix}sessions sessions
                        LEFT JOIN ${prefix}session_results results ON results.sessionId = sessions.id
                        WHERE LOWER(sessions.name) LIKE '%qualif%'
                            AND sessions.raceId IN (
                                SELECT DISTINCT own.raceId
                                FROM ${prefix}session_results own
                                JOIN ${prefix}session_results mate ON mate.sessionId = own.sessionId
                                JOIN ${prefix}sessions sharedSession ON sharedSession.id = own.sessionId
                                WHERE own.driverId = ? AND mate.driverId = ?
                                    AND LOWER(CAST(sharedSession.isRace AS CHAR)) IN ('1','true')
                            )
                        ORDER BY sessions.raceId, sessions.sessionNumber,
                            results.positionDisplayOrder`, ids)
                ]);
                if (drivers.length !== 2) return null;
                const { gridPosition, qualifyingPosition } = juniorClassificationLookups(gridResults, qualifyingResults);
                const academyLookups = series === 'academy'
                    ? academyComparisonLookups(sharedRaces, qualifyingResults)
                    : null;
                const comparisonRows = sharedRaces.map(row => ({
                    ...row,
                    constructorId: row.sameTeam ? row.firstConstructorId : null,
                    constructorName: row.sameTeam ? row.firstConstructorName : null,
                    officialName: `${row.raceName} ${juniorRaceSessionLabel(series, row)}`,
                    firstPosition: row.firstPosition === null ? null : Number(row.firstPosition),
                    secondPosition: row.secondPosition === null ? null : Number(row.secondPosition),
                    firstQualifying: academyLookups ? academyLookups.qualifyingPosition(row, ids[0]) : qualifyingPosition({ ...row, driverId: ids[0] }),
                    secondQualifying: academyLookups ? academyLookups.qualifyingPosition(row, ids[1]) : qualifyingPosition({ ...row, driverId: ids[1] }),
                    firstGrid: academyLookups ? academyLookups.gridPosition(row, ids[0]) : gridPosition({ ...row, driverId: ids[0] }),
                    secondGrid: academyLookups ? academyLookups.gridPosition(row, ids[1]) : gridPosition({ ...row, driverId: ids[1] }),
                    firstPoints: Number(row.firstPoints || 0),
                    secondPoints: Number(row.secondPoints || 0)
                }));
                return {
                    drivers: ids.map(id => drivers.find(driver => String(driver.id) === id)),
                    ...comparisonRaceGroups(comparisonRows)
                };
            });
            if (!data) return res.status(404).json({ error: 'One or both drivers could not be found.' });
            return res.json(data);
        }
        const data = await withConnection(async connection => {
            const [drivers, sharedRaces] = await Promise.all([
                connection.query(`SELECT drivers.id, drivers.name, drivers.fullName, drivers.nationalityCountryId,
                    drivers.totalRaceWins, drivers.totalPodiums, drivers.totalPolePositions, drivers.totalFastestLaps,
                    drivers.totalPoints, drivers.totalChampionshipWins, drivers.totalRaceStarts,
                    career.firstYear, career.lastYear, career.seasons, career.bestChampionshipPosition
                    FROM drivers
                    LEFT JOIN (
                        SELECT driverId, MIN(year) AS firstYear, MAX(year) AS lastYear,
                            COUNT(DISTINCT year) AS seasons, MIN(NULLIF(positionNumber, 0)) AS bestChampionshipPosition
                        FROM seasons_driver_standings GROUP BY driverId
                    ) career ON career.driverId = drivers.id
                    WHERE drivers.id IN (?, ?)`, ids),
                connection.query(`SELECT a.raceId, a.year, a.round,
                    COALESCE(NULLIF(gp.fullName, ''), r.officialName) AS name, gp.shortName, r.officialName, r.date,
                    a.constructorId AS firstConstructorId, firstConstructor.name AS firstConstructorName,
                    b.constructorId AS secondConstructorId, secondConstructor.name AS secondConstructorName,
                    (a.constructorId = b.constructorId) AS sameTeam,
                    a.positionNumber AS firstPosition, a.positionText AS firstPositionText,
                    a.qualificationPositionNumber AS firstQualifying, a.gridPositionNumber AS firstGrid, a.points AS firstPoints,
                    b.positionNumber AS secondPosition, b.positionText AS secondPositionText,
                    b.qualificationPositionNumber AS secondQualifying, b.gridPositionNumber AS secondGrid, b.points AS secondPoints
                    FROM races_race_results a
                    JOIN races_race_results b ON b.raceId = a.raceId
                    JOIN races r ON r.id = a.raceId
                    LEFT JOIN grands_prix gp ON gp.id = r.grandPrixId
                    LEFT JOIN constructors firstConstructor ON firstConstructor.id = a.constructorId
                    LEFT JOIN constructors secondConstructor ON secondConstructor.id = b.constructorId
                    WHERE a.driverId = ? AND b.driverId = ? ORDER BY a.year DESC, a.round DESC`, ids)
            ]);
            if (drivers.length !== 2) return null;
            const comparisonRows = sharedRaces.map(row => ({
                ...row,
                constructorId: row.sameTeam ? row.firstConstructorId : null,
                constructorName: row.sameTeam ? row.firstConstructorName : null
            }));
            return { drivers: ids.map(id => drivers.find(driver => String(driver.id) === id)), ...comparisonRaceGroups(comparisonRows) };
        });
        if (!data) return res.status(404).json({ error: 'One or both drivers could not be found.' });
        res.json(data);
    } catch (error) { sendError(res, error); }
});

router.get('/api/drivers/:id/teammates', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const rows = await withConnection(connection => connection.query(`
                SELECT b.driverId AS id, d.name, d.countryCode AS nationalityCountryId,
                    COUNT(*) AS sharedRaces, MIN(a.year) AS firstSeason, MAX(a.year) AS lastSeason
                FROM ${prefix}session_results a
                JOIN ${prefix}session_results b ON b.sessionId = a.sessionId AND b.constructorId = a.constructorId AND b.driverId <> a.driverId
                JOIN ${prefix}sessions sessions ON sessions.id = a.sessionId
                JOIN ${prefix}drivers d ON d.id = b.driverId
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
        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const data = await withConnection(async connection => {
                const [drivers, results, teammates, gridResults, qualifyingResults] = await Promise.all([
                    connection.query(`SELECT id, name, countryCode AS nationalityCountryId FROM ${prefix}drivers WHERE id = ?`, [req.params.id]),
                    connection.query(`SELECT results.sessionId, results.raceId, results.year, results.round, races.date,
                        sessions.name AS sessionName, CONCAT(races.name, ' · ', sessions.name) AS officialName,
                        races.circuitId, circuits.name AS circuitName,
                        results.constructorId, constructors.name AS constructorName, results.positionNumber,
                        results.status AS positionText, sessions.sessionNumber, results.points,
                        results.laps, results.laps AS raceLaps, results.time, results.gapMillis, results.gapLaps,
                        results.status AS reasonRetired, results.fastestLap, results.polePosition
                        FROM ${prefix}session_results results JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
                        JOIN ${prefix}races races ON races.id = results.raceId LEFT JOIN ${prefix}circuits circuits ON circuits.id = races.circuitId
                        LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
                        WHERE results.driverId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1','true')
                        ORDER BY results.year DESC, results.round DESC, sessions.sessionNumber DESC LIMIT 250`, [req.params.id]),
                    connection.query(`SELECT own.sessionId, own.raceId, sessions.sessionNumber,
                        mate.driverId, drivers.name AS driverName, mate.positionNumber,
                        mate.status AS positionText, mate.points, mate.status AS reasonRetired
                        FROM ${prefix}session_results own JOIN ${prefix}session_results mate ON mate.sessionId = own.sessionId
                        AND mate.constructorId = own.constructorId AND mate.driverId <> own.driverId
                        JOIN ${prefix}sessions sessions ON sessions.id = own.sessionId JOIN ${prefix}drivers drivers ON drivers.id = mate.driverId
                        WHERE own.driverId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1','true')
                        ORDER BY own.year DESC, own.round DESC`, [req.params.id]),
                    connection.query(`SELECT sessions.raceId, sessions.sessionNumber,
                        results.driverId, results.positionNumber
                        FROM ${prefix}sessions sessions
                        JOIN ${prefix}session_results results ON results.sessionId = sessions.id
                        WHERE LOWER(sessions.name) LIKE '%starting grid%'
                            AND results.positionNumber BETWEEN 1 AND 99
                            AND sessions.raceId IN (
                                SELECT DISTINCT own.raceId
                                FROM ${prefix}session_results own
                                JOIN ${prefix}sessions raceSession ON raceSession.id = own.sessionId
                                WHERE own.driverId = ?
                                    AND LOWER(CAST(raceSession.isRace AS CHAR)) IN ('1','true')
                            )
                        ORDER BY sessions.raceId, sessions.sessionNumber DESC`, [req.params.id]),
                    connection.query(`SELECT sessions.raceId, sessions.id AS sessionId,
                        sessions.name AS sessionName, sessions.sessionNumber,
                        results.driverId, results.positionNumber
                        FROM ${prefix}sessions sessions
                        LEFT JOIN ${prefix}session_results results ON results.sessionId = sessions.id
                        WHERE LOWER(sessions.name) LIKE '%qualif%'
                            AND sessions.raceId IN (
                                SELECT DISTINCT own.raceId
                                FROM ${prefix}session_results own
                                JOIN ${prefix}sessions raceSession ON raceSession.id = own.sessionId
                                WHERE own.driverId = ?
                                    AND LOWER(CAST(raceSession.isRace AS CHAR)) IN ('1','true')
                            )
                        ORDER BY sessions.raceId, sessions.sessionNumber,
                            results.positionDisplayOrder`, [req.params.id])
                ]);
                if (!drivers.length) return null;
                const genericLookups = juniorClassificationLookups(gridResults, qualifyingResults);
                const academyLookups = series === 'academy'
                    ? academyComparisonLookups(results, qualifyingResults)
                    : null;
                const gridPosition = row => academyLookups
                    ? academyLookups.gridPosition(row, row.driverId)
                    : genericLookups.gridPosition(row);
                const qualifyingPosition = row => academyLookups
                    ? academyLookups.qualifyingPosition(row, row.driverId)
                    : genericLookups.qualifyingPosition(row);
                const teammateMap = new Map();
                teammates.forEach(row => { const key=String(row.sessionId); if(!teammateMap.has(key))teammateMap.set(key,[]); teammateMap.get(key).push({driverId:row.driverId,driverName:row.driverName,position:row.positionNumber===null?null:Number(row.positionNumber),positionText:row.positionText,qualifying:qualifyingPosition(row),grid:gridPosition(row),points:Number(row.points||0),reasonRetired:row.reasonRetired}); });
                return {driver:drivers[0],results:results.map(row=>({raceId:row.raceId,sessionId:row.sessionId,sessionName:row.sessionName,year:Number(row.year),round:Number(row.round),date:row.date,officialName:row.officialName,circuitId:row.circuitId,circuitName:row.circuitName,constructorId:row.constructorId,constructorName:row.constructorName,position:row.positionNumber===null?null:Number(row.positionNumber),positionText:row.positionText,qualifying:qualifyingPosition({...row,driverId:req.params.id}),grid:gridPosition({...row,driverId:req.params.id}),points:Number(row.points||0),laps:Number(row.laps||0),raceLaps:Number(row.raceLaps||0),time:row.time,gapMillis:row.gapMillis===null?null:Number(row.gapMillis),gapLaps:row.gapLaps===null?null:Number(row.gapLaps),reasonRetired:row.reasonRetired,fastestLap:Boolean(row.fastestLap),polePosition:Boolean(row.polePosition),teammates:teammateMap.get(String(row.sessionId))||[]}))};
            });
            if (!data) return res.status(404).json({ error: 'Driver not found.' });
            return res.json(data);
        }
        const data = await withConnection(async connection => {
            const [drivers, results, teammates] = await Promise.all([
                connection.query('SELECT id, name, nationalityCountryId FROM drivers WHERE id = ?', [req.params.id]),
                connection.query(`SELECT rr.raceId, rr.year, rr.round, r.date,
                    COALESCE(NULLIF(gp.fullName, ''), r.officialName) AS name, gp.shortName, r.officialName,
                    r.circuitId, COALESCE(NULLIF(c.fullName, ''), c.name) AS circuitName, rr.constructorId, k.name AS constructorName,
                    rr.positionNumber, rr.positionText, rr.qualificationPositionNumber,
                    rr.gridPositionNumber, rr.points, rr.laps, r.laps AS raceLaps, rr.time, rr.gap,
                    rr.reasonRetired, rr.fastestLap, rr.polePosition
                    FROM races_race_results rr JOIN races r ON r.id = rr.raceId
                    LEFT JOIN grands_prix gp ON gp.id = r.grandPrixId
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
                name: row.name, shortName: row.shortName, officialName: row.officialName, circuitId: row.circuitId, circuitName: row.circuitName,
                constructorId: row.constructorId, constructorName: row.constructorName,
                position: row.positionNumber === null ? null : Number(row.positionNumber), positionText: row.positionText,
                qualifying: row.qualificationPositionNumber === null ? null : Number(row.qualificationPositionNumber),
                grid: row.gridPositionNumber === null ? null : Number(row.gridPositionNumber), points: Number(row.points || 0), time: row.time, gap: row.gap,
                laps: Number(row.laps || 0), raceLaps: Number(row.raceLaps || 0), reasonRetired: row.reasonRetired,
                fastestLap: Boolean(row.fastestLap), polePosition: Boolean(row.polePosition), teammates: teammateMap.get(String(row.raceId)) || []
            })) };
        });
        if (!data) return res.status(404).json({ error: 'Driver not found.' });
        res.json(data);
    } catch (error) { sendError(res, error); }
});

async function juniorDriverResults(connection, series, driverId) {
    const prefix = seriesPrefix(series);
    const [rows, classifications] = await Promise.all([connection.query(`
        SELECT results.sessionId, results.raceId, results.year, results.round,
            results.positionNumber, results.positionDisplayOrder, results.points,
            results.status, results.driverNumber, results.constructorId,
            results.laps, results.time, results.gapMillis, results.gapLaps,
            results.fastestLap, results.polePosition,
            sessions.name AS sessionName, sessions.sessionNumber,
            races.name AS raceName, races.code AS raceCode, races.date,
            constructors.name AS constructorName
        FROM ${prefix}session_results results
        JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
        JOIN ${prefix}races races ON races.id = results.raceId
        LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
        WHERE results.driverId = ?
            AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
            AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
        ORDER BY results.year DESC, results.round DESC, sessions.sessionNumber DESC
    `, [driverId]), connection.query(`
        SELECT sessions.raceId, races.year, sessions.id AS sessionId, sessions.name AS sessionName,
            sessions.sessionNumber, sessions.isRace, sessions.cancelled, results.driverId, results.positionNumber
        FROM ${prefix}sessions sessions
        JOIN ${prefix}races races ON races.id = sessions.raceId
        LEFT JOIN ${prefix}session_results results ON results.sessionId = sessions.id
        WHERE sessions.raceId IN (SELECT DISTINCT raceId FROM ${prefix}session_results WHERE driverId = ?)
            AND (LOWER(sessions.name) LIKE '%grid%' OR LOWER(sessions.name) LIKE '%qualif%'
                OR LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true'))
        ORDER BY sessions.raceId, sessions.sessionNumber
    `, [driverId])]);
    const contexts = driverRaceGridContexts(series, classifications, series === 'f3' ? f3SessionType : f2SessionType);
    const isTrue = value => value === true || Number(value) === 1 || String(value).toLowerCase() === 'true';
    return rows.map(row => {
        const status = juniorClassificationStatus(row.status, row.positionNumber, true) || '';
        const disqualified = /\b(?:DSQ|DQ|DISQ|DISQUALIFIED|EXC)\b/i.test(status);
        const unclassified = disqualified || /\b(?:DNS|DNQ|DNPQ|WD|DNF|RET|RETIRED|NC)\b/i.test(status);
        const positionNumber = disqualified ? null : juniorClassificationPosition(row.positionNumber);
        const gridContext = contexts.get(String(row.sessionId));
        const gridPositionNumber = juniorClassificationPosition(gridContext?.gridByDriver.get(String(driverId)));
        return {
            ...row, time: juniorClassificationTime(row.time), status: status || null, name: row.raceName, sessionLabel: juniorRaceSessionLabel(series, row),
            year: Number(row.year), round: Number(row.round), positionNumber,
            positionText: unclassified ? status : positionNumber || status || '—',
            gridPositionNumber,
            gridSource: gridPositionNumber === null ? null : gridContext.source,
            gridNote: gridContext?.gridNote || null,
            positionsGained: !unclassified && positionNumber > 0 && gridPositionNumber !== null ? gridPositionNumber - positionNumber : null,
            reasonRetired: unclassified ? status : null,
            points: disqualified ? 0 : Number(row.points || 0), laps: Number(row.laps || 0),
            fastestLap: ['f2', 'academy'].includes(series) && isTrue(row.fastestLap),
            polePosition: ['f2', 'academy'].includes(series) && isTrue(row.polePosition)
        };
    });
}

// Entries and race classifications preserve seasons even without a standings row.
async function juniorDriverCareer(connection, prefix, driverId) {
    return connection.query(`
        SELECT career.year, NULL AS positionNumber, 0 AS championshipWon,
            COALESCE(stats.points, 0) AS points, COALESCE(stats.starts, 0) AS starts,
            COALESCE(stats.wins, 0) AS wins, COALESCE(stats.podiums, 0) AS podiums,
            COALESCE(stats.poles, 0) AS poles, COALESCE(stats.fastestLaps, 0) AS fastestLaps,
            teams.constructorName
        FROM (
            SELECT year FROM ${prefix}entries WHERE driverId = ?
            UNION SELECT year FROM ${prefix}session_results WHERE driverId = ?
        ) career
        LEFT JOIN (
            SELECT results.year,
                SUM(CASE WHEN UPPER(COALESCE(results.status, '')) NOT IN ('DNS', 'DNQ', 'DNPQ', 'WD') THEN 1 ELSE 0 END) AS starts,
                SUM(CASE WHEN results.positionNumber = 1 AND UPPER(COALESCE(results.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN results.positionNumber BETWEEN 1 AND 3 AND UPPER(COALESCE(results.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 1 ELSE 0 END) AS podiums,
                SUM(CASE WHEN LOWER(CAST(results.polePosition AS CHAR)) IN ('1', 'true') THEN 1 ELSE 0 END) AS poles,
                SUM(CASE WHEN LOWER(CAST(results.fastestLap AS CHAR)) IN ('1', 'true') THEN 1 ELSE 0 END) AS fastestLaps,
                SUM(CASE WHEN UPPER(COALESCE(results.status, '')) IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 0 ELSE COALESCE(results.points, 0) END) AS points
            FROM ${prefix}session_results results
            JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
            WHERE results.driverId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
            GROUP BY results.year
        ) stats ON stats.year = career.year
        LEFT JOIN (
            SELECT participation.year, GROUP_CONCAT(DISTINCT constructors.name ORDER BY constructors.name SEPARATOR ' / ') AS constructorName
            FROM (
                SELECT year, constructorId FROM ${prefix}entries WHERE driverId = ?
                UNION SELECT year, constructorId FROM ${prefix}session_results WHERE driverId = ?
            ) participation
            LEFT JOIN ${prefix}constructors constructors ON constructors.id = participation.constructorId
            GROUP BY participation.year
        ) teams ON teams.year = career.year
        ORDER BY career.year DESC
    `, [driverId, driverId, driverId, driverId, driverId]);
}

router.get('/api/drivers/:id/results', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase();
        const rows = await withConnection(connection => isJuniorSeries(series)
            ? juniorDriverResults(connection, series, req.params.id)
            : connection.query(F1_DRIVER_RESULTS_SQL, [req.params.id]));
        res.json(rows);
    } catch (error) {
        sendError(res, error);
    }
});

router.get('/api/drivers/:id', async (req, res) => {

    try {

        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const summaryOnly = String(req.query.summary || '') === '1';
            const data = await withConnection(async connection => {
                const [driverRows, standings, results, career] = await Promise.all([
                    connection.query(`
                        SELECT d.id, d.name, d.firstName, d.lastName, d.abbreviation, d.countryCode,
                            (SELECT MAX(year) FROM ${prefix}entries) AS currentSeason,
                            (SELECT constructors.name FROM ${prefix}entries entry
                                LEFT JOIN ${prefix}constructors constructors ON constructors.id = entry.constructorId
                                WHERE entry.driverId = d.id ORDER BY entry.year DESC, entry.round DESC LIMIT 1) AS latestConstructorName,
                            (SELECT entry.driverNumber
                                FROM ${prefix}entries entry
                                WHERE entry.driverId = d.id
                                ORDER BY entry.year DESC, entry.round DESC
                                LIMIT 1) AS latestNumber
                        FROM ${prefix}drivers d
                        WHERE d.id = ?
                    `, [req.params.id]),
                    connection.query(`
                        SELECT standings.year, MIN(standings.positionNumber) AS positionNumber,
                            SUM(COALESCE(standings.points, 0)) AS points,
                            MAX(standings.championshipWon) AS championshipWon,
                            calendars.finalDate AS seasonFinalDate,
                            SUM(COALESCE(standings.starts, 0)) AS starts,
                            SUM(COALESCE(standings.wins, 0)) AS wins,
                            SUM(COALESCE(standings.podiums, 0)) AS podiums,
                            SUM(COALESCE(standings.poles, 0)) AS poles,
                            SUM(COALESCE(standings.fastestLaps, 0)) AS fastestLaps,
                            SUM(COALESCE(standings.retirements, 0)) AS retirements,
                            GROUP_CONCAT(DISTINCT standings.constructorId ORDER BY standings.constructorId SEPARATOR '||') AS constructorId,
                            GROUP_CONCAT(DISTINCT constructors.name ORDER BY constructors.name SEPARATOR ' / ') AS constructorName
                        FROM ${prefix}season_driver_standings standings
                        LEFT JOIN ${prefix}constructors constructors ON constructors.id = standings.constructorId
                        LEFT JOIN (
                            SELECT year, MAX(COALESCE(endDate, date)) AS finalDate
                            FROM ${prefix}races
                            GROUP BY year
                        ) calendars ON calendars.year = standings.year
                        WHERE standings.driverId = ?
                        GROUP BY standings.year, calendars.finalDate
                        ORDER BY standings.year DESC
                    `, [req.params.id]),
                    summaryOnly ? Promise.resolve([]) : juniorDriverResults(connection, series, req.params.id),
                    juniorDriverCareer(connection, prefix, req.params.id)
                ]);

                if (!driverRows.length) return null;
                const isTrue = value => value === true || Number(value) === 1 || String(value).toLowerCase() === 'true';
                return {
                    driver: {
                        ...driverRows[0],
                        countryCode: f2CountryCode(driverRows[0])
                    },
                    standings: [...standings, ...career.filter(season => !standings.some(row => Number(row.year) === Number(season.year)))].sort((a, b) => b.year - a.year).map(row => ({
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
                    results
                };
            });

            if (!data) return res.status(404).json({ error: `${series.toUpperCase()} driver not found.` });
            return res.json(data);
        }

        const summaryOnly = String(req.query.summary || '') === '1';
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
                        cn.name AS nationalityCountryName,
                        (SELECT MAX(year) FROM seasons_driver_standings) AS currentSeason

                    FROM drivers d

                    LEFT JOIN countries cb
                        ON cb.id = d.countryOfBirthCountryId

                    LEFT JOIN countries cn
                        ON cn.id = d.nationalityCountryId

                    WHERE d.id = ?
                `, [req.params.id]),


                connection.query(`
                    SELECT
                        career.year,
                        COALESCE(s.positionNumber, seasonStats.positionNumber) AS positionNumber,
                        COALESCE(s.points, seasonStats.totalPoints, raceStats.totalPoints, 0) AS points,
                        s.championshipWon,
                        COALESCE(seasonStats.totalRaceStarts, raceStats.totalRaceStarts, 0) AS totalRaceStarts,
                        COALESCE(seasonStats.totalRaceWins, raceStats.totalRaceWins, 0) AS totalRaceWins,
                        COALESCE(seasonStats.totalPodiums, raceStats.totalPodiums, 0) AS totalPodiums,
                        COALESCE(seasonStats.totalPolePositions, raceStats.totalPolePositions, 0) AS totalPolePositions,
                        COALESCE(seasonStats.totalFastestLaps, raceStats.totalFastestLaps, 0) AS totalFastestLaps,
                        seasonTeams.teams

                    FROM (
                        SELECT year, driverId FROM seasons_drivers WHERE driverId = ?
                        UNION
                        SELECT year, driverId FROM races_race_results WHERE driverId = ?
                    ) career

                    LEFT JOIN seasons_drivers seasonStats
                        ON seasonStats.driverId = career.driverId AND seasonStats.year = career.year

                    LEFT JOIN seasons_driver_standings s
                        ON s.driverId = career.driverId AND s.year = career.year

                    LEFT JOIN (
                        SELECT rr.driverId, rr.year,
                            SUM(CASE WHEN UPPER(COALESCE(rr.positionText, '')) NOT IN ('DNS', 'DNQ', 'DNPQ', 'WD') THEN 1 ELSE 0 END) AS totalRaceStarts,
                            SUM(CASE WHEN rr.positionNumber = 1 THEN 1 ELSE 0 END) AS totalRaceWins,
                            SUM(CASE WHEN rr.positionNumber BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS totalPodiums,
                            SUM(CASE WHEN LOWER(CAST(rr.polePosition AS CHAR)) IN ('1', 'true') THEN 1 ELSE 0 END) AS totalPolePositions,
                            SUM(CASE WHEN LOWER(CAST(rr.fastestLap AS CHAR)) IN ('1', 'true') THEN 1 ELSE 0 END) AS totalFastestLaps,
                            SUM(COALESCE(rr.points, 0)) AS totalPoints
                        FROM races_race_results rr
                        WHERE rr.driverId = ?
                        GROUP BY rr.driverId, rr.year
                    ) raceStats ON raceStats.driverId = career.driverId AND raceStats.year = career.year

                    LEFT JOIN (
                        SELECT rr.driverId, rr.year,
                            GROUP_CONCAT(DISTINCT k.name ORDER BY k.name SEPARATOR '||') AS teams
                        FROM races_race_results rr
                        JOIN constructors k ON k.id = rr.constructorId
                        WHERE rr.driverId = ?
                        GROUP BY rr.driverId, rr.year
                    ) seasonTeams ON seasonTeams.driverId = career.driverId AND seasonTeams.year = career.year

                    ORDER BY career.year DESC
                `, [req.params.id, req.params.id, req.params.id, req.params.id]),


                summaryOnly ? Promise.resolve([]) : connection.query(F1_DRIVER_RESULTS_SQL, [req.params.id])

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
