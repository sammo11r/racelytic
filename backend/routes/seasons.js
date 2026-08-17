const express = require('express');
const { withConnection, sendError } = require('../route-helpers');

const router = express.Router();

// ============================================================
// Seasons List
// ============================================================

router.get('/api/seasons', async (req, res) => {

    try {

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
                        r.officialName,
                        r.grandPrixId,
                        r.circuitId,
                        r.laps,
                        r.distance,
                        c.name AS circuitName,
                        c.latitude AS circuitLatitude,
                        c.longitude AS circuitLongitude
                    FROM races r
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
