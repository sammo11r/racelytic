const express = require('express');
const { withConnection, sendError } = require('../route-helpers');

const router = express.Router();

const SEARCH_PAGES = [
    ['Database', 'Browse the complete archive', '/database.html'],
    ['Seasons', 'Championship history', '/seasons.html'],
    ['Races', 'Grand Prix and session results', '/races.html'],
    ['Drivers', 'Driver profiles and statistics', '/drivers.html'],
    ['Constructors', 'Teams and constructor history', '/constructors.html'],
    ['Circuits', 'Tracks and venues', '/circuits.html'],
    ['Chassis', 'Cars, engines and manufacturers', '/chassis.html'],
    ['Analysis', 'Formula 1 data lab', '/analysis.html'],
    ['Season analysis', 'Championship trends and progression', '/season-analysis.html'],
    ['Season comparison', 'Compare championships across eras', '/season-comparison.html'],
    ['Race analysis', 'Explore a Grand Prix in detail', '/race-analysis.html'],
    ['Driver comparison', 'Compare careers and results', '/driver-comparison.html'],
    ['Driver form', 'Recent finishing and qualifying form', '/driver-form.html'],
    ['Teammate battles', 'Intra-team head-to-heads', '/teammate-battles.html'],
    ['Circuit analysis', 'Performance by venue', '/circuit-analysis.html'],
    ['Records', 'Explore all-time rankings', '/records.html'],
    ['Simulator', 'Recalculate a Formula 1 season', '/simulator-overview.html'],
    ['Points systems', 'Create and manage scoring rules', '/points-systems.html'],
    ['Scenario calculator', 'Project a championship run-in', '/scenario-calculator.html'],
    ['Championship builder', 'Create a custom championship', '/championship-builder.html'],
    ['Games', 'Play with Formula 1 history', '/games.html'],
    ['Quizzes', 'Test your Formula 1 knowledge', '/quizzes.html'],
    ['About', 'About Racelytics and its data', '/about.html'],
    ['Account', 'Your saved creations and community library', '/account.html']
];

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

router.get('/api/search', async (req, res) => {
    const search = String(req.query.q || '').trim().slice(0, 80);
    if (search.length < 2) return res.json([]);

    try {
        const q = `%${search}%`;
        const databaseResults = await withConnection(async connection => {
            const seasons = await connection.query(`
                SELECT year FROM seasons
                WHERE CAST(year AS CHAR) LIKE ?
                ORDER BY year DESC LIMIT 6
            `, [q]);
            const drivers = await connection.query(`
                SELECT id, name, nationalityCountryId FROM drivers
                WHERE name LIKE ? OR fullName LIKE ? OR abbreviation LIKE ?
                ORDER BY totalRaceWins DESC, name LIMIT 6
            `, [q, q, q]);
            const constructors = await connection.query(`
                SELECT id, name, countryId FROM constructors
                WHERE name LIKE ? OR fullName LIKE ?
                ORDER BY totalRaceWins DESC, name LIMIT 6
            `, [q, q]);
            const circuits = await connection.query(`
                SELECT id, name, placeName FROM circuits
                WHERE name LIKE ? OR fullName LIKE ? OR placeName LIKE ?
                ORDER BY totalRacesHeld DESC, name LIMIT 6
            `, [q, q, q]);
            const races = await connection.query(`
                SELECT id, year, officialName FROM races
                WHERE officialName LIKE ? OR CAST(year AS CHAR) LIKE ?
                ORDER BY year DESC, round DESC LIMIT 6
            `, [q, q]);
            const chassis = await connection.query(`
                SELECT ch.id, ch.name, ch.fullName, constructors.name AS constructorName
                FROM chassis ch
                LEFT JOIN constructors ON constructors.id = ch.constructorId
                WHERE ch.name LIKE ? OR ch.fullName LIKE ? OR constructors.name LIKE ?
                ORDER BY ch.fullName LIMIT 6
            `, [q, q, q]);
            return { seasons, drivers, constructors, circuits, races, chassis };
        });

        const lower = search.toLocaleLowerCase();
        const pages = SEARCH_PAGES.filter(([label, description]) =>
            `${label} ${description}`.toLocaleLowerCase().includes(lower)
        ).slice(0, 6).map(([label, meta, url]) => ({ type: 'Page', label, meta, url }));

        res.json([
            ...pages,
            ...databaseResults.seasons.map(row => ({ type: 'Season', label: String(row.year), meta: 'Formula 1 season', url: `/season.html?year=${row.year}` })),
            ...databaseResults.drivers.map(row => ({ type: 'Driver', label: row.name, meta: row.nationalityCountryId || 'Driver profile', url: `/driver.html?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.constructors.map(row => ({ type: 'Constructor', label: row.name, meta: row.countryId || 'Constructor profile', url: `/constructor.html?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.circuits.map(row => ({ type: 'Circuit', label: row.name, meta: row.placeName || 'Circuit profile', url: `/circuit.html?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.races.map(row => ({ type: 'Race', label: row.officialName, meta: String(row.year), url: `/race.html?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.chassis.map(row => ({ type: 'Chassis', label: row.fullName || row.name, meta: row.constructorName || 'Formula 1 chassis', url: `/chassis.html?search=${encodeURIComponent(row.fullName || row.name)}` }))
        ].slice(0, 30));
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
