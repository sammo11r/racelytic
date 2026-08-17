const express = require('express');
const { withConnection, sendError } = require('../route-helpers');

const router = express.Router();

// ============================================================
// Circuits
// ============================================================

router.get('/api/circuits', async (req, res) => {

    try {

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


        res.json(rows);

    } catch (error) {

        sendError(res, error);
    }
});


// ============================================================
// Circuit Details
// ============================================================

router.get('/api/circuits/:id/analysis', async (req, res) => {
    try {
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
            return { circuit: circuits[0], races: [...races.values()] };
        });
        if (!data) return res.status(404).json({ error: 'Circuit not found.' });
        res.json(data);
    } catch (error) { sendError(res, error); }
});

router.get('/api/circuits/:id', async (req, res) => {

    try {

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
                circuit: circuitRows[0],
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
