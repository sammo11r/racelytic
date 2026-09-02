const years = value => String(value || '').split(',').map(Number).filter(year => year > 0);
const list = value => String(value || '').split('||').filter(Boolean);
const isTrue = value => value === true || value === 1 || /^(1|true)$/i.test(String(value));
const { driverRaceGridContexts } = require('./driver-race-grids');
const { f2SessionType, f3SessionType } = require('./junior-session-types');
const { academySessionType } = require('./series-config');
const { juniorClassificationPosition, juniorClassificationStatus } = require('./junior-classification');

function juniorCountryName(code) {
    try { return code ? new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()) : ''; }
    catch { return String(code || '').toUpperCase(); }
}

async function constructorResults(connection, id) {
    return connection.query(`
        SELECT rr.raceId, rr.year, rr.round, rr.driverId, rr.positionNumber, rr.positionText,
            rr.gridPositionNumber, rr.gridPositionText, rr.reasonRetired, rr.points, rr.laps,
            d.name AS driverName, COALESCE(NULLIF(gp.fullName, ''), r.officialName) AS name,
            gp.shortName, r.officialName, r.date, COALESCE(NULLIF(c.fullName, ''), c.name) AS circuitName
        FROM races_race_results rr
        JOIN drivers d ON d.id = rr.driverId
        JOIN races r ON r.id = rr.raceId
        LEFT JOIN grands_prix gp ON gp.id = r.grandPrixId
        LEFT JOIN circuits c ON c.id = r.circuitId
        WHERE rr.constructorId = ?
        ORDER BY rr.year DESC, rr.round DESC, rr.positionDisplayOrder
    `, [id]);
}

function buildConstructorDetail(constructor, standings, drivers, chassis, results = []) {
    const seasons = standings.map(row => ({ ...row, year: Number(row.year),
        championshipWon: isTrue(row.championshipWon),
        positionNumber: Number(row.positionNumber) > 0 && Number(row.positionNumber) < 100 ? Number(row.positionNumber) : null,
        drivers: list(row.drivers), chassis: list(row.chassis)
    }));
    const normalizedDrivers = drivers.map(row => ({ ...row, seasons: years(row.seasonYears),
        firstYear: Number(row.firstYear), lastYear: Number(row.lastYear),
        starts: Number(row.starts || 0), wins: Number(row.wins || 0), podiums: Number(row.podiums || 0), points: Number(row.points || 0)
    }));
    const currentSeason = Number(constructor.currentSeason) || null;
    return {
        constructor: { ...constructor, currentSeason, firstYear: seasons.at(-1)?.year || null,
            lastYear: seasons[0]?.year || null,
            currentDrivers: normalizedDrivers.filter(driver => driver.seasons.includes(currentSeason)).map(driver => ({ id: driver.driverId, name: driver.driverName })) },
        standings: seasons, drivers: normalizedDrivers,
        chassis: chassis.map(row => ({ ...row, seasons: years(row.seasonYears), firstYear: Number(row.firstYear), lastYear: Number(row.lastYear),
            engines: list(row.engines), engineManufacturers: list(row.engineManufacturers) })),
        results
    };
}

async function constructorDetail(connection, id, summaryOnly = false) {
    const [constructors, standings, drivers, chassis, results] = await Promise.all([
        connection.query(`SELECT k.*, co.name AS countryName, (SELECT MAX(year) FROM races) AS currentSeason
            FROM constructors k LEFT JOIN countries co ON co.id = k.countryId WHERE k.id = ?`, [id]),
        connection.query(`
            SELECT career.year, standing.positionNumber, standing.points, standing.championshipWon,
                (SELECT GROUP_CONCAT(DISTINCT d.name ORDER BY d.name SEPARATOR '||')
                    FROM seasons_entrants_drivers entry JOIN drivers d ON d.id = entry.driverId
                    WHERE entry.constructorId = career.constructorId AND entry.year = career.year
                        AND (entry.testDriver IS NULL OR LOWER(CAST(entry.testDriver AS CHAR)) NOT IN ('1', 'true'))) AS drivers,
                (SELECT GROUP_CONCAT(DISTINCT COALESCE(ch.fullName, ch.name) ORDER BY ch.name SEPARATOR '||')
                    FROM seasons_entrants_chassis entry JOIN chassis ch ON ch.id = entry.chassisId
                    WHERE entry.constructorId = career.constructorId AND entry.year = career.year) AS chassis
            FROM (
                SELECT constructorId, year FROM seasons_constructors WHERE constructorId = ?
                UNION SELECT constructorId, year FROM seasons_entrants_constructors WHERE constructorId = ?
                UNION SELECT constructorId, year FROM seasons_constructor_standings WHERE constructorId = ?
                UNION SELECT constructorId, year FROM races_race_results WHERE constructorId = ?
            ) career
            LEFT JOIN (
                SELECT constructorId, year, MIN(CASE WHEN positionNumber BETWEEN 1 AND 99 THEN positionNumber END) AS positionNumber,
                    SUM(points) AS points, MAX(LOWER(CAST(championshipWon AS CHAR)) IN ('1', 'true')) AS championshipWon
                FROM seasons_constructor_standings WHERE constructorId = ? GROUP BY constructorId, year
            ) standing ON standing.constructorId = career.constructorId AND standing.year = career.year
            ORDER BY career.year DESC
        `, [id, id, id, id, id]),
        connection.query(`
            SELECT entry.driverId, d.name AS driverName, MIN(entry.year) AS firstYear, MAX(entry.year) AS lastYear,
                GROUP_CONCAT(DISTINCT entry.year ORDER BY entry.year DESC SEPARATOR ',') AS seasonYears,
                stats.starts, stats.wins, stats.podiums, stats.points
            FROM (
                SELECT driverId, year FROM seasons_entrants_drivers WHERE constructorId = ?
                    AND (testDriver IS NULL OR LOWER(CAST(testDriver AS CHAR)) NOT IN ('1', 'true'))
                UNION SELECT driverId, year FROM races_race_results WHERE constructorId = ?
            ) entry
            JOIN drivers d ON d.id = entry.driverId
            LEFT JOIN (
                SELECT driverId,
                    SUM(UPPER(COALESCE(positionText, '')) NOT IN ('DNS', 'DNQ', 'DNPQ', 'WD')) AS starts,
                    SUM(positionNumber = 1) AS wins, SUM(positionNumber BETWEEN 1 AND 3) AS podiums, SUM(points) AS points
                FROM races_race_results WHERE constructorId = ? GROUP BY driverId
            ) stats ON stats.driverId = entry.driverId
            GROUP BY entry.driverId, d.name, stats.starts, stats.wins, stats.podiums, stats.points
            ORDER BY lastYear DESC, starts DESC, d.name
        `, [id, id, id]),
        connection.query(`
            SELECT sec.chassisId, ch.name AS chassisName, ch.fullName AS chassisFullName,
                MIN(sec.year) AS firstYear, MAX(sec.year) AS lastYear,
                GROUP_CONCAT(DISTINCT sec.year ORDER BY sec.year DESC SEPARATOR ',') AS seasonYears,
                GROUP_CONCAT(DISTINCT em.name ORDER BY em.name SEPARATOR '||') AS engineManufacturers,
                GROUP_CONCAT(DISTINCT e.fullName ORDER BY e.fullName SEPARATOR '||') AS engines
            FROM seasons_entrants_chassis sec JOIN chassis ch ON ch.id = sec.chassisId
            LEFT JOIN engine_manufacturers em ON em.id = sec.engineManufacturerId
            LEFT JOIN seasons_entrants_engines see ON see.year = sec.year AND see.entrantId = sec.entrantId
                AND see.constructorId = sec.constructorId AND see.engineManufacturerId = sec.engineManufacturerId
            LEFT JOIN engines e ON e.id = see.engineId
            WHERE sec.constructorId = ? GROUP BY sec.chassisId, ch.name, ch.fullName
            ORDER BY lastYear DESC, firstYear DESC, ch.name
        `, [id]),
        summaryOnly ? Promise.resolve([]) : constructorResults(connection, id)
    ]);
    if (!constructors.length) return null;
    return buildConstructorDetail(constructors[0], standings, drivers, chassis, results);
}

async function juniorConstructorResults(connection, prefix, series, id) {
    const rows = await connection.query(`
            SELECT sessions.id AS sessionId, sessions.name AS sessionName, sessions.sessionNumber,
                sessions.year, sessions.round, results.raceId, results.driverId, drivers.name AS driverName,
                results.positionNumber, results.status, results.points,
                races.name AS raceName, races.date, circuits.name AS circuitName
            FROM ${prefix}session_results results
            JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
            JOIN ${prefix}races races ON races.id = results.raceId
            LEFT JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
            LEFT JOIN ${prefix}circuits circuits ON circuits.id = races.circuitId
            WHERE results.constructorId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
            ORDER BY sessions.year DESC, sessions.round DESC, sessions.sessionNumber DESC, results.positionDisplayOrder
        `, [id]);
    if (!rows.length) return [];
    const raceIds = [...new Set(rows.map(row => row.raceId).filter(Boolean))];
    const placeholders = raceIds.map(() => '?').join(',');
    const contextRows = await connection.query(`
            SELECT sessions.id AS sessionId, sessions.raceId, sessions.year, sessions.name AS sessionName,
                sessions.sessionNumber, sessions.isRace, sessions.cancelled, results.driverId, results.positionNumber
            FROM ${prefix}sessions sessions
            LEFT JOIN ${prefix}session_results results ON results.sessionId = sessions.id
            WHERE sessions.raceId IN (${placeholders})
            ORDER BY sessions.year, sessions.round, sessions.sessionNumber, results.positionDisplayOrder
        `, raceIds);
    const sessionType = series === 'academy' ? academySessionType : series === 'f3' ? f3SessionType : f2SessionType;
    const contexts = driverRaceGridContexts(series, contextRows, sessionType);
    return rows.map(row => {
        const positionNumber = juniorClassificationPosition(row.positionNumber);
        const status = juniorClassificationStatus(row.status, row.positionNumber, true);
        const disqualified = /^(?:DSQ|DQ|DISQ|DISQUALIFIED|EXC)$/i.test(String(status || ''));
        const positionText = disqualified ? status : positionNumber || status || '—';
        const context = contexts.get(String(row.sessionId));
        return { ...row, name: row.raceName, positionNumber, positionText,
            gridPositionNumber: juniorClassificationPosition(context?.gridByDriver.get(String(row.driverId))),
            gridPositionText: null, reasonRetired: positionNumber || !status ? null : status,
            points: /\b(?:DSQ|DQ|DISQ|DISQUALIFIED|EXC)\b/i.test(String(row.status || '')) ? 0 : Number(row.points || 0)
        };
    });
}

async function juniorConstructorDetail(connection, prefix, series, id) {
    const [constructors, standings, drivers] = await Promise.all([
        connection.query(`
            SELECT constructors.id, constructors.name, constructors.abbreviation, constructors.countryCode,
                current.year AS currentSeason, COALESCE(titles.totalChampionshipWins, 0) AS totalChampionshipWins,
                COALESCE(stats.totalRaceStarts, 0) AS totalRaceStarts, COALESCE(stats.totalRaceWins, 0) AS totalRaceWins,
                COALESCE(stats.totalPodiums, 0) AS totalPodiums, COALESCE(stats.totalPolePositions, 0) AS totalPolePositions,
                COALESCE(stats.totalPoints, 0) AS totalPoints
            FROM ${prefix}constructors constructors
            CROSS JOIN (SELECT MAX(year) AS year FROM ${prefix}races) current
            LEFT JOIN (
                SELECT constructorId, SUM(positionNumber = 1 AND (
                    LOWER(CAST(championshipWon AS CHAR)) IN ('1', 'true') OR year < YEAR(CURRENT_DATE())
                )) AS totalChampionshipWins
                FROM ${prefix}season_constructor_standings GROUP BY constructorId
            ) titles ON titles.constructorId = constructors.id
            LEFT JOIN (
                SELECT results.constructorId,
                    COUNT(DISTINCT CASE WHEN UPPER(COALESCE(results.status, '')) NOT IN ('DNS', 'DNQ', 'DNPQ', 'WD', 'WITHDRAWN', 'DID NOT START', 'DID NOT QUALIFY') THEN sessions.id END) AS totalRaceStarts,
                    SUM(results.positionNumber = 1 AND UPPER(COALESCE(results.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC')) AS totalRaceWins,
                    SUM(results.positionNumber BETWEEN 1 AND 3 AND UPPER(COALESCE(results.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC')) AS totalPodiums,
                    SUM(LOWER(CAST(results.polePosition AS CHAR)) IN ('1', 'true')) AS totalPolePositions,
                    SUM(CASE WHEN UPPER(COALESCE(results.status, '')) IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 0 ELSE results.points END) AS totalPoints
                FROM ${prefix}session_results results JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
                WHERE LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                    AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
                GROUP BY results.constructorId
            ) stats ON stats.constructorId = constructors.id
            WHERE constructors.id = ?
        `, [id]),
        connection.query(`
            SELECT career.year, standing.positionNumber, standing.points, standing.championshipWon,
                GROUP_CONCAT(DISTINCT drivers.name ORDER BY drivers.name SEPARATOR '||') AS drivers
            FROM (
                SELECT constructorId, year FROM ${prefix}entries WHERE constructorId = ?
                UNION SELECT constructorId, year FROM ${prefix}season_constructor_standings WHERE constructorId = ?
                UNION SELECT constructorId, year FROM ${prefix}session_results WHERE constructorId = ?
            ) career
            LEFT JOIN ${prefix}season_constructor_standings standing
                ON standing.constructorId = career.constructorId AND standing.year = career.year
            LEFT JOIN ${prefix}entries entries ON entries.constructorId = career.constructorId AND entries.year = career.year
            LEFT JOIN ${prefix}drivers drivers ON drivers.id = entries.driverId
            GROUP BY career.constructorId, career.year, standing.positionNumber, standing.points, standing.championshipWon
            ORDER BY career.year DESC
        `, [id, id, id]),
        connection.query(`
            SELECT career.driverId, drivers.name AS driverName, MIN(career.year) AS firstYear, MAX(career.year) AS lastYear,
                GROUP_CONCAT(DISTINCT career.year ORDER BY career.year DESC SEPARATOR ',') AS seasonYears,
                COALESCE(stats.starts, 0) AS starts, COALESCE(stats.wins, 0) AS wins,
                COALESCE(stats.podiums, 0) AS podiums, COALESCE(stats.points, 0) AS points
            FROM (
                SELECT driverId, year FROM ${prefix}entries WHERE constructorId = ?
                UNION SELECT driverId, year FROM ${prefix}session_results WHERE constructorId = ?
            ) career JOIN ${prefix}drivers drivers ON drivers.id = career.driverId
            LEFT JOIN (
                SELECT results.driverId,
                    SUM(UPPER(COALESCE(results.status, '')) NOT IN ('DNS', 'DNQ', 'DNPQ', 'WD')) AS starts,
                    SUM(results.positionNumber = 1 AND UPPER(COALESCE(results.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC')) AS wins,
                    SUM(results.positionNumber BETWEEN 1 AND 3 AND UPPER(COALESCE(results.status, '')) NOT IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC')) AS podiums,
                    SUM(CASE WHEN UPPER(COALESCE(results.status, '')) IN ('DSQ', 'DQ', 'DISQ', 'DISQUALIFIED', 'EXC') THEN 0 ELSE results.points END) AS points
                FROM ${prefix}session_results results JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
                WHERE results.constructorId = ? AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                    AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
                GROUP BY results.driverId
            ) stats ON stats.driverId = career.driverId
            GROUP BY career.driverId, drivers.name, stats.starts, stats.wins, stats.podiums, stats.points
            ORDER BY lastYear DESC, starts DESC, drivers.name
        `, [id, id, id])
    ]);
    if (!constructors.length) return null;
    const constructor = constructors[0], currentSeason = Number(constructor.currentSeason);
    const normalizedStandings = standings.map(row => ({ ...row, year: Number(row.year),
        positionNumber: juniorClassificationPosition(row.positionNumber),
        championshipWon: Number(row.positionNumber) === 1 && (isTrue(row.championshipWon) || Number(row.year) < currentSeason),
        drivers: list(row.drivers), chassis: []
    }));
    const normalizedDrivers = drivers.map(row => ({ ...row, seasons: years(row.seasonYears),
        firstYear: Number(row.firstYear), lastYear: Number(row.lastYear), starts: Number(row.starts || 0),
        wins: Number(row.wins || 0), podiums: Number(row.podiums || 0), points: Number(row.points || 0)
    }));
    return { constructor: { ...constructor, currentSeason, countryName: juniorCountryName(constructor.countryCode),
        firstYear: normalizedStandings.at(-1)?.year || null, lastYear: normalizedStandings[0]?.year || null,
        currentDrivers: normalizedDrivers.filter(driver => driver.seasons.includes(currentSeason)).map(driver => ({ id: driver.driverId, name: driver.driverName })) },
        standings: normalizedStandings, drivers: normalizedDrivers, chassis: [], results: [] };
}

module.exports = { constructorDetail, constructorResults, buildConstructorDetail, juniorConstructorDetail, juniorConstructorResults };
