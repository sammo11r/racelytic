const { completedCalendar } = require('./ask-calendar-calculations');
const { resourcePath } = require('./resource-routes');
const { normaliseSeries } = require('./series-config');

function problem(message) {
    const error = new Error(message);
    error.statusCode = 422;
    return error;
}

function identity(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim();
}

async function driverSeasonParticipation(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    if (series !== 'f1') throw problem('Entered, started, and missed season races currently require the Formula 1 result archive.');
    const year = Number(interpretation.targetSeason);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) throw problem('Name a season for driver participation.');
    const mode = interpretation.participationMode;
    if (!['entered', 'started', 'missed'].includes(mode)) throw problem('Choose entered, started, or missed races.');
    const candidates = await connection.query('SELECT id, name FROM drivers ORDER BY name');
    const search = identity(interpretation.subjectName);
    const exact = candidates.filter(row => identity(row.name) === search);
    const found = exact.length ? exact : candidates.filter(row => identity(row.name).includes(search));
    if (found.length !== 1) throw problem(found.length ? `Several drivers match “${interpretation.subjectName}”. Name one more precisely.`
        : `No recorded driver matches “${interpretation.subjectName}”.`);
    const driver = found[0];
    const calendar = await completedCalendar(connection, 'f1', year);
    if (!calendar.length) throw problem(`No completed Formula 1 races are recorded in ${year}.`);
    const results = await connection.query(`SELECT raceId, positionText FROM races_race_results
        WHERE year = ? AND driverId = ?`, [year, driver.id]);
    if (!results.length) throw problem(`${driver.name} has no recorded race entry in ${year}; missed events cannot be inferred from an absent season.`);
    const byEvent = new Map(results.map(row => [String(row.raceId), row]));
    const selected = calendar.filter(row => {
        const result = byEvent.get(String(row.id));
        if (mode === 'missed') return !result;
        if (mode === 'entered') return Boolean(result);
        return result && !/^(?:DNS|DNQ|DNPQ|WD|WIT)$/i.test(String(result.positionText || ''));
    });
    return { intent: 'driver_season_participation',
        answer: `${driver.name} ${mode} ${selected.length} of the ${calendar.length} completed Formula 1 races in ${year}${selected.length ? `: ${selected.map(row => row.name).join(', ')}` : '.'}${selected.length ? '.' : ''}`,
        fact: { title: `${driver.name} · ${year} ${mode} races`, rows: selected.map(row => ({
            label: `Round ${row.round}`, value: `${row.name}${byEvent.get(String(row.id))?.positionText ? ` · ${byEvent.get(String(row.id)).positionText}` : ''}`,
            href: resourcePath('f1', 'race', row.id, row.name)
        })) },
        methodology: { source: 'Recorded completed Formula 1 calendar and race-result entry rows.',
            coverage: `${year} completed Formula 1 races`, sample: `${results.length} recorded driver result rows.` },
        assumptions: [mode === 'missed' ? 'Missed means no result-table entry for a completed race in a season where the driver has at least one entry.'
            : mode === 'entered' ? 'Entered means the driver appears in the race-result table, including DNS or qualification failures.'
                : 'Started excludes DNS, DNQ, pre-qualifying failure and withdrawal status.'],
        scope: { series: 'f1', targetSeason: year, subjectName: driver.name, participationMode: mode } };
}

module.exports = { driverSeasonParticipation };
