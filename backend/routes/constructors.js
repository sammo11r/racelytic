const express = require('express');
const { withConnection, sendError } = require('../route-helpers');

const router = express.Router();
const { isJuniorSeries, seriesPrefix } = require('../series-config');
const f2ConstructorCountryFallbacks = {
    'invicta-racing': 'gb',
    'phm-racing': 'de',
    'rodin-motorsport': 'nz'
};

function normalizeF2Constructor(constructor) {
    return {
        ...constructor,
        countryCode: constructor.countryCode || f2ConstructorCountryFallbacks[constructor.id] || ''
    };
}

// ============================================================
// Constructors
// ============================================================

router.get('/api/constructors', async (req, res) => {

    try {

        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const rows = await withConnection(connection => connection.query(`
                SELECT constructors.id, constructors.name, constructors.abbreviation,
                    constructors.countryCode, career.firstYear, career.lastYear,
                    COALESCE(standings.titles, 0) AS totalChampionshipWins,
                    COALESCE(results.wins, 0) AS totalRaceWins,
                    COALESCE(results.podiums, 0) AS totalPodiums,
                    COALESCE(results.points, 0) AS totalRacePoints,
                    latest.positionNumber AS latestPosition, latest.points AS latestPoints
                FROM ${prefix}constructors constructors
                LEFT JOIN (
                    SELECT constructorId, MIN(year) AS firstYear, MAX(year) AS lastYear
                    FROM ${prefix}entries GROUP BY constructorId
                ) career ON career.constructorId = constructors.id
                LEFT JOIN (
                    SELECT constructorId,
                        SUM(positionNumber = 1 AND (
                            LOWER(CAST(championshipWon AS CHAR)) IN ('1', 'true')
                            OR year < YEAR(CURRENT_DATE())
                        )) AS titles
                    FROM ${prefix}season_constructor_standings GROUP BY constructorId
                ) standings ON standings.constructorId = constructors.id
                LEFT JOIN (
                    SELECT sessionResults.constructorId,
                        SUM(CASE WHEN UPPER(COALESCE(sessionResults.status, '')) IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 0 ELSE sessionResults.positionNumber = 1 END) AS wins,
                        SUM(CASE WHEN UPPER(COALESCE(sessionResults.status, '')) IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 0 ELSE sessionResults.positionNumber BETWEEN 1 AND 3 END) AS podiums,
                        SUM(CASE WHEN UPPER(COALESCE(sessionResults.status, '')) IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 0 ELSE sessionResults.points END) AS points
                    FROM ${prefix}session_results sessionResults
                    JOIN ${prefix}sessions sessions ON sessions.id = sessionResults.sessionId
                    WHERE LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                    GROUP BY sessionResults.constructorId
                ) results ON results.constructorId = constructors.id
                LEFT JOIN ${prefix}season_constructor_standings latest
                    ON latest.constructorId = constructors.id
                    AND latest.year = career.lastYear
                ORDER BY constructors.name
            `));
            return res.json(rows.map(normalizeF2Constructor));
        }

        const search = String(
            req.query.search || ''
        ).trim();


        const rows = await withConnection(connection => {

            if (search) {

                const q = `%${search}%`;

                return connection.query(`
                    SELECT
                        k.*,
                        co.name AS countryName

                    FROM constructors k

                    LEFT JOIN countries co
                        ON co.id = k.countryId

                    WHERE
                        k.name LIKE ?
                        OR k.fullName LIKE ?

                    ORDER BY k.name
                `, [q, q]);
            }


            return connection.query(`
                SELECT
                    k.*,
                    co.name AS countryName

                FROM constructors k

                LEFT JOIN countries co
                    ON co.id = k.countryId

                ORDER BY k.name
            `);
        });


        res.json(rows);

    } catch (error) {

        sendError(res, error);
    }
});


// ============================================================
// Constructor Details
// ============================================================

router.get('/api/constructors/:id', async (req, res) => {

    try {

        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const data = await withConnection(async connection => {
                const [constructorRows, standings, drivers, results] = await Promise.all([
                    connection.query(`
                        SELECT constructors.id, constructors.name, constructors.abbreviation,
                            constructors.countryCode, MIN(entries.year) AS firstYear,
                            MAX(entries.year) AS lastYear,
                            (SELECT SUM(results.positionNumber = 1)
                                FROM ${prefix}session_results results
                                JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
                                WHERE results.constructorId = constructors.id
                                    AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                                    AND UPPER(COALESCE(results.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC')) AS totalRaceWins,
                            (SELECT SUM(results.positionNumber BETWEEN 1 AND 3
                                    AND UPPER(COALESCE(results.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC'))
                                FROM ${prefix}session_results results
                                JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
                                WHERE results.constructorId = constructors.id
                                    AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')) AS totalPodiums,
                            (SELECT SUM(CASE WHEN UPPER(COALESCE(results.status, '')) IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 0 ELSE results.points END)
                                FROM ${prefix}session_results results
                                JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
                                WHERE results.constructorId = constructors.id
                                    AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')) AS totalRacePoints,
                            (SELECT SUM(LOWER(CAST(results.fastestLap AS CHAR)) IN ('1', 'true'))
                                FROM ${prefix}session_results results
                                JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
                                WHERE results.constructorId = constructors.id
                                    AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')) AS totalFastestLaps
                        FROM ${prefix}constructors constructors
                        LEFT JOIN ${prefix}entries entries ON entries.constructorId = constructors.id
                        WHERE constructors.id = ?
                        GROUP BY constructors.id, constructors.name, constructors.abbreviation,
                            constructors.countryCode
                    `, [req.params.id]),
                    connection.query(`
                        SELECT standings.year, standings.positionNumber, standings.points,
                            standings.championshipWon,
                            GROUP_CONCAT(DISTINCT drivers.name ORDER BY drivers.name SEPARATOR '||') AS drivers,
                            GROUP_CONCAT(DISTINCT entries.chassisId ORDER BY entries.chassisId SEPARATOR '||') AS chassis
                        FROM ${prefix}season_constructor_standings standings
                        LEFT JOIN ${prefix}entries entries ON entries.constructorId = standings.constructorId
                            AND entries.year = standings.year
                        LEFT JOIN ${prefix}drivers drivers ON drivers.id = entries.driverId
                        WHERE standings.constructorId = ?
                        GROUP BY standings.year, standings.positionNumber, standings.points,
                            standings.championshipWon
                        ORDER BY standings.year DESC
                    `, [req.params.id]),
                    connection.query(`
                        SELECT entries.driverId, drivers.name AS driverName,
                            drivers.countryCode, MIN(entries.year) AS firstYear,
                            MAX(entries.year) AS lastYear, COUNT(DISTINCT entries.year) AS seasons,
                            COALESCE(stats.starts, 0) AS starts, COALESCE(stats.wins, 0) AS wins,
                            COALESCE(stats.podiums, 0) AS podiums, COALESCE(stats.points, 0) AS points
                        FROM ${prefix}entries entries
                        JOIN ${prefix}drivers drivers ON drivers.id = entries.driverId
                        LEFT JOIN (
                            SELECT sessionResults.constructorId, sessionResults.driverId,
                                COUNT(*) AS starts,
                                SUM(sessionResults.positionNumber = 1 AND UPPER(COALESCE(sessionResults.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC')) AS wins,
                                SUM(sessionResults.positionNumber BETWEEN 1 AND 3 AND UPPER(COALESCE(sessionResults.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC')) AS podiums,
                                SUM(CASE WHEN UPPER(COALESCE(sessionResults.status, '')) IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 0 ELSE sessionResults.points END) AS points
                            FROM ${prefix}session_results sessionResults
                            JOIN ${prefix}sessions sessions ON sessions.id = sessionResults.sessionId
                            WHERE LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                            GROUP BY sessionResults.constructorId, sessionResults.driverId
                        ) stats ON stats.constructorId = entries.constructorId
                            AND stats.driverId = entries.driverId
                        WHERE entries.constructorId = ?
                        GROUP BY entries.driverId, drivers.name, drivers.countryCode,
                            stats.starts, stats.wins, stats.podiums, stats.points
                        ORDER BY lastYear DESC, starts DESC, drivers.name
                    `, [req.params.id]),
                    connection.query(`
                        SELECT sessions.year, sessions.round, sessions.name AS sessionName,
                            sessionResults.raceId, sessionResults.driverId, drivers.name AS driverName,
                            sessionResults.positionNumber, sessionResults.status,
                            sessionResults.points, sessionResults.fastestLap,
                            races.name AS raceName, races.date
                        FROM ${prefix}session_results sessionResults
                        JOIN ${prefix}sessions sessions ON sessions.id = sessionResults.sessionId
                        JOIN ${prefix}races races ON races.id = sessionResults.raceId
                        LEFT JOIN ${prefix}drivers drivers ON drivers.id = sessionResults.driverId
                        WHERE sessionResults.constructorId = ?
                            AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                        ORDER BY sessions.year DESC, sessions.round DESC,
                            sessions.sessionNumber DESC, sessionResults.positionDisplayOrder
                        LIMIT 250
                    `, [req.params.id])
                ]);
                if (!constructorRows.length) return null;
                const isTrue = value => value === true || Number(value) === 1 || String(value).toLowerCase() === 'true';
                return {
                    constructor: normalizeF2Constructor(constructorRows[0]),
                    standings: standings.map(row => ({
                        ...row,
                        championshipWon: Number(row.positionNumber) === 1 && (
                            isTrue(row.championshipWon) || Number(row.year) < new Date().getFullYear()
                        )
                    })),
                    drivers: drivers.map(row => ({
                        ...row, firstYear: Number(row.firstYear), lastYear: Number(row.lastYear),
                        seasons: Number(row.seasons), starts: Number(row.starts), wins: Number(row.wins),
                        podiums: Number(row.podiums), points: Number(row.points)
                    })),
                    results: results.map(row => ({
                        ...row,
                        points: /\b(?:DSQ|DQ|DISQ|DISQUALIFIED|EXC)\b/i.test(String(row.status || '')) ? 0 : Number(row.points || 0),
                        fastestLap: ['f2', 'academy'].includes(series) && isTrue(row.fastestLap)
                    }))
                };
            });
            if (!data) return res.status(404).json({ error: `${series.toUpperCase()} team not found.` });
            return res.json(data);
        }

        const data = await withConnection(async connection => {

            const [
                constructorRows,
                standings,
                results,
                drivers,
                chassis
            ] = await Promise.all([

                connection.query(`
                    SELECT
                        k.*,
                        co.name AS countryName

                    FROM constructors k

                    LEFT JOIN countries co
                        ON co.id = k.countryId

                    WHERE k.id = ?
                `, [req.params.id]),


                connection.query(`
                    SELECT
                        s.year,
                        s.positionNumber,
                        s.points,
                        s.championshipWon,
                        (SELECT GROUP_CONCAT(DISTINCT d.name ORDER BY d.name SEPARATOR '||')
                            FROM seasons_entrants_drivers sed
                            JOIN drivers d ON d.id = sed.driverId
                            WHERE sed.constructorId = s.constructorId AND sed.year = s.year
                                AND COALESCE(sed.testDriver, 0) = 0) AS drivers,
                        (SELECT GROUP_CONCAT(DISTINCT COALESCE(ch.fullName, ch.name) ORDER BY ch.name SEPARATOR '||')
                            FROM seasons_entrants_chassis sec
                            JOIN chassis ch ON ch.id = sec.chassisId
                            WHERE sec.constructorId = s.constructorId AND sec.year = s.year) AS chassis

                    FROM seasons_constructor_standings s

                    WHERE s.constructorId = ?

                    ORDER BY s.year DESC
                `, [req.params.id]),


                connection.query(`
                    SELECT
                        rr.year,
                        rr.round,
                        rr.raceId,
                        rr.driverId,
                        rr.positionNumber,
                        rr.positionText,
                        rr.gridPositionNumber,
                        rr.points,
                        rr.laps,

                        d.name AS driverName,

                        r.officialName,
                        r.date,

                        COALESCE(NULLIF(c.fullName, ''), c.name) AS circuitName

                    FROM races_race_results rr

                    JOIN drivers d
                        ON d.id = rr.driverId

                    JOIN races r
                        ON r.id = rr.raceId

                    LEFT JOIN circuits c
                        ON c.id = r.circuitId

                    WHERE rr.constructorId = ?

                    ORDER BY
                        rr.year DESC,
                        rr.round DESC,
                        rr.positionDisplayOrder

                    LIMIT 250
                `, [req.params.id]),

                connection.query(`
                    SELECT sed.driverId, d.name AS driverName, d.nationalityCountryId,
                        MIN(sed.year) AS firstYear, MAX(sed.year) AS lastYear,
                        COUNT(DISTINCT sed.year) AS seasons,
                        COALESCE(stats.starts, 0) AS starts,
                        COALESCE(stats.wins, 0) AS wins,
                        COALESCE(stats.podiums, 0) AS podiums,
                        COALESCE(stats.points, 0) AS points
                    FROM seasons_entrants_drivers sed
                    JOIN drivers d ON d.id = sed.driverId
                    LEFT JOIN (
                        SELECT constructorId, driverId, COUNT(*) AS starts,
                            SUM(positionNumber = 1) AS wins,
                            SUM(positionNumber BETWEEN 1 AND 3) AS podiums,
                            SUM(points) AS points
                        FROM races_race_results
                        GROUP BY constructorId, driverId
                    ) stats ON stats.constructorId = sed.constructorId AND stats.driverId = sed.driverId
                    WHERE sed.constructorId = ? AND COALESCE(sed.testDriver, 0) = 0
                    GROUP BY sed.driverId, d.name, d.nationalityCountryId,
                        stats.starts, stats.wins, stats.podiums, stats.points
                    ORDER BY lastYear DESC, starts DESC, d.name
                `, [req.params.id]),

                connection.query(`
                    SELECT sec.chassisId, ch.name AS chassisName, ch.fullName AS chassisFullName,
                        MIN(sec.year) AS firstYear, MAX(sec.year) AS lastYear,
                        COUNT(DISTINCT sec.year) AS seasons,
                        GROUP_CONCAT(DISTINCT em.name ORDER BY em.name SEPARATOR '||') AS engineManufacturers,
                        GROUP_CONCAT(DISTINCT e.fullName ORDER BY e.fullName SEPARATOR '||') AS engines
                    FROM seasons_entrants_chassis sec
                    JOIN chassis ch ON ch.id = sec.chassisId
                    LEFT JOIN engine_manufacturers em ON em.id = sec.engineManufacturerId
                    LEFT JOIN seasons_entrants_engines see
                        ON see.year = sec.year AND see.entrantId = sec.entrantId
                        AND see.constructorId = sec.constructorId
                        AND see.engineManufacturerId = sec.engineManufacturerId
                    LEFT JOIN engines e ON e.id = see.engineId
                    WHERE sec.constructorId = ?
                    GROUP BY sec.chassisId, ch.name, ch.fullName
                    ORDER BY lastYear DESC, firstYear DESC, ch.name
                `, [req.params.id])

            ]);


            if (!constructorRows.length) {
                return null;
            }


            return {
                constructor: constructorRows[0],
                standings,
                results,
                drivers: drivers.map(driver => ({
                    ...driver,
                    firstYear: Number(driver.firstYear), lastYear: Number(driver.lastYear),
                    seasons: Number(driver.seasons), starts: Number(driver.starts), wins: Number(driver.wins),
                    podiums: Number(driver.podiums), points: Number(driver.points)
                })),
                chassis: chassis.map(item => ({
                    ...item,
                    firstYear: Number(item.firstYear), lastYear: Number(item.lastYear), seasons: Number(item.seasons),
                    engineManufacturers: item.engineManufacturers ? item.engineManufacturers.split('||') : [],
                    engines: item.engines ? item.engines.split('||') : []
                }))
            };
        });


        if (!data) {

            return res.status(404).json({
                error: 'Constructor not found.'
            });
        }


        res.json(data);

    } catch (error) {

        sendError(res, error);
    }
});

module.exports = router;
