const express = require('express');
const { pool, sendError } = require('../route-helpers');

const router = express.Router();

async function getRaceWinners() {
    return pool.query(`
        SELECT drivers.name AS driverName, COUNT(*) AS wins,
            MIN(results.year) AS firstWinYear, MAX(results.year) AS lastWinYear
        FROM races_race_results results
        JOIN drivers ON drivers.id = results.driverId
        WHERE results.positionNumber = 1
        GROUP BY results.driverId, drivers.name
        ORDER BY wins DESC, drivers.name
    `);
}

function normalizedName(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

router.get('/api/games/world-champions', async (req, res) => {
    try {
        const rows = await pool.query(`
            SELECT standings.year,
                GROUP_CONCAT(DISTINCT constructors.name ORDER BY constructors.name SEPARATOR '|||') AS teamNames
            FROM seasons_driver_standings standings
            LEFT JOIN races_race_results results
                ON results.year = standings.year
                AND results.driverId = standings.driverId
            LEFT JOIN constructors
                ON constructors.id = results.constructorId
            WHERE standings.championshipWon = 1
            GROUP BY standings.year
            ORDER BY standings.year DESC
        `);

        res.json(rows.map(row => ({
            year: Number(row.year),
            teams: row.teamNames ? String(row.teamNames).split('|||') : []
        })));
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/api/games/world-champions/guess', async (req, res) => {
    const guess = String(req.body.guess || '').trim().replace(/\s+/g, ' ');
    if (guess.length < 2 || guess.length > 100) {
        return res.status(400).json({ error: 'Enter a driver name.' });
    }

    try {
        const rows = await pool.query(`
            SELECT standings.year, drivers.name AS driverName
            FROM seasons_driver_standings standings
            JOIN drivers ON drivers.id = standings.driverId
            WHERE standings.championshipWon = 1
                AND (
                    LOWER(drivers.name) = LOWER(?)
                    OR LOWER(SUBSTRING_INDEX(drivers.name, ' ', -1)) = LOWER(?)
                )
            ORDER BY standings.year DESC
        `, [guess, guess]);

        res.json({
            correct: rows.length > 0,
            driverName: rows[0]?.driverName || null,
            years: rows.map(row => Number(row.year))
        });
    } catch (error) {
        sendError(res, error);
    }
});

router.get('/api/games/race-winners', async (req, res) => {
    try {
        const rows = await getRaceWinners();
        res.json(rows.map((row, slot) => ({
            slot,
            wins: Number(row.wins),
            firstWinYear: Number(row.firstWinYear),
            lastWinYear: Number(row.lastWinYear)
        })));
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/api/games/race-winners/guess', async (req, res) => {
    const guess = normalizedName(req.body.guess);
    if (guess.length < 2 || guess.length > 100) {
        return res.status(400).json({ error: 'Enter a driver name.' });
    }

    try {
        const rows = await getRaceWinners();
        const matches = rows.map((row, slot) => ({ row, slot })).filter(({ row }) => {
            const fullName = normalizedName(row.driverName);
            const surname = fullName.split(' ').at(-1);
            return guess === fullName || guess === surname;
        });
        res.json({
            correct: matches.length > 0,
            matches: matches.map(({ row, slot }) => ({ slot, driverName: row.driverName }))
        });
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;
