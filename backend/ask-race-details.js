const { completedCalendar } = require('./ask-calendar-calculations');
const { normaliseSeries } = require('./series-config');
const { resourcePath } = require('./resource-routes');

const TABLES = Object.freeze({
    race: 'races_race_results', sprint: 'races_sprint_race_results', qualifying: 'races_qualifying_results',
    grid: 'races_starting_grid_positions', fastest: 'races_fastest_laps'
});
const LABELS = Object.freeze({ grid_position: 'starting grid', race_pole: 'pole position',
    session_classification: 'session classification', event_points: 'event points', race_status: 'race status',
    grid_movement: 'grid movement', race_entries: 'race entries', fastest_race_lap: 'fastest race lap',
    qualifying_position: 'qualifying position' });

function problem(message) {
    const error = new Error(message);
    error.statusCode = 422;
    return error;
}

function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/\b(?:the|grand prix|gp|e-prix|race|event)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function matches(value, requested) {
    const needle = normalize(requested);
    const haystack = normalize(value);
    return needle && (haystack === needle || haystack.includes(needle) || needle.includes(haystack));
}

async function eventFor(connection, series, interpretation) {
    const year = Number(interpretation.targetSeason);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) throw problem('Name a season for this race question.');
    const name = String(interpretation.eventName || '').trim();
    if (!name) throw problem('Name the race or circuit for this question.');
    const calendar = await completedCalendar(connection, series, year);
    const found = calendar.filter(row => matches(row.name, name) || matches(row.circuitName, name));
    if (!found.length) throw problem(`No completed ${year} race matches “${name}” in this championship.`);
    if (found.length > 1) throw problem(`Several ${year} races match “${name}”. Name the event more precisely.`);
    return found[0];
}

async function f1Rows(connection, table, eventId) {
    if (!Object.values(TABLES).includes(table)) throw problem('That session is not recorded in this archive.');
    const rows = await connection.query(`SELECT results.*, drivers.name AS driverName, constructors.name AS teamName
        FROM ${table} results JOIN drivers ON drivers.id = results.driverId
        LEFT JOIN constructors ON constructors.id = results.constructorId
        WHERE results.raceId = ? ORDER BY results.positionDisplayOrder, results.positionNumber`, [eventId]);
    return rows.map(row => ({ ...row, positionNumber: row.positionNumber === null ? null : Number(row.positionNumber),
        points: Number(row.points || 0), gridPositionNumber: row.gridPositionNumber === null ? null : Number(row.gridPositionNumber) }));
}

function subjectFrom(rows, requested) {
    const name = String(requested || '').trim();
    if (!name) return null;
    const subjects = [...new Map(rows.flatMap(row => [
        { id: `driver:${row.driverId}`, name: row.driverName, entity: 'driver' },
        row.constructorId ? { id: `team:${row.constructorId}`, name: row.teamName, entity: 'team' } : null
    ].filter(Boolean)).map(row => [row.id, row])).values()];
    const exact = subjects.filter(row => normalize(row.name) === normalize(name));
    const found = exact.length ? exact : subjects.filter(row => matches(row.name, name));
    if (!found.length) throw problem(`No recorded driver or team matches “${name}” at this event.`);
    if (found.length > 1) throw problem(`Several competitors match “${name}”: ${found.slice(0, 5).map(row => row.name).join(', ')}. Name one more precisely.`);
    return found[0];
}

function response(intent, series, event, answer, rows, assumptions, scope = {}) {
    return { intent, answer, entityLabel: series === 'f1' ? 'Formula 1' : series.toUpperCase(),
        fact: { title: `${event.year} ${event.name} · ${LABELS[intent]}`, rows: [
            { label: 'Event', value: event.name, href: resourcePath(series, 'race', event.id, event.name) }, ...rows
        ] },
        methodology: { source: 'Recorded official event classification and session results in the Racelytic archive.',
            coverage: `${event.year} ${event.name}`, sample: `${rows.length} supporting result rows.` },
        scope: { series, targetSeason: Number(event.year), eventName: event.name, ...scope }, assumptions };
}

function entry(row, series, value) {
    return { label: row.driverName, value,
        href: resourcePath(series, 'driver', row.driverId) };
}

async function calculateF1RaceDetail(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    if (series !== 'f1') throw problem('This race detail currently requires the Formula 1 grid and session archive.');
    const event = await eventFor(connection, series, interpretation);
    const intent = interpretation.intent;
    const session = interpretation.sessionType === 'sprint' ? 'sprint'
        : interpretation.sessionType === 'qualifying' ? 'qualifying' : 'race';
    const table = TABLES[session];
    if (['grid_position', 'qualifying_position'].includes(intent)) {
        const position = Number(interpretation.resultPosition);
        if (!Number.isInteger(position) || position < 1 || position > 100) throw problem('Name a grid or qualifying position such as P3.');
        const rows = await f1Rows(connection, intent === 'grid_position' ? TABLES.grid : TABLES.qualifying, event.id);
        if (!rows.length) throw problem(`No ${intent === 'grid_position' ? 'starting grid' : 'qualifying classification'} is recorded for ${event.name}.`);
        const found = rows.filter(row => row.positionNumber === position);
        if (!found.length) throw problem(`No competitor is recorded at P${position} in that ${intent === 'grid_position' ? 'starting grid' : 'qualifying classification'}.`);
        return response(intent, series, event, `${found.map(row => row.driverName).join(' and ')} ${intent === 'grid_position' ? 'started from' : 'qualified'} P${position} at the ${event.year} ${event.name}.`,
            found.map(row => entry(row, series, `P${position}${row.gridPenalty ? ` · ${row.gridPenalty}` : ''}`)),
            [intent === 'grid_position' ? 'The recorded official starting-grid table is used after grid penalties.'
                : 'Qualifying position is taken before subsequent grid penalties.'], { resultPosition: position });
    }
    if (intent === 'race_pole') {
        const race = await f1Rows(connection, TABLES.race, event.id);
        const poles = race.filter(row => Number(row.polePosition) === 1);
        if (!poles.length) throw problem(`No official pole attribution is recorded for ${event.name}.`);
        return response(intent, series, event, `${poles.map(row => row.driverName).join(' and ')} was credited with pole at the ${event.year} ${event.name}.`,
            poles.map(row => entry(row, series, 'Official pole attribution')), ['The race result’s recorded pole-position flag is used; sprint grid position alone is not pole.']);
    }
    if (intent === 'fastest_race_lap') {
        const laps = await f1Rows(connection, TABLES.fastest, event.id);
        const fastest = laps.filter(row => row.positionNumber === 1);
        if (!fastest.length) throw problem(`No fastest race lap is recorded for ${event.name}.`);
        const result = fastest[0];
        return response(intent, series, event, `${result.driverName} set the fastest recorded race lap at the ${event.year} ${event.name}${result.time ? ` in ${result.time}` : ''}.`,
            fastest.map(row => entry(row, series, `Lap ${row.lap || '—'} · ${row.time || 'time not recorded'}`)),
            ['Fastest lap comes from the race-lap table; bonus-point eligibility is a separate scoring rule.']);
    }
    if (intent === 'event_points') {
        const race = await f1Rows(connection, TABLES.race, event.id);
        const sprint = await f1Rows(connection, TABLES.sprint, event.id);
        if (!race.length) throw problem(`No race points are recorded for ${event.name}.`);
        const subject = interpretation.subjectName ? subjectFrom([...race, ...sprint], interpretation.subjectName) : null;
        const groupByTeam = subject ? subject.entity === 'team' : interpretation.entity === 'constructors';
        const totals = new Map();
        for (const [type, rows] of [['race', race], ['sprint', sprint]]) for (const row of rows) {
            const key = String(groupByTeam ? row.constructorId : row.driverId);
            if (!key || key === 'null') continue;
            const current = totals.get(key) || { ...row, racePoints: 0, sprintPoints: 0 };
            current[type === 'race' ? 'racePoints' : 'sprintPoints'] += row.points;
            totals.set(key, current);
        }
        const all = [...totals.values()].map(row => ({ ...row, total: row.racePoints + row.sprintPoints }))
            .sort((a, b) => b.total - a.total || a.driverName.localeCompare(b.driverName));
        const selected = subject ? all.filter(row => subject.entity === 'team'
            ? String(row.constructorId) === subject.id.slice(5) : String(row.driverId) === subject.id.slice(7)) : all;
        if (!selected.length) throw problem(`No event points were recorded for ${subject?.name || 'that competitor'}.`);
        const total = selected.reduce((sum, row) => sum + row.total, 0);
        const label = subject?.name || (groupByTeam ? 'All teams' : 'All drivers');
        return response(intent, series, event, subject ? `${label} scored ${total} recorded points at the ${event.year} ${event.name}, including ${selected.reduce((sum, row) => sum + row.sprintPoints, 0)} sprint points.`
            : `The ${event.year} ${event.name} awarded ${total} recorded ${groupByTeam ? 'team' : 'driver'} points across the Grand Prix and sprint.`,
            selected.map(row => ({ label: groupByTeam ? row.teamName : row.driverName,
                value: `${row.total} total = ${row.racePoints} Grand Prix + ${row.sprintPoints} sprint`,
                href: resourcePath(series, groupByTeam ? 'constructor' : 'driver',
                    groupByTeam ? row.constructorId : row.driverId) })),
            ['Recorded race and sprint points are added; official standings adjustments outside these classifications are not inferred.'],
            { subjectName: subject?.name || null, entity: groupByTeam ? 'constructors' : 'drivers' });
    }
    const rows = await f1Rows(connection, table, event.id);
    if (!rows.length) throw problem(`No ${session} classification is recorded for ${event.name}.`);
    if (intent === 'session_classification') {
        return response(intent, series, event, `The ${event.year} ${event.name} ${session} classification has ${rows.length} recorded competitors; ${rows[0].driverName} is listed first.`,
            rows.map(row => entry(row, series, `${row.positionNumber ? `P${row.positionNumber}` : row.positionText || 'unclassified'}${session === 'qualifying' ? '' : ` · ${row.points} points`}`)),
            ['Results use the exact recorded session classification.'], { sessionType: session });
    }
    if (intent === 'race_status') {
        const filter = interpretation.statusFilter || 'retired';
        const patterns = { retired: /^(?:DNF|RET|NC)$/i, dns: /^DNS$/i, disqualified: /^(?:DSQ|DQ|DISQ|EXC)$/i };
        if (!patterns[filter]) throw problem('Choose retired, did not start, or disqualified.');
        const found = rows.filter(row => patterns[filter].test(String(row.positionText || '')));
        return response(intent, series, event, `${found.length} ${found.length === 1 ? 'competitor was' : 'competitors were'} recorded as ${filter} in the ${event.year} ${event.name} ${session}.`,
            found.map(row => entry(row, series, `${row.positionText}${row.reasonRetired ? ` · ${row.reasonRetired}` : ''}`)),
            ['Result status is read from the official classification; the recorded retirement reason is displayed but not treated as an independently sourced incident explanation.'],
            { statusFilter: filter, sessionType: session });
    }
    if (intent === 'grid_movement') {
        if (session !== 'race') throw problem('Grid-to-finish movement is available for Grand Prix results only.');
        const eligible = rows.filter(row => Number.isInteger(row.gridPositionNumber) && row.gridPositionNumber > 0
            && Number.isInteger(row.positionNumber) && row.positionNumber > 0
            && /^\d+$/.test(String(row.positionText || '')))
            .map(row => ({ ...row, movement: row.gridPositionNumber - row.positionNumber }));
        if (!eligible.length) throw problem(`No comparable grid and classified finish rows are recorded for ${event.name}.`);
        const direction = interpretation.extreme === 'smallest' ? 'lost' : 'gained';
        const best = direction === 'lost' ? Math.min(...eligible.map(row => row.movement)) : Math.max(...eligible.map(row => row.movement));
        const found = eligible.filter(row => row.movement === best);
        return response(intent, series, event, `${found.map(row => row.driverName).join(' and ')} ${direction} the most positions at the ${event.year} ${event.name}: ${Math.abs(best)} places.`,
            found.map(row => entry(row, series, `Grid P${row.gridPositionNumber} → finish P${row.positionNumber} · ${best >= 0 ? '+' : ''}${best} places`)),
            ['Only competitors with a positive recorded grid position and classified numerical finish are compared.'], { extreme: interpretation.extreme || 'largest' });
    }
    if (intent === 'race_entries') {
        const mode = interpretation.entryMode === 'entered' ? 'entered' : 'started';
        const found = mode === 'entered' ? rows : rows.filter(row => !/^(?:DNS|DNQ|DNPQ|WD)$/i.test(String(row.positionText || '')));
        return response(intent, series, event, `${found.length} competitors ${mode} the ${event.year} ${event.name}.`,
            found.map(row => entry(row, series, `${row.teamName || 'Team not recorded'} · ${row.positionText || row.positionNumber || '—'}`)),
            [mode === 'entered' ? 'Entered means a competitor appears in the recorded race classification, including non-starters.'
                : 'Started excludes DNS, DNQ, pre-qualifying failures, and withdrawals.'], { entryMode: mode });
    }
    throw problem('That race detail calculation is not available.');
}

module.exports = { calculateF1RaceDetail };
