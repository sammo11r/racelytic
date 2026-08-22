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
                k.name AS constructorName,
                MIN(sec.year) AS firstYear,
                MAX(sec.year) AS lastYear,
                GROUP_CONCAT(DISTINCT em.id ORDER BY em.name SEPARATOR '||') AS engineManufacturerIds,
                GROUP_CONCAT(DISTINCT em.name ORDER BY em.name SEPARATOR '||') AS engineManufacturers,
                GROUP_CONCAT(DISTINCT e.fullName ORDER BY e.fullName SEPARATOR '||') AS engines
            FROM chassis ch
            LEFT JOIN constructors k ON k.id = ch.constructorId
            LEFT JOIN seasons_entrants_chassis sec ON sec.chassisId = ch.id
            LEFT JOIN engine_manufacturers em ON em.id = sec.engineManufacturerId
            LEFT JOIN seasons_entrants_engines see
                ON see.year = sec.year AND see.entrantId = sec.entrantId
                AND see.constructorId = sec.constructorId
                AND see.engineManufacturerId = sec.engineManufacturerId
            LEFT JOIN engines e ON e.id = see.engineId
            GROUP BY ch.id, ch.constructorId, ch.name, ch.fullName, k.name
            ORDER BY COALESCE(MAX(sec.year), 0) DESC, ch.fullName
        `));
        res.json(rows.map(row => ({
            ...row,
            firstYear: row.firstYear === null ? null : Number(row.firstYear),
            lastYear: row.lastYear === null ? null : Number(row.lastYear),
            engineManufacturerIds: row.engineManufacturerIds ? row.engineManufacturerIds.split('||') : [],
            engineManufacturers: row.engineManufacturers ? row.engineManufacturers.split('||') : [],
            engines: row.engines ? row.engines.split('||') : []
        })));
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;
