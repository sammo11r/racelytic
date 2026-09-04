const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { buildSearchResponse, searchLikePattern } = require('../search-results');

const router = express.Router();

const SEARCH_PAGES = [
    ['Database', 'Browse the complete archive', '/database'],
    ['Seasons', 'Championship history', '/seasons'],
    ['Races', 'Grand Prix and session results', '/races'],
    ['Drivers', 'Driver profiles and statistics', '/drivers'],
    ['Constructors', 'Teams and constructor history', '/constructors'],
    ['Circuits', 'Tracks and venues', '/circuits'],
    ['Chassis', 'Cars, engines and manufacturers', '/chassis'],
    ['Analysis', 'Formula 1 data lab', '/analysis'],
    ['Season analysis', 'Championship trends and progression', '/season-analysis'],
    ['Season comparison', 'Compare championships across eras', '/season-comparison'],
    ['Race analysis', 'Explore a Grand Prix in detail', '/race-analysis'],
    ['Driver comparison', 'Compare careers and results', '/driver-comparison'],
    ['Driver form', 'Recent finishing and qualifying form', '/driver-form'],
    ['Teammate battles', 'Intra-team head-to-heads', '/teammate-battles'],
    ['Circuit analysis', 'Performance by venue', '/circuit-analysis'],
    ['Records', 'Explore all-time rankings', '/records'],
    ['Simulator', 'Explore Formula 1 simulation tools', '/simulator-overview'],
    ['Simulate season', 'Recalculate a Formula 1 season', '/simulator'],
    ['Points systems', 'Create and manage scoring rules', '/points-systems'],
    ['Scenario calculator', 'Project a championship run-in', '/scenario-calculator'],
    ['Championship builder', 'Create a custom championship', '/championship-builder'],
    ['Games', 'Play with Formula 1 history', '/games'],
    ['Quizzes', 'Test your Formula 1 knowledge', '/quizzes'],
    ['World champions quiz', 'Name every Formula 1 world champion', '/world-champions-quiz'],
    ['Race winners quiz', 'Name Formula 1 Grand Prix winners', '/race-winners-quiz'],
    ['Community', 'Explore public championships, scoring systems and record views', '/community'],
    ['About', 'About Racelytic and its data', '/about'],
    ['Account', 'Your saved creations and community library', '/account'],
    ['Privacy', 'Racelytic privacy information', '/privacy'],
    ['Terms', 'Racelytic terms of use', '/terms'],
    ['Search', 'Search every Racelytic series and archive', '/search']
];

const F2_SEARCH_PAGES = [
    ['Database', 'Browse the Formula 2 archive', '/f2/database'],
    ['Seasons', 'Formula 2 championship history', '/f2/seasons'],
    ['Races', 'Formula 2 weekends and sessions', '/f2/races'],
    ['Drivers', 'Formula 2 driver profiles', '/f2/drivers'],
    ['Constructors', 'Formula 2 teams and results', '/f2/constructors'],
    ['Circuits', 'Formula 2 tracks and venues', '/f2/circuits'],
    ['Chassis', 'Formula 2 chassis and engine records', '/f2/chassis'],
    ['Analysis', 'Explore Formula 2 data and trends', '/f2/analysis'],
    ['Season analysis', 'Formula 2 championship progression', '/f2/season-analysis'],
    ['Season comparison', 'Compare Formula 2 championships', '/f2/season-comparison'],
    ['Race analysis', 'Explore a Formula 2 race in detail', '/f2/race-analysis'],
    ['Driver comparison', 'Compare Formula 2 careers', '/f2/driver-comparison'],
    ['Driver form', 'Recent Formula 2 performance', '/f2/driver-form'],
    ['Teammate battles', 'Formula 2 intra-team head-to-heads', '/f2/teammate-battles'],
    ['Circuit analysis', 'Formula 2 performance by venue', '/f2/circuit-analysis'],
    ['Records', 'Formula 2 all-time rankings', '/f2/records'],
    ['Simulator', 'Formula 2 simulator overview', '/f2/simulator'],
    ['Simulate season', 'Formula 2 championship simulation', '/f2/simulate-season'],
    ['Scenario calculator', 'Project a Formula 2 championship run-in', '/f2/scenario-calculator'],
    ['Championship builder', 'Create a custom Formula 2 championship', '/f2/championship-builder'],
    ['Points systems', 'Create and manage Formula 2 scoring rules', '/f2/points-systems'],
    ['Games', 'Games built from Formula 2 history', '/f2/games'],
    ['Quizzes', 'Test your Formula 2 knowledge', '/f2/quizzes'],
    ['Champions quiz', 'Name every Formula 2 champion', '/f2/champions-quiz'],
    ['Race winners quiz', 'Name Formula 2 race winners', '/f2/race-winners-quiz'],
    ['About', 'About the Formula 2 archive', '/f2/about']
];

const F3_SEARCH_PAGES = [
    ['Formula 3', 'Explore the FIA Formula 3 archive', '/f3'],
    ['Database', 'Browse the Formula 3 dataset', '/f3/database'],
    ['Seasons', 'Formula 3 championship history', '/f3/seasons'],
    ['Races', 'Formula 3 weekends and sessions', '/f3/races'],
    ['Drivers', 'Formula 3 driver profiles', '/f3/drivers'],
    ['Teams', 'Formula 3 teams and results', '/f3/teams'],
    ['Circuits', 'Formula 3 tracks and venues', '/f3/circuits'],
    ['Chassis', 'Formula 3 chassis and engine records', '/f3/chassis'],
    ['Analysis', 'Explore Formula 3 data and trends', '/f3/analysis'],
    ['Season analysis', 'Formula 3 championship progression', '/f3/season-analysis'],
    ['Season comparison', 'Compare Formula 3 championships', '/f3/season-comparison'],
    ['Race analysis', 'Explore a Formula 3 race in detail', '/f3/race-analysis'],
    ['Driver comparison', 'Compare Formula 3 careers', '/f3/driver-comparison'],
    ['Driver form', 'Recent Formula 3 performance', '/f3/driver-form'],
    ['Teammate battles', 'Formula 3 intra-team head-to-heads', '/f3/teammate-battles'],
    ['Circuit analysis', 'Formula 3 performance by venue', '/f3/circuit-analysis'],
    ['Records', 'Formula 3 all-time rankings', '/f3/records'],
    ['Simulator', 'Formula 3 simulator overview', '/f3/simulator'],
    ['Simulate season', 'Formula 3 championship simulation', '/f3/simulate-season'],
    ['Scenario calculator', 'Project a Formula 3 championship run-in', '/f3/scenario-calculator'],
    ['Championship builder', 'Create a custom Formula 3 championship', '/f3/championship-builder'],
    ['Points systems', 'Create and manage Formula 3 scoring rules', '/f3/points-systems'],
    ['Games', 'Games built from Formula 3 history', '/f3/games'],
    ['About', 'About the Formula 3 archive', '/f3/about']
];
const ACADEMY_SEARCH_PAGES = F3_SEARCH_PAGES.map(([label, description, url]) => [
    label === 'Formula 3' ? 'F1 Academy' : label,
    description.replace(/Formula 3|FIA Formula 3/g, 'F1 Academy'),
    url.replace('/f3', '/academy')
]);

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
            application: 'Racelytic',
            database: 'connected'
        });

    } catch (error) {

        sendError(res, error);
    }
});

const SERIES_PARENTS = {
    driver: { f1: '/drivers', f2: '/f2/drivers', f3: '/f3/drivers', academy: '/academy/drivers' },
    constructor: { f1: '/constructors', f2: '/f2/constructors', f3: '/f3/teams', academy: '/academy/teams' },
    circuit: { f1: '/circuits', f2: '/f2/circuits', f3: '/f3/circuits', academy: '/academy/circuits' },
    race: { f1: '/races', f2: '/f2/races', f3: '/f3/races', academy: '/academy/races' },
    season: { f1: '/seasons', f2: '/f2/seasons', f3: '/f3/seasons', academy: '/academy/seasons' }
};

router.get('/api/series-equivalent', async (req, res) => {
    const target = String(req.query.target || '').toLowerCase();
    const type = String(req.query.type || '').toLowerCase();
    const id = String(req.query.id || '').trim().slice(0, 120);
    const validSeries = ['f1', 'f2', 'f3', 'academy'];
    const validTarget = validSeries.includes(target);
    if (!validTarget || !SERIES_PARENTS[type] || !id) {
        return res.status(400).json({ error: 'Invalid series equivalent request.' });
    }

    try {
        const equivalentId = await withConnection(async connection => {
            let rows;
            if (type === 'season') {
                const table = target === 'academy' ? 'fa_seasons' : target === 'f3' ? 'f3_seasons' : target === 'f2' ? 'f2_seasons' : 'seasons';
                rows = await connection.query(`SELECT year AS id FROM \`${table}\` WHERE year = ? LIMIT 1`, [id]);
            } else if (type === 'driver') {
                const source = validSeries.includes(String(req.query.source || '').toLowerCase())
                    ? String(req.query.source).toLowerCase()
                    : target === 'f2' ? 'f1' : 'f2';
                const driverTables = { f1: 'drivers', f2: 'f2_drivers', f3: 'f3_drivers', academy: 'fa_drivers' };
                const sourceTable = driverTables[source];
                const targetTable = driverTables[target];
                rows = await connection.query(`
                    SELECT targetDriver.id
                    FROM \`${sourceTable}\` sourceDriver
                    JOIN \`${targetTable}\` targetDriver ON LOWER(targetDriver.name) = LOWER(sourceDriver.name)
                    WHERE sourceDriver.id = ?
                    LIMIT 1
                `, [id]);
            } else if (type === 'constructor') {
                const source = validSeries.includes(String(req.query.source || '').toLowerCase())
                    ? String(req.query.source).toLowerCase()
                    : target === 'f2' ? 'f1' : 'f2';
                const constructorTables = { f1: 'constructors', f2: 'f2_constructors', f3: 'f3_constructors', academy: 'fa_constructors' };
                const sourceTable = constructorTables[source];
                const targetTable = constructorTables[target];
                const sourceNames = source === 'f1'
                    ? 'LOWER(targetConstructor.name) IN (LOWER(sourceConstructor.name), LOWER(sourceConstructor.fullName))'
                    : target === 'f1'
                        ? 'LOWER(sourceConstructor.name) IN (LOWER(targetConstructor.name), LOWER(targetConstructor.fullName))'
                        : 'LOWER(sourceConstructor.name) = LOWER(targetConstructor.name)';
                rows = await connection.query(`
                    SELECT targetConstructor.id
                    FROM \`${sourceTable}\` sourceConstructor
                    JOIN \`${targetTable}\` targetConstructor ON ${sourceNames}
                    WHERE sourceConstructor.id = ?
                    LIMIT 1
                `, [id]);
            } else if (type === 'circuit') {
                const source = validSeries.includes(String(req.query.source || '').toLowerCase())
                    ? String(req.query.source).toLowerCase()
                    : target === 'f2' ? 'f1' : 'f2';
                const circuitTables = { f1: 'circuits', f2: 'f2_circuits', f3: 'f3_circuits', academy: 'fa_circuits' };
                const sourceTable = circuitTables[source];
                const targetTable = circuitTables[target];
                const circuitNames = source === 'f1'
                    ? 'LOWER(targetCircuit.name) IN (LOWER(sourceCircuit.name), LOWER(sourceCircuit.fullName))'
                    : target === 'f1'
                        ? 'LOWER(sourceCircuit.name) IN (LOWER(targetCircuit.name), LOWER(targetCircuit.fullName))'
                        : 'LOWER(sourceCircuit.name) = LOWER(targetCircuit.name)';
                rows = await connection.query(`
                    SELECT targetCircuit.id
                    FROM \`${sourceTable}\` sourceCircuit
                    JOIN \`${targetTable}\` targetCircuit ON ${circuitNames}
                    WHERE sourceCircuit.id = ?
                    LIMIT 1
                `, [id]);
            } else {
                const source = validSeries.includes(String(req.query.source || '').toLowerCase())
                    ? String(req.query.source).toLowerCase()
                    : target === 'f1' ? 'f2' : 'f1';
                const raceTables = { f1: 'races', f2: 'f2_races', f3: 'f3_races', academy: 'fa_races' };
                const circuitTables = { f1: 'circuits', f2: 'f2_circuits', f3: 'f3_circuits', academy: 'fa_circuits' };
                const sourceRaceTable = raceTables[source];
                const targetRaceTable = raceTables[target];
                const sourceCircuitTable = circuitTables[source];
                const targetCircuitTable = circuitTables[target];
                const circuitNames = source === 'f1'
                    ? 'LOWER(targetCircuit.name) IN (LOWER(sourceCircuit.name), LOWER(sourceCircuit.fullName))'
                    : target === 'f1'
                        ? 'LOWER(sourceCircuit.name) IN (LOWER(targetCircuit.name), LOWER(targetCircuit.fullName))'
                        : 'LOWER(sourceCircuit.name) = LOWER(targetCircuit.name)';
                rows = await connection.query(`
                    SELECT targetRace.id
                    FROM \`${sourceRaceTable}\` sourceRace
                    JOIN \`${sourceCircuitTable}\` sourceCircuit ON sourceCircuit.id = sourceRace.circuitId
                    JOIN \`${targetCircuitTable}\` targetCircuit ON ${circuitNames}
                    JOIN \`${targetRaceTable}\` targetRace
                        ON targetRace.circuitId = targetCircuit.id AND targetRace.year = sourceRace.year
                    WHERE sourceRace.id = ?
                    ORDER BY ABS(DATEDIFF(targetRace.date, sourceRace.date)), targetRace.round
                    LIMIT 1
                `, [id]);
            }
            return rows[0]?.id ?? null;
        });

        const parent = SERIES_PARENTS[type][target];
        if (equivalentId === null) return res.json({ matched: false, url: parent });
        const prefix = target === 'academy' ? '/academy' : target === 'f3' ? '/f3' : target === 'f2' ? '/f2' : '';
        const parameter = type === 'season' ? 'year' : 'id';
        const targetPath = ['f3', 'academy'].includes(target) && type === 'constructor' ? 'team' : type;
        res.json({ matched: true, url: `${prefix}/${targetPath}?${parameter}=${encodeURIComponent(equivalentId)}` });
    } catch (error) {
        sendError(res, error);
    }
});

router.get('/api/search', async (req, res) => {
    const search = String(req.query.q || '').trim().slice(0, 80);
    const searchOptions = {
        query: search,
        preferredSeries: String(req.query.context || '').toLowerCase(),
        seriesFilter: String(req.query.series || '').toLowerCase(),
        mode: req.query.mode
    };
    if (search.length < 2) return res.json(buildSearchResponse([], searchOptions));

    try {
        const q = searchLikePattern(search);
        const fuzzySearch = search.length >= 4 && !/\s/.test(search) ? search : null;
        const fuzzyPrefix = fuzzySearch
            ? `${fuzzySearch.slice(0, 3).replace(/[!%_]/g, character => `!${character}`)}%`
            : null;
        const resultLimit = count => searchOptions.mode === 'full' ? '' : ` LIMIT ${count}`;
        const databaseResults = await withConnection(async connection => {
            const [seasons, drivers, constructors, circuits, races, chassis,
                f2Seasons, f2Drivers, f2Constructors, f2Circuits, f2Races, f2Chassis,
                f3Seasons, f3Drivers, f3Constructors, f3Circuits, f3Races, f3Chassis] = await Promise.all([
              connection.query(`
                SELECT year FROM seasons
                WHERE CAST(year AS CHAR) LIKE ? ESCAPE '!'
                ORDER BY year DESC${resultLimit(6)}
              `, [q]),
              connection.query(`
                SELECT id, name, fullName, abbreviation, nationalityCountryId, totalRaceWins FROM drivers
                WHERE name LIKE ? ESCAPE '!' OR fullName LIKE ? ESCAPE '!' OR abbreviation LIKE ? ESCAPE '!'
                    OR LOWER(SUBSTRING_INDEX(name, ' ', -1)) LIKE LOWER(?) ESCAPE '!'
                ORDER BY totalRaceWins DESC, name${resultLimit(6)}
              `, [q, q, q, fuzzyPrefix]),
              connection.query(`
                SELECT id, name, fullName, countryId, totalRaceWins FROM constructors
                WHERE name LIKE ? ESCAPE '!' OR fullName LIKE ? ESCAPE '!'
                ORDER BY totalRaceWins DESC, name${resultLimit(6)}
              `, [q, q]),
              connection.query(`
                SELECT id, name AS shortName, fullName, COALESCE(NULLIF(fullName, ''), name) AS name,
                    placeName, totalRacesHeld FROM circuits
                WHERE name LIKE ? ESCAPE '!' OR fullName LIKE ? ESCAPE '!' OR placeName LIKE ? ESCAPE '!'
                ORDER BY totalRacesHeld DESC, name${resultLimit(6)}
              `, [q, q, q]),
              connection.query(`
                SELECT races.id, races.year, races.officialName,
                    COALESCE(NULLIF(gp.fullName, ''), races.officialName) AS name,
                    gp.shortName,
                    COALESCE(NULLIF(circuits.fullName, ''), circuits.name) AS circuitName,
                    circuits.placeName
                FROM races
                LEFT JOIN grands_prix gp ON gp.id = races.grandPrixId
                LEFT JOIN circuits ON circuits.id = races.circuitId
                WHERE races.officialName LIKE ? ESCAPE '!' OR gp.fullName LIKE ? ESCAPE '!' OR gp.shortName LIKE ? ESCAPE '!'
                    OR CAST(races.year AS CHAR) LIKE ? ESCAPE '!'
                    OR circuits.name LIKE ? ESCAPE '!' OR circuits.fullName LIKE ? ESCAPE '!' OR circuits.placeName LIKE ? ESCAPE '!'
                ORDER BY races.year DESC, races.round DESC${resultLimit(24)}
              `, [q, q, q, q, q, q, q]),
              connection.query(`
                SELECT ch.id, ch.name, ch.fullName, constructors.name AS constructorName
                FROM chassis ch
                LEFT JOIN constructors ON constructors.id = ch.constructorId
                WHERE ch.name LIKE ? ESCAPE '!' OR ch.fullName LIKE ? ESCAPE '!' OR constructors.name LIKE ? ESCAPE '!'
                ORDER BY ch.fullName${resultLimit(6)}
              `, [q, q, q]),
              connection.query(`SELECT year FROM f2_seasons WHERE CAST(year AS CHAR) LIKE ? ESCAPE '!' ORDER BY year DESC${resultLimit(6)}`, [q]),
              connection.query(`SELECT id, name, abbreviation, countryCode FROM f2_drivers WHERE name LIKE ? ESCAPE '!' OR abbreviation LIKE ? ESCAPE '!' OR LOWER(SUBSTRING_INDEX(name, ' ', -1)) LIKE LOWER(?) ESCAPE '!' ORDER BY name${resultLimit(6)}`, [q, q, fuzzyPrefix]),
              connection.query(`SELECT id, name, abbreviation, countryCode FROM f2_constructors WHERE name LIKE ? ESCAPE '!' OR abbreviation LIKE ? ESCAPE '!' ORDER BY name${resultLimit(6)}`, [q, q]),
              connection.query(`SELECT id, name, placeName FROM f2_circuits WHERE name LIKE ? ESCAPE '!' OR placeName LIKE ? ESCAPE '!' ORDER BY name${resultLimit(6)}`, [q, q]),
              connection.query(`SELECT races.id, races.year, races.name, circuits.name AS circuitName, circuits.placeName
                FROM f2_races races LEFT JOIN f2_circuits circuits ON circuits.id = races.circuitId
                WHERE races.name LIKE ? ESCAPE '!' OR CAST(races.year AS CHAR) LIKE ? ESCAPE '!' OR circuits.name LIKE ? ESCAPE '!' OR circuits.placeName LIKE ? ESCAPE '!'
                ORDER BY races.year DESC, races.round DESC${resultLimit(24)}`, [q, q, q, q]),
              connection.query(`SELECT id, name FROM f2_chassis WHERE name LIKE ? ESCAPE '!' ORDER BY name${resultLimit(6)}`, [q]),
              connection.query(`SELECT year FROM f3_seasons WHERE CAST(year AS CHAR) LIKE ? ESCAPE '!' ORDER BY year DESC${resultLimit(6)}`, [q]),
              connection.query(`SELECT id, name, abbreviation, countryCode FROM f3_drivers WHERE name LIKE ? ESCAPE '!' OR abbreviation LIKE ? ESCAPE '!' OR LOWER(SUBSTRING_INDEX(name, ' ', -1)) LIKE LOWER(?) ESCAPE '!' ORDER BY name${resultLimit(6)}`, [q, q, fuzzyPrefix]),
              connection.query(`SELECT id, name, abbreviation, countryCode FROM f3_constructors WHERE name LIKE ? ESCAPE '!' OR abbreviation LIKE ? ESCAPE '!' ORDER BY name${resultLimit(6)}`, [q, q]),
              connection.query(`SELECT id, name, placeName FROM f3_circuits WHERE name LIKE ? ESCAPE '!' OR placeName LIKE ? ESCAPE '!' ORDER BY name${resultLimit(6)}`, [q, q]),
              connection.query(`SELECT races.id, races.year, races.name, circuits.name AS circuitName, circuits.placeName
                FROM f3_races races LEFT JOIN f3_circuits circuits ON circuits.id = races.circuitId
                WHERE races.name LIKE ? ESCAPE '!' OR CAST(races.year AS CHAR) LIKE ? ESCAPE '!' OR circuits.name LIKE ? ESCAPE '!' OR circuits.placeName LIKE ? ESCAPE '!'
                ORDER BY races.year DESC, races.round DESC${resultLimit(24)}`, [q, q, q, q]),
              connection.query(`SELECT id, name FROM f3_chassis WHERE id NOT IN ('dallara-f3-2020', 'dallara-f3-2021') AND name LIKE ? ESCAPE '!' ORDER BY name${resultLimit(6)}`, [q])
            ]);
            const [academySeasons, academyDrivers, academyConstructors, academyCircuits, academyRaces, academyChassis] = await Promise.all([
                connection.query(`SELECT year FROM fa_seasons WHERE CAST(year AS CHAR) LIKE ? ESCAPE '!' ORDER BY year DESC${resultLimit(6)}`, [q]),
                connection.query(`SELECT id, name, abbreviation, countryCode FROM fa_drivers WHERE name LIKE ? ESCAPE '!' OR abbreviation LIKE ? ESCAPE '!' OR LOWER(SUBSTRING_INDEX(name, ' ', -1)) LIKE LOWER(?) ESCAPE '!' ORDER BY name${resultLimit(6)}`, [q, q, fuzzyPrefix]),
                connection.query(`SELECT id, name, abbreviation, countryCode FROM fa_constructors WHERE name LIKE ? ESCAPE '!' OR abbreviation LIKE ? ESCAPE '!' ORDER BY name${resultLimit(6)}`, [q, q]),
                connection.query(`SELECT id, name, placeName FROM fa_circuits WHERE name LIKE ? ESCAPE '!' OR placeName LIKE ? ESCAPE '!' ORDER BY name${resultLimit(6)}`, [q, q]),
                connection.query(`SELECT races.id, races.year, races.name, circuits.name AS circuitName, circuits.placeName
                    FROM fa_races races LEFT JOIN fa_circuits circuits ON circuits.id = races.circuitId
                    WHERE races.name LIKE ? ESCAPE '!' OR CAST(races.year AS CHAR) LIKE ? ESCAPE '!' OR circuits.name LIKE ? ESCAPE '!' OR circuits.placeName LIKE ? ESCAPE '!'
                    ORDER BY races.year DESC, races.round DESC${resultLimit(24)}`, [q, q, q, q]),
                connection.query(`SELECT id, name FROM fa_chassis WHERE name LIKE ? ESCAPE '!' ORDER BY name${resultLimit(6)}`, [q])
            ]);
            return {
                seasons, drivers, constructors, circuits, races, chassis,
                f2Seasons, f2Drivers, f2Constructors, f2Circuits, f2Races, f2Chassis,
                f3Seasons, f3Drivers, f3Constructors, f3Circuits, f3Races, f3Chassis,
                academySeasons, academyDrivers, academyConstructors, academyCircuits, academyRaces, academyChassis
            };
        });

        const lower = search.toLocaleLowerCase();
        const matchingPages = (pages, series) => pages.filter(([label, description]) =>
            `${label} ${description}`.toLocaleLowerCase().includes(lower)
        ).slice(0, 4).map(([label, meta, url]) => ({ type: `${series} Page`, label, meta, url }));
        const pages = [
            ...matchingPages(SEARCH_PAGES, 'F1'),
            ...matchingPages(F2_SEARCH_PAGES, 'F2'),
            ...matchingPages(F3_SEARCH_PAGES, 'F3'),
            ...matchingPages(ACADEMY_SEARCH_PAGES, 'F1 Academy')
        ];

        const rawResults = [
            ...pages,
            ...databaseResults.seasons.map(row => ({ type: 'F1 Season', label: String(row.year), meta: 'Formula 1 season', url: `/season?year=${row.year}` })),
            ...databaseResults.f2Seasons.map(row => ({ type: 'F2 Season', label: String(row.year), meta: 'Formula 2 season', url: `/f2/season?year=${row.year}` })),
            ...databaseResults.f3Seasons.map(row => ({ type: 'F3 Season', label: String(row.year), meta: 'Formula 3 season', url: `/f3/season?year=${row.year}` })),
            ...databaseResults.academySeasons.map(row => ({ type: 'F1 Academy Season', label: String(row.year), meta: 'F1 Academy season', url: `/academy/season?year=${row.year}` })),
            ...databaseResults.drivers.map(row => ({ type: 'F1 Driver', label: row.name, meta: row.nationalityCountryId || 'Formula 1 driver', aliases: [row.fullName, row.abbreviation], prominence: row.totalRaceWins, url: `/driver?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.f2Drivers.map(row => ({ type: 'F2 Driver', label: row.name, meta: row.countryCode || 'Formula 2 driver', aliases: [row.abbreviation], url: `/f2/driver?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.f3Drivers.map(row => ({ type: 'F3 Driver', label: row.name, meta: row.countryCode || 'Formula 3 driver', aliases: [row.abbreviation], url: `/f3/driver?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.academyDrivers.map(row => ({ type: 'F1 Academy Driver', label: row.name, meta: row.countryCode || 'F1 Academy driver', aliases: [row.abbreviation], url: `/academy/driver?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.constructors.map(row => ({ type: 'F1 Constructor', label: row.name, meta: row.countryId || 'Formula 1 constructor', aliases: [row.fullName], prominence: row.totalRaceWins, url: `/constructor?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.f2Constructors.map(row => ({ type: 'F2 Constructor', label: row.name, meta: row.countryCode || 'Formula 2 constructor', aliases: [row.abbreviation], url: `/f2/constructor?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.f3Constructors.map(row => ({ type: 'F3 Team', label: row.name, meta: row.countryCode || 'Formula 3 team', aliases: [row.abbreviation], url: `/f3/team?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.academyConstructors.map(row => ({ type: 'F1 Academy Team', label: row.name, meta: row.countryCode || 'F1 Academy team', aliases: [row.abbreviation], url: `/academy/team?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.circuits.map(row => ({ type: 'F1 Circuit', label: row.name, meta: row.placeName || 'Formula 1 circuit', aliases: [row.shortName, row.fullName], prominence: row.totalRacesHeld, place: row.placeName, url: `/circuit?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.f2Circuits.map(row => ({ type: 'F2 Circuit', label: row.name, meta: row.placeName || 'Formula 2 circuit', place: row.placeName, url: `/f2/circuit?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.f3Circuits.map(row => ({ type: 'F3 Circuit', label: row.name, meta: row.placeName || 'Formula 3 circuit', place: row.placeName, url: `/f3/circuit?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.academyCircuits.map(row => ({ type: 'F1 Academy Circuit', label: row.name, meta: row.placeName || 'F1 Academy circuit', place: row.placeName, url: `/academy/circuit?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.races.map(row => ({ type: 'F1 Race', label: row.name, aliases: [row.shortName, row.officialName], meta: `${row.year}${row.placeName ? ` · ${row.placeName}` : ''}`, year: Number(row.year), searchText: `${row.name} ${row.shortName || ''} ${row.officialName} ${row.circuitName || ''} ${row.placeName || ''} ${row.year}`, url: `/race?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.f2Races.map(row => ({ type: 'F2 Race', label: row.name, meta: `${row.year}${row.placeName ? ` · ${row.placeName}` : ''}`, year: Number(row.year), searchText: `${row.name} ${row.circuitName || ''} ${row.placeName || ''} ${row.year}`, url: `/f2/race?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.f3Races.map(row => ({ type: 'F3 Race', label: row.name, meta: `${row.year}${row.placeName ? ` · ${row.placeName}` : ''}`, year: Number(row.year), searchText: `${row.name} ${row.circuitName || ''} ${row.placeName || ''} ${row.year}`, url: `/f3/race?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.academyRaces.map(row => ({ type: 'F1 Academy Race', label: row.name, meta: `${row.year}${row.placeName ? ` · ${row.placeName}` : ''}`, year: Number(row.year), searchText: `${row.name} ${row.circuitName || ''} ${row.placeName || ''} ${row.year}`, url: `/academy/race?id=${encodeURIComponent(row.id)}` })),
            ...databaseResults.chassis.map(row => ({ type: 'F1 Chassis', label: row.fullName || row.name, meta: row.constructorName || 'Formula 1 chassis', url: `/chassis?search=${encodeURIComponent(row.fullName || row.name)}` })),
            ...databaseResults.f2Chassis.map(row => ({ type: 'F2 Chassis', label: row.name, meta: 'Formula 2 chassis', url: '/f2/chassis' })),
            ...databaseResults.f3Chassis.map(row => ({ type: 'F3 Chassis', label: row.name, meta: 'Formula 3 chassis', url: '/f3/chassis' })),
            ...databaseResults.academyChassis.map(row => ({ type: 'F1 Academy Chassis', label: row.name, meta: 'F1 Academy chassis', url: '/academy/chassis' }))
        ];
        const tagResult = result => {
            const type = result.type;
            const series = type.startsWith('F1 Academy') ? 'academy'
                : type.startsWith('F3') ? 'f3'
                    : type.startsWith('F2') ? 'f2' : 'f1';
            const category = / Circuit$/.test(type) ? 'circuit'
                : / Race$/.test(type) ? 'race'
                    : / Driver$/.test(type) ? 'driver'
                        : / Constructor$| Team$/.test(type) ? 'team'
                            : / Season$/.test(type) ? 'season'
                                : / Chassis$/.test(type) ? 'chassis' : 'page';
            return { ...result, series, category };
        };
        res.json(buildSearchResponse(rawResults.map(tagResult), searchOptions));
    } catch (error) {
        sendError(res, error);
    }
});


// ============================================================
// Dashboard
// ============================================================

router.get('/api/dashboard', async (req, res) => {

    try {

        const series = String(req.query.series || '').toLowerCase();
        const tables = {
            f1: { drivers: 'drivers', constructors: 'constructors', circuits: 'circuits', seasons: 'seasons', races: 'races', chassis: 'chassis', standings: 'seasons_driver_standings', eventName: "COALESCE(NULLIF(grandPrix.fullName, ''), race.officialName)", eventFields: ', grandPrix.shortName, race.officialName', eventJoin: 'LEFT JOIN grands_prix grandPrix ON grandPrix.id = race.grandPrixId' },
            f2: { drivers: 'f2_drivers', constructors: 'f2_constructors', circuits: 'f2_circuits', seasons: 'f2_seasons', races: 'f2_races', chassis: 'f2_chassis', standings: 'f2_season_driver_standings', eventName: 'race.name', eventFields: '', eventJoin: '' },
            f3: { drivers: 'f3_drivers', constructors: 'f3_constructors', circuits: 'f3_circuits', seasons: 'f3_seasons', races: 'f3_races', chassis: 'f3_chassis', standings: 'f3_season_driver_standings', eventName: 'race.name', eventFields: '', eventJoin: '' },
            academy: { drivers: 'fa_drivers', constructors: 'fa_constructors', circuits: 'fa_circuits', seasons: 'fa_seasons', races: 'fa_races', chassis: 'fa_chassis', standings: 'fa_season_driver_standings', eventName: 'race.name', eventFields: '', eventJoin: '' }
        }[['f2', 'f3', 'academy'].includes(series) ? series : 'f1'];

        const data = await withConnection(async connection => {

            const latest = await connection.query(`
                SELECT MAX(year) AS year
                FROM \`${tables.seasons}\`
            `);
            const latestSeason = Number(latest[0].year);

            const [drivers, constructors, circuits, seasons, rounds, leader, latestEvent, nextEvent, archive] = await Promise.all([

                connection.query(`
                    SELECT COUNT(*) AS count
                    FROM \`${tables.drivers}\`
                `),

                connection.query(`
                    SELECT COUNT(*) AS count
                    FROM \`${tables.constructors}\`
                `),

                connection.query(`
                    SELECT COUNT(*) AS count
                    FROM \`${tables.circuits}\`
                `),

                connection.query(`
                    SELECT COUNT(*) AS count
                    FROM \`${tables.seasons}\`
                `),

                connection.query(`SELECT COUNT(*) AS count FROM \`${tables.races}\` WHERE year = ?`, [latestSeason]),

                connection.query(`
                    SELECT drivers.name, standings.points, standings.championshipWon
                    FROM \`${tables.standings}\` standings
                    JOIN \`${tables.drivers}\` drivers ON drivers.id = standings.driverId
                    WHERE standings.year = ?
                    ORDER BY standings.positionNumber IS NULL, standings.positionNumber
                    LIMIT 1
                `, [latestSeason]),

                connection.query(`
                    SELECT race.id, race.round, race.date, ${tables.eventName} AS name${tables.eventFields}
                    FROM \`${tables.races}\` race
                    ${tables.eventJoin}
                    WHERE race.year = ? AND race.date <= CURRENT_DATE()
                    ORDER BY race.date DESC, race.round DESC
                    LIMIT 1
                `, [latestSeason]),

                connection.query(`
                    SELECT race.id, race.round, race.date, ${tables.eventName} AS name${tables.eventFields}
                    FROM \`${tables.races}\` race
                    ${tables.eventJoin}
                    WHERE race.year = ? AND race.date > CURRENT_DATE()
                    ORDER BY race.date, race.round
                    LIMIT 1
                `, [latestSeason]),

                // Keep archive totals aligned with the race and chassis directories.
                req.query.archive === '1'
                    ? connection.query(`SELECT (SELECT COUNT(*) FROM \`${tables.races}\`) AS races,
                        (SELECT COUNT(*) FROM \`${tables.chassis}\`${series === 'f3' ? " WHERE id NOT IN ('dallara-f3-2020', 'dallara-f3-2021')" : ''}) AS chassis`)
                    : Promise.resolve([])

            ]);


            return {
                drivers: Number(drivers[0].count),
                constructors: Number(constructors[0].count),
                circuits: Number(circuits[0].count),
                seasons: Number(seasons[0].count),
                ...(archive[0] ? { races: Number(archive[0].races), chassis: Number(archive[0].chassis) } : {}),
                latestSeason,
                currentSeason: {
                    rounds: Number(rounds[0].count),
                    leader: leader[0] ? {
                        name: leader[0].name,
                        points: Number(leader[0].points || 0),
                        championshipWon: ['1', 'true'].includes(String(leader[0].championshipWon).toLowerCase())
                    } : null,
                    latestEvent: latestEvent[0] || null,
                    nextEvent: nextEvent[0] || null
                }
            };
        });


        res.json(data);

    } catch (error) {

        sendError(res, error);
    }
});

module.exports = router;
