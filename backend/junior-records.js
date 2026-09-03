const f1Records = require('./f1-records');
const { seriesPrefix, minimumSeasonYear, isJuniorSeries } = require('./series-config');
const { buildJuniorCircuitAnalysis } = require('./junior-circuit-analysis');
const { starter, classified } = require('../frontend/js/f1-circuit-analysis-model');
const { f2SessionType, f3SessionType, academySessionType } = require('./routes/seasons');

function configuration(input = {}) {
    const series = String(input.series || '').toLowerCase();
    if (!isJuniorSeries(series)) throw new Error('A junior championship is required.');
    const config = f1Records.configuration(input);
    // Preserve old saved records while using explicit format choices for new ones.
    const legacyFormat = input.includeSprints == null ? 'all' : [true, 'true'].includes(input.includeSprints) ? 'all' : 'F';
    const raceFormat = config.category === 'championships' ? 'all' : config.category === 'poles' ? 'F'
        : ['all', 'F', 'S'].includes(input.raceFormat) ? input.raceFormat : legacyFormat;
    return { ...config, series, fromYear: config.fromYear == null ? null : Math.max(minimumSeasonYear(series), config.fromYear),
        raceFormat, includeSprints: raceFormat !== 'F' && !['poles', 'championships'].includes(config.category) };
}

function aggregate(races, titles, config, countries = new Map()) {
    const entities = new Map(), team = config.type === 'constructors';
    let measured = 0, derived = 0, starters = 0;
    const selected = races.filter(race => (config.raceFormat === 'all' || config.raceFormat === race.raceType)
        && (!config.fromYear || race.year >= config.fromYear) && (!config.toYear || race.year <= config.toYear));
    for (const race of selected) {
        for (const result of race.results) {
            const id = String(team ? result.constructorId || '' : result.driverId || '');
            if (!id || (config.constructorId && String(result.constructorId) !== config.constructorId)) continue;
            const country = countries.get(id) || '';
            if (config.nationality && country.toLowerCase() !== config.nationality.toLowerCase()) continue;
            if (!entities.has(id)) entities.set(id, { id, name: (team ? result.constructorName : result.driverName) || id,
                nationalityCountryId: country, events: new Set(), wins: new Set(), podiums: new Set(), poles: new Set(), fastestLaps: new Set(),
                contributions: new Set(), carStarts: 0, points: 0, gains: [], firstYear: race.year, lastYear: race.year });
            const row = entities.get(id), event = String(race.sessionId);
            row.firstYear = Math.min(row.firstYear, race.year); row.lastYear = Math.max(row.lastYear, race.year);
            row.points += Number(result.points) || 0;
            if (result.points > 0) row.contributions.add(race.year);
            if (result.polePosition && race.raceType === 'F') row.poles.add(event);
            if (result.fastestLap) row.fastestLaps.add(event);
            if (!starter(result)) continue;
            row.events.add(event); row.carStarts++; starters++;
            if (!classified(result)) continue;
            if (result.position === 1) row.wins.add(event);
            if (result.position <= 3) row.podiums.add(`${event}-${result.position}`);
            if (Number(result.grid) > 0 && Number(result.grid) < 999) {
                row.gains.push(Number(result.grid) - Number(result.position)); measured++;
                if (race.gridSource === 'derived') derived++;
            }
        }
    }
    const entries = [];
    for (const row of entities.values()) {
        const championships = new Set(titles.filter(title => String(title.id) === row.id
            && (!config.fromYear || title.year >= config.fromYear) && (!config.toYear || title.year <= config.toYear)
            && (!config.constructorId || row.contributions.has(Number(title.year)))).map(title => Number(title.year))).size;
        const values = { starts: row.events.size, wins: row.wins.size, podiums: row.podiums.size, poles: row.poles.size,
            fastestLaps: row.fastestLaps.size, points: row.points, championships,
            gridGain: row.gains.length ? row.gains.reduce((sum, gain) => sum + gain, 0) / row.gains.length : null };
        const value = values[config.category];
        if (value == null || (config.category === 'gridGain' ? row.gains.length < config.minStarts : value <= 0)) continue;
        entries.push({ id: row.id, name: row.name, nationalityCountryId: row.nationalityCountryId, value,
            starts: values.starts, wins: values.wins, podiums: values.podiums, points: values.points,
            carStarts: row.carStarts, sample: row.gains.length, firstYear: row.firstYear, lastYear: row.lastYear });
    }
    return { entries: f1Records.rankEntries(entries), coverage: { sessions: selected.length, starters, measured, derived } };
}

async function explore(connection, input) {
    const config = configuration(input), prefix = seriesPrefix(config.series), params = [], filters = [];
    if (config.fromYear) { filters.push('races.year >= ?'); params.push(config.fromYear); }
    if (config.toYear) { filters.push('races.year <= ?'); params.push(config.toYear); }
    if (config.circuitId) { filters.push('races.circuitId = ?'); params.push(config.circuitId); }
    const sessions = await connection.query(`SELECT sessions.id AS sessionId, races.id AS raceId,
        sessions.sessionNumber, sessions.name AS sessionName, sessions.isRace, sessions.cancelled, sessions.startTimeUtc,
        races.name AS raceName, races.year, races.round, races.date
        FROM ${prefix}sessions sessions JOIN ${prefix}races races ON races.id = sessions.raceId
        ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
        ORDER BY races.year, races.round, sessions.sessionNumber`, params);
    // Load results separately: archive sessionId columns may be unindexed, so an
    // outer join across every session otherwise scans the result table repeatedly.
    const results = await connection.query(`SELECT results.sessionId,
        results.driverId, drivers.name AS driverName, drivers.countryCode AS driverCountry,
        results.constructorId, constructors.name AS constructorName, constructors.countryCode AS constructorCountry,
        results.positionNumber, results.status AS positionText, results.laps, results.gapMillis, results.gapLaps,
        results.polePosition, results.fastestLap, results.points
        FROM ${prefix}session_results results JOIN ${prefix}races races ON races.id = results.raceId
        LEFT JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
        LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
        ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
        ORDER BY results.positionDisplayOrder`, params);
    const bySession = new Map();
    for (const result of results) {
        const id = String(result.sessionId);
        if (!bySession.has(id)) bySession.set(id, []);
        bySession.get(id).push(result);
    }
    const rows = sessions.flatMap(session => (bySession.get(String(session.sessionId)) || [{}]).map(result => ({ ...session, ...result })));
    const team = config.type === 'constructors';
    const titles = config.category === 'championships' ? await connection.query(`SELECT ${team ? 'constructorId' : 'driverId'} AS id, year
        FROM ${prefix}season_${team ? 'constructor' : 'driver'}_standings
        WHERE positionNumber = 1 AND LOWER(CAST(championshipWon AS CHAR)) IN ('1','true')`) : [];
    const sessionType = config.series === 'academy' ? academySessionType : config.series === 'f3' ? f3SessionType : f2SessionType;
    const { races } = buildJuniorCircuitAnalysis(null, rows, config.series, sessionType);
    const countries = new Map(rows.map(row => [String(team ? row.constructorId : row.driverId), team ? row.constructorCountry : row.driverCountry]));
    const { entries, coverage } = aggregate(races, titles, config, countries);
    const limit = /^\d+$/.test(String(input.limit || '')) ? Math.max(1, Math.min(1000, Number(input.limit))) : entries.length;
    const labels = { wins: 'Wins', championships: 'Championships', podiums: 'Podiums', poles: 'Pole positions', fastestLaps: 'Fastest laps', points: 'Points', starts: 'Starts', gridGain: 'Average positions gained' };
    return { type: config.type, category: config.category, label: labels[config.category], includeSprints: config.includeSprints,
        configuration: config, total: entries.length, entries: entries.slice(0, limit), coverage };
}

module.exports = { configuration, aggregate, explore };
