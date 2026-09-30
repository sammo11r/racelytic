const { loadStarts, qualifies } = require('./ask-inventory-calculations');
const { normaliseSeries } = require('./series-config');
const { resourcePath } = require('./resource-routes');

const SERIES_NAMES = Object.freeze({ f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy', fe: 'Formula E', wec: 'WEC' });

function problem(message) {
    const error = new Error(message);
    error.statusCode = 422;
    return error;
}

function identity(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function resolveCompetitor(rows, name, entityHint = null) {
    const requested = identity(name);
    if (!requested) throw problem('Name a recorded driver or team for this chronology question.');
    const possibleTypes = entityHint === 'drivers' ? ['drivers'] : entityHint === 'constructors' || entityHint === 'teams' ? ['teams'] : ['drivers', 'teams'];
    const candidates = [...new Map(rows.flatMap(row => possibleTypes.map(type => {
        const id = type === 'drivers' ? row.driverId : row.teamId;
        const displayName = type === 'drivers' ? row.driverName : row.teamName;
        return id && displayName ? [`${type}:${id}`, { id, name: displayName, type }] : [];
    }).filter(item => item.length)).values()).values()];
    const exact = candidates.filter(candidate => identity(candidate.name) === requested);
    const matches = exact.length ? exact : candidates.filter(candidate => identity(candidate.name).includes(requested));
    if (!matches.length) throw problem(`No recorded driver or team matches “${name}” in this championship.`);
    if (matches.length > 1) throw problem(`More than one name matches “${name}”: ${matches.slice(0, 5).map(candidate => candidate.name).join(', ')}. Name one more precisely.`);
    return matches[0];
}

function sortStarts(rows) {
    return rows.sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate))
        || Number(a.round || 0) - Number(b.round || 0)
        || Number(a.sessionNumber || 0) - Number(b.sessionNumber || 0));
}

function fact(intent, answer, series, subject, event, assumptions) {
    const subjectHref = resourcePath(series, subject.type === 'drivers' ? 'driver' : series === 'wec' ? 'team' : 'constructor', subject.id);
    return {
        intent, answer, entityLabel: SERIES_NAMES[series],
        fact: { title: `${subject.name} · ${SERIES_NAMES[series]} chronology`, rows: [
            { label: subject.type === 'drivers' ? 'Driver' : 'Team', value: subject.name, href: subjectHref },
            { label: 'Race', value: event.eventName, href: resourcePath(series, 'race', event.eventId, event.eventName) },
            { label: 'Date', value: event.eventDate || 'Not recorded' },
            { label: 'Round', value: Number(event.round || 0) },
            ...(event.position > 0 ? [{ label: 'Position', value: Number(event.position) }] : []),
            ...(event.points > 0 ? [{ label: 'Points', value: Number(event.points) }] : [])
        ] },
        methodology: { source: 'Recorded race starts and official classifications in the Racelytic archive.',
            coverage: `${SERIES_NAMES[series]} recorded race starts`, sample: 'The qualifying boundary event and subject are shown.' },
        assumptions
    };
}

async function sprintPointRows(connection) {
    const rows = await connection.query(`SELECT races.id AS eventId, COALESCE(NULLIF(gp.fullName,''), races.officialName) AS eventName,
            COALESCE(races.sprintRaceDate, races.date) AS eventDate, races.year, races.round,
            results.driverId, drivers.name AS driverName, results.constructorId AS teamId,
            constructors.name AS teamName, results.points, results.positionNumber AS position,
            results.positionText AS status
        FROM races_sprint_race_results results JOIN races ON races.id = results.raceId
        LEFT JOIN grands_prix gp ON gp.id = races.grandPrixId
        JOIN drivers ON drivers.id = results.driverId
        JOIN constructors ON constructors.id = results.constructorId
        WHERE results.points > 0`);
    return rows.map(row => ({ ...row, eventDate: row.eventDate instanceof Date
        ? `${row.eventDate.getFullYear()}-${String(row.eventDate.getMonth() + 1).padStart(2, '0')}-${String(row.eventDate.getDate()).padStart(2, '0')}`
        : String(row.eventDate || '').slice(0, 10), points: Number(row.points || 0), position: Number(row.position), sessionName: 'Sprint' }));
}

async function calculateCareerChronology(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const rows = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const intent = interpretation.intent;
    const forcedType = intent === 'driver_last_start' ? 'drivers' : intent === 'team_boundary_start' ? 'teams'
        : interpretation.entityExplicit ? interpretation.entity : null;
    const subject = resolveCompetitor(rows, interpretation.subjectName, forcedType);
    const idField = subject.type === 'drivers' ? 'driverId' : 'teamId';
    let matching = rows.filter(row => row[idField] === subject.id);
    const direction = intent === 'driver_last_start' ? 'last' : interpretation.chronologyDirection || 'first';
    const milestone = interpretation.milestone;
    if (intent === 'competitor_milestone') {
        if (!['points', 'podium', 'win', 'pole'].includes(milestone)) throw problem('Choose points, a podium, a win, or pole as the milestone.');
        if (milestone === 'pole' && series !== 'f1') throw problem('Official pole attribution in this chronology is currently available for Formula 1 only.');
        if (milestone === 'points' && series === 'f1') {
            matching = matching.concat((await sprintPointRows(connection)).filter(row => row[idField] === subject.id));
        }
        matching = matching.filter(row => milestone === 'pole' ? Number(row.polePosition) === 1 : qualifies(row, milestone, series));
    }
    sortStarts(matching);
    const event = direction === 'last' ? matching.at(-1) : matching[0];
    if (!event) throw problem(`No recorded ${milestone || 'race start'} was found for ${subject.name} in ${SERIES_NAMES[series]}.`);
    const label = intent === 'competitor_milestone' ? `${direction} recorded ${milestone === 'points' ? 'points finish' : milestone}`
        : `${direction} recorded race start`;
    const session = event.sessionName === 'Sprint' ? ' in the sprint' : '';
    const answer = `${subject.name}'s ${label} in ${SERIES_NAMES[series]} was at ${event.eventName}${session}${event.eventDate ? ` on ${event.eventDate}` : ` in ${event.year}`}.`;
    return fact(intent, answer, series, subject, event, [
        'Chronology follows recorded race starts and official results; non-starters are excluded.',
        ...(milestone === 'points' ? ['Recorded race and sprint points are included where available.'] : []),
        ...(series === 'wec' ? [`The selected scope is ${interpretation.classCode || 'overall'}; class and overall podiums/wins are distinct.`] : [])
    ]);
}

module.exports = { calculateCareerChronology, resolveCompetitor };
