const express = require('express');
const { withConnection, sendError } = require('../route-helpers');

const router = express.Router();

// ============================================================
// Health
// ============================================================

router.get('/api/health', async (req, res) => {

    try {

        await withConnection(connection =>
            connection.query('SELECT 1')
        );

        res.json({
            status: 'ok',
            application: 'Racelytics',
            database: 'connected'
        });

    } catch (error) {

        sendError(res, error);
    }
});


// ============================================================
// Dashboard
// ============================================================

router.get('/api/dashboard', async (req, res) => {

    try {

        const data = await withConnection(async connection => {

            const [
                drivers,
                constructors,
                circuits,
                seasons,
                latest
            ] = await Promise.all([

                connection.query(`
                    SELECT COUNT(*) AS count
                    FROM drivers
                `),

                connection.query(`
                    SELECT COUNT(*) AS count
                    FROM constructors
                `),

                connection.query(`
                    SELECT COUNT(*) AS count
                    FROM circuits
                `),

                connection.query(`
                    SELECT COUNT(*) AS count
                    FROM seasons
                `),

                connection.query(`
                    SELECT MAX(year) AS year
                    FROM seasons
                `)

            ]);


            return {
                drivers: Number(drivers[0].count),
                constructors: Number(constructors[0].count),
                circuits: Number(circuits[0].count),
                seasons: Number(seasons[0].count),
                latestSeason: Number(latest[0].year)
            };
        });


        res.json(data);

    } catch (error) {

        sendError(res, error);
    }
});

module.exports = router;
