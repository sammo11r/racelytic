const express = require('express');
const { withConnection, sendError } = require('../route-helpers');

const router = express.Router();

router.get('/api/chassis', async (req, res) => {
    try {
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
