const { completedCalendar } = require('./ask-calendar-calculations');
const { resourcePath } = require('./resource-routes');
const { WEC_TOOL_CATALOG } = require('./ask-tools');

function problem(message) {
    const error = new Error(message);
    error.statusCode = 422;
    return error;
}

function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/\b(?:the|24 hours of|hours of|race|wec)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseWecDetail(query) {
    const text = String(query || '').trim();
    const year = Number(text.match(/\b(20\d{2})\b/)?.[1]);
    if (!year) return null;
    const carNumber = text.match(/\bcar\s*#?\s*(\d{1,3})\b/i)?.[1];
    if (carNumber && /\bclass\b/i.test(text) && /\boverall\b/i.test(text)) {
        return { intent: 'wec_class_overall_rank', targetSeason: year, carNumber,
            eventName: text.match(/\bat\s+(.+?)\s+(?:in|during)\s+(?:the\s+)?20\d{2}\b/i)?.[1]?.trim() || null };
    }
    if (/\bhow\s+many\s+cars?\b/i.test(text) && /\b(?:enter|entered|field|fielded)\b/i.test(text)) {
        return { intent: 'wec_team_car_count', targetSeason: year,
            eventName: text.match(/\bat\s+(.+?)\s+(?:in|during)\s+(?:the\s+)?20\d{2}\b/i)?.[1]?.trim() || null,
            classCode: /\bhypercar\b/i.test(text) ? 'HYPERCAR' : /\blmp\s*2\b/i.test(text) ? 'LMP2'
                : /\blmgt\s*3\b/i.test(text) ? 'LMGT3' : null };
    }
    return null;
}

async function matchEvent(connection, plan) {
    if (!plan.eventName) return null;
    const events = await completedCalendar(connection, 'wec', plan.targetSeason);
    const needle = normalize(plan.eventName);
    let found = events.filter(row => normalize(row.name).includes(needle)
        || normalize(row.circuitName).includes(needle) || needle.includes(normalize(row.name)));
    if (found.length > 1 && needle === 'le mans') found = found.filter(row => /24 hours of le mans/i.test(row.name));
    if (found.length !== 1) throw problem(found.length ? 'Several WEC events match; name one event more precisely.'
        : `No completed ${plan.targetSeason} WEC event matches “${plan.eventName}”.`);
    return found[0];
}

function wrap(plan, answer, title, rows, event = null) {
    const tool = WEC_TOOL_CATALOG[plan.intent];
    return { intent: plan.intent, answer,
        wecEvidence: { title, columns: ['Car', 'Team', 'Class', plan.intent === 'wec_class_overall_rank' ? 'Class / overall' : 'Events'],
            rows: rows.map(row => [row.car, row.team, row.classCode, row.value,
                resourcePath('wec', 'race', event?.id || row.eventId, event?.name || row.eventName)]) },
        methodology: { source: plan.intent === 'wec_class_overall_rank' ? 'Recorded WEC race classification.' : 'Recorded WEC car entries.',
            coverage: event ? `${event.name}, ${event.year}` : `${plan.targetSeason} WEC season`, sample: `${rows.length} car records.` },
        assumptions: plan.intent === 'wec_team_car_count' && !event
            ? ['A season car is counted once by its recorded competitor identity, even if it entered several events.']
            : ['Each recorded car entry is counted once at the selected event.'],
        interpretation: { ...plan, series: 'wec', eventName: event?.name || null },
        scope: { targetSeason: plan.targetSeason, eventName: event?.name || null, classCode: plan.classCode || null },
        grounding: { grounded: true, tool: tool.id, label: tool.label,
            source: plan.intent === 'wec_class_overall_rank' ? 'WEC race classification' : 'WEC event entries', evidenceItems: rows.length } };
}

async function executeWecDetail(connection, query, parsed = parseWecDetail(query)) {
    if (!parsed) return null;
    if (parsed.intent === 'wec_class_overall_rank' && !parsed.eventName) throw problem('Name the WEC event for the car ranking.');
    const event = await matchEvent(connection, parsed);
    if (parsed.intent === 'wec_class_overall_rank') {
        const rows = await connection.query(`SELECT results.overallPosition, results.classPosition, results.status,
                classes.code AS classCode, entries.carNumber, teams.name AS teamName
            FROM wec_session_results results JOIN wec_sessions sessions ON sessions.id = results.sessionId
            JOIN wec_entries entries ON entries.id = results.entryId AND entries.eventId = results.eventId
            JOIN wec_classes classes ON classes.id = results.classId
            JOIN wec_teams teams ON teams.id = entries.teamId
            WHERE results.eventId = ? AND sessions.type = 'race' AND entries.carNumber = ?`, [event.id, parsed.carNumber]);
        if (!rows.length) throw problem(`Car #${parsed.carNumber} has no recorded race classification at ${event.name}.`);
        if (rows.length > 1) throw problem(`More than one car #${parsed.carNumber} is recorded at ${event.name}; include its class or team.`);
        const car = rows[0];
        if (!Number.isInteger(Number(car.classPosition)) || !Number.isInteger(Number(car.overallPosition))) {
            throw problem(`Car #${parsed.carNumber} has no numerical class and overall positions in the recorded classification.`);
        }
        const answer = `#${car.carNumber} ${car.teamName} finished P${car.classPosition} in ${car.classCode} and P${car.overallPosition} overall at the ${parsed.targetSeason} ${event.name}.`;
        return wrap(parsed, answer, `${parsed.targetSeason} ${event.name} · car #${car.carNumber}`,
            [{ car: `#${car.carNumber}`, team: car.teamName, classCode: car.classCode,
                value: `P${car.classPosition} / P${car.overallPosition}` }], event);
    }
    const teams = await connection.query('SELECT id, name FROM wec_teams ORDER BY CHAR_LENGTH(name) DESC');
    const search = normalize(query);
    const matches = teams.filter(row => search.includes(normalize(row.name)));
    const team = matches[0];
    if (!team) throw problem('Name a recorded WEC team for the car count.');
    const entries = await connection.query(`SELECT entries.id, entries.competitorId, entries.carNumber,
            classes.code AS classCode, events.id AS eventId, events.name AS eventName
        FROM wec_entries entries JOIN wec_events events ON events.id = entries.eventId
        JOIN wec_classes classes ON classes.id = entries.classId
        WHERE entries.teamId = ? AND events.year = ? AND events.status = 'completed'
            ${event ? 'AND events.id = ?' : ''} ${parsed.classCode ? 'AND classes.code = ?' : ''}
        ORDER BY events.round, entries.carNumber`, [team.id, parsed.targetSeason,
            ...(event ? [event.id] : []), ...(parsed.classCode ? [parsed.classCode] : [])]);
    const unique = new Map();
    for (const row of entries) {
        const key = event ? row.id : row.competitorId || `${row.classCode}:${row.carNumber}`;
        const current = unique.get(key) || { ...row, events: new Set() };
        current.events.add(row.eventId);
        unique.set(key, current);
    }
    const cars = [...unique.values()];
    const where = event ? `at the ${parsed.targetSeason} ${event.name}` : `in the ${parsed.targetSeason} WEC season`;
    return wrap({ ...parsed, subjectName: team.name }, `${team.name} entered ${cars.length} distinct ${parsed.classCode || 'WEC'} ${cars.length === 1 ? 'car' : 'cars'} ${where}.`,
        `${team.name} · ${where}`, cars.map(row => ({ car: `#${row.carNumber}`, team: team.name,
            classCode: row.classCode, value: event ? '1 event' : `${row.events.size} events`, eventId: row.eventId, eventName: row.eventName })), event);
}

module.exports = { parseWecDetail, executeWecDetail };
