const { rankEntries } = require('./f1-records');

const CATEGORIES = Object.freeze({
    classWins: 'Class wins', overallWins: 'Overall wins', podiums: 'Class podiums', championships: 'Championships',
    points: 'Race points', starts: 'Starts', laps: 'Laps completed', finishRate: 'Classified finish rate',
    averageFinish: 'Average class finish'
});
const TYPES = new Set(['drivers', 'teams', 'manufacturers']);
const SAMPLE_CATEGORIES = new Set(['finishRate', 'averageFinish']);
const integer = (value, fallback, min, max) => /^\d+$/.test(String(value ?? '')) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback;

function configuration(input = {}) {
    const category = Object.hasOwn(CATEGORIES, input.category) ? input.category : 'classWins';
    const type = TYPES.has(input.type) ? input.type : 'drivers';
    const fromYear = integer(input.fromYear, null, 2012, 2200), toYear = integer(input.toYear, null, 2012, 2200);
    if (fromYear && toYear && fromYear > toYear) throw Object.assign(new Error('The end season must be the same as or after the start season.'), { status: 400 });
    return { series: 'wec', type, category, fromYear, toYear,
        circuitId: category === 'championships' ? '' : String(input.circuitId || '').trim().slice(0, 100),
        classCode: String(input.classCode || '').trim().slice(0, 60),
        teamId: type === 'drivers' ? String(input.teamId || '').trim().slice(0, 100) : '',
        minStarts: SAMPLE_CATEGORIES.has(category) ? integer(input.minStarts, 5, 1, 1000) : 1 };
}

const nonStarter = result => ['not-started', 'did-not-start', 'dns', 'withdrawn'].includes(String(result.status || '').toLowerCase());
const classified = result => String(result.status || '').toLowerCase() === 'classified' && Number.isFinite(Number(result.classPosition));

function aggregate(results, titles, config) {
    const entities = new Map(), titleIds = new Map();
    const subjectRows = result => config.type === 'drivers' ? result.crew || []
        : config.type === 'teams' ? [result.team] : [result.manufacturer];
    for (const result of results) {
        if ((config.fromYear && result.year < config.fromYear) || (config.toYear && result.year > config.toYear)
            || (config.circuitId && result.circuitId !== config.circuitId)
            || (config.classCode && result.classCode !== config.classCode)
            || (config.teamId && result.team?.id !== config.teamId)) continue;
        for (const subject of subjectRows(result)) {
            if (!subject?.id) continue;
            if (!entities.has(subject.id)) entities.set(subject.id, { id: subject.id, name: subject.name, starts: 0,
                classWins: 0, overallWins: 0, podiums: 0, points: 0, laps: 0, classified: 0, positions: [],
                firstYear: result.year, lastYear: result.year, contributionYears: new Set() });
            const row = entities.get(subject.id);
            row.firstYear = Math.min(row.firstYear, result.year); row.lastYear = Math.max(row.lastYear, result.year);
            if (Number(result.points) > 0) row.contributionYears.add(result.year);
            row.points += Number(result.points) || 0; row.laps += Number(result.laps) || 0;
            if (nonStarter(result)) continue;
            row.starts += 1;
            if (!classified(result)) continue;
            row.classified += 1; row.positions.push(Number(result.classPosition));
            if (Number(result.classPosition) === 1) row.classWins += 1;
            if (Number(result.overallPosition) === 1) row.overallWins += 1;
            if (Number(result.classPosition) <= 3) row.podiums += 1;
        }
    }
    for (const title of titles || []) {
        if ((config.fromYear && title.year < config.fromYear) || (config.toYear && title.year > config.toYear)
            || (config.classCode && title.classCode !== config.classCode) || title.type !== config.type) continue;
        const row = entities.get(title.entityId);
        if (config.teamId && (!row || !row.contributionYears.has(title.year))) continue;
        if (!titleIds.has(title.entityId)) titleIds.set(title.entityId, new Set());
        titleIds.get(title.entityId).add(title.championshipId);
        if (!entities.has(title.entityId)) entities.set(title.entityId, { id: title.entityId, name: title.entityName,
            starts: 0, classWins: 0, overallWins: 0, podiums: 0, points: 0, laps: 0, classified: 0, positions: [],
            firstYear: title.year, lastYear: title.year, contributionYears: new Set() });
    }
    const entries = [];
    for (const row of entities.values()) {
        const values = { ...row, championships: titleIds.get(row.id)?.size || 0,
            finishRate: row.starts ? row.classified / row.starts * 100 : null,
            averageFinish: row.positions.length ? row.positions.reduce((sum, value) => sum + value, 0) / row.positions.length : null };
        const value = values[config.category], sample = config.category === 'averageFinish' ? row.positions.length : row.starts;
        if (value == null || (SAMPLE_CATEGORIES.has(config.category) ? sample < config.minStarts : value <= 0)) continue;
        entries.push({ id: row.id, name: row.name, value, starts: row.starts, classWins: row.classWins,
            overallWins: row.overallWins, podiums: row.podiums, points: row.points, laps: row.laps,
            sample, firstYear: row.firstYear, lastYear: row.lastYear });
    }
    return rankEntries(entries, { lowerIsBetter: config.category === 'averageFinish' });
}

async function options(connection) {
    const [circuits, teams, classes] = await Promise.all([
        connection.query(`SELECT DISTINCT circuits.id, circuits.name FROM wec_circuits circuits JOIN wec_events events ON events.circuitId = circuits.id ORDER BY circuits.name`),
        connection.query(`SELECT DISTINCT teams.id, teams.name FROM wec_teams teams JOIN wec_entries entries ON entries.teamId = teams.id ORDER BY teams.name`),
        connection.query(`SELECT classes.code, MAX(classes.name) AS name, MIN(classes.displayOrder) AS displayOrder, MIN(classes.year) AS firstYear, MAX(classes.year) AS lastYear FROM wec_classes classes GROUP BY classes.code ORDER BY MIN(classes.displayOrder), classes.code`)
    ]);
    return { circuits, teams, classes: classes.map(row => ({ ...row, displayOrder: Number(row.displayOrder), firstYear: Number(row.firstYear), lastYear: Number(row.lastYear) })) };
}

async function explore(connection, input) {
    const config = configuration(input), filters = [], params = [];
    if (config.fromYear) { filters.push('events.year >= ?'); params.push(config.fromYear); }
    if (config.toYear) { filters.push('events.year <= ?'); params.push(config.toYear); }
    if (config.circuitId) { filters.push('events.circuitId = ?'); params.push(config.circuitId); }
    if (config.classCode) { filters.push('classes.code = ?'); params.push(config.classCode); }
    if (config.teamId) { filters.push('entries.teamId = ?'); params.push(config.teamId); }
    const [resultRows, crewRows, titleRows] = await Promise.all([
        connection.query(`SELECT results.eventId, results.entryId, results.overallPosition, results.classPosition,
            results.status, results.laps, results.points, events.year, events.circuitId,
            classes.code AS classCode, teams.id AS teamId, teams.name AS teamName,
            manufacturers.id AS manufacturerId, manufacturers.name AS manufacturerName
            FROM wec_session_results results
            JOIN wec_sessions sessions ON sessions.id = results.sessionId AND sessions.eventId = results.eventId AND LOWER(sessions.type) = 'race'
            JOIN wec_events events ON events.id = results.eventId
            JOIN wec_entries entries ON entries.id = results.entryId AND entries.eventId = results.eventId
            JOIN wec_classes classes ON classes.id = results.classId
            JOIN wec_teams teams ON teams.id = entries.teamId
            JOIN wec_manufacturers manufacturers ON manufacturers.id = entries.manufacturerId
            ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
            ORDER BY events.year, events.round`, params),
        connection.query(`SELECT crew.eventId, crew.entryId, drivers.id, drivers.name
            FROM wec_entry_drivers crew JOIN wec_drivers drivers ON drivers.id = crew.driverId
            JOIN wec_events events ON events.id = crew.eventId
            ${config.fromYear || config.toYear || config.circuitId ? `WHERE ${[
                config.fromYear ? 'events.year >= ?' : '', config.toYear ? 'events.year <= ?' : '', config.circuitId ? 'events.circuitId = ?' : ''
            ].filter(Boolean).join(' AND ')}` : ''}
            ORDER BY crew.eventId, crew.entryId, crew.crewOrder`, [config.fromYear, config.toYear, config.circuitId].filter(value => value)),
        connection.query(`SELECT championships.id AS championshipId, championships.entityType,
            seasons.year, classes.code AS classCode, standings.entityId, standings.championshipWon,
            COALESCE(drivers.name, manufacturers.name, standingTeams.name, competitorTeams.name) AS entityName,
            competitors.teamId AS competitorTeamId, competitorTeams.name AS competitorTeamName
            FROM wec_championships championships
            JOIN wec_seasons seasons ON seasons.id = championships.seasonId
            JOIN wec_classes classes ON classes.id = championships.classId
            JOIN wec_standings standings ON standings.championshipId = championships.id AND standings.championshipWon = 1
            LEFT JOIN wec_drivers drivers ON championships.entityType = 'driver' AND drivers.id = standings.entityId
            LEFT JOIN wec_manufacturers manufacturers ON championships.entityType = 'manufacturer' AND manufacturers.id = standings.entityId
            LEFT JOIN wec_teams standingTeams ON championships.entityType = 'team' AND standingTeams.id = standings.entityId
            LEFT JOIN wec_competitors competitors ON championships.entityType = 'competitor' AND competitors.id = standings.entityId
            LEFT JOIN wec_teams competitorTeams ON competitorTeams.id = competitors.teamId`)
    ]);
    const crew = new Map();
    for (const row of crewRows) {
        const key = `${row.eventId}:${row.entryId}`;
        if (!crew.has(key)) crew.set(key, []);
        if (!crew.get(key).some(driver => driver.id === row.id)) crew.get(key).push({ id: row.id, name: row.name });
    }
    const results = resultRows.map(row => ({ ...row, year: Number(row.year), laps: Number(row.laps || 0), points: Number(row.points || 0),
        team: { id: row.teamId, name: row.teamName }, manufacturer: { id: row.manufacturerId, name: row.manufacturerName },
        crew: crew.get(`${row.eventId}:${row.entryId}`) || [] }));
    const titles = titleRows.map(row => ({ championshipId: row.championshipId, year: Number(row.year), classCode: row.classCode,
        type: row.entityType === 'driver' ? 'drivers' : row.entityType === 'manufacturer' ? 'manufacturers' : ['team', 'competitor'].includes(row.entityType) ? 'teams' : '',
        entityId: row.entityType === 'competitor' ? row.competitorTeamId : row.entityId,
        entityName: row.entityType === 'competitor' ? row.competitorTeamName : row.entityName })).filter(row => row.type && row.entityId);
    const entries = aggregate(results, titles, config), years = results.map(row => row.year);
    const limit = integer(input.limit, entries.length, 1, 1000);
    return { type: config.type, category: config.category, label: CATEGORIES[config.category],
        unit: config.category === 'finishRate' ? '%' : '', lowerIsBetter: config.category === 'averageFinish',
        configuration: config, total: entries.length, entries: entries.slice(0, limit), coverage: {
            results: results.length, fromYear: years.length ? Math.min(...years) : null, toYear: years.length ? Math.max(...years) : null
        } };
}

module.exports = { CATEGORIES, SAMPLE_CATEGORIES, configuration, aggregate, explore, options };
