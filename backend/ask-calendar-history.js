const { completedCalendar } = require('./ask-calendar-calculations');
const { normaliseSeries } = require('./series-config');
const { resourcePath } = require('./resource-routes');

const SERIES_NAMES = Object.freeze({ f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy', fe: 'Formula E', wec: 'WEC' });

function problem(message) {
    const error = new Error(message);
    error.statusCode = 422;
    return error;
}

function normalizeName(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/\b(?:the|grand prix|gp|e-prix|prix|race|event|circuit|track|venue)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ').trim();
}

function dateText(value) {
    if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    return String(value || '').slice(0, 10);
}

function eventEvidence(series, row) {
    return { label: `${row.year} · round ${Number(row.round)}`, value: `${row.name} at ${row.circuitName} · ${dateText(row.date)} · ${Number(row.raceCount || 0)} recorded race session(s)`,
        href: resourcePath(series, 'race', row.id, row.name) };
}

function identity(row, kind) {
    return kind === 'circuit' ? String(row.circuitId)
        : kind === 'country' ? normalizeName(row.countryName) : normalizeName(row.name);
}

function name(row, kind) {
    return kind === 'circuit' ? row.circuitName : kind === 'country' ? row.countryName : row.name;
}

function matchName(calendar, requested, kind) {
    const normalized = normalizeName(requested);
    if (!normalized) throw problem(`Name an archive ${kind} for this calendar question.`);
    const distinct = [...new Map(calendar.filter(row => name(row, kind))
        .map(row => [identity(row, kind), { key: identity(row, kind), name: name(row, kind) }])).values()];
    const exact = distinct.filter(row => normalizeName(row.name) === normalized);
    const matches = exact.length ? exact : distinct.filter(row => normalizeName(row.name).includes(normalized));
    if (!matches.length) throw problem(`No recorded ${kind} matches “${requested}” in this championship.`);
    if (matches.length > 1) throw problem(`Several ${kind}s match “${requested}”: ${matches.slice(0, 5).map(row => row.name).join(', ')}. Name one more precisely.`);
    return matches[0];
}

function response(intent, series, answer, title, rows, kind, assumptions, scope = {}) {
    return { intent, answer, entityLabel: SERIES_NAMES[series], fact: { title, rows },
        methodology: { source: 'Completed events with recorded race classifications in the Racelytic archive.',
            coverage: `${SERIES_NAMES[series]} recorded calendar history`, sample: `${rows.length} supporting event rows.` },
        scope: { series, calendarHistoryKind: kind, completedOnly: true, ...scope }, assumptions };
}

async function calculateCalendarHistory(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    let kind = ['event', 'country'].includes(interpretation.calendarHistoryKind) ? interpretation.calendarHistoryKind : 'circuit';
    const calendar = await completedCalendar(connection, series, null);
    if (!calendar.length) throw problem(`No completed ${SERIES_NAMES[series]} races are recorded.`);
    const assumptions = ['Only events with a recorded race classification are counted.',
        kind === 'event' ? 'Event names are grouped by their recorded title; renamed events are not merged.'
            : kind === 'country' ? 'Host countries use recorded circuit country metadata.'
                : 'Circuit appearances use the recorded circuit identity; layout renames attached to one circuit record are grouped.'];
    if (interpretation.intent === 'calendar_host_leader') {
        const groups = new Map();
        for (const row of calendar) {
            const key = identity(row, kind);
            if (!groups.has(key)) groups.set(key, { name: name(row, kind), rows: [] });
            groups.get(key).rows.push(row);
        }
        const ranked = [...groups.values()].map(group => ({ ...group,
            raceCount: group.rows.reduce((sum, row) => sum + Number(row.raceCount || 0), 0) }))
            .sort((a, b) => b.raceCount - a.raceCount || a.name.localeCompare(b.name));
        const leaders = ranked.filter(group => group.raceCount === ranked[0].raceCount);
        const leader = leaders[0];
        return response(interpretation.intent, series,
            `${leader.name} hosted ${leader.raceCount} recorded ${SERIES_NAMES[series]} ${leader.raceCount === 1 ? 'race' : 'races'}, the most among ${kind}s${leaders.length > 1 ? ` (tied by ${leaders.length} ${kind}s)` : ''}.`,
            `${SERIES_NAMES[series]} · most races by ${kind}`, leaders.slice(0, 10).flatMap(group => group.rows.map(row => eventEvidence(series, row))),
            kind, [...assumptions, 'Race counts include recorded sprint, feature, and main race sessions where present.'], { count: leader.raceCount });
    }
    let subject;
    try { subject = matchName(calendar, interpretation.calendarHistoryName, kind); }
    catch (error) {
        if (kind !== 'circuit' || !/No recorded circuit matches/.test(error.message)) throw error;
        try { subject = matchName(calendar, interpretation.calendarHistoryName, 'country'); }
        catch { throw error; }
        kind = 'country';
        assumptions[1] = 'Host countries use recorded circuit country metadata.';
    }
    const matches = calendar.filter(row => identity(row, kind) === subject.key);
    const years = [...new Set(matches.map(row => Number(row.year)))].sort((a, b) => a - b);
    if (interpretation.intent === 'calendar_host_years') {
        return response(interpretation.intent, series,
            `${subject.name} appears in ${years.length} ${SERIES_NAMES[series]} ${years.length === 1 ? 'season' : 'seasons'}: ${years.join(', ')}.`,
            `${subject.name} · recorded calendar years`, matches.map(row => eventEvidence(series, row)),
            kind, assumptions, { calendarHistoryName: subject.name, years });
    }
    if (interpretation.intent === 'calendar_host_boundary') {
        const direction = interpretation.chronologyDirection === 'last' ? 'last' : 'first';
        const event = direction === 'last' ? matches.at(-1) : matches[0];
        return response(interpretation.intent, series,
            `${subject.name}'s ${direction} recorded ${SERIES_NAMES[series]} appearance was ${event.name} on ${dateText(event.date)}.`,
            `${subject.name} · ${direction} appearance`, [eventEvidence(series, event)],
            kind, assumptions, { calendarHistoryName: subject.name, chronologyDirection: direction, year: Number(event.year) });
    }
    throw problem('That calendar history calculation is not available.');
}

module.exports = { calculateCalendarHistory };
