const express = require('express');
const { pool, sendError } = require('../route-helpers');
const { isJuniorSeries, normaliseSeries, seriesPrefix } = require('../series-config');
const { normalizedName, nameMatchesGuess, matchingChampionAnswers, constructorMatchesGuess } = require('../quiz-name-matcher');

const router = express.Router();
const QUIZ_SUMMARY_TTL_MS = 5 * 60 * 1000;
const quizSummaryCache = new Map();

async function getRaceWinners() {
    return pool.query(`
        SELECT drivers.name AS driverName, countries.name AS countryName, COUNT(*) AS wins,
            MIN(results.year) AS firstWinYear, MAX(results.year) AS lastWinYear
        FROM races_race_results results
        JOIN drivers ON drivers.id = results.driverId
        LEFT JOIN countries ON countries.id = drivers.nationalityCountryId
        WHERE results.positionNumber = 1
        GROUP BY results.driverId, drivers.name, countries.name
        ORDER BY wins DESC, drivers.name
    `);
}

async function getJuniorRaceWinners(series) {
    const prefix = seriesPrefix(series);
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
        FROM ${prefix}session_results results
        JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
        JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
        WHERE results.positionNumber = 1
            AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
            AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
        GROUP BY results.driverId, drivers.name, drivers.countryCode
        ORDER BY wins DESC, featureWins DESC, drivers.name
    `);
}

async function getWecRaceWinners() {
    return pool.query(`
        SELECT drivers.name AS driverName, countries.name AS countryName,
            COUNT(DISTINCT results.eventId) AS wins,
            MIN(events.year) AS firstWinYear, MAX(events.year) AS lastWinYear
        FROM wec_session_results results
        JOIN wec_sessions sessions ON sessions.id = results.sessionId AND sessions.eventId = results.eventId
        JOIN wec_events events ON events.id = results.eventId
        JOIN wec_entry_drivers crew ON crew.entryId = results.entryId AND crew.eventId = results.eventId
        JOIN wec_drivers drivers ON drivers.id = crew.driverId
        LEFT JOIN countries ON countries.id = drivers.nationalityCountryId
        WHERE sessions.type = 'race' AND results.overallPosition = 1 AND results.status = 'classified'
        GROUP BY drivers.id, drivers.name, countries.name
        ORDER BY wins DESC, drivers.name
    `);
}

async function getWecSeasonWinningCrews(year) {
    const rows = await pool.query(`
        SELECT events.id AS raceId, events.round, events.name AS raceName,
            teams.name AS teamName, manufacturers.name AS manufacturerName,
            GROUP_CONCAT(drivers.name ORDER BY crew.crewOrder SEPARATOR '|||') AS driverNames
        FROM wec_session_results results
        JOIN wec_sessions sessions ON sessions.id = results.sessionId AND sessions.eventId = results.eventId
        JOIN wec_events events ON events.id = results.eventId
        JOIN wec_entries entries ON entries.id = results.entryId AND entries.eventId = results.eventId
        LEFT JOIN wec_teams teams ON teams.id = entries.teamId
        LEFT JOIN wec_manufacturers manufacturers ON manufacturers.id = entries.manufacturerId
        JOIN wec_entry_drivers crew ON crew.entryId = entries.id AND crew.eventId = entries.eventId
        JOIN wec_drivers drivers ON drivers.id = crew.driverId
        WHERE sessions.type = 'race' AND results.overallPosition = 1
            AND results.status = 'classified' AND events.year = ?
        GROUP BY events.id, events.round, events.name, teams.name, manufacturers.name
        ORDER BY events.round
    `, [year]);
    return rows.map(row => {
        const driverNames = String(row.driverNames || '').split('|||').filter(Boolean);
        return { ...row, driverNames, displayName: driverNames.join(' / ') };
    });
}

const raceWinnersFor = series => series === 'wec' ? getWecRaceWinners()
    : isJuniorSeries(series) ? getJuniorRaceWinners(series) : getRaceWinners();

async function getChampionAnswers(series) {
    if (isJuniorSeries(series)) {
        const prefix = seriesPrefix(series);
        return pool.query(`
            SELECT standings.year, drivers.name AS driverName
            FROM ${prefix}season_driver_standings standings
            JOIN ${prefix}drivers drivers ON drivers.id = standings.driverId
            WHERE standings.positionNumber = 1
                AND (
                    LOWER(CAST(standings.championshipWon AS CHAR)) IN ('1', 'true')
                    OR standings.year < YEAR(CURRENT_DATE())
                )
            ORDER BY standings.year DESC
        `);
    }
    return pool.query(`
        SELECT standings.year, drivers.name AS driverName
        FROM seasons_driver_standings standings
        JOIN drivers ON drivers.id = standings.driverId
        WHERE standings.championshipWon = 1
        ORDER BY standings.year DESC
    `);
}

async function getConstructorChampionAnswers(series) {
    if (isJuniorSeries(series)) {
        const prefix = seriesPrefix(series);
        return pool.query(`
            SELECT standings.year, constructors.name AS constructorName
            FROM ${prefix}season_constructor_standings standings
            JOIN ${prefix}constructors constructors ON constructors.id = standings.constructorId
            WHERE standings.positionNumber = 1
                AND (
                    LOWER(CAST(standings.championshipWon AS CHAR)) IN ('1', 'true')
                    OR standings.year < YEAR(CURRENT_DATE())
                )
            ORDER BY standings.year DESC
        `);
    }
    return pool.query(`
        SELECT standings.year, constructors.name AS constructorName
        FROM seasons_constructor_standings standings
        JOIN constructors ON constructors.id = standings.constructorId
        WHERE standings.championshipWon = 1
        ORDER BY standings.year DESC
    `);
}

async function getSeasonRaceWinnerAnswers(year, series) {
    if (isJuniorSeries(series)) {
        const prefix = seriesPrefix(series);
        return pool.query(`
            SELECT results.sessionId AS raceId, drivers.name AS driverName
            FROM ${prefix}session_results results
            JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
            JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
            WHERE results.positionNumber = 1
                AND sessions.year = ?
                AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
            ORDER BY sessions.round, sessions.sessionNumber
        `, [year]);
    }
    return pool.query(`
        SELECT results.raceId, drivers.name AS driverName
        FROM races_race_results results
        JOIN drivers ON drivers.id = results.driverId
        WHERE results.positionNumber = 1 AND results.year = ?
        ORDER BY results.round
    `, [year]);
}

async function getLatestSeasonRaceIds(series) {
    if (series === 'wec') {
        const rows = await pool.query(`
            SELECT DISTINCT events.year, events.id AS raceId, events.round
            FROM wec_events events
            JOIN wec_session_results results ON results.eventId = events.id
                AND results.overallPosition = 1 AND results.status = 'classified'
            JOIN wec_sessions sessions ON sessions.id = results.sessionId
                AND sessions.eventId = results.eventId AND sessions.type = 'race'
            ORDER BY events.year DESC, events.round
        `);
        const year = Number(rows[0]?.year);
        return { year, answerIds: rows.filter(row => Number(row.year) === year).map(row => String(row.raceId)) };
    }
    if (isJuniorSeries(series)) {
        const prefix = seriesPrefix(series);
        const rows = await pool.query(`
            SELECT sessions.year, sessions.id AS raceId
            FROM ${prefix}sessions sessions
            JOIN ${prefix}session_results results
                ON results.sessionId = sessions.id AND results.positionNumber = 1
            WHERE LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
            ORDER BY sessions.year DESC, sessions.round, sessions.sessionNumber
        `);
        const year = Number(rows[0]?.year);
        return {
            year,
            answerIds: rows.filter(row => Number(row.year) === year).map(row => String(row.raceId))
        };
    }

    const rows = await pool.query(`
        SELECT races.year, races.id AS raceId
        FROM races
        JOIN races_race_results results
            ON results.raceId = races.id AND results.positionNumber = 1
        ORDER BY races.year DESC, races.round
    `);
    const year = Number(rows[0]?.year);
    return {
        year,
        answerIds: rows.filter(row => Number(row.year) === year).map(row => String(row.raceId))
    };
}

function answerRange(rows, field) {
    const values = rows.map(row => Number(row[field])).filter(Number.isFinite);
    return {
        firstYear: values.length ? Math.min(...values) : null,
        lastYear: values.length ? Math.max(...values) : null
    };
}

async function buildQuizSummary(series) {
    if (series === 'wec') {
        const [winners, season] = await Promise.all([getWecRaceWinners(), getLatestSeasonRaceIds(series)]);
        const winnerRange = answerRange(winners, 'firstWinYear');
        return { series, generatedAt: new Date().toISOString(), quizzes: {
            raceWinners: { firstYear: winnerRange.firstYear, total: winners.length, answerIds: winners.map((_, slot) => String(slot)) },
            seasonRaceWinners: { year: season.year, total: season.answerIds.length, answerIds: season.answerIds }
        } };
    }
    const includeDriverHistory = series === 'f1' || series === 'f2' || series === 'fe';
    const [champions, winners, constructors, season] = await Promise.all([
        includeDriverHistory ? getChampionAnswers(series) : Promise.resolve([]),
        includeDriverHistory ? (isJuniorSeries(series) ? getJuniorRaceWinners(series) : getRaceWinners()) : Promise.resolve([]),
        getConstructorChampionAnswers(series),
        getLatestSeasonRaceIds(series)
    ]);
    const championRange = answerRange(champions, 'year');
    const winnerRange = answerRange(winners, 'firstWinYear');
    const constructorRange = answerRange(constructors, 'year');

    return {
        series,
        generatedAt: new Date().toISOString(),
        quizzes: {
            ...(includeDriverHistory ? {
                champions: {
                    ...championRange,
                    total: champions.length,
                    answerIds: champions.map(row => String(row.year))
                },
                raceWinners: {
                    firstYear: winnerRange.firstYear,
                    total: winners.length,
                    answerIds: winners.map((_, slot) => String(slot))
                }
            } : {}),
            constructorChampions: {
                ...constructorRange,
                total: constructors.length,
                answerIds: constructors.map(row => String(row.year))
            },
            seasonRaceWinners: {
                year: season.year,
                total: season.answerIds.length,
                answerIds: season.answerIds
            }
        }
    };
}

router.get('/api/games/quiz-summary', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase() === 'wec' ? 'wec' : normaliseSeries(req.query.series);
        const cached = quizSummaryCache.get(series);
        if (cached && cached.expiresAt > Date.now()) {
            res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
            return res.json(cached.value);
        }

        const value = await buildQuizSummary(series);
        quizSummaryCache.set(series, { value, expiresAt: Date.now() + QUIZ_SUMMARY_TTL_MS });
        res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        res.json(value);
    } catch (error) {
        sendError(res, error);
    }
});

router.get('/api/games/world-champions', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const rows = await pool.query(`
                SELECT standings.year,
                    GROUP_CONCAT(DISTINCT constructors.name ORDER BY constructors.name SEPARATOR '|||') AS teamNames,
                    (
                        SELECT MAX(CHAR_LENGTH(championDrivers.name))
                        FROM ${prefix}season_driver_standings championStandings
                        JOIN ${prefix}drivers championDrivers ON championDrivers.id = championStandings.driverId
                        WHERE championStandings.positionNumber = 1
                            AND (
                                LOWER(CAST(championStandings.championshipWon AS CHAR)) IN ('1', 'true')
                                OR championStandings.year < YEAR(CURRENT_DATE())
                            )
                    ) AS driverNameLength
                FROM ${prefix}season_driver_standings standings
                LEFT JOIN ${prefix}sessions sessions ON sessions.year = standings.year
                LEFT JOIN ${prefix}session_results results
                    ON results.sessionId = sessions.id
                    AND results.driverId = standings.driverId
                LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
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
        const series = String(req.query.series || '').toLowerCase();
        const rows = await getChampionAnswers(series);
        const matches = matchingChampionAnswers(rows, guess);

        res.json({
            correct: matches.length > 0,
            driverName: matches[0]?.driverName || null,
            years: matches.map(match => match.year),
            matches
        });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/api/games/world-champions/reveal', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase();
        const rows = await getChampionAnswers(series);
        res.json({ answers: rows.map(row => ({ year: Number(row.year), driverName: row.driverName })) });
    } catch (error) {
        sendError(res, error);
    }
});

router.get('/api/games/race-winners', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase();
        const junior = isJuniorSeries(series);
        const rows = await raceWinnersFor(series);
        const driverNameLength = Math.max(0, ...rows.map(row => String(row.driverName || '').length));
        res.json(rows.map((row, slot) => ({
            slot,
            wins: Number(row.wins),
            driverNameLength,
            ...(!junior ? { countryName: row.countryName || null } : {}),
            ...(junior ? {
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
        const series = String(req.query.series || '').toLowerCase();
        const rows = await raceWinnersFor(series);
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

router.post('/api/games/race-winners/reveal', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase();
        const rows = await raceWinnersFor(series);
        res.json({ answers: rows.map((row, slot) => ({ slot, driverName: row.driverName })) });
    } catch (error) {
        sendError(res, error);
    }
});

router.get('/api/games/constructor-champions', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase();
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const rows = await pool.query(`
                SELECT standings.year,
                    (SELECT MAX(CHAR_LENGTH(championConstructors.name))
                     FROM ${prefix}season_constructor_standings championStandings
                     JOIN ${prefix}constructors championConstructors ON championConstructors.id = championStandings.constructorId
                     WHERE championStandings.positionNumber = 1
                        AND (
                            LOWER(CAST(championStandings.championshipWon AS CHAR)) IN ('1', 'true')
                            OR championStandings.year < YEAR(CURRENT_DATE())
                        )) AS constructorNameLength
                FROM ${prefix}season_constructor_standings standings
                WHERE standings.positionNumber = 1
                    AND (
                        LOWER(CAST(standings.championshipWon AS CHAR)) IN ('1', 'true')
                        OR standings.year < YEAR(CURRENT_DATE())
                    )
                ORDER BY standings.year DESC
            `);
            return res.json(rows.map(row => ({
                year: Number(row.year), constructorNameLength: Number(row.constructorNameLength || 0)
            })));
        }
        const rows = await pool.query(`
            SELECT standings.year,
                (SELECT MAX(CHAR_LENGTH(championConstructors.name))
                 FROM seasons_constructor_standings championStandings
                 JOIN constructors championConstructors ON championConstructors.id = championStandings.constructorId
                 WHERE championStandings.championshipWon = 1) AS constructorNameLength
            FROM seasons_constructor_standings standings
            WHERE standings.championshipWon = 1
            ORDER BY standings.year DESC
        `);
        res.json(rows.map(row => ({
            year: Number(row.year),
            constructorNameLength: Number(row.constructorNameLength || 0)
        })));
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/api/games/constructor-champions/guess', async (req, res) => {
    const guess = String(req.body.guess || '').trim();
    if (guess.length < 2 || guess.length > 100) return res.status(400).json({ error: 'Enter a constructor name.' });
    try {
        const series = String(req.query.series || '').toLowerCase();
        const rows = await getConstructorChampionAnswers(series);
        const matches = rows.filter(row => constructorMatchesGuess(row.constructorName, guess)).map(row => ({
            year: Number(row.year), constructorName: row.constructorName
        }));
        res.json({ correct: matches.length > 0, matches });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/api/games/constructor-champions/reveal', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase();
        const rows = await getConstructorChampionAnswers(series);
        res.json({ answers: rows.map(row => ({ year: Number(row.year), constructorName: row.constructorName })) });
    } catch (error) {
        sendError(res, error);
    }
});

router.get('/api/games/season-race-winners', async (req, res) => {
    try {
        const series = String(req.query.series || '').toLowerCase();
        if (series === 'wec') {
            const yearRows = await pool.query(`
                SELECT DISTINCT events.year
                FROM wec_events events
                JOIN wec_session_results results ON results.eventId = events.id
                    AND results.overallPosition = 1 AND results.status = 'classified'
                JOIN wec_sessions sessions ON sessions.id = results.sessionId
                    AND sessions.eventId = results.eventId AND sessions.type = 'race'
                ORDER BY events.year DESC
            `);
            const years = yearRows.map(row => Number(row.year));
            const requestedYear = req.query.year === undefined ? years[0] : Number(req.query.year);
            if (!Number.isInteger(requestedYear) || !years.includes(requestedYear)) return res.status(400).json({ error: 'Choose an available season.' });
            const crews = await getWecSeasonWinningCrews(requestedYear);
            const driverNameLength = Math.max(0, ...crews.map(row => row.displayName.length));
            return res.json({ years, year: requestedYear, races: crews.map(row => ({
                raceId: String(row.raceId), round: Number(row.round), raceName: row.raceName,
                constructors: [...new Set([row.teamName, row.manufacturerName].filter(Boolean))], driverNameLength
            })) });
        }
        if (isJuniorSeries(series)) {
            const prefix = seriesPrefix(series);
            const yearRows = await pool.query(`
                SELECT DISTINCT sessions.year
                FROM ${prefix}sessions sessions
                JOIN ${prefix}session_results results ON results.sessionId = sessions.id AND results.positionNumber = 1
                WHERE LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                    AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
                ORDER BY sessions.year DESC
            `);
            const years = yearRows.map(row => Number(row.year));
            const requestedYear = req.query.year === undefined ? years[0] : Number(req.query.year);
            if (!Number.isInteger(requestedYear) || !years.includes(requestedYear)) return res.status(400).json({ error: 'Choose an available season.' });
            const rows = await pool.query(`
                SELECT sessions.id AS raceId, sessions.round,
                    CONCAT(races.name, ' · ', sessions.name) AS raceName,
                    GROUP_CONCAT(DISTINCT constructors.name ORDER BY constructors.name SEPARATOR ' / ') AS constructorNames,
                    MAX(CHAR_LENGTH(drivers.name)) AS driverNameLength
                FROM ${prefix}sessions sessions
                JOIN ${prefix}races races ON races.id = sessions.raceId
                JOIN ${prefix}session_results results ON results.sessionId = sessions.id AND results.positionNumber = 1
                JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
                LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
                WHERE sessions.year = ?
                    AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                    AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
                GROUP BY sessions.id, sessions.round, sessions.sessionNumber, races.name, sessions.name
                ORDER BY sessions.round, sessions.sessionNumber
            `, [requestedYear]);
            return res.json({ years, year: requestedYear, races: rows.map(row => ({
                raceId: String(row.raceId), round: Number(row.round), raceName: row.raceName,
                constructors: row.constructorNames ? String(row.constructorNames).split(' / ') : [],
                driverNameLength: Number(row.driverNameLength || 0)
            })) });
        }
        const yearRows = await pool.query(`SELECT DISTINCT year FROM races_race_results WHERE positionNumber = 1 ORDER BY year DESC`);
        const years = yearRows.map(row => Number(row.year));
        const requestedYear = req.query.year === undefined ? years[0] : Number(req.query.year);
        if (!Number.isInteger(requestedYear) || !years.includes(requestedYear)) return res.status(400).json({ error: 'Choose an available season.' });
        const rows = await pool.query(`
            SELECT races.id AS raceId, races.round,
                COALESCE(NULLIF(grands_prix.shortName, ''), NULLIF(grands_prix.fullName, ''), NULLIF(races.officialName, ''), CONCAT('Round ', races.round)) AS raceName,
                GROUP_CONCAT(DISTINCT constructors.name ORDER BY constructors.name SEPARATOR ' / ') AS constructorNames,
                MAX(CHAR_LENGTH(drivers.name)) AS driverNameLength
            FROM races
            JOIN races_race_results results ON results.raceId = races.id AND results.positionNumber = 1
            JOIN drivers ON drivers.id = results.driverId
            LEFT JOIN constructors ON constructors.id = results.constructorId
            LEFT JOIN grands_prix ON grands_prix.id = races.grandPrixId
            WHERE races.year = ?
            GROUP BY races.id, races.round, raceName
            ORDER BY races.round
        `, [requestedYear]);
        res.json({ years, year: requestedYear, races: rows.map(row => ({
            raceId: String(row.raceId), round: Number(row.round), raceName: row.raceName,
            constructors: row.constructorNames ? String(row.constructorNames).split(' / ') : [],
            driverNameLength: Number(row.driverNameLength || 0)
        })) });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/api/games/season-race-winners/guess', async (req, res) => {
    const guess = String(req.body.guess || '').trim();
    const year = Number(req.body.year);
    if (guess.length < 2 || guess.length > 100 || !Number.isInteger(year)) return res.status(400).json({ error: 'Enter a driver name and choose a season.' });
    try {
        const series = String(req.query.series || '').toLowerCase();
        if (series === 'wec') {
            const crews = await getWecSeasonWinningCrews(year);
            const matches = crews.filter(row => row.driverNames.some(name => nameMatchesGuess(name, guess)))
                .map(row => ({ raceId: String(row.raceId), driverName: row.displayName }));
            return res.json({ correct: matches.length > 0, matches });
        }
        const rows = await getSeasonRaceWinnerAnswers(year, series);
        const matches = rows.filter(row => nameMatchesGuess(row.driverName, guess)).map(row => ({
            raceId: String(row.raceId), driverName: row.driverName
        }));
        res.json({ correct: matches.length > 0, matches });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/api/games/season-race-winners/reveal', async (req, res) => {
    const year = Number(req.body.year);
    if (!Number.isInteger(year)) return res.status(400).json({ error: 'Choose a season.' });
    try {
        const series = String(req.query.series || '').toLowerCase();
        if (series === 'wec') {
            const crews = await getWecSeasonWinningCrews(year);
            return res.json({ answers: crews.map(row => ({ raceId: String(row.raceId), driverName: row.displayName })) });
        }
        const rows = await getSeasonRaceWinnerAnswers(year, series);
        res.json({ answers: rows.map(row => ({ raceId: String(row.raceId), driverName: row.driverName })) });
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;
