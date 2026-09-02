const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { constructorDetail, constructorResults, juniorConstructorDetail, juniorConstructorResults } = require('../constructor-detail');

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

function normalizeConstructorArchive(row) {
    const countryCode = String(row.countryCode || '').toLowerCase();
    let countryName = row.countryName || '';
    if (!countryName && /^[a-z]{2}$/.test(countryCode)) {
        countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode.toUpperCase());
    }
    return {
        ...row,
        countryId: row.countryId || countryCode,
        countryName,
        seasons: String(row.seasonYears || '').split(',').map(Number).filter(year => year > 0),
        currentSeason: Number(row.currentSeason) || null,
        currentDrivers: String(row.currentDrivers || '').split('||').filter(Boolean)
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
                    constructors.countryCode, career.firstYear, career.lastYear, career.seasonYears,
                    current.year AS currentSeason, currentStandings.positionNumber AS currentPosition,
                    currentStandings.points AS currentPoints, drivers.currentDrivers,
                    COALESCE(standings.titles, 0) AS totalChampionshipWins,
                    COALESCE(results.wins, 0) AS totalRaceWins,
                    COALESCE(results.podiums, 0) AS totalPodiums,
                    COALESCE(results.points, 0) AS totalRacePoints,
                    COALESCE(results.starts, 0) AS totalRaceStarts,
                    latest.positionNumber AS latestPosition, latest.points AS latestPoints
                FROM ${prefix}constructors constructors
                CROSS JOIN (SELECT MAX(year) AS year FROM ${prefix}races) current
                LEFT JOIN (
                    SELECT constructorId, MIN(year) AS firstYear, MAX(year) AS lastYear,
                        GROUP_CONCAT(DISTINCT year ORDER BY year DESC SEPARATOR ',') AS seasonYears
                    FROM (
                        SELECT constructorId, year FROM ${prefix}entries
                        UNION SELECT constructorId, year FROM ${prefix}season_constructor_standings
                        UNION SELECT results.constructorId, sessions.year FROM ${prefix}session_results results
                            JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
                    ) appearances GROUP BY constructorId
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
                        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(sessionResults.status, '')) NOT IN ('DNS', 'DNQ', 'DNPQ', 'WD', 'WITHDRAWN', 'DID NOT START', 'DID NOT QUALIFY') THEN sessions.id END) AS starts,
                        SUM(CASE WHEN UPPER(COALESCE(sessionResults.status, '')) IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 0 ELSE sessionResults.positionNumber = 1 END) AS wins,
                        SUM(CASE WHEN UPPER(COALESCE(sessionResults.status, '')) IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 0 ELSE sessionResults.positionNumber BETWEEN 1 AND 3 END) AS podiums,
                        SUM(CASE WHEN UPPER(COALESCE(sessionResults.status, '')) IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 0 ELSE sessionResults.points END) AS points
                    FROM ${prefix}session_results sessionResults
                    JOIN ${prefix}sessions sessions ON sessions.id = sessionResults.sessionId
                    WHERE LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                        AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
                    GROUP BY sessionResults.constructorId
                ) results ON results.constructorId = constructors.id
                LEFT JOIN ${prefix}season_constructor_standings latest
                    ON latest.constructorId = constructors.id
                    AND latest.year = career.lastYear
                LEFT JOIN ${prefix}season_constructor_standings currentStandings
                    ON currentStandings.constructorId = constructors.id AND currentStandings.year = current.year
                LEFT JOIN (
                    SELECT entries.constructorId, GROUP_CONCAT(DISTINCT drivers.name ORDER BY drivers.name SEPARATOR '||') AS currentDrivers
                    FROM ${prefix}entries entries JOIN ${prefix}drivers drivers ON drivers.id = entries.driverId
                    WHERE entries.year = (SELECT MAX(year) FROM ${prefix}races)
                    GROUP BY entries.constructorId
                ) drivers ON drivers.constructorId = constructors.id
                ORDER BY constructors.name
            `));
            return res.json(rows.map(row => normalizeConstructorArchive(normalizeF2Constructor(row))));
        }

        const search = String(req.query.search || '').trim();
        const q = `%${search}%`;
        const rows = await withConnection(connection => connection.query(`
            SELECT k.*, co.name AS countryName, career.seasonYears, career.firstYear, career.lastYear,
                current.year AS currentSeason, standings.currentPosition, standings.currentPoints,
                drivers.currentDrivers
            FROM constructors k
            CROSS JOIN (SELECT MAX(year) AS year FROM races) current
            LEFT JOIN countries co ON co.id = k.countryId
            LEFT JOIN (
                SELECT constructorId, GROUP_CONCAT(DISTINCT year ORDER BY year DESC SEPARATOR ',') AS seasonYears,
                    MIN(year) AS firstYear, MAX(year) AS lastYear
                FROM (
                    SELECT constructorId, year FROM seasons_constructors
                    UNION SELECT constructorId, year FROM seasons_entrants_constructors
                    UNION SELECT constructorId, year FROM seasons_constructor_standings
                    UNION SELECT rr.constructorId, r.year FROM races_race_results rr JOIN races r ON r.id = rr.raceId
                ) appearances GROUP BY constructorId
            ) career ON career.constructorId = k.id
            LEFT JOIN (
                SELECT constructorId, MIN(CASE WHEN positionNumber BETWEEN 1 AND 99 THEN positionNumber END) AS currentPosition,
                    SUM(points) AS currentPoints
                FROM seasons_constructor_standings WHERE year = (SELECT MAX(year) FROM races)
                GROUP BY constructorId
            ) standings ON standings.constructorId = k.id
            LEFT JOIN (
                SELECT entry.constructorId, GROUP_CONCAT(DISTINCT d.name ORDER BY d.name SEPARATOR '||') AS currentDrivers
                FROM seasons_entrants_drivers entry JOIN drivers d ON d.id = entry.driverId
                WHERE entry.year = (SELECT MAX(year) FROM races)
                    AND (entry.testDriver IS NULL OR LOWER(CAST(entry.testDriver AS CHAR)) NOT IN ('1', 'true'))
                GROUP BY entry.constructorId
            ) drivers ON drivers.constructorId = k.id
            ${search ? 'WHERE k.name LIKE ? OR k.fullName LIKE ? OR co.name LIKE ?' : ''}
            ORDER BY k.name
        `, search ? [q, q, q] : []));
        res.json(rows.map(normalizeConstructorArchive));
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
            if (String(req.query.results || '') === '1') {
                const results = await withConnection(connection => juniorConstructorResults(connection, prefix, series, req.params.id));
                return res.json(results);
            }
            const data = await withConnection(connection => juniorConstructorDetail(connection, prefix, series, req.params.id));
            if (!data) return res.status(404).json({ error: `${series.toUpperCase()} team not found.` });
            if (series === 'f2') {
                data.constructor = normalizeF2Constructor(data.constructor);
                if (!data.constructor.countryName && data.constructor.countryCode) {
                    data.constructor.countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(data.constructor.countryCode.toUpperCase());
                }
            }
            return res.json(data);
        }

        if (String(req.query.results || '') === '1') {
            const results = await withConnection(connection => constructorResults(connection, req.params.id));
            return res.json(results);
        }
        const data = await withConnection(connection => constructorDetail(connection, req.params.id, String(req.query.summary || '') === '1'));


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
