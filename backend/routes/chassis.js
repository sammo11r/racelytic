const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const f3ChassisSpecifications = require('../../data/f3-chassis-specifications.json');
const f2ChassisSpecifications = require('../../data/f2-chassis-specifications.json');
const academyChassisSpecifications = require('../../data/academy-chassis-specifications.json');

const router = express.Router();

router.get('/api/chassis', async (req, res) => {
    try {
        if (String(req.query.series || '').toLowerCase() === 'academy') {
            const rows = await withConnection(connection => connection.query(`
                SELECT ch.id, ch.name,
                    MIN(entries.year) AS firstYear, MAX(entries.year) AS lastYear,
                    GROUP_CONCAT(DISTINCT entries.year ORDER BY entries.year SEPARATOR '||') AS years,
                    GROUP_CONCAT(DISTINCT engines.id ORDER BY engines.name SEPARATOR '||') AS engineIds,
                    GROUP_CONCAT(DISTINCT engines.name ORDER BY engines.name SEPARATOR '||') AS engines,
                    COUNT(entries.raceId) AS totalEntries,
                    COUNT(DISTINCT entries.raceId) AS totalWeekends,
                    COUNT(DISTINCT entries.constructorId) AS totalTeams,
                    COUNT(DISTINCT entries.driverId) AS totalDrivers
                FROM fa_chassis ch
                LEFT JOIN fa_entries entries ON entries.chassisId = ch.id
                LEFT JOIN fa_engines engines ON engines.id = entries.engineId
                GROUP BY ch.id, ch.name
                ORDER BY COALESCE(MAX(entries.year), 0) DESC, ch.name
            `));
            const specifications = new Map(academyChassisSpecifications.map(chassis => [chassis.id, chassis]));
            return res.json(rows.map(row => ({
                ...(specifications.get(row.id) || {}),
                id: row.id,
                name: specifications.get(row.id)?.name || row.name,
                firstYear: row.firstYear === null ? null : Number(row.firstYear),
                lastYear: row.lastYear === null ? null : Number(row.lastYear),
                years: row.years ? row.years.split('||').map(Number) : [],
                engineIds: row.engineIds ? row.engineIds.split('||') : [],
                engines: row.engines ? row.engines.split('||') : [],
                totalEntries: Number(row.totalEntries || 0),
                totalWeekends: Number(row.totalWeekends || 0),
                totalTeams: Number(row.totalTeams || 0),
                totalDrivers: Number(row.totalDrivers || 0)
            })));
        }
        if (String(req.query.series || '').toLowerCase() === 'f2') {
            const rows = await withConnection(connection => connection.query(`
                SELECT ch.id, ch.name,
                    MIN(entries.year) AS firstYear,
                    MAX(entries.year) AS lastYear,
                    GROUP_CONCAT(DISTINCT entries.year ORDER BY entries.year SEPARATOR '||') AS years,
                    GROUP_CONCAT(DISTINCT engines.id ORDER BY engines.name SEPARATOR '||') AS engineIds,
                    GROUP_CONCAT(DISTINCT engines.name ORDER BY engines.name SEPARATOR '||') AS engines,
                    COUNT(entries.raceId) AS totalEntries,
                    COUNT(DISTINCT entries.raceId) AS totalWeekends,
                    COUNT(DISTINCT entries.constructorId) AS totalTeams,
                    COUNT(DISTINCT entries.driverId) AS totalDrivers
                FROM f2_chassis ch
                LEFT JOIN f2_entries entries ON entries.chassisId = ch.id
                LEFT JOIN f2_engines engines ON engines.id = entries.engineId
                GROUP BY ch.id, ch.name
                ORDER BY COALESCE(MAX(entries.year), 0), ch.name
            `));
            const specifications = new Map(f2ChassisSpecifications.map(chassis => [chassis.id, chassis]));
            return res.json(rows.map(row => ({
                ...(specifications.get(row.id) || {}),
                id: row.id,
                name: specifications.get(row.id)?.name || row.name,
                firstYear: row.firstYear === null ? null : Number(row.firstYear),
                lastYear: row.lastYear === null ? null : Number(row.lastYear),
                years: row.years ? row.years.split('||').map(Number) : [],
                engineIds: row.engineIds ? row.engineIds.split('||') : [],
                engines: row.engines ? row.engines.split('||') : [],
                totalEntries: Number(row.totalEntries || 0),
                totalWeekends: Number(row.totalWeekends || 0),
                totalTeams: Number(row.totalTeams || 0),
                totalDrivers: Number(row.totalDrivers || 0)
            })));
        }
        if (String(req.query.series || '').toLowerCase() === 'f3') {
            const rows = await withConnection(connection => connection.query(`
                SELECT ch.id, ch.name,
                    MIN(entries.year) AS firstYear,
                    MAX(entries.year) AS lastYear,
                    GROUP_CONCAT(DISTINCT entries.year ORDER BY entries.year SEPARATOR '||') AS years,
                    GROUP_CONCAT(DISTINCT engines.id ORDER BY engines.name SEPARATOR '||') AS engineIds,
                    GROUP_CONCAT(DISTINCT engines.name ORDER BY engines.name SEPARATOR '||') AS engines,
                    COUNT(entries.raceId) AS totalEntries,
                    COUNT(DISTINCT entries.raceId) AS totalWeekends,
                    COUNT(DISTINCT entries.constructorId) AS totalTeams,
                    COUNT(DISTINCT entries.driverId) AS totalDrivers
                FROM f3_chassis ch
                LEFT JOIN (
                    SELECT raceId, year, driverId, constructorId, engineId,
                        CASE WHEN chassisId IN ('dallara-f3-2020', 'dallara-f3-2021')
                            THEN 'dallara-f3-2019' ELSE chassisId END AS chassisId
                    FROM f3_entries
                ) entries ON entries.chassisId = ch.id
                LEFT JOIN f3_engines engines ON engines.id = entries.engineId
                WHERE ch.id NOT IN ('dallara-f3-2020', 'dallara-f3-2021')
                GROUP BY ch.id, ch.name
                ORDER BY COALESCE(MAX(entries.year), 0) DESC, ch.name
            `));
            const specifications = new Map(f3ChassisSpecifications.map(chassis => [chassis.id, chassis]));
            return res.json(rows.map(row => ({
                ...(specifications.get(row.id) || {}),
                id: row.id,
                name: row.name,
                firstYear: row.firstYear === null ? null : Number(row.firstYear),
                lastYear: row.lastYear === null ? null : Number(row.lastYear),
                years: row.years ? row.years.split('||').map(Number) : [],
                engineIds: row.engineIds ? row.engineIds.split('||') : [],
                engines: row.engines ? row.engines.split('||') : [],
                totalEntries: Number(row.totalEntries || 0),
                totalWeekends: Number(row.totalWeekends || 0),
                totalTeams: Number(row.totalTeams || 0),
                totalDrivers: Number(row.totalDrivers || 0)
            })));
        }
        const rows = await withConnection(connection => connection.query(`
            SELECT ch.id, ch.constructorId, ch.name, ch.fullName,
                k.name AS constructorName, current.year AS currentSeason,
                career.seasonYears, career.firstYear, career.lastYear,
                career.engineManufacturerIds, career.engineManufacturers, career.engines,
                COALESCE(performance.totalRaceStarts, 0) AS totalRaceStarts,
                COALESCE(performance.totalRaceWins, 0) AS totalRaceWins,
                COALESCE(performance.totalPodiums, 0) AS totalPodiums,
                COALESCE(performance.totalPolePositions, 0) AS totalPolePositions,
                COALESCE(performance.totalPoints, 0) AS totalPoints,
                COALESCE(performance.performanceSeasons, 0) AS performanceSeasons
            FROM chassis ch
            LEFT JOIN constructors k ON k.id = ch.constructorId
            CROSS JOIN (SELECT MAX(year) AS year FROM races) current
            LEFT JOIN (
                SELECT sec.chassisId,
                    GROUP_CONCAT(DISTINCT sec.year ORDER BY sec.year DESC SEPARATOR ',') AS seasonYears,
                    MIN(sec.year) AS firstYear, MAX(sec.year) AS lastYear,
                    GROUP_CONCAT(DISTINCT em.id ORDER BY em.name SEPARATOR '||') AS engineManufacturerIds,
                    GROUP_CONCAT(DISTINCT em.name ORDER BY em.name SEPARATOR '||') AS engineManufacturers,
                    GROUP_CONCAT(DISTINCT e.fullName ORDER BY e.fullName SEPARATOR '||') AS engines
                FROM seasons_entrants_chassis sec
                LEFT JOIN engine_manufacturers em ON em.id = sec.engineManufacturerId
                LEFT JOIN seasons_entrants_engines see
                    ON see.year = sec.year AND see.entrantId = sec.entrantId
                    AND see.constructorId = sec.constructorId
                    AND see.engineManufacturerId = sec.engineManufacturerId
                LEFT JOIN engines e ON e.id = see.engineId
                GROUP BY sec.chassisId
            ) career ON career.chassisId = ch.id
            LEFT JOIN (
                SELECT singleChassis.chassisId, COUNT(DISTINCT season.year) AS performanceSeasons,
                    SUM(season.totalRaceStarts) AS totalRaceStarts,
                    SUM(season.totalRaceWins) AS totalRaceWins,
                    SUM(season.totalPodiums) AS totalPodiums,
                    SUM(season.totalPolePositions) AS totalPolePositions,
                    SUM(season.totalPoints) AS totalPoints
                FROM (
                    SELECT year, constructorId, MIN(chassisId) AS chassisId
                    FROM seasons_entrants_chassis
                    GROUP BY year, constructorId
                    HAVING COUNT(DISTINCT chassisId) = 1
                ) singleChassis
                JOIN seasons_constructors season
                    ON season.year = singleChassis.year AND season.constructorId = singleChassis.constructorId
                GROUP BY singleChassis.chassisId
            ) performance ON performance.chassisId = ch.id
            ORDER BY COALESCE(career.lastYear, 0) DESC, ch.fullName
        `));
        res.json(rows.map(row => ({
            ...row,
            firstYear: row.firstYear === null ? null : Number(row.firstYear),
            lastYear: row.lastYear === null ? null : Number(row.lastYear),
            currentSeason: Number(row.currentSeason) || null,
            seasons: String(row.seasonYears || '').split(',').map(Number).filter(year => year > 0),
            engineManufacturerIds: row.engineManufacturerIds ? row.engineManufacturerIds.split('||') : [],
            engineManufacturers: row.engineManufacturers ? row.engineManufacturers.split('||') : [],
            engines: row.engines ? row.engines.split('||') : [],
            totalRaceStarts: Number(row.totalRaceStarts || 0),
            totalRaceWins: Number(row.totalRaceWins || 0),
            totalPodiums: Number(row.totalPodiums || 0),
            totalPolePositions: Number(row.totalPolePositions || 0),
            totalPoints: Number(row.totalPoints || 0),
            performanceSeasons: Number(row.performanceSeasons || 0)
        })));
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;
