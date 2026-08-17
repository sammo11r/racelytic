const express = require('express');
const { withConnection, sendError } = require('../route-helpers');

const router = express.Router();

// ============================================================
// Constructors
// ============================================================

router.get('/api/constructors', async (req, res) => {

    try {

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

                        c.name AS circuitName

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
