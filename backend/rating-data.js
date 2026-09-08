const { academySessionType, seriesPrefix } = require('./series-config');
const { DEFAULT_CONFIGURATION, eventBaseWeight } = require('./rating-engine');

const NON_STARTERS = /^(DNS|DNQ|DNPQ|WD|W|WIT|DNP|DNA|DNE|EX|WITHDRAWN|DID NOT START|DID NOT QUALIFY|DID NOT PREQUALIFY)$/i;
const DISQUALIFIED = /\b(?:DSQ|DQ|DISQ|DISQUALIFIED|EXC|EXCLUDED)\b/i;
const UNCLASSIFIED = /^(?:DNF|RET|RETIRED|NC|NCL|NOT CLASSIFIED)$/i;

function statusOf(row) { return String(row.positionText || row.status || '').trim(); }
function started(row) { return !NON_STARTERS.test(statusOf(row)); }
function disqualified(row) { return DISQUALIFIED.test(statusOf(row)); }
function classified(row) {
    const position = Number(row.positionNumber);
    return started(row) && !disqualified(row) && !UNCLASSIFIED.test(statusOf(row)) && position >= 1 && position < 100;
}

function participants(rows) {
    const maxLaps = Math.max(0, ...rows.filter(started).map(row => Number(row.laps) || 0));
    const unique = new Map();
    for (const row of rows) {
        const id = String(row.driverId || '');
        const order = Number(row.positionDisplayOrder || row.positionNumber || 999);
        const existing = unique.get(id);
        if (!id || (existing && Number(existing.positionDisplayOrder || existing.positionNumber || 999) <= order)) continue;
        unique.set(id, row);
    }
    return [...unique.values()].map(row => ({
        driverId: String(row.driverId || ''), driverName: row.driverName || row.driverId,
        constructorId: String(row.constructorId || ''), constructorName: row.constructorName || '',
        finishOrder: Number(row.positionDisplayOrder || row.positionNumber || 999),
        positionNumber: Number(row.positionNumber) > 0 && Number(row.positionNumber) < 100 ? Number(row.positionNumber) : null,
        positionText: statusOf(row), started: started(row), classified: classified(row), disqualified: disqualified(row),
        completion: classified(row) || disqualified(row) ? 1 : maxLaps ? Math.min(1, (Number(row.laps) || 0) / maxLaps) : 0
    }));
}

function groupEvents(rows, metadata) {
    const groups = new Map();
    for (const row of rows) {
        const key = String(row.eventId);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return [...groups.entries()].map(([id, resultRows]) => ({ ...metadata(resultRows[0]), id, participants: participants(resultRows) }));
}

function eventDistanceWeight(rows, scheduledLaps, baseWeight) {
    const completedLaps = Math.max(0, ...rows.filter(started).map(row => Number(row.laps) || 0));
    const distance = Number(scheduledLaps) > 0 ? completedLaps / Number(scheduledLaps) : 1;
    return baseWeight * Math.min(1, Math.max(.25, distance));
}

async function loadF1Events(connection) {
    const resultColumns = `result.positionDisplayOrder, result.positionNumber, result.positionText,
        result.driverId, result.constructorId, result.laps, result.reasonRetired,
        drivers.name AS driverName, constructors.name AS constructorName`;
    const races = await connection.query(`SELECT CONCAT('race:', races.id) AS eventId, races.date AS eventDate,
        races.year, races.round, races.scheduledLaps, COALESCE(NULLIF(grands_prix.fullName, ''), races.officialName) AS eventName,
        ${resultColumns}
        FROM races JOIN races_race_results result ON result.raceId = races.id
        JOIN drivers ON drivers.id = result.driverId LEFT JOIN constructors ON constructors.id = result.constructorId
        LEFT JOIN grands_prix ON grands_prix.id = races.grandPrixId
        ORDER BY races.date, races.round, result.positionDisplayOrder`);
    const sprints = await connection.query(`SELECT CONCAT('sprint:', races.id) AS eventId,
        COALESCE(races.sprintRaceDate, races.date) AS eventDate, races.year, races.round, races.sprintRaceScheduledLaps AS scheduledLaps,
        CONCAT(COALESCE(NULLIF(grands_prix.fullName, ''), races.officialName), ' · Sprint') AS eventName,
        ${resultColumns}
        FROM races JOIN races_sprint_race_results result ON result.raceId = races.id
        JOIN drivers ON drivers.id = result.driverId LEFT JOIN constructors ON constructors.id = result.constructorId
        LEFT JOIN grands_prix ON grands_prix.id = races.grandPrixId
        ORDER BY eventDate, races.round, result.positionDisplayOrder`);
    const map = (row, sessionType, baseWeight, resultRows) => ({
        series: 'f1', date: row.eventDate, year: row.year, round: row.round,
        name: row.eventName, datePrecision: 'date', sessionType,
        weight: eventDistanceWeight(resultRows, row.scheduledLaps, baseWeight)
    });
    return [
        ...groupEvents(races, row => ({ ...map(row, 'race', eventBaseWeight('race'),
            races.filter(item => item.eventId === row.eventId)), eventSequence: 2 })),
        ...groupEvents(sprints, row => ({ ...map(row, 'sprint', eventBaseWeight('sprint'),
            sprints.filter(item => item.eventId === row.eventId)), eventSequence: 1 }))
    ];
}

function juniorSessionType(series, session, index, count) {
    if (series === 'academy') return academySessionType(session, index, count, session.year);
    const name = String(session.sessionName || '').toLowerCase();
    if (name.includes('feature')) return 'F';
    if (name.includes('sprint') || name.includes('reverse')) return 'S';
    const number = Number(session.sessionNumber || 0), year = Number(session.year);
    if (number) {
        if (year <= 2020) return number <= 4 ? 'F' : 'S';
        if (year === 2021) return number >= 8 ? 'F' : 'S';
        return number >= 6 ? 'F' : 'S';
    }
    return index === count - 1 ? 'F' : 'S';
}

async function loadJuniorEvents(connection, series) {
    const prefix = seriesPrefix(series);
    const rows = await connection.query(`SELECT CONCAT(sessions.raceId, ':', sessions.id) AS eventId,
        COALESCE(sessions.startTimeUtc, races.date) AS eventDate, sessions.startTimeUtc AS sessionStartTimeUtc,
        races.year, races.round,
        races.name AS raceName, sessions.name AS sessionName, sessions.sessionNumber,
        results.positionDisplayOrder, results.positionNumber, results.status AS positionText,
        results.driverId, results.constructorId, results.laps,
        drivers.name AS driverName, constructors.name AS constructorName
        FROM ${prefix}sessions sessions JOIN ${prefix}races races ON races.id = sessions.raceId
        JOIN ${prefix}session_results results ON results.sessionId = sessions.id
        LEFT JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
        LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
        WHERE sessions.isRace = 1 AND sessions.cancelled = 0
        ORDER BY eventDate, races.round, sessions.sessionNumber, results.positionDisplayOrder`);
    const grouped = groupEvents(rows, row => ({ series, date: row.eventDate,
        datePrecision: row.sessionStartTimeUtc ? 'timestamp' : 'date', year: row.year, round: row.round,
        name: `${row.raceName} · ${row.sessionName || 'Race'}`, sessionName: row.sessionName,
        eventSequence: Number(row.sessionNumber) || 0, sessionType: '', weight: 1 }));
    const weekends = new Map();
    grouped.forEach(event => {
        const key = `${event.year}:${event.round}`;
        if (!weekends.has(key)) weekends.set(key, []);
        weekends.get(key).push(event);
    });
    for (const events of weekends.values()) {
        events.sort((a, b) => new Date(a.date) - new Date(b.date)
            || a.eventSequence - b.eventSequence || String(a.id).localeCompare(String(b.id)));
        events.forEach((event, index) => {
            const source = rows.find(row => String(row.eventId) === event.id);
            if (series === 'academy') source.name = source.sessionName;
            const type = juniorSessionType(series, source, index, events.length);
            event.sessionType = type === 'F' ? 'feature' : series === 'academy' ? 'reverse-grid' : 'sprint';
            event.eventSequence = Number(source.sessionNumber) || index + 1;
            event.weight = eventBaseWeight(event.sessionType, DEFAULT_CONFIGURATION);
        });
    }
    return grouped;
}

async function loadRatingEvents(connection, series) {
    return series === 'f1' ? loadF1Events(connection) : loadJuniorEvents(connection, series);
}

module.exports = { classified, disqualified, eventDistanceWeight, groupEvents, loadF1Events, loadJuniorEvents, loadRatingEvents, participants, started };
