const pool = require('./db');
const { entityPageTitle, publicEntityName, routeContext } = require('./seo');
const { resourcePath } = require('./resource-routes');
const { optionalConstructorLineage } = require('./constructor-lineage');
const { f2CircuitImageId } = require('../frontend/js/f2-circuit-images');

const SERIES_PREFIX = Object.freeze({ f1: '', f2: 'f2_', f3: 'f3_', academy: 'fa_' });
const SITEMAP_CACHE_MS = 5 * 60 * 1000;
let sitemapCache = { expiresAt: 0, routes: [] };
let sitemapPromise;

function queryValue(req, name) {
    if (req.params?.resourceId && (name === 'id' || name === 'year')) return String(req.params.resourceId).trim().slice(0, 160);
    const value = Array.isArray(req.query?.[name]) ? req.query[name][0] : req.query?.[name];
    return typeof value === 'string' && value.length <= 160 ? value.trim() : '';
}

function seriesBase(key) {
    return key === 'f1' ? '' : `/${key}`;
}

async function resolveCommunityMetadata(req, context, id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const rows = await pool.query(`
        SELECT c.name, c.description, c.configuration, u.display_name AS ownerName
        FROM app_custom_championships c
        JOIN app_users u ON u.id = c.user_id
        WHERE c.id = ? AND c.visibility = 'public'
    `, [id]);
    if (!rows.length) return null;
    const configuration = typeof rows[0].configuration === 'string'
        ? JSON.parse(rows[0].configuration) : rows[0].configuration;
    if ((configuration?.series || 'f1') !== context.series.key) return null;
    return {
        title: `${rows[0].name} · ${context.series.name} · Racelytic`,
        description: rows[0].description || `A custom ${context.series.name} championship created by ${rows[0].ownerName} on Racelytic.`,
        robots: 'index, follow'
    };
}

async function resolveDriverMetadata(context, id) {
    const series = context.series.key;
    let rows;
    if (series === 'f1') {
        rows = await pool.query(`
            SELECT d.name, d.fullName, d.permanentNumber, d.dateOfBirth, d.dateOfDeath, d.placeOfBirth,
                   d.totalChampionshipWins, d.totalRaceStarts, d.totalRaceWins, d.totalPodiums,
                   d.totalPolePositions, d.totalFastestLaps, d.totalPoints,
                   countries.name AS nationalityCountryName,
                   (SELECT MIN(year) FROM seasons_driver_standings WHERE driverId = d.id) AS firstSeason,
                   (SELECT MAX(year) FROM seasons_driver_standings WHERE driverId = d.id) AS lastSeason,
                   (SELECT MAX(year) FROM seasons_driver_standings) AS currentSeason,
                   (SELECT constructors.name FROM races_race_results results
                    LEFT JOIN constructors ON constructors.id = results.constructorId
                    WHERE results.driverId = d.id ORDER BY results.year DESC, results.round DESC LIMIT 1) AS latestConstructorName
            FROM drivers d
            LEFT JOIN countries ON countries.id = d.nationalityCountryId
            WHERE d.id = ?
        `, [id]);
    } else {
        const prefix = SERIES_PREFIX[series];
        rows = await pool.query(`
            SELECT drivers.name, drivers.countryCode,
                   COALESCE(stats.totalChampionshipWins, 0) AS totalChampionshipWins,
                   COALESCE(stats.totalRaceStarts, 0) AS totalRaceStarts,
                   COALESCE(stats.totalRaceWins, 0) AS totalRaceWins,
                   COALESCE(stats.totalPodiums, 0) AS totalPodiums,
                   COALESCE(stats.totalPolePositions, 0) AS totalPolePositions,
                   COALESCE(stats.totalFastestLaps, 0) AS totalFastestLaps,
                   COALESCE(stats.totalPoints, 0) AS totalPoints,
                   stats.firstSeason, stats.lastSeason,
                   (SELECT MAX(year) FROM ${prefix}entries) AS currentSeason,
                   (SELECT entry.driverNumber FROM ${prefix}entries entry WHERE entry.driverId = drivers.id
                    ORDER BY entry.year DESC, entry.round DESC LIMIT 1) AS latestNumber,
                   (SELECT constructors.name FROM ${prefix}entries entry
                    LEFT JOIN ${prefix}constructors constructors ON constructors.id = entry.constructorId
                    WHERE entry.driverId = drivers.id ORDER BY entry.year DESC, entry.round DESC LIMIT 1) AS latestConstructorName
            FROM ${prefix}drivers drivers
            LEFT JOIN (
                SELECT standings.driverId, MIN(standings.year) AS firstSeason, MAX(standings.year) AS lastSeason,
                       COUNT(DISTINCT CASE WHEN standings.positionNumber = 1 AND
                           (LOWER(CAST(standings.championshipWon AS CHAR)) IN ('1', 'true') OR calendars.finalDate < CURRENT_DATE())
                           THEN standings.year END) AS totalChampionshipWins,
                       SUM(COALESCE(standings.starts, 0)) AS totalRaceStarts,
                       SUM(COALESCE(standings.wins, 0)) AS totalRaceWins,
                       SUM(COALESCE(standings.podiums, 0)) AS totalPodiums,
                       SUM(COALESCE(standings.poles, 0)) AS totalPolePositions,
                       SUM(COALESCE(standings.fastestLaps, 0)) AS totalFastestLaps,
                       SUM(COALESCE(standings.points, 0)) AS totalPoints
                FROM ${prefix}season_driver_standings standings
                LEFT JOIN (SELECT year, MAX(COALESCE(endDate, date)) AS finalDate FROM ${prefix}races GROUP BY year) calendars
                    ON calendars.year = standings.year
                WHERE standings.driverId = ?
                GROUP BY standings.driverId
            ) stats ON stats.driverId = drivers.id
            WHERE drivers.id = ?
        `, [id, id]);
    }
    if (!rows.length) return { robots: 'noindex, follow', notFound: true };
    const driver = rows[0];
    const displayName = publicEntityName(driver);
    const description = `${displayName} ${context.series.name} career statistics: ${Number(driver.totalRaceStarts || 0)} starts, ${Number(driver.totalRaceWins || 0)} wins, ${Number(driver.totalPodiums || 0)} podiums and complete season history.`;
    return {
        title: entityPageTitle(displayName, context.series.name, 'Driver'),
        description,
        initialContent: { kind: 'driver', series, driver }
    };
}

async function resolveConstructorMetadata(context, id) {
    const series = context.series.key;
    let rows;
    if (series === 'f1') {
        rows = await pool.query(`
            SELECT constructors.name, constructors.fullName, countries.name AS countryName,
                   constructors.totalChampionshipWins, constructors.totalRaceStarts, constructors.totalRaceWins,
                   constructors.totalPodiums, constructors.totalPolePositions, constructors.totalPoints,
                   (SELECT MIN(year) FROM races_race_results WHERE constructorId = constructors.id) AS firstYear,
                   (SELECT MAX(year) FROM races_race_results WHERE constructorId = constructors.id) AS lastYear,
                   (SELECT COUNT(DISTINCT year) FROM races_race_results WHERE constructorId = constructors.id) AS seasons
            FROM constructors LEFT JOIN countries ON countries.id = constructors.countryId
            WHERE constructors.id = ?
        `, [id]);
    } else {
        const prefix = SERIES_PREFIX[series];
        rows = await pool.query(`
            SELECT constructors.name, constructors.abbreviation, constructors.countryCode,
                   COALESCE(titles.totalChampionshipWins, 0) AS totalChampionshipWins,
                   COALESCE(stats.totalRaceStarts, 0) AS totalRaceStarts,
                   COALESCE(stats.totalRaceWins, 0) AS totalRaceWins,
                   COALESCE(stats.totalPodiums, 0) AS totalPodiums,
                   COALESCE(stats.totalPolePositions, 0) AS totalPolePositions,
                   COALESCE(stats.totalPoints, 0) AS totalPoints,
                   stats.firstYear, stats.lastYear, stats.seasons
            FROM ${prefix}constructors constructors
            LEFT JOIN (
                SELECT constructorId, COUNT(DISTINCT CASE WHEN positionNumber = 1 AND
                    (LOWER(CAST(championshipWon AS CHAR)) IN ('1', 'true') OR year < YEAR(CURRENT_DATE())) THEN year END) AS totalChampionshipWins
                FROM ${prefix}season_constructor_standings WHERE constructorId = ? GROUP BY constructorId
            ) titles ON titles.constructorId = constructors.id
            LEFT JOIN (
                SELECT results.constructorId, MIN(sessions.year) AS firstYear, MAX(sessions.year) AS lastYear,
                       COUNT(DISTINCT sessions.year) AS seasons,
                       COUNT(DISTINCT CASE WHEN UPPER(COALESCE(results.status, '')) NOT IN ('DNS', 'DNQ', 'DNPQ', 'WD') THEN sessions.id END) AS totalRaceStarts,
                       SUM(results.positionNumber = 1 AND UPPER(COALESCE(results.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC')) AS totalRaceWins,
                       SUM(results.positionNumber BETWEEN 1 AND 3 AND UPPER(COALESCE(results.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC')) AS totalPodiums,
                       SUM(LOWER(CAST(results.polePosition AS CHAR)) IN ('1', 'true')) AS totalPolePositions,
                       SUM(CASE WHEN UPPER(COALESCE(results.status, '')) IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 0 ELSE results.points END) AS totalPoints
                FROM ${prefix}session_results results JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
                WHERE results.constructorId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                    AND LOWER(COALESCE(CAST(sessions.cancelled AS CHAR), 'false')) NOT IN ('1', 'true')
                GROUP BY results.constructorId
            ) stats ON stats.constructorId = constructors.id
            WHERE constructors.id = ?
        `, [id, id, id]);
    }
    if (!rows.length) return { robots: 'noindex, follow', notFound: true };
    const constructor = rows[0];
    const lineage = series === 'f1' ? await optionalConstructorLineage(pool, id) : null;
    const entity = series === 'f1' ? 'constructor' : 'team';
    const displayName = publicEntityName(constructor);
    return {
        title: entityPageTitle(displayName, context.series.name, series === 'f1' ? 'Constructor' : 'Team'),
        description: `${displayName} ${context.series.name} ${entity} statistics, including ${Number(constructor.totalRaceWins || 0)} wins, ${Number(constructor.totalPodiums || 0)} podiums and complete season history.`,
        initialContent: { kind: 'constructor', series, constructor, lineage }
    };
}

async function resolveCircuitMetadata(context, id) {
    const series = context.series.key;
    let rows;
    if (series === 'f1') {
        rows = await pool.query(`
            SELECT circuits.id, COALESCE(NULLIF(circuits.fullName, ''), circuits.name) AS name,
                   circuits.type, circuits.direction, circuits.placeName, countries.name AS countryName,
                   circuits.length, circuits.turns, layouts.id AS layoutId,
                   layouts.length AS layoutLength, layouts.turns AS layoutTurns,
                   history.totalRacesHeld, history.firstHeldYear, history.lastHeldYear
            FROM circuits
            LEFT JOIN countries ON countries.id = circuits.countryId
            LEFT JOIN circuits_layouts layouts ON layouts.id = (
                SELECT MAX(active.id) FROM circuits_layouts active WHERE active.circuitId = circuits.id AND active.effective = 1
            )
            LEFT JOIN (
                SELECT races.circuitId, COUNT(DISTINCT races.id) AS totalRacesHeld,
                       MIN(races.year) AS firstHeldYear, MAX(races.year) AS lastHeldYear
                FROM races JOIN (SELECT DISTINCT raceId FROM races_race_results) completed ON completed.raceId = races.id
                GROUP BY races.circuitId
            ) history ON history.circuitId = circuits.id
            WHERE circuits.id = ?
        `, [id]);
    } else {
        const prefix = SERIES_PREFIX[series];
        rows = await pool.query(`
            SELECT circuits.id, circuits.name, circuits.type, circuits.direction, circuits.placeName,
                   circuits.lengthMeters, circuits.turns,
                   COUNT(DISTINCT CASE WHEN completed.sessionId IS NOT NULL THEN sessions.id END) AS totalRacesHeld,
                   MIN(CASE WHEN completed.sessionId IS NOT NULL THEN races.year END) AS firstHeldYear,
                   MAX(CASE WHEN completed.sessionId IS NOT NULL THEN races.year END) AS lastHeldYear
            FROM ${prefix}circuits circuits
            LEFT JOIN ${prefix}races races ON races.circuitId = circuits.id
            LEFT JOIN ${prefix}sessions sessions ON sessions.raceId = races.id
                AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                AND LOWER(COALESCE(CAST(sessions.cancelled AS CHAR), 'false')) NOT IN ('1', 'true')
            LEFT JOIN (SELECT DISTINCT sessionId FROM ${prefix}session_results) completed ON completed.sessionId = sessions.id
            WHERE circuits.id = ?
            GROUP BY circuits.id, circuits.name, circuits.type, circuits.direction, circuits.placeName, circuits.lengthMeters, circuits.turns
        `, [id]);
        if (rows.length) {
            const location = String(rows[0].placeName || '').split(',').map(part => part.trim()).filter(Boolean);
            rows[0].countryName = location.length > 1 ? location.pop() : '';
            rows[0].placeName = location.join(', ');
            rows[0].layoutId = id === 'valencia' ? null : f2CircuitImageId(id);
        }
    }
    if (!rows.length) return { robots: 'noindex, follow', notFound: true };
    const circuit = rows[0];
    return {
        title: entityPageTitle(circuit.name, context.series.name, 'Circuit'),
        description: `${circuit.name} ${context.series.name} circuit history, layout facts and ${Number(circuit.totalRacesHeld || 0)} recorded races.`,
        initialContent: { kind: 'circuit', series, circuit }
    };
}

async function resolveSeasonMetadata(context, id) {
    if (!/^\d{4}$/.test(id)) return { robots: 'noindex, follow', notFound: true };
    const series = context.series.key;
    const prefix = SERIES_PREFIX[series];
    const driverStandings = series === 'f1' ? 'seasons_driver_standings' : `${prefix}season_driver_standings`;
    const constructorStandings = series === 'f1' ? 'seasons_constructor_standings' : `${prefix}season_constructor_standings`;
    const driverTable = `${prefix}drivers`;
    const constructorTable = `${prefix}constructors`;
    const driverQuery = series === 'f1'
        ? `SELECT standings.positionNumber, standings.points, standings.championshipWon, drivers.name
            FROM ${driverStandings} standings JOIN ${driverTable} drivers ON drivers.id = standings.driverId
            WHERE standings.year = ? ORDER BY standings.positionNumber LIMIT 3`
        : `SELECT MIN(standings.positionNumber) AS positionNumber, SUM(COALESCE(standings.points, 0)) AS points,
                   MAX(standings.championshipWon) AS championshipWon, drivers.name
            FROM ${driverStandings} standings JOIN ${driverTable} drivers ON drivers.id = standings.driverId
            WHERE standings.year = ? GROUP BY standings.driverId, drivers.name
            ORDER BY positionNumber LIMIT 3`;
    const [seasonRows, drivers, constructors, totals] = await Promise.all([
        pool.query(`SELECT year FROM ${prefix}seasons WHERE year = ?`, [id]),
        pool.query(driverQuery, [id]),
        pool.query(`SELECT standings.positionNumber, standings.championshipWon, constructors.name
            FROM ${constructorStandings} standings JOIN ${constructorTable} constructors ON constructors.id = standings.constructorId
            WHERE standings.year = ? ORDER BY standings.positionNumber LIMIT 1`, [id]),
        series === 'f1'
            ? pool.query(`SELECT COUNT(DISTINCT races.id) AS races, COALESCE(SUM(races.laps), 0) AS laps, MAX(races.date) AS finalDate
                FROM races JOIN (SELECT DISTINCT raceId FROM races_race_results) completed ON completed.raceId = races.id WHERE races.year = ?`, [id])
            : pool.query(`SELECT COUNT(DISTINCT sessions.id) AS races, COALESCE(SUM(completed.laps), 0) AS laps,
                       MAX(COALESCE(races.endDate, races.date)) AS finalDate
                FROM ${prefix}races races
                LEFT JOIN ${prefix}sessions sessions ON sessions.raceId = races.id
                    AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                    AND LOWER(COALESCE(CAST(sessions.cancelled AS CHAR), 'false')) NOT IN ('1', 'true')
                LEFT JOIN (SELECT sessionId, MAX(laps) AS laps FROM ${prefix}session_results GROUP BY sessionId) completed ON completed.sessionId = sessions.id
                WHERE races.year = ? AND completed.sessionId IS NOT NULL`, [id])
    ]);
    if (!seasonRows.length) return { robots: 'noindex, follow', notFound: true };
    const total = totals[0] || {};
    const completed = drivers.some(row => ['1', 'true'].includes(String(row.championshipWon).toLowerCase()))
        || Boolean(total.finalDate && new Date(total.finalDate) < new Date());
    const initialContent = {
        kind: 'season', series, year: Number(id), completed, races: Number(total.races || 0), laps: Number(total.laps || 0),
        first: drivers[0] || null, second: drivers[1] || null, third: drivers[2] || null, constructor: constructors[0] || null
    };
    return {
        title: `${id} ${context.series.name} Season · Racelytic`,
        description: `${id} ${context.series.name} standings, champion, race calendar and complete season results.`,
        initialContent
    };
}

async function resolveRaceMetadata(context, id) {
    const series = context.series.key;
    const prefix = SERIES_PREFIX[series];
    let raceRows, winnerRows;
    if (series === 'f1') {
        [raceRows, winnerRows] = await Promise.all([
            pool.query(`SELECT races.id, races.year, races.round, races.date, races.time, races.officialName,
                    COALESCE(NULLIF(grands_prix.fullName, ''), races.officialName) AS displayName,
                    races.circuitId, circuits.name AS circuitName, countries.name AS countryName,
                    races.laps, races.distance, races.courseLength, races.turns,
                    ((SELECT COUNT(*) FROM races_qualifying_results WHERE raceId = races.id)
                      + (SELECT COUNT(*) FROM races_sprint_race_results WHERE raceId = races.id)) AS supportingResultCount
                FROM races LEFT JOIN grands_prix ON grands_prix.id = races.grandPrixId
                LEFT JOIN circuits ON circuits.id = races.circuitId LEFT JOIN countries ON countries.id = circuits.countryId
                WHERE races.id = ?`, [id]),
            pool.query(`SELECT drivers.name AS winnerName, constructors.name AS winnerConstructorName
                FROM races_race_results results LEFT JOIN drivers ON drivers.id = results.driverId
                LEFT JOIN constructors ON constructors.id = results.constructorId
                WHERE results.raceId = ? AND results.positionNumber = 1 LIMIT 1`, [id])
        ]);
    } else {
        [raceRows, winnerRows] = await Promise.all([
            pool.query(`SELECT races.id, races.year, races.round, races.date, races.endDate, races.name,
                    races.circuitId, circuits.name AS circuitName, circuits.placeName,
                    circuits.type AS circuitType, circuits.direction, circuits.lengthMeters, circuits.turns,
                    (SELECT COUNT(*) FROM ${prefix}sessions WHERE raceId = races.id) AS sessionCount,
                    (SELECT COUNT(*) FROM ${prefix}sessions WHERE raceId = races.id
                        AND LOWER(CAST(isRace AS CHAR)) IN ('1', 'true')
                        AND LOWER(COALESCE(CAST(cancelled AS CHAR), 'false')) NOT IN ('1', 'true')) AS raceSessionCount,
                    (SELECT COUNT(DISTINCT sessions.id) FROM ${prefix}sessions sessions
                        JOIN ${prefix}session_results results ON results.sessionId = sessions.id
                        WHERE sessions.raceId = races.id AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                        AND LOWER(COALESCE(CAST(sessions.cancelled AS CHAR), 'false')) NOT IN ('1', 'true')) AS completedRaceSessionCount,
                    (SELECT COUNT(*) FROM ${prefix}session_results WHERE raceId = races.id) AS supportingResultCount
                FROM ${prefix}races races LEFT JOIN ${prefix}circuits circuits ON circuits.id = races.circuitId
                WHERE races.id = ?`, [id]),
            pool.query(`SELECT drivers.name AS winnerName, constructors.name AS winnerConstructorName
                FROM ${prefix}sessions sessions JOIN ${prefix}session_results results ON results.sessionId = sessions.id
                LEFT JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
                LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
                WHERE sessions.raceId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                    AND LOWER(COALESCE(CAST(sessions.cancelled AS CHAR), 'false')) NOT IN ('1', 'true')
                    AND results.positionNumber = 1 ORDER BY sessions.sessionNumber DESC LIMIT 1`, [id])
        ]);
    }
    if (!raceRows.length) return { robots: 'noindex, follow', notFound: true };
    const race = raceRows[0], winner = winnerRows[0] || {};
    const name = race.displayName || race.name || race.officialName;
    const raceSessionCount = Number(race.raceSessionCount || 0);
    const completedRaceSessionCount = Number(race.completedRaceSessionCount || 0);
    const hasResults = series === 'f1' ? Boolean(winnerRows.length)
        : raceSessionCount > 0 && completedRaceSessionCount === raceSessionCount;
    return {
        title: `${race.year} ${name} · ${context.series.name} · Racelytic`,
        description: `${race.year} ${name} ${context.series.name} race weekend, circuit details and complete session results.`,
        initialContent: {
            kind: 'race', series, race, hasResults,
            inProgress: !hasResults && Number(race.supportingResultCount || 0) > 0,
            ...winner
        }
    };
}

async function resolveEntityMetadata(req, context, page, id) {
    if (page === 'driver') return resolveDriverMetadata(context, id);
    if (page === 'constructor' || page === 'team') return resolveConstructorMetadata(context, id);
    if (page === 'circuit') return resolveCircuitMetadata(context, id);
    if (page === 'season') return resolveSeasonMetadata(context, id);
    if (page === 'race') return resolveRaceMetadata(context, id);
    const prefix = SERIES_PREFIX[context.series.key];
    const entity = page === 'team' ? 'constructor' : page;
    let sql;
    if (entity === 'season') {
        if (!/^\d{4}$/.test(id)) return null;
        sql = `SELECT CAST(year AS CHAR) AS name FROM ${prefix}seasons WHERE year = ?`;
    } else if (entity === 'race' && context.series.key === 'f1') {
        sql = `SELECT CONCAT(r.year, ' ', COALESCE(NULLIF(gp.fullName, ''), r.officialName)) AS name
            FROM races r LEFT JOIN grands_prix gp ON gp.id = r.grandPrixId WHERE r.id = ?`;
    } else if (entity === 'race') {
        sql = `SELECT CONCAT(year, ' ', name) AS name FROM ${prefix}races WHERE id = ?`;
    } else if (['driver', 'constructor', 'circuit', 'chassis'].includes(entity)) {
        const table = entity === 'chassis' ? `${prefix}chassis` : `${prefix}${entity}s`;
        const name = context.series.key === 'f1' ? "COALESCE(NULLIF(fullName, ''), name)" : 'name';
        sql = `SELECT ${name} AS name FROM ${table} WHERE id = ?`;
    } else {
        return null;
    }
    const rows = await pool.query(sql, [id]);
    if (!rows.length) return { robots: 'noindex, follow', notFound: true };
    const labels = { season: 'Season', race: 'Results', driver: 'Driver', constructor: 'Constructor', team: 'Team', circuit: 'Circuit', chassis: 'Chassis' };
    return {
        title: `${rows[0].name} ${labels[page] || labels[entity]} · ${context.series.name} · Racelytic`
    };
}

async function resolveSeoMetadata(req) {
    const context = routeContext(req.path);
    const parameter = context.page === 'season' ? 'year' : 'id';
    const id = queryValue(req, parameter);
    if (!id) return {};
    try {
        if (context.page === 'championship-builder') {
            return await resolveCommunityMetadata(req, context, id) || {};
        }
        return await resolveEntityMetadata(req, context, context.page, id) || {};
    } catch (error) {
        console.error('Unable to resolve dynamic SEO metadata:', error.message);
        return {};
    }
}

async function buildDynamicSitemapRoutes() {
    const specs = [
        ['f1', '', 'seasons', 'season', 'year', 'year'], ['f1', '', 'drivers', 'driver', 'id', 'id'],
        ['f1', '', 'constructors', 'constructor', 'id', 'id'], ['f1', '', 'circuits', 'circuit', 'id', 'id'],
        ['f1', '', 'races', 'race', 'id', 'id'], ['f1', '', 'chassis', 'chassis', 'id', 'id'],
        ...['f2', 'f3', 'academy'].flatMap(series => {
            const prefix = SERIES_PREFIX[series];
            const base = seriesBase(series);
            const teamPage = series === 'f2' ? 'constructor' : 'team';
            return [
                [series, base, `${prefix}seasons`, 'season', 'year', 'year'],
                [series, base, `${prefix}drivers`, 'driver', 'id', 'id'],
                [series, base, `${prefix}constructors`, teamPage, 'id', 'id'],
                [series, base, `${prefix}circuits`, 'circuit', 'id', 'id'],
                [series, base, `${prefix}races`, 'race', 'id', 'id'],
                [series, base, `${prefix}chassis`, 'chassis', 'id', 'id']
            ];
        })
    ];
    const groups = await Promise.all(specs.map(async ([series, , table, page, column]) => {
        const rows = page === 'race' && series === 'f1'
            ? await pool.query(`SELECT races.${column} AS value,
                    COALESCE(NULLIF(grands_prix.fullName, ''), NULLIF(races.officialName, ''), CONCAT('race-', races.id)) AS label
                FROM races LEFT JOIN grands_prix ON grands_prix.id = races.grandPrixId`)
            : await pool.query(`SELECT ${column} AS value,
                    ${page === 'race' ? "COALESCE(NULLIF(name, ''), CONCAT('race-', id))" : "''"} AS label FROM ${table}`);
        return rows.map(row => resourcePath(series, page, row.value, row.label));
    }));
    let community = [];
    try {
        const rows = await pool.query("SELECT id, configuration FROM app_custom_championships WHERE visibility = 'public'");
        community = rows.map(row => {
            const configuration = typeof row.configuration === 'string' ? JSON.parse(row.configuration) : row.configuration;
            const base = seriesBase(configuration?.series || 'f1');
            return `${base}/championship-builder?id=${encodeURIComponent(row.id)}`;
        });
    } catch (error) {
        if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    }
    return [...groups.flat(), ...community];
}

async function dynamicSitemapRoutes() {
    if (sitemapCache.expiresAt > Date.now()) return sitemapCache.routes;
    if (!sitemapPromise) {
        sitemapPromise = buildDynamicSitemapRoutes().then(routes => {
            sitemapCache = { expiresAt: Date.now() + SITEMAP_CACHE_MS, routes };
            return routes;
        }).finally(() => { sitemapPromise = null; });
    }
    return sitemapPromise;
}

module.exports = { dynamicSitemapRoutes, resolveSeoMetadata };
