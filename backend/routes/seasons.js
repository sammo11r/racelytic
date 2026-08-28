const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { academySessionType } = require('../series-config');

const router = express.Router();

function isDisqualified(result) {
    return /\b(?:DSQ|DQ|DISQ|DISQUALIFIED|EXC)\b/i.test(String(result.status || result.positionText || ''));
}

function f2SessionType(session, sessionIndex, sessionCount, year) {
    const name = String(session.name || '').toLowerCase();
    if (name.includes('feature')) return 'F';
    if (name.includes('sprint')) return 'S';
    const sessionNumber = Number(session.sessionNumber || 0);
    if (sessionNumber) {
        if (Number(year) <= 2020) return sessionNumber <= 4 ? 'F' : 'S';
        if (Number(year) === 2021) return sessionNumber >= 8 ? 'F' : 'S';
        return sessionNumber >= 6 ? 'F' : 'S';
    }
    if (Number(year) <= 2020) return sessionIndex === 0 ? 'F' : 'S';
    return sessionIndex === sessionCount - 1 ? 'F' : 'S';
}

function f2ResultPoints(result, sessionType, year, polePosition) {
    if (isDisqualified(result)) return 0;
    if (result.officialPoints !== null && result.officialPoints !== undefined) {
        return Number(result.officialPoints);
    }
    const featurePoints = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    const sprintPoints = Number(year) <= 2021
        ? [15, 12, 10, 8, 6, 4, 2, 1]
        : [10, 8, 6, 5, 4, 3, 2, 1];
    const position = Number(result.positionNumber || 0);
    const scale = sessionType === 'F' ? featurePoints : sprintPoints;
    let points = position > 0 ? Number(scale[position - 1] || 0) : 0;
    if (['1', 'true'].includes(String(result.fastestLap).toLowerCase()) && position > 0 && position <= 10) {
        points += Number(year) <= 2021 ? 2 : 1;
    }
    if (polePosition) points += Number(year) <= 2021 ? 4 : 2;
    return points;
}

function f3SessionType(session, sessionIndex, sessionCount, year) {
    const name = String(session.name || '').toLowerCase();
    if (name.includes('feature')) return 'F';
    if (name.includes('sprint')) return 'S';
    const sessionNumber = Number(session.sessionNumber || 0);
    if (sessionNumber) {
        if (Number(year) <= 2020) return sessionNumber <= 4 ? 'F' : 'S';
        if (Number(year) === 2021) return sessionNumber >= 8 ? 'F' : 'S';
        return sessionNumber >= 6 ? 'F' : 'S';
    }
    return sessionIndex === sessionCount - 1 ? 'F' : 'S';
}

function f3ResultPoints(result, sessionType, year, polePosition) {
    if (isDisqualified(result)) return 0;
    if (result.officialPoints !== null && result.officialPoints !== undefined) {
        return Number(result.officialPoints);
    }
    const featurePoints = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    const sprintPoints = Number(year) <= 2021
        ? [15, 12, 10, 8, 6, 5, 4, 3, 2, 1]
        : [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const position = Number(result.positionNumber || 0);
    const scale = sessionType === 'F' ? featurePoints : sprintPoints;
    let points = position > 0 ? Number(scale[position - 1] || 0) : 0;
    if (['1', 'true'].includes(String(result.fastestLap).toLowerCase()) && position > 0 && position <= 10) {
        points += Number(year) <= 2021 ? 2 : 1;
    }
    if (polePosition) points += Number(year) <= 2021 ? 4 : 2;
    return points;
}

function juniorSeriesConfiguration(series) {
    if (series === 'academy') return { prefix: 'fa_', sessionType: academySessionType, resultPoints: f2ResultPoints };
    if (series === 'f3') return { prefix: 'f3_', sessionType: f3SessionType, resultPoints: f3ResultPoints };
    return { prefix: 'f2_', sessionType: f2SessionType, resultPoints: f2ResultPoints };
}

function eligibleFastestLapDrivers(results) {
    const timedCandidates = new Map();
    const importedCandidates = new Map();

    for (const result of results) {
        const position = Number(result.positionNumber || 0);
        if (position < 1 || position > 10 || isDisqualified(result)) continue;

        const sessionId = String(result.sessionId);
        if (['1', 'true'].includes(String(result.fastestLap).toLowerCase()) && !importedCandidates.has(sessionId)) {
            importedCandidates.set(sessionId, result.driverId);
        }

        const lapTime = Number(result.fastestLapTimeMillis);
        if (!Number.isFinite(lapTime) || lapTime <= 0) continue;
        const current = timedCandidates.get(sessionId);
        if (!current || lapTime < current.lapTime) {
            timedCandidates.set(sessionId, { driverId: result.driverId, lapTime });
        }
    }

    const drivers = new Map(importedCandidates);
    for (const [sessionId, candidate] of timedCandidates) {
        drivers.set(sessionId, candidate.driverId);
    }
    return drivers;
}

function resolveSeasonAwards(result, context, poleDriverByRace, fastestLapDriverBySession) {
    const driverId = String(result.driverId);
    return {
        polePosition: context.type === 'F' && driverId === String(poleDriverByRace.get(context.raceId)),
        fastestLap: driverId === String(fastestLapDriverBySession.get(String(result.sessionId)))
    };
}

// ============================================================
// Seasons List
// ============================================================

router.get('/api/seasons', async (req, res) => {

    try {

        const series = String(req.query.series || '').toLowerCase();
        if (['f2', 'f3', 'academy'].includes(series)) {
            const { prefix } = juniorSeriesConfiguration(series);
            const rows = await withConnection(async connection => {
                const [seasons, raceCounts, driverCounts, constructorCounts, champions] = await Promise.all([
                    connection.query(`SELECT year FROM ${prefix}seasons ORDER BY year DESC`),
                    connection.query(`SELECT year, COUNT(*) AS raceCount FROM ${prefix}races GROUP BY year`),
                    connection.query(`SELECT year, COUNT(DISTINCT driverId) AS driverCount FROM ${prefix}entries WHERE driverId IS NOT NULL GROUP BY year`),
                    connection.query(`SELECT year, COUNT(DISTINCT constructorId) AS constructorCount FROM ${prefix}entries WHERE constructorId IS NOT NULL GROUP BY year`),
                    connection.query(`
                        SELECT standings.year, standings.driverId AS championDriverId, drivers.name AS championName
                        FROM ${prefix}season_driver_standings standings
                        JOIN ${prefix}drivers drivers ON drivers.id = standings.driverId
                        LEFT JOIN (
                            SELECT year, MAX(COALESCE(endDate, date)) AS finalDate
                            FROM ${prefix}races
                            GROUP BY year
                        ) calendars ON calendars.year = standings.year
                        WHERE standings.positionNumber = 1
                            AND (
                                LOWER(CAST(standings.championshipWon AS CHAR)) IN ('1', 'true')
                                OR calendars.finalDate < CURRENT_DATE()
                            )
                    `)
                ]);
                const countMap = (items, field) => new Map(items.map(item => [Number(item.year), Number(item[field])]));
                const raceMap = countMap(raceCounts, 'raceCount');
                const driverMap = countMap(driverCounts, 'driverCount');
                const constructorMap = countMap(constructorCounts, 'constructorCount');
                const championMap = new Map(champions.map(row => [Number(row.year), { id: row.championDriverId, name: row.championName }]));

                return seasons.map(season => {
                    const year = Number(season.year);
                    return {
                        year,
                        raceCount: raceMap.get(year) || 0,
                        driverCount: driverMap.get(year) || 0,
                        constructorCount: constructorMap.get(year) || 0,
                        champion: championMap.get(year) || null
                    };
                });
            });
            return res.json(rows);
        }

        const rows = await withConnection(async connection => {

            const [
                seasons,
                raceCounts,
                driverCounts,
                constructorCounts,
                champions
            ] = await Promise.all([

                connection.query(`
                    SELECT year
                    FROM seasons
                    ORDER BY year DESC
                `),

                connection.query(`
                    SELECT
                        year,
                        COUNT(*) AS raceCount
                    FROM races
                    GROUP BY year
                `),

                connection.query(`
                    SELECT
                        year,
                        COUNT(DISTINCT driverId) AS driverCount
                    FROM races_race_results
                    WHERE driverId IS NOT NULL
                    GROUP BY year
                `),

                connection.query(`
                    SELECT
                        year,
                        COUNT(DISTINCT constructorId) AS constructorCount
                    FROM races_race_results
                    WHERE constructorId IS NOT NULL
                    GROUP BY year
                `),

                connection.query(`
                    SELECT
                        standings.year,
                        standings.driverId AS championDriverId,
                        drivers.name AS championName
                    FROM seasons_driver_standings standings
                    JOIN drivers
                        ON drivers.id = standings.driverId
                    WHERE standings.championshipWon = 1
                `)

            ]);


            const raceMap = new Map(
                raceCounts.map(row => [
                    Number(row.year),
                    Number(row.raceCount)
                ])
            );


            const driverMap = new Map(
                driverCounts.map(row => [
                    Number(row.year),
                    Number(row.driverCount)
                ])
            );


            const constructorMap = new Map(
                constructorCounts.map(row => [
                    Number(row.year),
                    Number(row.constructorCount)
                ])
            );


            const championMap = new Map(
                champions.map(row => [
                    Number(row.year),
                    {
                        id: row.championDriverId,
                        name: row.championName
                    }
                ])
            );


            return seasons.map(season => {

                const year = Number(season.year);

                return {
                    year,
                    raceCount: raceMap.get(year) || 0,
                    driverCount: driverMap.get(year) || 0,
                    constructorCount: constructorMap.get(year) || 0,
                    champion: championMap.get(year) || null
                };
            });
        });


        res.json(rows);

    } catch (error) {

        sendError(res, error);
    }
});


// ============================================================
// Single Season
// ============================================================

router.get('/api/seasons/:year', async (req, res) => {

    const year = Number(req.params.year);


    if (!Number.isInteger(year)) {

        return res.status(400).json({
            error: 'Invalid season.'
        });
    }


    try {

        const series = String(req.query.series || '').toLowerCase();
        if (['f2', 'f3', 'academy'].includes(series)) {
            const { prefix, sessionType, resultPoints } = juniorSeriesConfiguration(series);
            const data = await withConnection(async connection => {
                const seasonRows = await connection.query(`SELECT year FROM ${prefix}seasons WHERE year = ?`, [year]);
                if (!seasonRows.length) return null;

                const [races, raceSessions, raceResults, featureGridResults, qualifyingResults, qualifyingWinners, officialStandings] = await Promise.all([
                    connection.query(`
                        SELECT r.id, r.round, r.date, r.endDate, r.name, r.code, r.circuitId,
                               c.name AS circuitName, c.placeName
                        FROM ${prefix}races r
                        LEFT JOIN ${prefix}circuits c ON c.id = r.circuitId
                        WHERE r.year = ?
                        ORDER BY r.round
                    `, [year]),
                    connection.query(`
                        SELECT sessions.id AS sessionId, sessions.raceId, sessions.sessionNumber,
                               sessions.name AS sessionName, sessions.cancelled, results.driverId,
                               drivers.name AS winnerName, constructors.name AS constructorName
                        FROM ${prefix}sessions sessions
                        LEFT JOIN ${prefix}session_results results ON results.sessionId = sessions.id AND results.positionNumber = 1
                        LEFT JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
                        LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
                        WHERE sessions.year = ?
                            AND (
                                LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                                OR (
                                    LOWER(CAST(sessions.cancelled AS CHAR)) IN ('1', 'true')
                                    AND LOWER(sessions.name) LIKE '%race%'
                                )
                            )
                        ORDER BY sessions.round, sessions.sessionNumber
                    `, [year]),
                    connection.query(`
                        SELECT sessions.id AS sessionId, results.driverId, results.constructorId,
                               results.positionNumber, results.points AS officialPoints,
                               results.status, results.fastestLap, results.fastestLapTimeMillis,
                               results.polePosition,
                               constructors.name AS constructorName,
                               drivers.name AS driverName, drivers.abbreviation
                        FROM ${prefix}sessions sessions
                        JOIN ${prefix}session_results results ON results.sessionId = sessions.id
                        LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
                        LEFT JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
                        WHERE sessions.year = ?
                            AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                            AND (sessions.cancelled IS NULL OR LOWER(CAST(sessions.cancelled AS CHAR)) NOT IN ('1', 'true'))
                        ORDER BY sessions.round, sessions.sessionNumber, results.positionDisplayOrder
                    `, [year]),
                    connection.query(`
                        SELECT sessions.raceId, results.driverId, results.positionNumber,
                               sessions.sessionNumber
                        FROM ${prefix}sessions sessions
                        JOIN ${prefix}session_results results
                            ON results.sessionId = sessions.id
                        WHERE sessions.year = ?
                            AND LOWER(sessions.name) LIKE '%starting grid%'
                            AND results.positionNumber BETWEEN 1 AND 99
                        ORDER BY sessions.round, sessions.sessionNumber DESC,
                                 results.positionNumber
                    `, [year]),
                    connection.query(`
                        SELECT sessions.raceId, sessions.id AS sessionId,
                               results.driverId, results.positionNumber
                        FROM ${prefix}sessions sessions
                        LEFT JOIN ${prefix}session_results results
                            ON results.sessionId = sessions.id
                        WHERE sessions.year = ?
                            AND LOWER(sessions.name) LIKE '%qualif%'
                        ORDER BY sessions.round, sessions.sessionNumber,
                                 results.positionDisplayOrder
                    `, [year]),
                    connection.query(`
                        SELECT sessions.raceId, results.driverId, results.timeMillis
                        FROM ${prefix}sessions sessions
                        JOIN ${prefix}session_results results
                            ON results.sessionId = sessions.id
                            AND results.positionNumber = 1
                        WHERE sessions.year = ?
                            AND LOWER(sessions.name) LIKE '%qualif%'
                        ORDER BY sessions.round,
                            CASE WHEN results.timeMillis IS NULL THEN 1 ELSE 0 END,
                            results.timeMillis
                    `, [year]),
                    connection.query(`
                        SELECT driverId, MIN(positionNumber) AS positionNumber,
                               MAX(points) AS points, MAX(championshipWon) AS championshipWon,
                               MAX(starts) AS starts, MAX(wins) AS wins, MAX(podiums) AS podiums,
                               MAX(poles) AS poles, MAX(fastestLaps) AS fastestLaps,
                               MAX(retirements) AS retirements
                        FROM ${prefix}season_driver_standings
                        WHERE year = ?
                        GROUP BY driverId
                    `, [year])
                ]);

                const sessionsByRace = new Map();
                for (const session of raceSessions) {
                    if (!sessionsByRace.has(session.raceId)) sessionsByRace.set(session.raceId, []);
                    sessionsByRace.get(session.raceId).push({
                        id: session.sessionId,
                        sessionNumber: Number(session.sessionNumber),
                        name: session.sessionName,
                        cancelled: ['1', 'true'].includes(String(session.cancelled).toLowerCase()),
                        winner: session.winnerName,
                        driverId: session.driverId,
                        constructor: session.constructorName
                    });
                }

                const resultsByDriver = new Map();
                for (const result of raceResults) {
                    const driverId = String(result.driverId);
                    if (!resultsByDriver.has(driverId)) resultsByDriver.set(driverId, {});
                    resultsByDriver.get(driverId)[result.sessionId] = {
                        position: result.positionNumber === null ? null : Number(result.positionNumber),
                        positionText: result.positionNumber || result.status || null,
                        points: result.officialPoints === null ? null : Number(result.officialPoints),
                        constructorId: result.constructorId,
                        fastestLap: ['1', 'true'].includes(String(result.fastestLap).toLowerCase()),
                        polePosition: result.polePosition === null
                            ? null
                            : ['1', 'true'].includes(String(result.polePosition).toLowerCase())
                    };
                }

                const poleDriverByRace = new Map();
                const qualifyingPositionByRaceDriver = new Map();
                const qualifyingSessionsByRace = new Map();
                const classifiedQualifyingDriversByRace = new Map();
                for (const result of qualifyingResults) {
                    const raceId = String(result.raceId);
                    if (!qualifyingSessionsByRace.has(raceId)) {
                        qualifyingSessionsByRace.set(raceId, new Set());
                    }
                    qualifyingSessionsByRace.get(raceId).add(String(result.sessionId));
                    const position = Number(result.positionNumber);
                    if (result.driverId && position >= 1 && position <= 99) {
                        if (!classifiedQualifyingDriversByRace.has(raceId)) {
                            classifiedQualifyingDriversByRace.set(raceId, new Set());
                        }
                        classifiedQualifyingDriversByRace.get(raceId).add(String(result.driverId));
                    }
                }
                for (const result of qualifyingResults) {
                    const raceId = String(result.raceId);
                    const position = Number(result.positionNumber);
                    if (qualifyingSessionsByRace.get(raceId)?.size !== 1) continue;
                    if (!result.driverId || position < 1 || position > 99) continue;
                    qualifyingPositionByRaceDriver.set(`${raceId}:${result.driverId}`, position);
                }
                const featureGridSessionByRace = new Map();
                for (const result of featureGridResults) {
                    const raceId = String(result.raceId);
                    const sessionNumber = Number(result.sessionNumber);
                    if (!featureGridSessionByRace.has(raceId)) {
                        featureGridSessionByRace.set(raceId, sessionNumber);
                    }
                    if (featureGridSessionByRace.get(raceId) !== sessionNumber) continue;
                    const qualifyingSessionCount = qualifyingSessionsByRace.get(raceId)?.size || 0;
                    const hasClassifiedQualifyingResult = classifiedQualifyingDriversByRace
                        .get(raceId)?.has(String(result.driverId));
                    if (qualifyingSessionCount !== 1 &&
                        (qualifyingSessionCount === 0 || hasClassifiedQualifyingResult)) {
                        qualifyingPositionByRaceDriver.set(
                            `${raceId}:${result.driverId}`,
                            Number(result.positionNumber)
                        );
                    }
                    if (Number(result.positionNumber) === 1) {
                        poleDriverByRace.set(result.raceId, result.driverId);
                    }
                }
                for (const result of qualifyingWinners) {
                    if (!poleDriverByRace.has(result.raceId)) {
                        poleDriverByRace.set(result.raceId, result.driverId);
                    }
                }

                let officialConstructorStandings = [];
                try {
                    officialConstructorStandings = await connection.query(`
                        SELECT constructorId, positionNumber, points, championshipWon
                        FROM ${prefix}season_constructor_standings
                        WHERE year = ?
                    `, [year]);
                } catch (error) {
                    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
                }

                const sessionContextById = new Map();
                for (const [raceId, sessions] of sessionsByRace) {
                    sessions.forEach((session, sessionIndex) => {
                        sessionContextById.set(session.id, {
                            raceId,
                            type: sessionType(session, sessionIndex, sessions.length, year)
                        });
                    });
                }

                const fastestLapDriverBySession = eligibleFastestLapDrivers(raceResults);

                const constructorsById = new Map();
                const driversById = new Map();
                for (const result of raceResults) {
                    const context = sessionContextById.get(result.sessionId);
                    if (!context) continue;
                    const driverId = String(result.driverId);
                    if (!driversById.has(driverId)) {
                        driversById.set(driverId, {
                            driverId: result.driverId,
                            name: result.driverName || result.driverId,
                            abbreviation: result.abbreviation,
                            constructorId: result.constructorId,
                            constructor: result.constructorName,
                            points: 0,
                            starts: 0,
                            wins: 0,
                            podiums: 0,
                            poles: 0,
                            fastestLaps: 0,
                            retirements: 0,
                            finishCounts: [],
                            raceResults: resultsByDriver.get(driverId) || {}
                        });
                    }
                    const driver = driversById.get(driverId);
                    driver.constructorId = result.constructorId || driver.constructorId;
                    driver.constructor = result.constructorName || driver.constructor;
                    driver.starts += 1;
                    const position = Number(result.positionNumber || 0);
                    const { polePosition, fastestLap } = resolveSeasonAwards(
                        result,
                        context,
                        poleDriverByRace,
                        fastestLapDriverBySession
                    );
                    result.fastestLap = fastestLap;
                    const displayedResult = driver.raceResults[result.sessionId];
                    if (displayedResult) {
                        displayedResult.polePosition = polePosition;
                        displayedResult.fastestLap = fastestLap;
                    }
                    const points = resultPoints(result, context.type, year, polePosition);
                    if (displayedResult) displayedResult.points = points;
                    driver.points += points;
                    if (position === 1) driver.wins += 1;
                    if (position > 0 && position <= 3) driver.podiums += 1;
                    if (polePosition) driver.poles += 1;
                    if (fastestLap) driver.fastestLaps += 1;
                    if (/DNF|RET/i.test(String(result.status || ''))) driver.retirements += 1;
                    if (position > 0) {
                        driver.finishCounts[position] = Number(driver.finishCounts[position] || 0) + 1;
                    }

                    if (!result.constructorId) continue;
                    const constructorId = String(result.constructorId);
                    if (!constructorsById.has(constructorId)) {
                        constructorsById.set(constructorId, {
                            constructorId: result.constructorId,
                            name: result.constructorName || result.constructorId,
                            points: 0,
                            finishCounts: [],
                            raceResults: {}
                        });
                    }
                    const constructor = constructorsById.get(constructorId);
                    const constructorPoints = resultPoints(result, context.type, year, polePosition);
                    constructor.points += constructorPoints;
                    constructor.raceResults[result.sessionId] =
                        Number(constructor.raceResults[result.sessionId] || 0) + constructorPoints;
                    if (position > 0) {
                        constructor.finishCounts[position] = Number(constructor.finishCounts[position] || 0) + 1;
                    }
                }

                const officialConstructorById = new Map(
                    officialConstructorStandings.map(row => [String(row.constructorId), row])
                );
                const constructorChampionship = [...constructorsById.values()]
                    .sort((first, second) => {
                        const firstOfficial = officialConstructorById.get(String(first.constructorId));
                        const secondOfficial = officialConstructorById.get(String(second.constructorId));
                        if (firstOfficial && secondOfficial) {
                            return Number(firstOfficial.positionNumber) - Number(secondOfficial.positionNumber);
                        }
                        if (firstOfficial) return -1;
                        if (secondOfficial) return 1;
                        if (second.points !== first.points) return second.points - first.points;
                        for (let position = 1; position <= 30; position += 1) {
                            const difference = Number(second.finishCounts[position] || 0) -
                                Number(first.finishCounts[position] || 0);
                            if (difference) return difference;
                        }
                        return first.name.localeCompare(second.name);
                    })
                    .map((constructor, index) => {
                        const official = officialConstructorById.get(String(constructor.constructorId));
                        return {
                        position: official ? Number(official.positionNumber) : index + 1,
                        constructorId: constructor.constructorId,
                        name: constructor.name,
                        points: official ? Number(official.points) : constructor.points,
                        champion: official
                            ? ['1', 'true'].includes(String(official.championshipWon).toLowerCase())
                            : index === 0,
                        raceResults: constructor.raceResults
                    };
                    });

                const officialByDriver = new Map(
                    officialStandings.map(row => [String(row.driverId), row])
                );
                const championship = [...driversById.values()]
                    .sort((first, second) => {
                        const firstOfficial = officialByDriver.get(String(first.driverId));
                        const secondOfficial = officialByDriver.get(String(second.driverId));
                        const firstPoints = firstOfficial ? Number(firstOfficial.points) : first.points;
                        const secondPoints = secondOfficial ? Number(secondOfficial.points) : second.points;
                        if (secondPoints !== firstPoints) return secondPoints - firstPoints;
                        if (firstOfficial && secondOfficial) {
                            return Number(firstOfficial.positionNumber) - Number(secondOfficial.positionNumber);
                        }
                        for (let position = 1; position <= 30; position += 1) {
                            const difference = Number(second.finishCounts[position] || 0) -
                                Number(first.finishCounts[position] || 0);
                            if (difference) return difference;
                        }
                        return first.name.localeCompare(second.name);
                    })
                    .map((driver, index) => {
                        const official = officialByDriver.get(String(driver.driverId));
                        return {
                        position: index + 1,
                        driverId: driver.driverId,
                        name: driver.name,
                        abbreviation: driver.abbreviation,
                        constructorId: driver.constructorId,
                        constructor: driver.constructor,
                        points: official ? Number(official.points) : driver.points,
                        champion: official
                            ? ['1', 'true'].includes(String(official.championshipWon).toLowerCase())
                            : index === 0,
                        starts: official ? Number(official.starts) : driver.starts,
                        wins: official ? Number(official.wins) : driver.wins,
                        podiums: official ? Number(official.podiums) : driver.podiums,
                        poles: official ? Number(official.poles) : driver.poles,
                        fastestLaps: official ? Number(official.fastestLaps) : driver.fastestLaps,
                        retirements: official ? Number(official.retirements) : driver.retirements,
                        raceResults: driver.raceResults
                    };
                    });

                const comparisonChampionship = championship.map(driver => {
                    const raceResults = {};
                    races.forEach(race => {
                        const sessions = (sessionsByRace.get(race.id) || []).filter(session => !session.cancelled);
                        const typedSessions = sessions.map((session, index) => ({
                            ...session,
                            type: sessionType(session, index, sessions.length, year)
                        }));
                        const feature = [...typedSessions].reverse().find(session => session.type === 'F')
                            || typedSessions[typedSessions.length - 1];
                        const sprintSessions = typedSessions.filter(session => session.type === 'S');
                        const sprintResults = sprintSessions
                            .map(session => driver.raceResults[session.id])
                            .filter(Boolean);
                        const featureResult = feature ? driver.raceResults[feature.id] : null;
                        if (!sprintResults.length && !featureResult) return;
                        raceResults[race.round] = {
                            ...(featureResult || sprintResults[0]),
                            points: Number(featureResult?.points || 0),
                            sprintPoints: sprintResults.reduce((sum, result) => sum + Number(result.points || 0), 0),
                            sprintPosition: sprintResults[0]?.position ?? null,
                            sprintFastestLap: Boolean(sprintResults[0]?.fastestLap),
                            sprintResults: sprintResults.map(result => ({
                                position: result.position,
                                fastestLap: Boolean(result.fastestLap),
                                constructorId: result.constructorId
                            })),
                            qualifyingPosition: qualifyingPositionByRaceDriver.get(
                                `${race.id}:${driver.driverId}`
                            ) ?? null
                        };
                    });
                    return { ...driver, raceResults };
                });

                return {
                    year,
                    summary: {
                        rounds: races.length,
                        drivers: championship.length,
                        teams: constructorChampionship.length,
                        first: championship[0] || null,
                        second: championship[1] || null,
                        third: championship[2] || null
                    },
                    championship,
                    driverChampionship: comparisonChampionship,
                    constructorChampionship,
                    calendar: races.map(race => ({
                        id: race.id,
                        round: Number(race.round),
                        date: race.date,
                        endDate: race.endDate,
                        name: race.name,
                        officialName: race.name,
                        code: race.code,
                        circuitId: race.circuitId,
                        circuitName: race.circuitName,
                        placeName: race.placeName,
                        poleDriverId: poleDriverByRace.get(race.id) || null,
                        sessions: sessionsByRace.get(race.id) || []
                    }))
                };
            });

            if (!data) return res.status(404).json({ error: 'Season not found.' });
            return res.json(data);
        }

        const data = await withConnection(async connection => {

            // ------------------------------------------------
            // Check season
            // ------------------------------------------------

            const seasonRows = await connection.query(`
                SELECT year
                FROM seasons
                WHERE year = ?
            `, [year]);


            if (!seasonRows.length) {
                return null;
            }


            // ------------------------------------------------
            // Load the season data
            // ------------------------------------------------

            const [
                races,
                driverStandings,
                constructorStandings,
                driverResults,
                sprintResults,
                constructorResults
            ] = await Promise.all([

                // --------------------------------------------
                // Race calendar
                // --------------------------------------------

                connection.query(`
                    SELECT
                        r.id,
                        r.year,
                        r.round,
                        r.date,
                        COALESCE(NULLIF(gp.fullName, ''), r.officialName) AS name,
                        gp.shortName,
                        r.officialName,
                        r.grandPrixId,
                        r.circuitId,
                        r.laps,
                        r.distance,
                        COALESCE(NULLIF(c.fullName, ''), c.name) AS circuitName,
                        c.latitude AS circuitLatitude,
                        c.longitude AS circuitLongitude
                    FROM races r
                    LEFT JOIN grands_prix gp
                        ON gp.id = r.grandPrixId
                    LEFT JOIN circuits c
                        ON c.id = r.circuitId
                    WHERE r.year = ?
                    ORDER BY r.round
                `, [year]),


                // --------------------------------------------
                // Driver championship standings
                // --------------------------------------------

                connection.query(`
                    SELECT
                        s.positionNumber,
                        s.positionText,
                        s.driverId,
                        s.points,
                        s.championshipWon,

                        d.name AS driverName,
                        d.abbreviation

                    FROM seasons_driver_standings s

                    JOIN drivers d
                        ON d.id = s.driverId

                    WHERE s.year = ?

                    ORDER BY
                        s.positionDisplayOrder,
                        s.positionNumber
                `, [year]),


                // --------------------------------------------
                // Constructor championship standings
                // --------------------------------------------

                connection.query(`
                    SELECT
                        s.positionNumber,
                        s.positionText,
                        s.constructorId,
                        s.points,
                        s.championshipWon,

                        k.name AS constructorName

                    FROM seasons_constructor_standings s

                    JOIN constructors k
                        ON k.id = s.constructorId

                    WHERE s.year = ?

                    ORDER BY
                        s.positionDisplayOrder,
                        s.positionNumber
                `, [year]),


                // --------------------------------------------
                // Driver points per race
                // --------------------------------------------

                connection.query(`
                    SELECT
                        rr.round,
                        rr.driverId,
                        rr.constructorId,
                        d.name AS driverName,
                        d.abbreviation,
                        rr.positionNumber,
                        rr.positionText,
                        rr.qualificationPositionNumber,
                        rr.reasonRetired,
                        rr.points,
                        rr.fastestLap,
                        rr.polePosition

                    FROM races_race_results rr

                    JOIN drivers d
                        ON d.id = rr.driverId

                    WHERE rr.year = ?

                    ORDER BY
                        rr.driverId,
                        rr.round
                `, [year]),


                // --------------------------------------------
                // Sprint results and points
                // --------------------------------------------

                connection.query(`
                    SELECT
                        round,
                        driverId,
                        constructorId,
                        positionNumber,
                        positionText,
                        points
                    FROM races_sprint_race_results
                    WHERE year = ?
                    ORDER BY driverId, round
                `, [year]),


                // --------------------------------------------
                // Constructor points per race
                // --------------------------------------------

                connection.query(`
                    SELECT
                        rr.round,
                        rr.constructorId,
                        k.name AS constructorName,
                        SUM(rr.points) AS points

                    FROM races_race_results rr

                    JOIN constructors k
                        ON k.id = rr.constructorId

                    WHERE rr.year = ?

                    GROUP BY
                        rr.round,
                        rr.constructorId,
                        k.name

                    ORDER BY
                        rr.constructorId,
                        rr.round
                `, [year])

            ]);


            // ------------------------------------------------
            // Calculate basic season information
            // ------------------------------------------------

            const totalRaces = races.length;


            const totalLaps = races.reduce(
                (sum, race) =>
                    sum + Number(race.laps || 0),
                0
            );


            // ------------------------------------------------
            // Driver championship podium
            // ------------------------------------------------

            const driverPodium =
                driverStandings
                    .slice(0, 3)
                    .map((driver, index) => ({
                        position: index + 1,
                        driverId: driver.driverId,
                        name: driver.driverName,
                        points: Number(driver.points || 0)
                    }));


            // ------------------------------------------------
            // Constructor championship podium
            // ------------------------------------------------

            const constructorPodium =
                constructorStandings
                    .slice(0, 3)
                    .map((constructor, index) => ({
                        position: index + 1,
                        constructorId: constructor.constructorId,
                        name: constructor.constructorName,
                        points: Number(constructor.points || 0)
                    }));


            // ------------------------------------------------
            // Driver race points
            // ------------------------------------------------

            const driverRaceMap = new Map();


            for (const row of driverResults) {

                const driverId = String(row.driverId);

                if (!driverRaceMap.has(driverId)) {

                    driverRaceMap.set(driverId, {});
                }


                driverRaceMap.get(driverId)[Number(row.round)] = {
                    constructorId: row.constructorId,
                    points: Number(row.points || 0),
                    position: row.positionNumber === null
                        ? null
                        : Number(row.positionNumber),
                    positionText: row.positionText,
                    qualifyingPosition: row.qualificationPositionNumber === null
                        ? null
                        : Number(row.qualificationPositionNumber),
                    reasonRetired: row.reasonRetired,
                    fastestLap: Boolean(row.fastestLap),
                    polePosition: Boolean(row.polePosition),
                    sprintPoints: 0,
                    sprintPosition: null,
                    sprintPositionText: null
                };
            }


            for (const row of sprintResults) {
                const driverId = String(row.driverId);
                const round = Number(row.round);

                if (!driverRaceMap.has(driverId)) driverRaceMap.set(driverId, {});
                if (!driverRaceMap.get(driverId)[round]) {
                    driverRaceMap.get(driverId)[round] = {
                        constructorId: row.constructorId,
                        points: 0,
                        position: null,
                        positionText: null,
                        qualifyingPosition: null,
                        reasonRetired: null,
                        fastestLap: false,
                        polePosition: false,
                        sprintPoints: 0,
                        sprintPosition: null,
                        sprintPositionText: null
                    };
                }

                const result = driverRaceMap.get(driverId)[round];
                result.sprintConstructorId = row.constructorId;
                result.sprintPoints = Number(row.points || 0);
                result.sprintPosition = row.positionNumber === null
                    ? null
                    : Number(row.positionNumber);
                result.sprintPositionText = row.positionText;
            }


            const driverChampionship =
                driverStandings.map(driver => {

                    const driverId =
                        String(driver.driverId);

                    return {
                        position:
                            Number(driver.positionNumber || 0),

                        positionText:
                            driver.positionText,

                        driverId:
                            driver.driverId,

                        name:
                            driver.driverName,

                        abbreviation:
                            driver.abbreviation,

                        points:
                            Number(driver.points || 0),

                        championshipWon:
                            Boolean(driver.championshipWon),

                        raceResults:
                            driverRaceMap.get(driverId) || {}
                    };
                });


            // ------------------------------------------------
            // Constructor race points
            // ------------------------------------------------

            const constructorRaceMap = new Map();


            for (const row of constructorResults) {

                const constructorId =
                    String(row.constructorId);

                if (!constructorRaceMap.has(constructorId)) {

                    constructorRaceMap.set(
                        constructorId,
                        {}
                    );
                }


                constructorRaceMap.get(constructorId)[Number(row.round)] = {
                    points: Number(row.points || 0),
                    sprintPoints: 0
                };
            }


            for (const row of sprintResults) {
                if (!row.constructorId) continue;
                const constructorId = String(row.constructorId);
                const round = Number(row.round);

                if (!constructorRaceMap.has(constructorId)) constructorRaceMap.set(constructorId, {});
                if (!constructorRaceMap.get(constructorId)[round]) {
                    constructorRaceMap.get(constructorId)[round] = { points: 0, sprintPoints: 0 };
                }

                constructorRaceMap.get(constructorId)[round].sprintPoints += Number(row.points || 0);
            }


            const constructorChampionship =
                constructorStandings.map(constructor => {

                    const constructorId =
                        String(
                            constructor.constructorId
                        );


                    return {
                        position:
                            Number(
                                constructor.positionNumber || 0
                            ),

                        positionText:
                            constructor.positionText,

                        constructorId:
                            constructor.constructorId,

                        name:
                            constructor.constructorName,

                        points:
                            Number(
                                constructor.points || 0
                            ),

                        championshipWon:
                            Boolean(
                                constructor.championshipWon
                            ),

                        raceResults:
                            constructorRaceMap.get(
                                constructorId
                            ) || {}
                    };
                });


            // ------------------------------------------------
            // Return complete season object
            // ------------------------------------------------

            return {

                year,

                summary: {
                    races: totalRaces,
                    laps: totalLaps,

                    first: driverPodium[0] || null,
                    second: driverPodium[1] || null,
                    third: driverPodium[2] || null
                },

                driverChampionship,

                constructorChampionship,

                calendar: races.map(race => ({
                    id: race.id,
                    round: Number(race.round),
                    date: race.date,
                    name: race.name,
                    shortName: race.shortName,
                    officialName: race.officialName,
                    grandPrixId: race.grandPrixId,
                    circuitId: race.circuitId,
                    circuitName: race.circuitName,
                    latitude: race.circuitLatitude === null ? null : Number(race.circuitLatitude),
                    longitude: race.circuitLongitude === null ? null : Number(race.circuitLongitude),
                    laps: Number(race.laps || 0),
                    distance: Number(race.distance || 0)
                }))
            };
        });


        if (!data) {

            return res.status(404).json({
                error: 'Season not found.'
            });
        }


        res.json(data);

    } catch (error) {

        sendError(res, error);
    }
});

module.exports = router;
module.exports.eligibleFastestLapDrivers = eligibleFastestLapDrivers;
module.exports.isDisqualified = isDisqualified;
module.exports.resolveSeasonAwards = resolveSeasonAwards;
module.exports.f2ResultPoints = f2ResultPoints;
module.exports.f2SessionType = f2SessionType;
module.exports.f3ResultPoints = f3ResultPoints;
module.exports.f3SessionType = f3SessionType;
module.exports.academySessionType = academySessionType;
