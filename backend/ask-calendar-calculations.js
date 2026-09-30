const { isJuniorSeries, normaliseSeries, seriesPrefix } = require('./series-config');
const { resourcePath } = require('./resource-routes');

const SERIES_NAMES = Object.freeze({ f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy', fe: 'Formula E', wec: 'WEC' });

function problem(message) {
    const error = new Error(message);
    error.statusCode = 422;
    return error;
}

function dateText(value) {
    if (!value) return null;
    if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    return String(value).slice(0, 10);
}

function normalizeName(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\b(?:grand prix|gp|e-prix|prix|race|round|the)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

async function completedCalendar(connection, series, year) {
    const yearFilter = Number.isInteger(Number(year)) && year !== null && year !== undefined;
    if (series === 'wec') return connection.query(`SELECT events.id, events.name, events.year, events.round, events.date,
            circuits.id AS circuitId, circuits.name AS circuitName, circuits.placeName,
            countries.name AS countryName,
            (SELECT COUNT(DISTINCT sessions.id) FROM wec_sessions sessions
                JOIN wec_session_results results ON results.sessionId = sessions.id AND results.eventId = events.id
                WHERE sessions.type = 'race') AS raceCount
        FROM wec_events events JOIN wec_circuits circuits ON circuits.id = events.circuitId
        LEFT JOIN countries ON countries.id = circuits.countryId
        WHERE ${yearFilter ? 'events.year = ? AND ' : ''}events.status = 'completed'
            AND EXISTS (SELECT 1 FROM wec_session_results results
                JOIN wec_sessions sessions ON sessions.id = results.sessionId
                WHERE results.eventId = events.id AND sessions.type = 'race')
        ORDER BY events.year, events.round, events.date`, yearFilter ? [year] : []);
    if (isJuniorSeries(series)) {
        const prefix = seriesPrefix(series);
        return connection.query(`SELECT races.id, races.name, races.year, races.round, races.date,
                circuits.id AS circuitId, circuits.name AS circuitName, circuits.placeName,
                ${series === 'fe' ? 'countries.name' : 'NULL'} AS countryName,
                (SELECT COUNT(DISTINCT sessions.id) FROM ${prefix}sessions sessions
                    JOIN ${prefix}session_results results ON results.sessionId = sessions.id AND results.raceId = races.id
                    WHERE LOWER(CAST(sessions.isRace AS CHAR)) IN ('1','true')) AS raceCount
            FROM ${prefix}races races JOIN ${prefix}circuits circuits ON circuits.id = races.circuitId
            ${series === 'fe' ? 'LEFT JOIN countries ON countries.alpha2Code = circuits.countryCode' : ''}
            WHERE ${yearFilter ? 'races.year = ? AND ' : ''}EXISTS (SELECT 1 FROM ${prefix}session_results results
                JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
                WHERE results.raceId = races.id AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1','true'))
            ORDER BY races.year, races.round, races.date`, yearFilter ? [year] : []);
    }
    return connection.query(`SELECT races.id, COALESCE(NULLIF(gp.fullName, ''), races.officialName) AS name,
            races.year, races.round, races.date, circuits.id AS circuitId,
            COALESCE(NULLIF(circuits.fullName, ''), circuits.name) AS circuitName,
            circuits.placeName, countries.name AS countryName,
            1 + EXISTS(SELECT 1 FROM races_sprint_race_results sprint WHERE sprint.raceId = races.id) AS raceCount
        FROM races LEFT JOIN grands_prix gp ON gp.id = races.grandPrixId
        JOIN circuits ON circuits.id = races.circuitId
        LEFT JOIN countries ON countries.id = circuits.countryId
        WHERE ${yearFilter ? 'races.year = ? AND ' : ''}EXISTS (SELECT 1 FROM races_race_results results WHERE results.raceId = races.id)
        ORDER BY races.year, races.round, races.date`, yearFilter ? [year] : []);
}

function eventFact(series, row) {
    return { label: `Round ${Number(row.round)}`, value: `${row.name}${dateText(row.date) ? ` · ${dateText(row.date)}` : ''}`,
        href: resourcePath(series, 'race', row.id, row.name) };
}

function result(intent, series, year, answer, rows, assumptions) {
    return {
        intent, answer, entityLabel: SERIES_NAMES[series],
        fact: { title: `${SERIES_NAMES[series]} ${year} completed calendar`, rows },
        methodology: { source: 'Recorded event calendar and race classifications in the Racelytic archive.',
            coverage: `${SERIES_NAMES[series]} ${year} completed calendar`, sample: `${rows.length} supporting archive facts.` },
        scope: { targetSeason: year, completedOnly: true },
        assumptions
    };
}

async function calculateCalendarQuestion(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const year = Number(interpretation.targetSeason);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) throw problem('Name a season to inspect its completed calendar.');
    const calendar = await completedCalendar(connection, series, year);
    if (!calendar.length) throw problem(`No completed ${SERIES_NAMES[series]} race is recorded for ${year}.`);
    const intent = interpretation.intent;
    const assumptions = ['Only events with a recorded race classification are included; scheduled but unrun events are excluded.',
        'A race count includes every recorded race session, including sprints where applicable.'];
    if (intent === 'season_calendar') {
        return result(intent, series, year, `The ${year} ${SERIES_NAMES[series]} completed calendar contains ${calendar.length} events, from ${calendar[0].name} to ${calendar.at(-1).name}.`,
            calendar.map(row => eventFact(series, row)), assumptions);
    }
    if (intent === 'season_event_count') {
        const unit = interpretation.countUnit === 'races' ? 'races' : 'events';
        const count = unit === 'races' ? calendar.reduce((sum, row) => sum + Number(row.raceCount || 0), 0) : calendar.length;
        return result(intent, series, year, `${year} ${SERIES_NAMES[series]} had ${count} recorded ${unit}.`,
            [{ label: `Recorded ${unit}`, value: count }, ...calendar.map(row => ({ ...eventFact(series, row),
                value: unit === 'races' ? `${row.name} · ${Number(row.raceCount || 0)} race sessions` : eventFact(series, row).value }))], assumptions);
    }
    let selected;
    if (intent === 'season_closer') selected = calendar.at(-1);
    else if (intent === 'adjacent_event') {
        const requested = normalizeName(interpretation.eventName);
        if (!requested) throw problem('Name the event whose previous or next race you want.');
        const matches = calendar.map((row, index) => ({ row, index })).filter(({ row }) => {
            const name = normalizeName(row.name);
            return name === requested || name.includes(requested) || requested.includes(name);
        });
        if (matches.length !== 1) throw problem(matches.length
            ? `Several ${year} events match “${interpretation.eventName}”. Name the event more precisely.`
            : `No completed ${year} event matches “${interpretation.eventName}”.`);
        const offset = interpretation.calendarDirection === 'previous' ? -1 : 1;
        selected = calendar[matches[0].index + offset];
        if (!selected) throw problem(`There is no ${offset < 0 ? 'previous' : 'next'} completed event after ${matches[0].row.name} in ${year}.`);
    } else throw problem('That calendar calculation is not available.');
    const location = [selected.placeName, selected.countryName].filter(Boolean).join(', ');
    const date = dateText(selected.date);
    const relation = intent === 'season_closer' ? `The last recorded ${SERIES_NAMES[series]} race of ${year}`
        : `The ${interpretation.calendarDirection} completed ${SERIES_NAMES[series]} event after ${interpretation.eventName} in ${year}`;
    return result(intent, series, year,
        `${relation} was ${selected.name}, held at ${selected.circuitName}${location ? ` in ${location}` : ''}${date ? ` on ${date}` : ''}.`,
        [{ label: 'Race', value: selected.name, href: resourcePath(series, 'race', selected.id, selected.name) },
            { label: 'Circuit', value: selected.circuitName, href: resourcePath(series, 'circuit', selected.circuitId) },
            { label: 'Round', value: Number(selected.round) }, { label: 'Date', value: date || 'Not recorded' }], assumptions);
}

module.exports = { calculateCalendarQuestion, completedCalendar };
