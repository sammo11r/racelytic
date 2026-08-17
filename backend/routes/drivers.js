const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { integerOrDefault } = require('../validation');

const router = express.Router();

// ============================================================
// Drivers
// ============================================================

router.get('/api/drivers', async (req, res) => {

    try {

        const search = String(
            req.query.search || ''
        ).trim();


        const limit = integerOrDefault(req.query.limit, 100, { min: 1, max: 1000 });


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
