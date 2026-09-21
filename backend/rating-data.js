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
    const statusRank = row => classified(row) ? 0 : disqualified(row) ? 2 : started(row) ? 1 : 3;
    const ordered = [...unique.values()].sort((first, second) => {
        const statusDifference = statusRank(first) - statusRank(second);
        if (statusDifference) return statusDifference;
        if (classified(first) && classified(second)) {
            return Number(first.positionNumber) - Number(second.positionNumber)
                || Number(first.positionDisplayOrder || 999) - Number(second.positionDisplayOrder || 999);
        }
        return (Number(second.laps) || 0) - (Number(first.laps) || 0)
            || Number(first.positionDisplayOrder || 999) - Number(second.positionDisplayOrder || 999)
            || String(first.driverId || '').localeCompare(String(second.driverId || ''));
    });
    return ordered.map((row, index) => ({
        driverId: String(row.driverId || ''), driverName: row.driverName || row.driverId,
        constructorId: String(row.constructorId || ''), constructorName: row.constructorName || '',
        // Classification feeds occasionally reuse or mis-order the display position for NC/DSQ rows.
        // Status and completed distance establish their order before a unique ordinal is assigned.
        finishOrder: index + 1,
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
    if (series === 'fe') return 'R';
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
            event.sessionType = type === 'R' ? 'race' : type === 'F' ? 'feature' : series === 'academy' ? 'reverse-grid' : 'sprint';
            event.eventSequence = Number(source.sessionNumber) || index + 1;
            event.weight = eventBaseWeight(event.sessionType, DEFAULT_CONFIGURATION);
        });
    }
    return grouped;
}

function wecClassScope(code) {
    const value = String(code || '').toUpperCase();
    if (value === 'LMP1' || value === 'HYPERCAR') return 'top';
    if (value === 'LMP2') return 'lmp2';
    if (value === 'LMGTE PRO') return 'gt-pro';
    if (value === 'LMGTE AM' || value === 'LMGT3') return 'gt';
    return 'other';
}

function wecEntryStatus(row) {
    const status = String(row.status || '').toLowerCase();
    const position = Number(row.classPosition);
    return {
        started: status !== 'not-started',
        classified: status === 'classified' && position > 0,
        disqualified: status === 'disqualified' || status === 'excluded'
    };
}

async function loadWecEvents(connection) {
    const rows = await connection.query(`SELECT events.id AS sourceEventId, CAST(events.date AS CHAR) AS eventDate,
        events.year, events.round, events.name AS eventName,
        classes.id AS classId, classes.code AS classCode, classes.name AS className, classes.displayOrder,
        results.entryId, results.classPosition, results.status, results.laps,
        entries.carNumber, teams.name AS teamName, manufacturers.name AS manufacturerName,
        crew.driverId, crew.crewOrder, drivers.name AS driverName
        FROM wec_sessions sessions
        JOIN wec_events events ON events.id = sessions.eventId
        JOIN wec_session_results results ON results.sessionId = sessions.id AND results.eventId = sessions.eventId
        JOIN wec_classes classes ON classes.id = results.classId
        JOIN wec_entries entries ON entries.id = results.entryId AND entries.eventId = results.eventId
        JOIN wec_entry_drivers crew ON crew.entryId = entries.id AND crew.eventId = entries.eventId
        JOIN wec_drivers drivers ON drivers.id = crew.driverId
        LEFT JOIN wec_teams teams ON teams.id = entries.teamId
        LEFT JOIN wec_manufacturers manufacturers ON manufacturers.id = entries.manufacturerId
        WHERE sessions.type = 'race' AND sessions.status = 'completed' AND events.status = 'completed'
        ORDER BY events.date, events.round, classes.displayOrder, results.classPosition, crew.crewOrder`);
    const groups = new Map();
    for (const row of rows) {
        const key = `${row.sourceEventId}:${row.classId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return [...groups.entries()].map(([id, classRows]) => {
        const first = classRows[0], entries = new Map();
        const maxLaps = Math.max(0, ...classRows.map(row => Number(row.laps) || 0));
        for (const row of classRows) {
            if (!entries.has(row.entryId)) {
                const state = wecEntryStatus(row);
                entries.set(row.entryId, {
                    id: String(row.entryId), carNumber: String(row.carNumber || ''), teamName: row.teamName || '',
                    manufacturerName: row.manufacturerName || '', positionNumber: Number(row.classPosition) > 0 ? Number(row.classPosition) : null,
                    finishOrder: Number(row.classPosition) > 0 ? Number(row.classPosition) : 999,
                    status: row.status || '', laps: Number(row.laps) || 0, ...state, drivers: []
                });
            }
            const entry = entries.get(row.entryId);
            if (!entry.drivers.some(driver => driver.id === String(row.driverId))) {
                entry.drivers.push({ id: String(row.driverId), name: row.driverName || row.driverId,
                    crewOrder: Number(row.crewOrder) || 0 });
            }
        }
        for (const entry of entries.values()) {
            entry.drivers.sort((a, b) => a.crewOrder - b.crewOrder);
            entry.completion = entry.classified || entry.disqualified ? 1 : maxLaps ? Math.min(1, entry.laps / maxLaps) : 0;
        }
        return { id, sourceEventId: String(first.sourceEventId), series: 'wec', date: first.eventDate,
            datePrecision: 'date', year: Number(first.year), round: Number(first.round), eventSequence: Number(first.displayOrder) || 0,
            name: first.eventName, sessionType: 'race', weight: 1,
            classId: first.classId, classCode: first.classCode, className: first.className,
            classScope: wecClassScope(first.classCode), entries: [...entries.values()] };
    });
}

async function loadRatingEvents(connection, series) {
    return series === 'f1' ? loadF1Events(connection) : series === 'wec' ? loadWecEvents(connection) : loadJuniorEvents(connection, series);
}

module.exports = { classified, disqualified, eventDistanceWeight, groupEvents, loadF1Events, loadJuniorEvents,
    loadRatingEvents, loadWecEvents, participants, started, wecClassScope, wecEntryStatus };
