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

async function getF2RaceWinners() {
    return pool.query(`
        SELECT drivers.name AS driverName,
            LOWER(CASE drivers.id
                WHEN 'james-wharton' THEN 'au'
                WHEN 'laurens-van-hoepen' THEN 'nl'
                WHEN 'nikita-mazepin' THEN 'ru'
                WHEN 'rafael-camara' THEN 'br'
                ELSE drivers.countryCode
            END) AS countryCode,
            COUNT(*) AS wins,
            SUM(LOWER(sessions.name) LIKE '%feature%') AS featureWins,
            SUM(LOWER(sessions.name) LIKE '%sprint%') AS sprintWins,
            MIN(sessions.year) AS firstWinYear,
            MAX(sessions.year) AS lastWinYear
        FROM f2_session_results results
        JOIN f2_sessions sessions ON sessions.id = results.sessionId
        JOIN f2_drivers drivers ON drivers.id = results.driverId
        WHERE results.positionNumber = 1
            AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
            AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
        GROUP BY results.driverId, drivers.name, drivers.countryCode
        ORDER BY wins DESC, featureWins DESC, drivers.name
    `);
}

function normalizedName(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function nameMatchesGuess(driverName, guess) {
    const normalizedDriverName = normalizedName(driverName);
    const normalizedGuess = normalizedName(guess);
    const nameParts = normalizedDriverName.split(' ');
    const surnameParticles = new Set(['da', 'de', 'del', 'della', 'di', 'du', 'la', 'le', 'van', 'von']);
    let surnameStart = nameParts.length - 1;
    while (surnameStart > 0 && surnameParticles.has(nameParts[surnameStart - 1])) surnameStart -= 1;
    const compoundSurname = nameParts.slice(surnameStart).join(' ');
    return normalizedGuess === normalizedDriverName
        || normalizedGuess === nameParts.at(-1)
        || normalizedGuess === compoundSurname;
}

router.get('/api/games/world-champions', async (req, res) => {
    try {
        if (String(req.query.series || '').toLowerCase() === 'f2') {
            const rows = await pool.query(`
                SELECT standings.year,
                    GROUP_CONCAT(DISTINCT constructors.name ORDER BY constructors.name SEPARATOR '|||') AS teamNames,
                    (
                        SELECT MAX(CHAR_LENGTH(championDrivers.name))
                        FROM f2_season_driver_standings championStandings
                        JOIN f2_drivers championDrivers ON championDrivers.id = championStandings.driverId
                        WHERE championStandings.positionNumber = 1
                            AND (
                                LOWER(CAST(championStandings.championshipWon AS CHAR)) IN ('1', 'true')
                                OR championStandings.year < YEAR(CURRENT_DATE())
                            )
                    ) AS driverNameLength
                FROM f2_season_driver_standings standings
                LEFT JOIN f2_sessions sessions ON sessions.year = standings.year
                LEFT JOIN f2_session_results results
                    ON results.sessionId = sessions.id
                    AND results.driverId = standings.driverId
                LEFT JOIN f2_constructors constructors ON constructors.id = results.constructorId
                WHERE standings.positionNumber = 1
                    AND (
                        LOWER(CAST(standings.championshipWon AS CHAR)) IN ('1', 'true')
                        OR standings.year < YEAR(CURRENT_DATE())
                    )
                GROUP BY standings.year
                ORDER BY standings.year DESC
            `);
            return res.json(rows.map(row => ({
                year: Number(row.year),
                teams: row.teamNames ? String(row.teamNames).split('|||') : [],
                driverNameLength: Number(row.driverNameLength || 0)
            })));
        }
        const rows = await pool.query(`
            SELECT standings.year,
                GROUP_CONCAT(DISTINCT constructors.name ORDER BY constructors.name SEPARATOR '|||') AS teamNames,
                (
                    SELECT MAX(CHAR_LENGTH(championDrivers.name))
                    FROM seasons_driver_standings championStandings
                    JOIN drivers championDrivers ON championDrivers.id = championStandings.driverId
                    WHERE championStandings.championshipWon = 1
                ) AS driverNameLength
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
            teams: row.teamNames ? String(row.teamNames).split('|||') : [],
            driverNameLength: Number(row.driverNameLength || 0)
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
        if (String(req.query.series || '').toLowerCase() === 'f2') {
            const rows = await pool.query(`
                SELECT standings.year, drivers.name AS driverName
                FROM f2_season_driver_standings standings
                JOIN f2_drivers drivers ON drivers.id = standings.driverId
                WHERE standings.positionNumber = 1
                    AND (
                        LOWER(CAST(standings.championshipWon AS CHAR)) IN ('1', 'true')
                        OR standings.year < YEAR(CURRENT_DATE())
                    )
                ORDER BY standings.year DESC
            `);
            const matches = rows.filter(row => nameMatchesGuess(row.driverName, guess));
            return res.json({
                correct: matches.length > 0,
                driverName: matches[0]?.driverName || null,
                years: matches.map(row => Number(row.year))
            });
        }
        const rows = await pool.query(`
            SELECT standings.year, drivers.name AS driverName
            FROM seasons_driver_standings standings
            JOIN drivers ON drivers.id = standings.driverId
            WHERE standings.championshipWon = 1
            ORDER BY standings.year DESC
        `);
        const matches = rows.filter(row => nameMatchesGuess(row.driverName, guess));

        res.json({
            correct: matches.length > 0,
            driverName: matches[0]?.driverName || null,
            years: matches.map(row => Number(row.year))
        });
    } catch (error) {
        sendError(res, error);
    }
});

router.get('/api/games/race-winners', async (req, res) => {
    try {
        const isF2 = String(req.query.series || '').toLowerCase() === 'f2';
        const rows = isF2 ? await getF2RaceWinners() : await getRaceWinners();
        const driverNameLength = Math.max(0, ...rows.map(row => String(row.driverName || '').length));
        res.json(rows.map((row, slot) => ({
            slot,
            wins: Number(row.wins),
            driverNameLength,
            ...(isF2 ? {
                featureWins: Number(row.featureWins),
                sprintWins: Number(row.sprintWins),
                countryCode: row.countryCode || null
            } : {}),
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
        const rows = String(req.query.series || '').toLowerCase() === 'f2'
            ? await getF2RaceWinners()
            : await getRaceWinners();
        const matches = rows.map((row, slot) => ({ row, slot })).filter(({ row }) => {
            return nameMatchesGuess(row.driverName, guess);
        });
        res.json({
            correct: matches.length > 0,
            matches: matches.map(({ row, slot }) => ({
                slot,
                driverName: row.driverName,
                countryCode: row.countryCode || null
            }))
        });
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;
