const CATEGORIES = {
    wins: 'Wins', championships: 'Championships', podiums: 'Podiums', poles: 'Pole positions', fastestLaps: 'Fastest laps',
    points: 'Points', starts: 'Starts', gridGain: 'Average positions gained', averageFinish: 'Average finish',
    finishRate: 'Finish rate', winRate: 'Win rate', podiumRate: 'Podium rate', dnfs: 'DNFs'
};
const SAMPLE_CATEGORIES = new Set(['gridGain', 'averageFinish', 'finishRate', 'winRate', 'podiumRate']);
const PERCENTAGE_CATEGORIES = new Set(['finishRate', 'winRate', 'podiumRate']);
const integer = (value, fallback, min, max) => /^\d+$/.test(String(value ?? '')) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback;

function configuration(input = {}) {
    const category = Object.hasOwn(CATEGORIES, input.category) ? input.category : 'wins';
    const type = input.type === 'constructors' ? 'constructors' : 'drivers';
    const fromYear = integer(input.fromYear, null, 1950, 2200), toYear = integer(input.toYear, null, 1950, 2200);
    if (fromYear && toYear && fromYear > toYear) throw Object.assign(new Error('The end season must be the same as or after the start season.'), { status: 400 });
    const requestedFormat = ['all', 'F', 'S'].includes(input.raceFormat) ? input.raceFormat : null;
    const raceFormat = ['championships', 'poles'].includes(category) ? 'F'
        : requestedFormat || ([true, 'true'].includes(input.includeSprints) ? 'all' : 'F');
    return { series: 'f1', type, category, fromYear, toYear,
        entityId: String(input.entityId || '').trim().slice(0, 100),
        circuitId: category === 'championships' ? '' : String(input.circuitId || '').trim().slice(0, 100),
        circuitIds: category === 'championships' || !Array.isArray(input.circuitIds) ? []
            : [...new Set(input.circuitIds.map(value => String(value || '').trim().slice(0, 100)).filter(Boolean))].slice(0, 100),
        constructorId: type === 'drivers' ? String(input.constructorId || '').trim().slice(0, 100) : '',
        nationality: String(input.nationality || '').trim().slice(0, 100),
        raceFormat,
        includeSprints: raceFormat === 'all',
        minStarts: SAMPLE_CATEGORIES.has(category) ? integer(input.minStarts, 10, 1, 1000) : 1 };
}

function rankEntries(rows, { lowerIsBetter = false } = {}) {
    const entries = rows.map(row => {
        const entry = { ...row };
        for (const key of ['value', 'starts', 'carStarts', 'wins', 'podiums', 'points', 'sample', 'firstYear', 'lastYear']) {
            entry[key] = row[key] == null ? null : Number(row[key]);
        }
        // The displayed precision defines a tie for average records.
        if (entry.value != null) entry.value = Math.round(entry.value * 100) / 100;
        return entry;
    }).sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value) || a.name.localeCompare(b.name));
    entries.forEach((entry, index) => { entry.rank = index && entries[index - 1].value === entry.value ? entries[index - 1].rank : index + 1; });
    return entries;
}

async function explore(connection, input) {
    const config = configuration(input), { type, category, entityId, fromYear, toYear, circuitId, circuitIds, constructorId, nationality, includeSprints, raceFormat } = config;
    const parameters = [], filters = [];
    if (fromYear) { filters.push('source.year >= ?'); parameters.push(fromYear); }
    if (toYear) { filters.push('source.year <= ?'); parameters.push(toYear); }
    if (circuitId) { filters.push('source.circuitId = ?'); parameters.push(circuitId); }
    if (!circuitId && circuitIds.length) {
        filters.push(`source.circuitId IN (${circuitIds.map(() => '?').join(', ')})`);
        parameters.push(...circuitIds);
    }
    if (constructorId) { filters.push('source.constructorId = ?'); parameters.push(constructorId); }
    const entity = type === 'drivers' ? 'd' : 'k', country = type === 'drivers' ? 'd.nationalityCountryId' : 'k.countryId';
    if (entityId) { filters.push(`${entity}.id = ?`); parameters.push(entityId); }
    if (nationality) { filters.push(`${country} = ?`); parameters.push(nationality); }
    const sourceQuery = (table, format) => `SELECT rr.*, r.circuitId, CONCAT(rr.raceId, '-${format}') AS eventId FROM ${table} rr JOIN races r ON r.id = rr.raceId`;
    const grandPrixSource = sourceQuery('races_race_results', 'gp');
    const sprintSource = sourceQuery('races_sprint_race_results', 'sprint');
    const source = raceFormat === 'S' ? sprintSource : raceFormat === 'all' ? `${grandPrixSource} UNION ALL ${sprintSource}` : grandPrixSource;
    const status = "UPPER(TRIM(COALESCE(source.positionText, '')))";
    const started = `${status} NOT IN ('DNS','DNQ','DNPQ','WD','W','DNP','DNA','DNE','EX','WITHDRAWN','DID NOT START','DID NOT QUALIFY','DID NOT PREQUALIFY')`;
    const classified = `${started} AND ${status} NOT IN ('DSQ','DISQ','DQ','DISQUALIFIED','EXCLUDED','EXC') AND source.positionNumber BETWEEN 1 AND 99`;
    const measured = `${classified} AND source.gridPositionNumber BETWEEN 1 AND 99`;
    const retired = `${started} AND ${status} NOT IN ('DSQ','DISQ','DQ','DISQUALIFIED','EXCLUDED','EXC') AND (${status} IN ('DNF','RET','RETIRED') OR (COALESCE(TRIM(source.reasonRetired), '') <> '' AND UPPER(TRIM(source.reasonRetired)) NOT IN ('FINISHED','RUNNING','CLASSIFIED','CLA')))`;
    const starts = `COUNT(DISTINCT CASE WHEN ${started} THEN source.eventId END)`;
    const wins = `COUNT(DISTINCT CASE WHEN ${classified} AND source.positionNumber = 1 THEN source.eventId END)`;
    const podiums = `COUNT(DISTINCT CASE WHEN ${classified} AND source.positionNumber <= 3 THEN CONCAT(source.eventId, '-', source.positionNumber) END)`;
    const carStarts = `SUM(CASE WHEN ${started} THEN 1 ELSE 0 END)`;
    const classifiedCount = `SUM(CASE WHEN ${classified} THEN 1 ELSE 0 END)`;
    const expressions = { starts, wins, podiums, points: 'SUM(COALESCE(source.points,0))',
        poles: 'COUNT(DISTINCT CASE WHEN source.polePosition = 1 THEN source.eventId END)',
        fastestLaps: 'COUNT(DISTINCT CASE WHEN source.fastestLap = 1 THEN source.eventId END)',
        gridGain: `AVG(CASE WHEN ${measured} THEN source.gridPositionNumber - source.positionNumber END)`,
        averageFinish: `AVG(CASE WHEN ${classified} THEN source.positionNumber END)`,
        finishRate: `100 * ${classifiedCount} / NULLIF(${carStarts}, 0)`,
        winRate: `100 * ${wins} / NULLIF(${starts}, 0)`,
        podiumRate: `100 * ${podiums} / NULLIF(${type === 'drivers' ? starts : carStarts}, 0)`,
        dnfs: `SUM(CASE WHEN ${retired} THEN 1 ELSE 0 END)` };
    const valueParameters = [];
    let value = expressions[category];
    const sample = category === 'gridGain' ? `SUM(CASE WHEN ${measured} THEN 1 ELSE 0 END)`
        : category === 'averageFinish' ? classifiedCount : carStarts;
    if (category === 'championships') {
        const titleFilters = [];
        if (fromYear) { titleFilters.push('standing.year >= ?'); valueParameters.push(fromYear); }
        if (toYear) { titleFilters.push('standing.year <= ?'); valueParameters.push(toYear); }
        if (constructorId) {
            titleFilters.push(`EXISTS (SELECT 1 FROM races_race_results contribution WHERE contribution.driverId = standing.driverId AND contribution.year = standing.year AND contribution.constructorId = ? AND contribution.points > 0)`);
            valueParameters.push(constructorId);
        }
        value = `(SELECT COUNT(DISTINCT standing.year) FROM seasons_${type === 'drivers' ? 'driver' : 'constructor'}_standings standing WHERE standing.${type === 'drivers' ? 'driverId' : 'constructorId'} = ${entity}.id AND standing.championshipWon = 1${titleFilters.length ? ` AND ${titleFilters.join(' AND ')}` : ''})`;
    }
    const rows = await connection.query(`SELECT ${entity}.id, ${entity}.name, ${country} AS nationalityCountryId,
        ${value} AS value, ${starts} AS starts, ${carStarts} AS carStarts,
        ${wins} AS wins, ${podiums} AS podiums, SUM(COALESCE(source.points,0)) AS points,
        ${sample} AS sample, MIN(source.year) AS firstYear, MAX(source.year) AS lastYear
        FROM (${source}) source JOIN drivers d ON d.id = source.driverId JOIN constructors k ON k.id = source.constructorId
        ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} GROUP BY ${entity}.id, ${entity}.name, ${country}
        HAVING value IS NOT NULL AND ${SAMPLE_CATEGORIES.has(category) ? `sample >= ${config.minStarts}` : 'value > 0'}`, [...valueParameters, ...parameters]);
    const lowerIsBetter = category === 'averageFinish';
    const entries = rankEntries(rows, { lowerIsBetter }), limit = integer(input.limit, entries.length, 1, 1000);
    const years = entries.flatMap(entry => [entry.firstYear, entry.lastYear]).filter(Number.isFinite);
    const coverage = { fromYear: years.length ? Math.min(...years) : null, toYear: years.length ? Math.max(...years) : null };
    return { type, category, label: CATEGORIES[category], unit: PERCENTAGE_CATEGORIES.has(category) ? '%' : '', lowerIsBetter, raceFormat, includeSprints, configuration: config, total: entries.length, entries: entries.slice(0, limit), coverage };
}

module.exports = { CATEGORIES, SAMPLE_CATEGORIES, configuration, rankEntries, explore };
