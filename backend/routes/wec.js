const express = require('express');
const { withConnection, sendError } = require('../route-helpers');
const { shapeClassification } = require('../wec-data');

const router = express.Router();

function seasonSummary(row) {
    return {
        id: row.id,
        year: Number(row.year),
        name: row.name,
        startDate: row.startDate,
        endDate: row.endDate,
        status: row.status,
        eventCount: Number(row.eventCount || 0),
        classCount: Number(row.classCount || 0),
        entryCount: Number(row.entryCount || 0),
        champion: row.champion || null
    };
}

function shapeEvent(row) {
    return {
        ...row,
        round: Number(row.round),
        scheduledMinutes: row.scheduledMinutes === null ? null : Number(row.scheduledMinutes),
        scheduledDistanceKm: row.scheduledDistanceKm === null ? null : Number(row.scheduledDistanceKm),
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
        length: row.length === null ? null : Number(row.length),
        turns: row.turns === null ? null : Number(row.turns)
    };
}

router.get('/api/wec/seasons', async (req, res) => {
    try {
        const rows = await withConnection(async connection => {
            const [seasons, champions] = await Promise.all([
                connection.query(`
                    SELECT seasons.id, seasons.year, seasons.name, seasons.startDate, seasons.endDate, seasons.status,
                        COALESCE(eventCounts.eventCount, 0) AS eventCount,
                        COALESCE(classCounts.classCount, 0) AS classCount,
                        COALESCE(entryCounts.entryCount, 0) AS entryCount
                    FROM wec_seasons seasons
                    LEFT JOIN (
                        SELECT seasonId, COUNT(*) AS eventCount
                        FROM wec_events GROUP BY seasonId
                    ) eventCounts ON eventCounts.seasonId = seasons.id
                    LEFT JOIN (
                        SELECT seasonId, COUNT(*) AS classCount
                        FROM wec_classes GROUP BY seasonId
                    ) classCounts ON classCounts.seasonId = seasons.id
                    LEFT JOIN (
                        SELECT seasonId, COUNT(*) AS entryCount
                        FROM wec_competitors GROUP BY seasonId
                    ) entryCounts ON entryCounts.seasonId = seasons.id
                    ORDER BY seasons.year DESC
                `),
                connection.query(`
                    SELECT championships.seasonId, championships.entityType, standings.entityId,
                        COALESCE(manufacturers.name, standingTeams.name) AS entityName
                    FROM wec_championships championships
                    JOIN wec_standings standings ON standings.championshipId = championships.id AND standings.championshipWon = 1
                    LEFT JOIN wec_manufacturers manufacturers
                        ON championships.entityType = 'manufacturer' AND manufacturers.id = standings.entityId
                    LEFT JOIN wec_teams standingTeams
                        ON championships.entityType = 'team' AND standingTeams.id = standings.entityId
                    WHERE championships.id LIKE '%-hypercar-manufacturers'
                        OR championships.id LIKE '%-hypercar-teams'
                        OR championships.id LIKE '%-lmp1-manufacturers'
                        OR championships.id LIKE '%-lmp1-teams'
                    ORDER BY championships.seasonId,
                        CASE
                            WHEN championships.id LIKE '%-hypercar-manufacturers' THEN 1
                            WHEN championships.id LIKE '%-hypercar-teams' THEN 2
                            WHEN championships.id LIKE '%-lmp1-manufacturers' THEN 3
                            ELSE 4
                        END
                `)
            ]);
            const championBySeason = new Map();
            for (const row of champions) {
                if (!championBySeason.has(row.seasonId) && row.entityName) {
                    championBySeason.set(row.seasonId, {
                        id: row.entityId,
                        name: row.entityName,
                        type: row.entityType === 'manufacturer' ? 'manufacturers' : 'teams'
                    });
                }
            }
            return seasons.map(row => seasonSummary({ ...row, champion: championBySeason.get(row.id) || null }));
        });
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        res.json(rows);
    } catch (error) { sendError(res, error); }
});

router.get('/api/wec/home', async (req, res) => {
    try {
        const data = await withConnection(async connection => {
            const seasonRows = await connection.query(`
                SELECT seasons.id, seasons.year, seasons.name, seasons.startDate, seasons.endDate, seasons.status,
                    COUNT(DISTINCT events.id) AS eventCount, COUNT(DISTINCT classes.id) AS classCount,
                    COUNT(DISTINCT competitors.id) AS entryCount,
                    (SELECT COUNT(*) FROM wec_seasons) AS archiveSeasonCount
                FROM wec_seasons seasons
                LEFT JOIN wec_events events ON events.seasonId = seasons.id
                LEFT JOIN wec_classes classes ON classes.seasonId = seasons.id
                LEFT JOIN wec_competitors competitors ON competitors.seasonId = seasons.id
                GROUP BY seasons.id, seasons.year, seasons.name, seasons.startDate, seasons.endDate, seasons.status
                ORDER BY seasons.year DESC LIMIT 1
            `);
            if (!seasonRows.length) return null;
            const season = seasonRows[0];
            const [eventRows, championRows] = await Promise.all([
                connection.query(`
                    SELECT events.id, events.seasonId, events.year, events.round, events.date, events.endDate,
                        events.name, events.formatType, events.scheduledMinutes, events.scheduledDistanceKm,
                        events.pointsScale, events.status, circuits.id AS circuitId, circuits.name AS circuitName,
                        circuits.placeName, circuits.countryId, LOWER(countries.alpha2Code) AS countryCode,
                        countries.name AS countryName, circuits.layoutId, circuits.layoutVersion,
                        winner.carNumber AS winnerCarNumber, winnerTeam.name AS winnerTeamName,
                        CASE WHEN winner.id IS NULL THEN 0 ELSE 1 END AS hasClassification
                    FROM wec_events events
                    JOIN wec_circuits circuits ON circuits.id = events.circuitId
                    LEFT JOIN countries ON countries.id = circuits.countryId
                    LEFT JOIN (
                        SELECT results.eventId, MAX(results.entryId) AS winnerEntryId
                        FROM wec_session_results results
                        JOIN wec_sessions sessions ON sessions.id = results.sessionId
                            AND sessions.eventId = results.eventId AND LOWER(sessions.type) = 'race'
                        WHERE results.overallPosition = 1 GROUP BY results.eventId
                    ) winners ON winners.eventId = events.id
                    LEFT JOIN wec_entries winner ON winner.id = winners.winnerEntryId
                    LEFT JOIN wec_teams winnerTeam ON winnerTeam.id = winner.teamId
                    WHERE events.seasonId = ? ORDER BY events.round DESC LIMIT 1
                `, [season.id]),
                connection.query(`
                    SELECT championships.id AS championshipId, championships.name AS championshipName,
                        championships.entityType, championships.classId,
                        standings.position, standings.entityId, standings.points, standings.championshipWon,
                        COALESCE(drivers.name, manufacturers.name, standingTeams.name, teams.name) AS entityName,
                        competitors.carNumber, competitorManufacturers.name AS manufacturerName
                    FROM wec_championships championships
                    JOIN wec_standings standings ON standings.championshipId = championships.id
                        AND standings.championshipWon = 1
                    LEFT JOIN wec_drivers drivers ON championships.entityType = 'driver' AND drivers.id = standings.entityId
                    LEFT JOIN wec_manufacturers manufacturers ON championships.entityType = 'manufacturer' AND manufacturers.id = standings.entityId
                    LEFT JOIN wec_teams standingTeams ON championships.entityType = 'team' AND standingTeams.id = standings.entityId
                    LEFT JOIN wec_competitors competitors ON championships.entityType = 'competitor' AND competitors.id = standings.entityId
                    LEFT JOIN wec_teams teams ON teams.id = competitors.teamId
                    LEFT JOIN wec_manufacturers competitorManufacturers ON competitorManufacturers.id = competitors.manufacturerId
                    WHERE championships.seasonId = ?
                    ORDER BY championships.id, standings.position, standings.entityId
                `, [season.id])
            ]);
            const championships = [];
            for (const row of championRows) {
                let championship = championships.find(item => item.id === row.championshipId);
                if (!championship) {
                    championship = { id: row.championshipId, name: row.championshipName, entityType: row.entityType, classId: row.classId, standings: [] };
                    championships.push(championship);
                }
                championship.standings.push({
                    position: Number(row.position), entityId: row.entityId, entityName: row.entityName,
                    carNumber: row.carNumber, manufacturerName: row.manufacturerName,
                    points: Number(row.points), championshipWon: Boolean(Number(row.championshipWon))
                });
            }
            return {
                archiveSeasonCount: Number(season.archiveSeasonCount),
                season: seasonSummary(season),
                latestEvent: eventRows.length ? shapeEvent(eventRows[0]) : null,
                championships
            };
        });
        if (!data) return res.status(404).json({ error: 'WEC archive not found.' });
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
        res.json(data);
    } catch (error) { sendError(res, error); }
});

router.get('/api/wec/events', async (req, res) => {
    try {
        const rows = await withConnection(async connection => {
            await connection.query('SET SESSION group_concat_max_len = 65535');
            const [events, winners, participants] = await Promise.all([
                connection.query(`
                    SELECT events.id, events.seasonId, events.year, events.round, events.date, events.endDate,
                        events.name, events.formatType, events.scheduledMinutes, events.scheduledDistanceKm,
                        events.status, circuits.id AS circuitId, circuits.name AS circuitName,
                        circuits.placeName, countries.name AS countryName
                    FROM wec_events events
                    JOIN wec_circuits circuits ON circuits.id = events.circuitId
                    LEFT JOIN countries ON countries.id = circuits.countryId
                    ORDER BY events.year DESC, events.round DESC
                `),
                connection.query(`
                    SELECT results.eventId, entries.id AS entryId, entries.carNumber,
                        teams.name AS teamName, manufacturers.name AS manufacturerName,
                        carModels.name AS carModelName, crew.crewOrder, drivers.name AS driverName
                    FROM wec_session_results results
                    JOIN wec_sessions sessions ON sessions.id = results.sessionId
                        AND sessions.eventId = results.eventId AND LOWER(sessions.type) = 'race'
                    JOIN wec_entries entries ON entries.id = results.entryId AND entries.eventId = results.eventId
                    JOIN wec_teams teams ON teams.id = entries.teamId
                    JOIN wec_manufacturers manufacturers ON manufacturers.id = entries.manufacturerId
                    JOIN wec_car_models carModels ON carModels.id = entries.carModelId
                    LEFT JOIN wec_entry_drivers crew ON crew.entryId = entries.id AND crew.eventId = results.eventId
                    LEFT JOIN wec_drivers drivers ON drivers.id = crew.driverId
                    WHERE results.overallPosition = 1
                    ORDER BY results.eventId, crew.crewOrder
                `),
                connection.query(`
                    SELECT terms.eventId, GROUP_CONCAT(terms.term SEPARATOR ' ') AS searchText
                    FROM (
                        SELECT entries.eventId, teams.name AS term
                        FROM wec_entries entries JOIN wec_teams teams ON teams.id = entries.teamId
                        GROUP BY entries.eventId, teams.id, teams.name
                        UNION
                        SELECT entries.eventId, manufacturers.name AS term
                        FROM wec_entries entries JOIN wec_manufacturers manufacturers ON manufacturers.id = entries.manufacturerId
                        GROUP BY entries.eventId, manufacturers.id, manufacturers.name
                        UNION
                        SELECT entries.eventId, carModels.name AS term
                        FROM wec_entries entries JOIN wec_car_models carModels ON carModels.id = entries.carModelId
                        GROUP BY entries.eventId, carModels.id, carModels.name
                        UNION
                        SELECT crew.eventId, drivers.name AS term
                        FROM wec_entry_drivers crew JOIN wec_drivers drivers ON drivers.id = crew.driverId
                        GROUP BY crew.eventId, drivers.id, drivers.name
                    ) terms
                    GROUP BY terms.eventId
                `)
            ]);
            const winnerByEvent = new Map();
            for (const row of winners) {
                if (!winnerByEvent.has(row.eventId)) {
                    winnerByEvent.set(row.eventId, {
                        entryId: row.entryId,
                        carNumber: row.carNumber,
                        teamName: row.teamName,
                        manufacturerName: row.manufacturerName,
                        carModelName: row.carModelName,
                        drivers: []
                    });
                }
                const winner = winnerByEvent.get(row.eventId);
                if (row.driverName && !winner.drivers.includes(row.driverName)) winner.drivers.push(row.driverName);
            }
            const searchTermsByEvent = new Map(participants.map(row => [row.eventId, row.searchText || '']));
            return events.map(row => ({
                ...shapeEvent(row),
                winner: winnerByEvent.get(row.id) || null,
                searchText: searchTermsByEvent.get(row.id) || ''
            }));
        });
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
        res.json(rows);
    } catch (error) { sendError(res, error); }
});

router.get('/api/wec/events/:eventId/header', async (req, res) => {
    if (!/^[a-z0-9-]{1,100}$/i.test(req.params.eventId)) return res.status(400).json({ error: 'A valid WEC event is required.' });
    try {
        const rows = await withConnection(connection => connection.query(`
            SELECT events.id, events.seasonId, events.year, events.round, events.date, events.endDate,
                events.name, events.formatType, events.scheduledMinutes, events.scheduledDistanceKm,
                events.pointsScale, events.status, circuits.id AS circuitId,
                circuits.name AS circuitName, circuits.placeName, circuits.countryId,
                countries.name AS countryName, circuits.type AS circuitType,
                circuits.direction, circuits.length, circuits.turns
            FROM wec_events events
            JOIN wec_circuits circuits ON circuits.id = events.circuitId
            LEFT JOIN countries ON countries.id = circuits.countryId
            WHERE events.id = ?
        `, [req.params.eventId]));
        if (!rows.length) return res.status(404).json({ error: 'WEC event not found.' });
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
        res.json({ event: shapeEvent(rows[0]) });
    } catch (error) { sendError(res, error); }
});

router.get('/api/wec/events/:eventId/entries', async (req, res) => {
    if (!/^[a-z0-9-]{1,100}$/i.test(req.params.eventId)) return res.status(400).json({ error: 'A valid WEC event is required.' });
    try {
        const rows = await withConnection(connection => connection.query(`
            SELECT entries.id, entries.competitorId, entries.carNumber, entries.championshipEligible,
                classes.id AS classId, classes.code AS classCode, classes.name AS className,
                classes.displayOrder, teams.id AS teamId, teams.name AS teamName,
                manufacturers.id AS manufacturerId, manufacturers.name AS manufacturerName,
                carModels.id AS carModelId, carModels.name AS carModelName,
                crew.crewOrder, crew.category, drivers.id AS driverId, drivers.name AS driverName
            FROM wec_entries entries
            JOIN wec_classes classes ON classes.id = entries.classId
            JOIN wec_teams teams ON teams.id = entries.teamId
            JOIN wec_manufacturers manufacturers ON manufacturers.id = entries.manufacturerId
            JOIN wec_car_models carModels ON carModels.id = entries.carModelId
            LEFT JOIN wec_entry_drivers crew ON crew.entryId = entries.id AND crew.eventId = entries.eventId
            LEFT JOIN wec_drivers drivers ON drivers.id = crew.driverId
            WHERE entries.eventId = ?
            ORDER BY classes.displayOrder, CAST(entries.carNumber AS UNSIGNED), entries.carNumber, crew.crewOrder
        `, [req.params.eventId]));
        if (!rows.length) return res.json({ entries: [] });
        const entries = [];
        const byId = new Map();
        for (const row of rows) {
            if (!byId.has(row.id)) {
                const entry = {
                    id: row.id, competitorId: row.competitorId, carNumber: row.carNumber,
                    championshipEligible: row.championshipEligible === true || Number(row.championshipEligible) === 1 || String(row.championshipEligible).toLowerCase() === 'true',
                    class: { id: row.classId, code: row.classCode, name: row.className },
                    team: { id: row.teamId, name: row.teamName },
                    manufacturer: { id: row.manufacturerId, name: row.manufacturerName },
                    carModel: { id: row.carModelId, name: row.carModelName }, crew: []
                };
                byId.set(row.id, entry);
                entries.push(entry);
            }
            if (row.driverId) byId.get(row.id).crew.push({ id: row.driverId, name: row.driverName, category: row.category });
        }
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
        res.json({ entries });
    } catch (error) { sendError(res, error); }
});

router.get('/api/wec/seasons/:year/header', async (req, res) => {
    if (!/^\d{4}$/.test(req.params.year)) return res.status(400).json({ error: 'A four-digit season year is required.' });
    try {
        const data = await withConnection(async connection => {
            const [seasonRows, classRows, championRows, navigationRows] = await Promise.all([
                connection.query(`SELECT id, year, name, startDate, endDate, status FROM wec_seasons WHERE year = ?`, [req.params.year]),
                connection.query(`SELECT id, code, name, displayOrder FROM wec_classes WHERE year = ? ORDER BY displayOrder`, [req.params.year]),
                connection.query(`
                    SELECT championships.id AS championshipId, championships.name AS championshipName,
                        championships.entityType, championships.classId,
                        standings.position, standings.entityId, standings.points, standings.championshipWon,
                        COALESCE(drivers.name, manufacturers.name, standingTeams.name, teams.name) AS entityName,
                        competitors.carNumber, competitorManufacturers.name AS manufacturerName
                    FROM wec_championships championships
                    JOIN wec_seasons seasons ON seasons.id = championships.seasonId
                    JOIN wec_standings standings ON standings.championshipId = championships.id
                        AND standings.championshipWon = 1
                    JOIN wec_classes classes ON classes.id = championships.classId
                    LEFT JOIN wec_drivers drivers ON championships.entityType = 'driver' AND drivers.id = standings.entityId
                    LEFT JOIN wec_manufacturers manufacturers ON championships.entityType = 'manufacturer' AND manufacturers.id = standings.entityId
                    LEFT JOIN wec_teams standingTeams ON championships.entityType = 'team' AND standingTeams.id = standings.entityId
                    LEFT JOIN wec_competitors competitors ON championships.entityType = 'competitor' AND competitors.id = standings.entityId
                    LEFT JOIN wec_teams teams ON teams.id = competitors.teamId
                    LEFT JOIN wec_manufacturers competitorManufacturers ON competitorManufacturers.id = competitors.manufacturerId
                    WHERE seasons.year = ?
                    ORDER BY classes.displayOrder,
                        CASE WHEN championships.id LIKE '%pro-am%' THEN 1 ELSE 0 END,
                        CASE championships.entityType WHEN 'driver' THEN 1 WHEN 'team' THEN 2 WHEN 'competitor' THEN 2 ELSE 3 END,
                        standings.position, standings.entityId
                `, [req.params.year]),
                connection.query(`SELECT id, year, name FROM wec_seasons ORDER BY year`)
            ]);
            if (!seasonRows.length) return null;

            const championships = [];
            for (const row of championRows) {
                let championship = championships.find(item => item.id === row.championshipId);
                if (!championship) {
                    championship = {
                        id: row.championshipId,
                        name: row.championshipName,
                        entityType: row.entityType,
                        classId: row.classId,
                        standings: []
                    };
                    championships.push(championship);
                }
                championship.standings.push({
                    position: Number(row.position), entityId: row.entityId, entityName: row.entityName,
                    carNumber: row.carNumber, manufacturerName: row.manufacturerName,
                    points: Number(row.points), championshipWon: Boolean(Number(row.championshipWon))
                });
            }

            const navigationIndex = navigationRows.findIndex(row => Number(row.year) === Number(req.params.year));
            return {
                season: seasonSummary(seasonRows[0]),
                classes: classRows.map(row => ({ ...row, displayOrder: Number(row.displayOrder) })),
                championships,
                navigation: {
                    previous: navigationIndex > 0 ? navigationRows[navigationIndex - 1] : null,
                    next: navigationIndex >= 0 && navigationIndex < navigationRows.length - 1 ? navigationRows[navigationIndex + 1] : null
                }
            };
        });
        if (!data) return res.status(404).json({ error: 'WEC season not found.' });
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        res.json(data);
    } catch (error) { sendError(res, error); }
});

router.get('/api/wec/seasons/:year/results', async (req, res) => {
    if (!/^\d{4}$/.test(req.params.year)) return res.status(400).json({ error: 'A four-digit season year is required.' });
    try {
        const data = await withConnection(async connection => {
            const [eventRows, championshipRows, resultRows, proAmRows] = await Promise.all([
                connection.query(`
                    SELECT events.id, events.round, events.name, events.date,
                        circuits.id AS circuitId, circuits.name AS circuitName, circuits.placeName
                    FROM wec_events events
                    JOIN wec_circuits circuits ON circuits.id = events.circuitId
                    WHERE events.year = ? ORDER BY events.round
                `, [req.params.year]),
                connection.query(`
                    SELECT DISTINCT championships.classId,
                        CASE WHEN championships.id LIKE '%pro-am%' THEN 1 ELSE 0 END AS proAm,
                        classes.code AS classCode, classes.name AS className, classes.displayOrder
                    FROM wec_championships championships
                    JOIN wec_seasons seasons ON seasons.id = championships.seasonId
                    JOIN wec_classes classes ON classes.id = championships.classId
                    WHERE seasons.year = ?
                    ORDER BY classes.displayOrder, proAm
                `, [req.params.year]),
                connection.query(`
                    SELECT results.eventId, results.entryId, results.classId, results.classPosition,
                        entries.competitorId, entries.carNumber,
                        teams.id AS teamId, teams.name AS teamName,
                        entryDrivers.driverId, entryDrivers.crewOrder, drivers.name AS driverName
                    FROM wec_session_results results
                    JOIN wec_sessions sessions ON sessions.id = results.sessionId AND sessions.type = 'race'
                    JOIN wec_events events ON events.id = results.eventId
                    JOIN wec_entries entries ON entries.id = results.entryId
                    JOIN wec_teams teams ON teams.id = entries.teamId
                    LEFT JOIN wec_entry_drivers entryDrivers ON entryDrivers.entryId = entries.id AND entryDrivers.eventId = entries.eventId
                    LEFT JOIN wec_drivers drivers ON drivers.id = entryDrivers.driverId
                    WHERE events.year = ? AND results.classPosition IS NOT NULL
                    ORDER BY events.round, results.classId, results.classPosition, entryDrivers.crewOrder
                `, [req.params.year]),
                connection.query(`
                    SELECT DISTINCT standings.entityId AS competitorId
                    FROM wec_championships championships
                    JOIN wec_seasons seasons ON seasons.id = championships.seasonId
                    JOIN wec_standings standings ON standings.championshipId = championships.id
                    WHERE seasons.year = ? AND championships.entityType = 'competitor'
                        AND championships.id LIKE '%pro-am-teams'
                `, [req.params.year])
            ]);
            if (!eventRows.length) return null;

            const categories = championshipRows.map(row => ({
                id: `${row.classId}${Number(row.proAm) ? '-pro-am' : ''}`,
                classId: row.classId,
                code: row.classCode,
                name: `${row.className}${Number(row.proAm) ? ' Pro/Am' : ''}`,
                proAm: Boolean(Number(row.proAm))
            }));
            const proAmCompetitors = new Set(proAmRows.map(row => row.competitorId));
            const classifiedEntries = [];
            const entriesByKey = new Map();
            for (const row of resultRows) {
                const key = `${row.eventId}:${row.entryId}`;
                let entry = entriesByKey.get(key);
                if (!entry) {
                    entry = {
                        eventId: row.eventId, entryId: row.entryId, classId: row.classId,
                        classPosition: Number(row.classPosition), competitorId: row.competitorId,
                        carNumber: row.carNumber, team: { id: row.teamId, name: row.teamName }, crew: []
                    };
                    entriesByKey.set(key, entry);
                    classifiedEntries.push(entry);
                }
                if (row.driverId && !entry.crew.some(driver => driver.id === row.driverId)) {
                    entry.crew.push({ id: row.driverId, name: row.driverName });
                }
            }

            return {
                categories,
                events: eventRows.map(event => ({
                    id: event.id, round: Number(event.round), name: event.name, date: event.date,
                    circuit: { id: event.circuitId, name: event.circuitName, placeName: event.placeName },
                    winners: categories.map(category => {
                        const candidates = classifiedEntries.filter(entry => entry.eventId === event.id
                            && entry.classId === category.classId
                            && (!category.proAm || proAmCompetitors.has(entry.competitorId)));
                        const winner = candidates.sort((left, right) => left.classPosition - right.classPosition)[0];
                        return winner ? { categoryId: category.id, ...winner } : null;
                    }).filter(Boolean)
                }))
            };
        });
        if (!data) return res.status(404).json({ error: 'WEC season results not found.' });
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        res.json(data);
    } catch (error) { sendError(res, error); }
});

router.get('/api/wec/seasons/:year/standings', async (req, res) => {
    if (!/^\d{4}$/.test(req.params.year)) return res.status(400).json({ error: 'A four-digit season year is required.' });
    try {
        const data = await withConnection(async connection => {
            const [eventRows, standingRows, resultRows, proAmRows] = await Promise.all([
                connection.query(`
                    SELECT events.id, events.round, events.name, circuits.placeName, circuits.name AS circuitName
                    FROM wec_events events JOIN wec_circuits circuits ON circuits.id = events.circuitId
                    WHERE events.year = ? ORDER BY events.round
                `, [req.params.year]),
                connection.query(`
                    SELECT championships.id AS championshipId, championships.name AS championshipName,
                        championships.entityType, championships.classId, championships.classIds, classes.name AS className,
                        classes.displayOrder, standings.position, standings.entityId, standings.points,
                        COALESCE(drivers.name, manufacturers.name) AS entityName
                    FROM wec_championships championships
                    JOIN wec_seasons seasons ON seasons.id = championships.seasonId
                    JOIN wec_classes classes ON classes.id = championships.classId
                    JOIN (
                        SELECT championshipId, MAX(round) AS finalRound
                        FROM wec_standings GROUP BY championshipId
                    ) finalRounds ON finalRounds.championshipId = championships.id
                    JOIN wec_standings standings ON standings.championshipId = championships.id
                        AND standings.round = finalRounds.finalRound
                    LEFT JOIN wec_drivers drivers ON championships.entityType = 'driver' AND drivers.id = standings.entityId
                    LEFT JOIN wec_manufacturers manufacturers ON championships.entityType = 'manufacturer' AND manufacturers.id = standings.entityId
                    WHERE seasons.year = ? AND championships.entityType IN ('driver', 'manufacturer')
                    ORDER BY championships.entityType, classes.displayOrder,
                        CASE WHEN championships.id LIKE '%pro-am%' THEN 1 ELSE 0 END,
                        standings.position, standings.entityId
                `, [req.params.year]),
                connection.query(`
                    SELECT results.eventId, results.classId, results.classPosition, results.status,
                        entries.competitorId, entries.manufacturerId, teams.id AS teamId, teams.name AS teamName,
                        entryDrivers.driverId
                    FROM wec_session_results results
                    JOIN wec_sessions sessions ON sessions.id = results.sessionId AND sessions.type = 'race'
                    JOIN wec_events events ON events.id = results.eventId
                    JOIN wec_entries entries ON entries.id = results.entryId
                    JOIN wec_teams teams ON teams.id = entries.teamId
                    LEFT JOIN wec_entry_drivers entryDrivers ON entryDrivers.entryId = entries.id AND entryDrivers.eventId = entries.eventId
                    WHERE events.year = ?
                    ORDER BY events.round, results.classId, results.classPosition
                `, [req.params.year]),
                connection.query(`
                    SELECT DISTINCT standings.entityId AS competitorId
                    FROM wec_championships championships
                    JOIN wec_seasons seasons ON seasons.id = championships.seasonId
                    JOIN wec_standings standings ON standings.championshipId = championships.id
                    WHERE seasons.year = ? AND championships.entityType = 'competitor'
                        AND championships.id LIKE '%pro-am-teams'
                `, [req.params.year])
            ]);
            if (!eventRows.length) return null;

            const events = eventRows.map(row => ({
                id: row.id, round: Number(row.round), name: row.name,
                circuitName: row.circuitName, placeName: row.placeName
            }));
            const proAmCompetitors = new Set(proAmRows.map(row => row.competitorId));
            const championships = [];
            for (const row of standingRows) {
                let championship = championships.find(item => item.id === row.championshipId);
                if (!championship) {
                    championship = {
                        id: row.championshipId,
                        name: row.championshipName,
                        label: `${row.className}${row.championshipId.includes('pro-am') ? ' Pro/Am' : ''}`,
                        entityType: row.entityType,
                        classId: row.classId,
                        classIds: String(row.classIds || row.classId).split('|').filter(Boolean),
                        proAm: row.championshipId.includes('pro-am'),
                        standings: []
                    };
                    championships.push(championship);
                }

                const relevantResults = resultRows.filter(result => championship.classIds.includes(result.classId)
                    && (row.entityType === 'driver' ? result.driverId === row.entityId : result.manufacturerId === row.entityId)
                    && (!championship.proAm || proAmCompetitors.has(result.competitorId)));
                const results = {};
                for (const event of events) {
                    const eventResults = relevantResults.filter(result => result.eventId === event.id)
                        .sort((left, right) => Number(left.classPosition || 9999) - Number(right.classPosition || 9999));
                    const best = eventResults[0];
                    if (best) results[event.id] = {
                        position: best.classPosition === null ? null : Number(best.classPosition),
                        status: best.status
                    };
                }
                const teamNames = relevantResults.map(result => result.teamName).filter(Boolean);
                championship.standings.push({
                    position: Number(row.position), entityId: row.entityId, entityName: row.entityName,
                    points: Number(row.points), teamName: teamNames.at(-1) || null, results
                });
            }
            return { events, championships };
        });
        if (!data) return res.status(404).json({ error: 'WEC season standings not found.' });
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        res.json(data);
    } catch (error) { sendError(res, error); }
});

router.get('/api/wec/seasons/:year', async (req, res) => {
    if (!/^\d{4}$/.test(req.params.year)) return res.status(400).json({ error: 'A four-digit season year is required.' });
    try {
        const data = await withConnection(async connection => {
            const [seasonRows, classRows, eventRows, competitorRows, winnerRows, navigationRows] = await Promise.all([
                connection.query(`SELECT id, year, name, startDate, endDate, status, sourceUrl FROM wec_seasons WHERE year = ?`, [req.params.year]),
                connection.query(`SELECT id, code, name, displayOrder FROM wec_classes WHERE year = ? ORDER BY displayOrder`, [req.params.year]),
                connection.query(`
                    SELECT events.id, events.round, events.date, events.endDate, events.name,
                        events.formatType, events.scheduledMinutes, events.scheduledDistanceKm,
                        events.pointsScale, events.status, circuits.id AS circuitId,
                        circuits.name AS circuitName, circuits.placeName, circuits.countryId,
                        countries.name AS countryName, LOWER(countries.alpha2Code) AS countryCode,
                        circuits.type AS circuitType, circuits.direction, circuits.latitude, circuits.longitude,
                        circuits.length, circuits.turns, circuits.layoutId, circuits.layoutVersion, circuits.mapSourceUrl,
                        coverage.classificationCount, winner.carNumber AS winnerCarNumber,
                        winnerTeam.name AS winnerTeamName
                    FROM wec_events events
                    JOIN wec_circuits circuits ON circuits.id = events.circuitId
                    LEFT JOIN countries ON countries.id = circuits.countryId
                    LEFT JOIN (
                        SELECT results.eventId, COUNT(*) AS classificationCount,
                            MAX(CASE WHEN sessions.type = 'race' AND results.overallPosition = 1 THEN results.entryId END) AS winnerEntryId
                        FROM wec_session_results results
                        JOIN wec_sessions sessions ON sessions.id = results.sessionId
                        GROUP BY results.eventId
                    ) coverage ON coverage.eventId = events.id
                    LEFT JOIN wec_entries winner ON winner.id = coverage.winnerEntryId
                    LEFT JOIN wec_teams winnerTeam ON winnerTeam.id = winner.teamId
                    WHERE events.year = ? ORDER BY events.round
                `, [req.params.year]),
                connection.query(`
                    SELECT competitors.id AS competitorId, competitors.classId, competitors.carNumber,
                        competitors.championshipEligible, classes.code AS classCode, classes.name AS className,
                        classes.displayOrder, teams.id AS teamId, teams.name AS teamName,
                        manufacturers.id AS manufacturerId, manufacturers.name AS manufacturerName,
                        carModels.id AS carModelId, carModels.name AS carModelName,
                        events.round, entryDrivers.driverId, entryDrivers.crewOrder, entryDrivers.category,
                        drivers.name AS driverName, drivers.abbreviation,
                        countries.name AS countryName, LOWER(countries.alpha2Code) AS countryCode
                    FROM wec_competitors competitors
                    JOIN wec_seasons seasons ON seasons.id = competitors.seasonId
                    JOIN wec_classes classes ON classes.id = competitors.classId
                    JOIN wec_teams teams ON teams.id = competitors.teamId
                    JOIN wec_manufacturers manufacturers ON manufacturers.id = competitors.manufacturerId
                    JOIN wec_car_models carModels ON carModels.id = competitors.carModelId
                    LEFT JOIN wec_entries entries ON entries.competitorId = competitors.id
                    LEFT JOIN wec_events events ON events.id = entries.eventId
                    LEFT JOIN wec_entry_drivers entryDrivers ON entryDrivers.entryId = entries.id AND entryDrivers.eventId = entries.eventId
                    LEFT JOIN wec_drivers drivers ON drivers.id = entryDrivers.driverId
                    LEFT JOIN countries ON countries.id = drivers.nationalityCountryId
                    WHERE seasons.year = ?
                    ORDER BY classes.displayOrder, CAST(competitors.carNumber AS UNSIGNED), competitors.carNumber,
                        events.round, entryDrivers.crewOrder
                `, [req.params.year]),
                connection.query(`
                    SELECT results.eventId, results.entryId, results.classId, entries.competitorId,
                        entries.carNumber, teams.id AS teamId, teams.name AS teamName,
                        entryDrivers.driverId, entryDrivers.crewOrder, drivers.name AS driverName
                    FROM wec_session_results results
                    JOIN wec_sessions sessions ON sessions.id = results.sessionId AND sessions.type = 'race'
                    JOIN wec_events events ON events.id = results.eventId
                    JOIN wec_entries entries ON entries.id = results.entryId
                    JOIN wec_teams teams ON teams.id = entries.teamId
                    LEFT JOIN wec_entry_drivers entryDrivers ON entryDrivers.entryId = entries.id AND entryDrivers.eventId = entries.eventId
                    LEFT JOIN wec_drivers drivers ON drivers.id = entryDrivers.driverId
                    WHERE events.year = ? AND results.classPosition = 1
                    ORDER BY events.round, results.classId, entryDrivers.crewOrder
                `, [req.params.year]),
                connection.query(`SELECT id, year, name FROM wec_seasons ORDER BY year`)
            ]);
            if (!seasonRows.length) return null;
            let standings = [];
            try {
                standings = await connection.query(`
                    SELECT championships.id AS championshipId, championships.name AS championshipName,
                        championships.entityType, championships.classId, standings.round,
                        standings.position, standings.entityId, standings.points, standings.championshipWon,
                        COALESCE(drivers.name, manufacturers.name, standingTeams.name, teams.name) AS entityName,
                        competitors.carNumber, competitorManufacturers.name AS manufacturerName
                    FROM wec_championships championships
                    JOIN wec_standings standings ON standings.championshipId = championships.id
                    LEFT JOIN wec_drivers drivers ON championships.entityType = 'driver' AND drivers.id = standings.entityId
                    LEFT JOIN wec_manufacturers manufacturers ON championships.entityType = 'manufacturer' AND manufacturers.id = standings.entityId
                    LEFT JOIN wec_teams standingTeams ON championships.entityType = 'team' AND standingTeams.id = standings.entityId
                    LEFT JOIN wec_competitors competitors ON championships.entityType = 'competitor' AND competitors.id = standings.entityId
                    LEFT JOIN wec_teams teams ON teams.id = competitors.teamId
                    LEFT JOIN wec_manufacturers competitorManufacturers ON competitorManufacturers.id = competitors.manufacturerId
                    WHERE championships.seasonId = ?
                    ORDER BY championships.id, standings.round, standings.position, standings.entityId
                `, [seasonRows[0].id]);
            } catch (error) {
                if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
            }
            const championships = [];
            for (const row of standings) {
                let championship = championships.find(item => item.id === row.championshipId);
                if (!championship) {
                    championship = { id: row.championshipId, name: row.championshipName, entityType: row.entityType, classId: row.classId, rounds: [] };
                    championships.push(championship);
                }
                let round = championship.rounds.find(item => item.round === Number(row.round));
                if (!round) {
                    round = { round: Number(row.round), standings: [] };
                    championship.rounds.push(round);
                }
                round.standings.push({
                    position: Number(row.position), entityId: row.entityId, entityName: row.entityName,
                    carNumber: row.carNumber, manufacturerName: row.manufacturerName,
                    points: Number(row.points), championshipWon: Boolean(Number(row.championshipWon))
                });
            }
            const classOrder = new Map(classRows.map(row => [row.id, Number(row.displayOrder)]));
            const entityOrder = { driver: 1, team: 2, competitor: 2, manufacturer: 3 };
            const championshipOrder = championship => (classOrder.get(championship.classId) || 99) * 100
                + (championship.id.includes('pro-am') ? 50 : 0)
                + (entityOrder[championship.entityType] || 9);
            championships.sort((left, right) => championshipOrder(left) - championshipOrder(right));
            for (const championship of championships) {
                championship.rounds.sort((left, right) => left.round - right.round);
                championship.standings = championship.rounds.at(-1)?.standings || [];
            }
            const entries = [];
            const entriesById = new Map();
            for (const row of competitorRows) {
                let entry = entriesById.get(row.competitorId);
                if (!entry) {
                    entry = {
                        id: row.competitorId,
                        class: { id: row.classId, code: row.classCode, name: row.className, displayOrder: Number(row.displayOrder) },
                        carNumber: row.carNumber,
                        championshipEligible: Boolean(Number(row.championshipEligible)),
                        team: { id: row.teamId, name: row.teamName },
                        manufacturer: { id: row.manufacturerId, name: row.manufacturerName },
                        carModel: { id: row.carModelId, name: row.carModelName },
                        rounds: [], crew: []
                    };
                    entry._rounds = new Set();
                    entry._crew = new Map();
                    entriesById.set(row.competitorId, entry);
                    entries.push(entry);
                }
                if (row.round !== null) entry._rounds.add(Number(row.round));
                if (row.driverId) {
                    let driver = entry._crew.get(row.driverId);
                    if (!driver) {
                        driver = {
                            id: row.driverId, name: row.driverName, abbreviation: row.abbreviation,
                            countryName: row.countryName, countryCode: row.countryCode,
                            category: row.category || null, rounds: []
                        };
                        driver._rounds = new Set();
                        entry._crew.set(row.driverId, driver);
                    }
                    if (row.round !== null) driver._rounds.add(Number(row.round));
                }
            }
            for (const entry of entries) {
                entry.rounds = [...entry._rounds].sort((left, right) => left - right);
                entry.crew = [...entry._crew.values()].map(driver => {
                    driver.rounds = [...driver._rounds].sort((left, right) => left - right);
                    delete driver._rounds;
                    return driver;
                });
                delete entry._rounds;
                delete entry._crew;
            }
            const winnerGroups = new Map();
            for (const row of winnerRows) {
                const key = `${row.eventId}:${row.classId}:${row.entryId}`;
                let winner = winnerGroups.get(key);
                if (!winner) {
                    winner = {
                        eventId: row.eventId, entryId: row.entryId, competitorId: row.competitorId,
                        classId: row.classId, carNumber: row.carNumber,
                        team: { id: row.teamId, name: row.teamName }, crew: []
                    };
                    winnerGroups.set(key, winner);
                }
                if (row.driverId && !winner.crew.some(driver => driver.id === row.driverId)) {
                    winner.crew.push({ id: row.driverId, name: row.driverName });
                }
            }
            const winnersByEvent = new Map();
            for (const winner of winnerGroups.values()) {
                if (!winnersByEvent.has(winner.eventId)) winnersByEvent.set(winner.eventId, []);
                winnersByEvent.get(winner.eventId).push(winner);
            }
            const classificationEvents = eventRows.filter(row => Number(row.classificationCount) > 0).length;
            const navigationIndex = navigationRows.findIndex(row => Number(row.year) === Number(req.params.year));
            const pointScales = {
                standard: { id: 'standard', name: 'Standard race', positions: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], other: 0.5, pole: 1 },
                extended: { id: 'extended', name: 'Extended race', positions: [38, 27, 23, 18, 15, 12, 9, 6, 3, 2], other: 1, pole: 1 },
                'le-mans': { id: 'le-mans', name: '24 Hours of Le Mans', positions: [50, 36, 30, 24, 20, 16, 12, 8, 4, 2], other: 1, pole: 1 }
            };
            return {
                season: seasonSummary({ ...seasonRows[0], eventCount: eventRows.length, classCount: classRows.length, entryCount: entries.length }),
                classes: classRows.map(row => ({ ...row, displayOrder: Number(row.displayOrder) })),
                events: eventRows.map(row => ({
                    ...shapeEvent(row),
                    classificationCount: Number(row.classificationCount || 0),
                    hasClassification: Number(row.classificationCount || 0) > 0,
                    classWinners: winnersByEvent.get(row.id) || []
                })),
                entries, championships,
                pointsSystems: [...new Set(eventRows.map(row => row.pointsScale))].map(scale => pointScales[scale]).filter(Boolean),
                navigation: {
                    previous: navigationIndex > 0 ? navigationRows[navigationIndex - 1] : null,
                    next: navigationIndex >= 0 && navigationIndex < navigationRows.length - 1 ? navigationRows[navigationIndex + 1] : null
                },
                coverage: { calendar: true, classificationEvents, totalEvents: eventRows.length, classifications: classificationEvents === eventRows.length, standings: championships.length > 0 }
            };
        });
        if (!data) return res.status(404).json({ error: 'WEC season not found.' });
        res.json(data);
    } catch (error) { sendError(res, error); }
});

router.get('/api/wec/events/:eventId', async (req, res) => {
    if (!/^[a-z0-9-]{1,100}$/i.test(req.params.eventId)) return res.status(400).json({ error: 'A valid WEC event is required.' });
    const requestedSession = typeof req.query.session === 'string' && req.query.session.length <= 100 ? req.query.session : '';
    try {
        const data = await withConnection(async connection => {
            const eventRows = await connection.query(`
                SELECT events.id, events.year, events.round, events.date, events.endDate, events.name,
                    events.formatType, events.scheduledMinutes, events.scheduledDistanceKm,
                    events.pointsScale, events.status, circuits.id AS circuitId,
                    circuits.name AS circuitName, circuits.placeName, circuits.countryId,
                    countries.name AS countryName, LOWER(countries.alpha2Code) AS countryCode,
                    circuits.type AS circuitType, circuits.direction, circuits.latitude, circuits.longitude,
                    circuits.length, circuits.turns, circuits.layoutId, circuits.layoutVersion, circuits.mapSourceUrl
                FROM wec_events events JOIN wec_circuits circuits ON circuits.id = events.circuitId
                LEFT JOIN countries ON countries.id = circuits.countryId
                WHERE events.id = ?
            `, [req.params.eventId]);
            if (!eventRows.length) return null;
            const navigationRows = await connection.query(`
                SELECT id, name, round FROM wec_events
                WHERE year = ? AND round IN (?, ?) ORDER BY round
            `, [eventRows[0].year, Number(eventRows[0].round) - 1, Number(eventRows[0].round) + 1]);
            const navigation = {
                previous: navigationRows.find(row => Number(row.round) < Number(eventRows[0].round)) || null,
                next: navigationRows.find(row => Number(row.round) > Number(eventRows[0].round)) || null
            };

            let sessionRows;
            try {
                sessionRows = await connection.query(`
                    SELECT id, name, type, classId, startTimeUtc, status
                    FROM wec_sessions WHERE eventId = ?
                    ORDER BY startTimeUtc, id
                `, [req.params.eventId]);
            } catch (error) {
                if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
                return { event: shapeEvent(eventRows[0]), navigation, sessions: [], selectedSessionId: null, classification: [], coverage: { classifications: false } };
            }

            const selected = requestedSession
                ? sessionRows.find(row => String(row.id) === requestedSession)
                : [...sessionRows].reverse().find(row => String(row.type).toLowerCase() === 'race') || sessionRows.at(-1);
            if (requestedSession && !selected) return { invalidSession: true };
            if (!selected) return { event: shapeEvent(eventRows[0]), navigation, sessions: sessionRows, selectedSessionId: null, classification: [], coverage: { classifications: false } };

            const [resultRows, crewRows] = await Promise.all([
                connection.query(`
                    SELECT results.entryId, results.classId, results.overallPosition, results.classPosition,
                        results.status, results.laps, results.time, results.timeMillis, results.gap,
                        results.bestLap, results.bestLapMillis, results.points,
                        entries.competitorId, entries.carNumber, entries.teamId, entries.manufacturerId, entries.carModelId,
                        classes.code AS classCode, classes.name AS className,
                        teams.name AS teamName, manufacturers.name AS manufacturerName,
                        carModels.name AS carModelName
                    FROM wec_session_results results
                    JOIN wec_entries entries ON entries.id = results.entryId AND entries.eventId = results.eventId
                    JOIN wec_classes classes ON classes.id = results.classId
                    JOIN wec_teams teams ON teams.id = entries.teamId
                    JOIN wec_manufacturers manufacturers ON manufacturers.id = entries.manufacturerId
                    JOIN wec_car_models carModels ON carModels.id = entries.carModelId
                    WHERE results.eventId = ? AND results.sessionId = ?
                    ORDER BY results.overallPosition IS NULL, results.overallPosition, classes.displayOrder, results.classPosition
                `, [req.params.eventId, selected.id]),
                connection.query(`
                    SELECT crew.entryId, crew.crewOrder, crew.category,
                        drivers.id AS driverId, drivers.name AS driverName,
                        drivers.abbreviation, drivers.nationalityCountryId,
                        countries.name AS countryName, LOWER(countries.alpha2Code) AS countryCode
                    FROM wec_entry_drivers crew JOIN wec_drivers drivers ON drivers.id = crew.driverId
                    LEFT JOIN countries ON countries.id = drivers.nationalityCountryId
                    WHERE crew.eventId = ? ORDER BY crew.entryId, crew.crewOrder
                `, [req.params.eventId])
            ]);
            return {
                event: shapeEvent(eventRows[0]),
                navigation,
                sessions: sessionRows,
                selectedSessionId: selected.id,
                classification: shapeClassification(resultRows, crewRows),
                coverage: { classifications: resultRows.length > 0 }
            };
        });
        if (!data) return res.status(404).json({ error: 'WEC event not found.' });
        if (data.invalidSession) return res.status(400).json({ error: 'The requested session does not belong to this event.' });
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        res.json(data);
    } catch (error) { sendError(res, error); }
});

router.get('/api/wec/entities/:type/:entityId', async (req, res) => {
    const type = req.params.type;
    if (!['drivers', 'teams', 'manufacturers', 'car-models', 'entries'].includes(type) || !/^[a-z0-9-]{1,140}$/i.test(req.params.entityId)) {
        return res.status(400).json({ error: 'A valid WEC entity is required.' });
    }
    try {
        const data = await withConnection(async connection => {
            let entityRows;
            if (type === 'drivers') entityRows = await connection.query(`SELECT drivers.id, drivers.name, drivers.abbreviation,
                drivers.nationalityCountryId AS countryId, countries.name AS countryName, LOWER(countries.alpha2Code) AS countryCode
                FROM wec_drivers drivers LEFT JOIN countries ON countries.id = drivers.nationalityCountryId WHERE drivers.id = ?`, [req.params.entityId]);
            if (type === 'teams') entityRows = await connection.query(`SELECT teams.id, teams.name, teams.countryId,
                countries.name AS countryName, LOWER(countries.alpha2Code) AS countryCode
                FROM wec_teams teams LEFT JOIN countries ON countries.id = teams.countryId WHERE teams.id = ?`, [req.params.entityId]);
            if (type === 'manufacturers') entityRows = await connection.query(`SELECT manufacturers.id, manufacturers.name, manufacturers.countryId,
                countries.name AS countryName, LOWER(countries.alpha2Code) AS countryCode
                FROM wec_manufacturers manufacturers LEFT JOIN countries ON countries.id = manufacturers.countryId WHERE manufacturers.id = ?`, [req.params.entityId]);
            if (type === 'car-models') entityRows = await connection.query(`
                SELECT carModels.id, carModels.name, carModels.regulation,
                    manufacturers.id AS manufacturerId, manufacturers.name AS manufacturerName,
                    manufacturers.countryId, countries.name AS countryName, LOWER(countries.alpha2Code) AS countryCode
                FROM wec_car_models carModels
                JOIN wec_manufacturers manufacturers ON manufacturers.id = carModels.manufacturerId
                LEFT JOIN countries ON countries.id = manufacturers.countryId
                WHERE carModels.id = ?
            `, [req.params.entityId]);
            if (type === 'entries') entityRows = await connection.query(`
                SELECT competitors.id, teams.name, competitors.carNumber, competitors.classId,
                    manufacturers.id AS manufacturerId, manufacturers.name AS manufacturerName,
                    carModels.id AS carModelId, carModels.name AS carModelName
                FROM wec_competitors competitors
                JOIN wec_teams teams ON teams.id = competitors.teamId
                JOIN wec_manufacturers manufacturers ON manufacturers.id = competitors.manufacturerId
                JOIN wec_car_models carModels ON carModels.id = competitors.carModelId
                WHERE competitors.id = ?
            `, [req.params.entityId]);
            if (!entityRows?.length) return null;
            const where = type === 'drivers' ? 'crew.driverId = ?' : type === 'teams' ? 'entries.teamId = ?'
                : type === 'manufacturers' ? 'entries.manufacturerId = ?' : type === 'car-models' ? 'entries.carModelId = ?' : 'entries.competitorId = ?';
            const driverJoin = type === 'drivers' ? 'JOIN wec_entry_drivers crew ON crew.entryId = entries.id AND crew.eventId = entries.eventId' : '';
            const appearances = await connection.query(`
                SELECT events.id AS eventId, events.year, events.round, events.date, events.name AS eventName,
                    entries.competitorId, entries.carNumber, teams.id AS teamId, teams.name AS teamName,
                    manufacturers.id AS manufacturerId, manufacturers.name AS manufacturerName,
                    carModels.name AS carModelName, classes.code AS classCode,
                    results.overallPosition, results.classPosition, results.status, results.laps
                FROM wec_entries entries ${driverJoin}
                JOIN wec_events events ON events.id = entries.eventId
                JOIN wec_sessions sessions ON sessions.eventId = events.id AND sessions.type = 'race'
                JOIN wec_session_results results ON results.sessionId = sessions.id AND results.entryId = entries.id
                JOIN wec_teams teams ON teams.id = entries.teamId
                JOIN wec_manufacturers manufacturers ON manufacturers.id = entries.manufacturerId
                JOIN wec_car_models carModels ON carModels.id = entries.carModelId
                JOIN wec_classes classes ON classes.id = entries.classId
                WHERE ${where} ORDER BY events.year DESC, events.round DESC
            `, [req.params.entityId]);
            const standingsWhere = type === 'teams'
                ? "((championships.entityType = 'team' AND standings.entityId = ?) OR standings.entityId IN (SELECT id FROM wec_competitors WHERE teamId = ?))"
                : type === 'entries' ? 'standings.entityId = ?'
                    : type === 'drivers' ? "championships.entityType = 'driver' AND standings.entityId = ?"
                        : "championships.entityType = 'manufacturer' AND standings.entityId = ?";
            const standingsParameters = type === 'teams' ? [req.params.entityId, req.params.entityId] : [req.params.entityId];
            const titles = type === 'car-models' ? [] : await connection.query(`
                SELECT championships.name, seasons.year, standings.position, standings.points, standings.championshipWon
                FROM wec_standings standings JOIN wec_championships championships ON championships.id = standings.championshipId
                JOIN wec_seasons seasons ON seasons.id = championships.seasonId
                JOIN (SELECT championshipId, MAX(round) AS finalRound FROM wec_standings GROUP BY championshipId) finals
                    ON finals.championshipId = standings.championshipId AND finals.finalRound = standings.round
                WHERE ${standingsWhere}
                ORDER BY seasons.year DESC, standings.position
            `, standingsParameters);
            return {
                entity: { ...entityRows[0], type },
                stats: {
                    starts: appearances.length,
                    overallWins: appearances.filter(row => Number(row.overallPosition) === 1).length,
                    classWins: appearances.filter(row => Number(row.classPosition) === 1).length,
                    podiums: appearances.filter(row => Number(row.classPosition) >= 1 && Number(row.classPosition) <= 3).length
                },
                championships: titles.map(row => ({ ...row, year: Number(row.year), position: Number(row.position), points: Number(row.points), championshipWon: Boolean(Number(row.championshipWon)) })),
                appearances: appearances.map(row => ({
                    ...row, year: Number(row.year), round: Number(row.round),
                    overallPosition: row.overallPosition === null ? null : Number(row.overallPosition),
                    classPosition: row.classPosition === null ? null : Number(row.classPosition),
                    laps: row.laps === null ? null : Number(row.laps)
                }))
            };
        });
        if (!data) return res.status(404).json({ error: 'WEC entity not found.' });
        res.json(data);
    } catch (error) { sendError(res, error); }
});

module.exports = { router, seasonSummary };
