const { resourcePath } = require('./resource-routes');
const { WEC_TOOL_CATALOG } = require('./ask-tools');
const { WEC_INTENT_CATALOG } = require('./ask-intents');
const { calendarQuestion, inventoryQuestion } = require('./ask-interpreter');
const { semanticFallbackProposal } = require('./ask-semantic-fallback');
const inventoryCalculations = require('./ask-inventory-calculations');
const { calculateCalendarQuestion } = require('./ask-calendar-calculations');
const { calculateCalendarHistory } = require('./ask-calendar-history');
const { calculateCareerChronology } = require('./ask-career-chronology');
const { parseWecDetail, executeWecDetail } = require('./ask-wec-details');

const CLASS_PATTERNS = Object.freeze([
    [/\bhypercar\b/i, 'HYPERCAR'],
    [/\blmp\s*1\b/i, 'LMP1'],
    [/\blmp\s*2\b/i, 'LMP2'],
    [/\blmgte[\s-]*(?:pro|professional)\b|\bgte[\s-]*pro\b/i, 'LMGTE PRO'],
    [/\blmgte[\s-]*am\b|\bgte[\s-]*am\b/i, 'LMGTE AM'],
    [/\blmgt\s*3\b|\bgt\s*3\b/i, 'LMGT3']
]);

function askError(message, statusCode = 422) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalized(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function classFromQuestion(question) {
    for (const [pattern, code] of CLASS_PATTERNS) {
        if (pattern.test(question)) return code;
    }
    return /\boverall\b/i.test(question) ? 'overall' : null;
}

function yearFromQuestion(question) {
    const match = String(question).match(/\b(20(?:1[2-9]|2[0-9]))\b/);
    return match ? Number(match[1]) : null;
}

function placeFromQuestion(question) {
    const match = String(question).match(/\b(?:at|in)\s+((?:le\s+mans|spa(?:-francorchamps)?|silverstone|fuji|monza|imola|portim[aã]o|bahrain|sebring|austin|interlagos|s[aã]o paulo))\b/i);
    return match ? match[1].replace(/\s+instead\b/i, '') : null;
}

function planWecQuestion(query, context = null) {
    const text = String(query || '').trim();
    const inventory = inventoryQuestion(text);
    const calendar = calendarQuestion(text);
    const replacement = /^\s*(?:what|how)\s+about\s+(.+?)[?.!]*$/i.exec(text)?.[1]?.trim();
    const replacementName = replacement && !/^(?:wins?|victor(?:y|ies)|podiums?|points?|drivers?|teams?|manufacturers?)$/i.test(replacement)
        ? replacement : null;
    const followUpPositions = [...text.matchAll(/\bp\s*(\d{1,2})\b/gi)].map(match => Number(match[1]));
    const followUpMilestoneCount = /\b(\d{1,4})\s+(?:wins?|victor(?:y|ies)|podiums?|points?|starts?)\b/i.exec(text);
    const followUp = /^(?:and\b|now\b|only\b|what about\b|how about\b|show\b|since\b|from\b|in\b|at\b|for\b|with\b|overall\b|hypercar\b|lmp\s*[12]\b|lmgt\s*3\b|20\d{2}\b)/i.test(text);
    const semantic = followUp ? null : semanticFallbackProposal(text);
    const inherited = followUp ? context || {} : {};
    const classCode = classFromQuestion(text) || inherited.classCode || 'overall';
    const proAm = /\bpro[\s/-]*am\b/i.test(text) || Boolean(inherited.proAm);
    const explicitYear = yearFromQuestion(text);
    const since = text.match(/\b(?:since|from)\s+(20\d{2})\b/i);
    const metric = /\bpodium/i.test(text) ? 'podiums'
        : /\bstarts?\b|\bappearances?\b/i.test(text) ? 'starts'
            : /\bwins?\b|\bvictor(?:y|ies)\b|\bwon\b|\bwinner\b/i.test(text) ? 'wins'
                : inherited.metric || null;
    const entityExplicit = /\b(?:team|teams|entries|manufacturer|manufacturers|driver|drivers)\b/i.test(text);
    const entity = /\b(?:team|teams|entries)\b/i.test(text) ? 'teams'
        : /\b(?:manufacturer|manufacturers)\b/i.test(text) ? 'manufacturers'
            : /\b(?:driver|drivers)\b/i.test(text) ? 'drivers'
                : inherited.entity || 'drivers';
    const intent = (inventory?.intent === 'competitor_season_summary' ? 'season_summary' : inventory?.intent) || calendar?.intent || (semantic?.score >= 0.9 ? semantic.intent : null) || (/\b(?:first|opening|opener)\b/i.test(text) && /\b(?:race|event|season opener)\b/i.test(text) ? 'season_opener'
        : /\bdebut\b/i.test(text) ? 'driver_debut'
            : /\b(?:last(?:\s+time)?|most recent|latest)\b/i.test(text) && /\b(?:scored?|earned?|got)\s+(?:(?:wec|hypercar|lmp1|lmp2|lmgt3|lmgte)\s+)?points?\b/i.test(text) ? 'latest_team_points'
                : /\b(?:standings|championship|champion|title)\b/i.test(text) ? 'season_standings'
        : /\b(?:classification|finishing order|race result|who won|winner of|podium at|podium in|show.*podium|p\s*1|chequered flag|checkered flag|top step)\b/i.test(text)
            ? 'race_result'
            : /\b(?:versus|vs\.?|against|compared? (?:to|with)|head[ -]to[ -]head)\b/i.test(text) ? 'head_to_head'
                : /\b(?:season summary|season totals?|season stats?|season statistics)\b/i.test(text) ? 'season_summary'
            : /\b(?:most|record|rank|top|leaders?)\b/i.test(text) ? 'record_leader'
                : /\b(?:how many|total|number of)\b/i.test(text) ? 'record_subject_total'
                    : inherited.intent || null);
    const targetSeason = ['race_result', 'season_standings', 'season_summary', 'season_opener', 'season_closer', 'season_calendar', 'season_event_count', 'adjacent_event', 'season_standings_gap', 'result_distribution', 'team_change_comparison'].includes(intent)
        ? explicitYear || inherited.targetSeason || null : null;
    const fromYear = since ? Number(since[1]) : ['record_leader', 'record_subject_total', 'head_to_head'].includes(intent)
        ? /\b(?:in|during)\s+20\d{2}\b/i.test(text) ? explicitYear : inherited.fromYear || null : null;
    const toYear = since ? null : /\b(?:in|during)\s+20\d{2}\b/i.test(text) && ['record_leader', 'record_subject_total', 'head_to_head'].includes(intent)
        ? explicitYear : inherited.toYear || null;
    const standingRound = /\b(?:after|through|at)\s+(?:round|race)\s+(\d{1,2})\b/i.exec(text)?.[1];
    const view = /\b(?:classification|finishing order|full results?)\b/i.test(text) ? 'classification'
        : /\bpodium\b/i.test(text) ? 'podium' : inherited.view || 'winner';
    return {
        intent, metric, entity: ['latest_team_points', 'latest_team_milestone'].includes(intent) ? 'teams'
            : intent === 'points_without_win' && entityExplicit && entity !== 'drivers' ? entity
                : ['team_tenure', 'team_seasons', 'teammate_events', 'debut_to_milestone', 'debut_milestone', 'milestone_never_reached', 'milestone_threshold', 'points_without_win'].includes(intent) ? 'drivers' : entity,
        entityExplicit, classCode, proAm, targetSeason, fromYear, toYear,
        standingRound: standingRound ? Number(standingRound) : inherited.standingRound || null,
        placeName: placeFromQuestion(text) || inherited.placeName || null,
        view, query: text, eventName: intent === 'consecutive_event_wins' ? inventory?.eventName || inherited.eventName || null
            : intent === 'adjacent_event' ? calendar?.eventName || inherited.eventName || null
            : intent === 'race_result' && followUp ? inherited.eventName || null : null,
        calendarDirection: intent === 'adjacent_event' ? calendar?.calendarDirection || inherited.calendarDirection || null : null,
        countUnit: intent === 'season_event_count' ? calendar?.countUnit || (/\b(?:races?|events?)\b/i.test(text)
            ? /\bevents?\b/i.test(text) ? 'events' : 'races' : null) || inherited.countUnit || null : null,
        calendarHistoryName: calendar?.intent === intent ? calendar.calendarHistoryName || null
            : ['calendar_host_years', 'calendar_host_boundary'].includes(intent) ? replacementName || inherited.calendarHistoryName || null
                : inherited.calendarHistoryName || null,
        calendarHistoryKind: calendar?.intent === intent ? calendar.calendarHistoryKind || null
            : intent === 'calendar_host_leader' && /\b(?:events?|grands?\s+prix|gps?)\b/i.test(text) ? 'event'
                : intent === 'calendar_host_leader' && /\b(?:circuits?|tracks?|venues?)\b/i.test(text) ? 'circuit'
                    : inherited.calendarHistoryKind || null,
        subjectName: inventory?.subjectName || (semantic?.intent === intent ? semantic.subjectName : null) || (['team_tenure', 'latest_team_milestone', 'latest_team_points'].includes(intent) && followUp
            ? replacementName || inherited.subjectName || null : intent === 'record_subject_total' && followUp ? inherited.subjectName || null : null),
        resultMetric: inventory?.resultMetric || inherited.resultMetric || null,
        distributionMetric: inventory?.distributionMetric || inherited.distributionMetric || null,
        failureMetric: inventory?.failureMetric || inherited.failureMetric || null,
        gapMeasure: inventory?.gapMeasure || inherited.gapMeasure || null,
        comparisonFromYear: inventory?.fromYear || inherited.comparisonFromYear || null,
        comparisonToYear: inventory?.toYear || inherited.comparisonToYear || null,
        newTeamName: inventory?.newTeamName || inherited.newTeamName || null,
        milestone: inventory?.milestone || (semantic?.intent === intent ? semantic.milestone : null) || (['debut_to_milestone', 'debut_milestone', 'milestone_never_reached', 'latest_team_milestone'].includes(intent)
            ? /\bpodiums?\b/i.test(text) ? 'podium' : /\b(?:wins?|victor(?:y|ies))\b/i.test(text) ? 'win'
                : /\bpoints?\b/i.test(text) ? 'points' : null : null) || inherited.milestone || null,
        firstPosition: inventory?.firstPosition || (followUpPositions.length === 2 ? followUpPositions[0] : inherited.firstPosition || null),
        historyMode: inventory?.historyMode || inherited.historyMode || null,
        minStarts: inventory?.minStarts || inherited.minStarts || null,
        milestoneCount: inventory?.milestoneCount || (intent === 'milestone_threshold' && followUpMilestoneCount
            ? Number(followUpMilestoneCount[1]) : inherited.milestoneCount || null),
        milestoneMeasure: inventory?.milestoneMeasure || inherited.milestoneMeasure || null,
        secondPosition: inventory?.secondPosition || (followUpPositions.length === 2 ? followUpPositions[1] : inherited.secondPosition || null),
        chronologyDirection: intent === 'milestone_threshold' && /\b(?:fewest|fastest|quickest|least)\b/i.test(text) ? null
            : inventory?.intent === intent ? inventory.chronologyDirection || null
            : calendar?.intent === intent ? calendar.chronologyDirection : semantic?.intent === intent ? semantic.chronologyDirection : inherited.chronologyDirection || null,
        extreme: inventory?.extreme || (/\b(?:largest|widest|biggest|greatest)\b/i.test(text) ? 'largest'
            : /\b(?:smallest|closest|narrowest|tightest)\b/i.test(text) ? 'smallest' : inherited.extreme || null)
    };
}

function scopeLabel(classCode) {
    return classCode === 'overall' ? 'overall' : classCode;
}

function rowLink(entity, id) {
    return resourcePath('wec', entity === 'drivers' ? 'driver' : entity === 'teams' ? 'team' : 'manufacturer', id);
}

async function matchingSubject(connection, query, entity, inheritedName) {
    const table = entity === 'drivers' ? 'wec_drivers' : entity === 'teams' ? 'wec_teams' : 'wec_manufacturers';
    const rows = await connection.query(`SELECT id, name FROM ${table} ORDER BY CHAR_LENGTH(name) DESC`);
    const search = normalized(query);
    const match = rows.find(row => search.includes(normalized(row.name)));
    if (match) return match;
    if (inheritedName) return rows.find(row => row.name === inheritedName) || null;
    throw askError(`Name a recorded WEC ${entity.slice(0, -1)} so I can calculate its total.`);
}

async function comparisonSubjects(connection, plan) {
    const table = plan.entity === 'drivers' ? 'wec_drivers' : plan.entity === 'teams' ? 'wec_teams' : 'wec_manufacturers';
    const rows = await connection.query(`SELECT id, name FROM ${table} ORDER BY CHAR_LENGTH(name) DESC`);
    const search = normalized(plan.query);
    const matches = rows.filter(row => normalized(row.name).length > 2 && search.includes(normalized(row.name)))
        .filter((row, index, all) => !all.some((other, otherIndex) => otherIndex < index && normalized(other.name).includes(normalized(row.name))));
    if (matches.length !== 2) throw askError(`Name exactly two recorded WEC ${plan.entity} for a comparison.`);
    return matches;
}

async function inferSubject(connection, plan) {
    if (plan.entityExplicit) return { entity: plan.entity, subject: await matchingSubject(connection, plan.query, plan.entity, plan.subjectName) };
    const search = normalized(plan.query);
    const candidates = [];
    for (const [entity, table] of [['drivers', 'wec_drivers'], ['teams', 'wec_teams'], ['manufacturers', 'wec_manufacturers']]) {
        const rows = await connection.query(`SELECT id, name FROM ${table}`);
        candidates.push(...rows.filter(row => search.includes(normalized(row.name))).map(subject => ({ entity, subject })));
    }
    candidates.sort((left, right) => right.subject.name.length - left.subject.name.length);
    if (candidates[0]) return candidates[0];
    return { entity: plan.entity, subject: await matchingSubject(connection, plan.query, plan.entity, plan.subjectName) };
}

async function resolvePlace(connection, plan) {
    if (!plan.placeName) return null;
    const rows = await connection.query(`SELECT id, name FROM wec_circuits ORDER BY name`);
    const requested = normalized(plan.placeName);
    const aliases = { spa: 'spa francorchamps', 'le mans': 'circuit de la sarthe', austin: 'circuit of the americas', interlagos: 'autodromo jose carlos pace' };
    const search = aliases[requested] || requested;
    const matches = rows.filter(row => normalized(row.name).includes(search) || search.includes(normalized(row.name)));
    if (matches.length !== 1) throw askError(matches.length
        ? `Several WEC circuits match ${plan.placeName}. Name the circuit more precisely.`
        : `I could not match ${plan.placeName} to a recorded WEC circuit.`);
    return matches[0];
}

async function recordAnswer(connection, plan) {
    if (!['wins', 'podiums', 'starts'].includes(plan.metric)) {
        throw askError('I can calculate WEC wins, podiums and starts from recorded race classifications. Try one of those measures.');
    }
    const { classCode, fromYear, toYear } = plan;
    if (fromYear && toYear && fromYear > toYear) throw askError('The end season must be the same as or after the start season.', 400);
    const circuit = await resolvePlace(connection, plan);
    const resolved = plan.subjectId ? { entity: plan.entity, subject: { id: plan.subjectId, name: plan.subjectName } }
        : plan.intent === 'record_subject_total' ? await inferSubject(connection, plan) : null;
    const entity = resolved?.entity || plan.entity;
    const subject = resolved?.subject || null;
    const join = entity === 'drivers'
        ? 'JOIN wec_entry_drivers crew ON crew.entryId = entries.id AND crew.eventId = events.id JOIN wec_drivers entity ON entity.id = crew.driverId'
        : entity === 'teams'
            ? 'JOIN wec_teams entity ON entity.id = entries.teamId'
            : 'JOIN wec_manufacturers entity ON entity.id = entries.manufacturerId';
    const position = classCode === 'overall' ? 'results.overallPosition' : 'results.classPosition';
    const conditions = ["sessions.type = 'race'", "results.status NOT IN ('not-started', 'did-not-start', 'dns', 'withdrawn')"];
    const params = [];
    if (classCode !== 'overall') {
        conditions.push('classes.code = ?');
        params.push(classCode);
    }
    if (fromYear) {
        conditions.push('events.year >= ?');
        params.push(fromYear);
    }
    if (toYear) { conditions.push('events.year <= ?'); params.push(toYear); }
    if (circuit) { conditions.push('events.circuitId = ?'); params.push(circuit.id); }
    if (subject) {
        conditions.push('entity.id = ?');
        params.push(subject.id);
    }
    const rows = await connection.query(`
        SELECT entity.id, entity.name, COUNT(DISTINCT events.id) AS starts,
            COUNT(DISTINCT CASE WHEN results.status = 'classified' AND ${position} = 1 THEN events.id END) AS wins,
            COUNT(DISTINCT CASE WHEN results.status = 'classified' AND ${position} BETWEEN 1 AND 3 THEN events.id END) AS podiums,
            MIN(events.year) AS firstYear, MAX(events.year) AS lastYear
        FROM wec_session_results results
        JOIN wec_sessions sessions ON sessions.id = results.sessionId
        JOIN wec_events events ON events.id = results.eventId
        JOIN wec_entries entries ON entries.id = results.entryId AND entries.eventId = events.id
        JOIN wec_classes classes ON classes.id = results.classId
        ${join}
        WHERE ${conditions.join(' AND ')}
        GROUP BY entity.id, entity.name
        ORDER BY ${plan.metric} DESC, starts DESC, entity.name
        LIMIT ${subject ? 1 : 10}
    `, params);
    if (subject && !rows.length) throw askError(`No matching WEC race classifications were found for ${subject.name} in that scope.`);
    const entries = rows.map((row, index) => ({
        rank: index + 1, id: row.id, name: row.name, value: Number(row[plan.metric] || 0),
        starts: Number(row.starts || 0), wins: Number(row.wins || 0), podiums: Number(row.podiums || 0),
        firstYear: Number(row.firstYear), lastYear: Number(row.lastYear),
        href: rowLink(entity, row.id)
    }));
    const leader = entries[0];
    const label = plan.metric === 'wins' ? 'race wins' : plan.metric === 'podiums' ? 'podiums' : 'race starts';
    const years = fromYear && toYear && fromYear === toYear ? ` in ${fromYear}`
        : `${fromYear ? ` since ${fromYear}` : ''}${toYear ? ` through ${toYear}` : ''}`;
    const scope = `${scopeLabel(classCode)} WEC${years}${circuit ? ` at ${circuit.name}` : ''}`;
    const answer = subject
        ? `${subject.name} has ${leader.value} ${scope} ${label} in the recorded archive.`
        : leader
            ? `${leader.name} leads ${scope} ${label} with ${leader.value}.`
            : `No ${scope} ${label} are recorded for that scope.`;
    return {
        intent: plan.intent, entity: entity === 'drivers' ? 'drivers' : 'constructors',
        entityLabel: entity === 'drivers' ? 'Drivers' : entity === 'teams' ? 'Teams' : 'Manufacturers',
        answer, subject: subject ? { ...subject, value: leader.value, href: rowLink(entity, subject.id) } : null,
        record: { category: plan.metric, label, total: entries.length, entries, coverage: { fromYear, toYear, circuit } },
        wecEvidence: { title: `${scope} ${label}`, columns: ['Rank', entity === 'drivers' ? 'Driver' : entity === 'teams' ? 'Team' : 'Manufacturer', label, 'Starts'], rows: entries.map(entry => [entry.rank, entry.name, entry.value, entry.starts, entry.href]) },
        methodology: { source: 'Recorded WEC race classifications and event crews.', coverage: scope, sample: `${entries.length} displayed ${entity}.` },
        assumptions: [classCode === 'overall' ? 'Wins and podiums use overall finishing positions.' : `Wins and podiums use ${classCode} class finishing positions.`, 'Each event counts at most once per driver or team. Non-starting entries are excluded.'],
        interpretation: { ...plan, entity, subjectName: subject?.name || null, placeName: circuit?.name || null },
        grounding: { grounded: true, tool: 'wec_record_search', label: 'WEC classification search', source: 'Recorded WEC race classifications', evidenceItems: entries.length }
    };
}

async function resolveEvent(connection, plan) {
    if (!plan.targetSeason) throw askError('Which WEC season should I look up? Include a year such as 2025.');
    const events = await connection.query(`
        SELECT events.id, events.year, events.round, events.name, circuits.name AS circuitName
        FROM wec_events events JOIN wec_circuits circuits ON circuits.id = events.circuitId
        WHERE events.year = ? AND events.status = 'completed' ORDER BY events.round
    `, [plan.targetSeason]);
    const words = normalized(plan.query).replace(/\b(?:20\d{2}|who|won|came|was|took|finished|p1|chequered|checkered|flag|top|step|show|the|wec|race|overall|hypercar|lmp1|lmp2|lmgte|pro|am|lmgt3|gt3|podium|classification|winner|results|at|in|of|what|about|and|now|instead)\b/g, ' ').trim();
    let matches = words
        ? events.filter(event => normalized(event.name).includes(words) || normalized(event.circuitName).includes(words))
        : plan.eventName ? events.filter(event => event.name === plan.eventName) : [];
    if (matches.length > 1 && /\ble mans\b/i.test(words) && !/\blone star\b/i.test(words)) {
        matches = matches.filter(event => /24 hours of le mans/i.test(event.name));
    }
    if (matches.length !== 1) throw askError(matches.length ? 'Several races match. Name the event more precisely.' : 'I could not match one recorded race in that season. Include the event or circuit name.');
    return matches[0];
}

async function raceAnswer(connection, plan) {
    const event = await resolveEvent(connection, plan);
    const conditions = ['results.eventId = ?', "sessions.type = 'race'"];
    const params = [event.id];
    if (plan.classCode !== 'overall') {
        conditions.push('classes.code = ?');
        params.push(plan.classCode);
    }
    const rows = await connection.query(`
        SELECT results.entryId, results.overallPosition, results.classPosition, results.status,
            classes.code AS classCode, entries.carNumber, teams.name AS teamName,
            GROUP_CONCAT(drivers.name ORDER BY crew.crewOrder SEPARATOR ', ') AS crew
        FROM wec_session_results results
        JOIN wec_sessions sessions ON sessions.id = results.sessionId
        JOIN wec_entries entries ON entries.id = results.entryId AND entries.eventId = results.eventId
        JOIN wec_classes classes ON classes.id = results.classId
        JOIN wec_teams teams ON teams.id = entries.teamId
        LEFT JOIN wec_entry_drivers crew ON crew.entryId = entries.id AND crew.eventId = entries.eventId
        LEFT JOIN wec_drivers drivers ON drivers.id = crew.driverId
        WHERE ${conditions.join(' AND ')}
        GROUP BY results.entryId, results.overallPosition, results.classPosition, results.status,
            classes.code, entries.carNumber, teams.name
        ORDER BY ${plan.classCode === 'overall' ? 'results.overallPosition' : 'results.classPosition'} IS NULL,
            ${plan.classCode === 'overall' ? 'results.overallPosition' : 'results.classPosition'}, entries.carNumber
    `, params);
    if (!rows.length) throw askError('No recorded race classification was found for that event and class.');
    const classified = rows.filter(row => row.status === 'classified');
    const shown = plan.view === 'winner' ? classified.slice(0, 1) : plan.view === 'podium' ? classified.slice(0, 3) : rows;
    if (!shown.length) throw askError('No classified cars were recorded for that event and class.');
    const first = shown[0];
    const label = `${plan.classCode === 'overall' ? 'overall' : plan.classCode} ${plan.view}`;
    const answer = plan.view === 'winner'
        ? `#${first.carNumber} ${first.teamName} won the ${plan.classCode === 'overall' ? 'overall' : plan.classCode} classification at the ${plan.targetSeason} ${event.name}; the crew was ${first.crew}.`
        : `The ${plan.classCode === 'overall' ? 'overall' : plan.classCode} ${plan.view} for the ${plan.targetSeason} ${event.name} is shown below.`;
    return {
        intent: 'race_result', answer, race: event,
        wecEvidence: { title: `${plan.targetSeason} ${event.name} · ${label}`, columns: ['Position', 'Car and team', 'Crew', 'Class'], rows: shown.map(row => [plan.classCode === 'overall' ? row.overallPosition || '—' : row.classPosition || '—', `#${row.carNumber} ${row.teamName}`, row.crew || '—', row.classCode, resourcePath('wec', 'race', event.id, event.name)]) },
        methodology: { source: 'Official WEC race classification stored in the Racelytic archive.', coverage: `${event.name}, ${event.year}`, sample: `${rows.length} classified or recorded entries.`, href: resourcePath('wec', 'race', event.id, event.name) },
        assumptions: [plan.classCode === 'overall' ? 'Positions are the overall race classification.' : `Positions are within the ${plan.classCode} class.`, 'Each car is one classified entry; crew names are listed in recorded order.'],
        interpretation: { ...plan, eventName: event.name },
        grounding: { grounded: true, tool: 'wec_race_classification', label: 'WEC race classification', source: 'Official WEC race results', evidenceItems: shown.length }
    };
}

async function standingsAnswer(connection, plan) {
    if (!plan.targetSeason) throw askError('Include a WEC season year for the standings.');
    if (plan.classCode === 'overall') throw askError('WEC has separate class championships. Name a class, such as Hypercar, LMP2 or LMGT3.');
    const entityType = plan.entity === 'drivers' ? 'driver' : plan.entity === 'teams' ? 'competitor' : 'manufacturer';
    const championships = await connection.query(`
        SELECT championships.id, championships.name FROM wec_championships championships
        JOIN wec_classes classes ON classes.id = championships.classId
        WHERE classes.year = ? AND classes.code = ? AND championships.entityType = ?
    `, [plan.targetSeason, plan.classCode, entityType]);
    const selected = championships.length === 1 ? championships
        : championships.filter(championship => championship.id.includes('pro-am') === plan.proAm);
    if (selected.length !== 1) throw askError(selected.length
        ? 'More than one championship matches that class and entity. Please name the championship more precisely.'
        : 'No official standings are recorded for that season, class and entity.');
    const championship = selected[0];
    const rows = await connection.query(`
        SELECT standings.position, standings.entityId, standings.points, standings.championshipWon,
            COALESCE(drivers.name, manufacturers.name, CONCAT('#', competitors.carNumber, ' ', teams.name)) AS name
        FROM wec_standings standings
        LEFT JOIN wec_drivers drivers ON ? = 'driver' AND drivers.id = standings.entityId
        LEFT JOIN wec_manufacturers manufacturers ON ? = 'manufacturer' AND manufacturers.id = standings.entityId
        LEFT JOIN wec_competitors competitors ON ? = 'competitor' AND competitors.id = standings.entityId
        LEFT JOIN wec_teams teams ON teams.id = competitors.teamId
        WHERE standings.championshipId = ?
          AND standings.round = ${plan.standingRound ? '?' : '(SELECT MAX(round) FROM wec_standings WHERE championshipId = ?)'}
        ORDER BY standings.position, standings.entityId LIMIT 30
    `, [entityType, entityType, entityType, championship.id, plan.standingRound || championship.id]);
    if (!rows.length) throw askError(plan.standingRound
        ? `No standings are recorded after round ${plan.standingRound} for that championship.`
        : 'That championship has no recorded standings yet.');
    const leader = rows[0];
    const champion = !plan.standingRound && ['1', 'true'].includes(String(leader.championshipWon).toLowerCase());
    const roundLabel = plan.standingRound ? ` after round ${plan.standingRound}` : '';
    return {
        intent: 'season_standings',
        answer: champion
            ? `${leader.name} won the ${plan.targetSeason} ${plan.classCode} ${plan.entity} championship with ${Number(leader.points)} points.`
            : `${leader.name} leads the recorded ${plan.targetSeason} ${plan.classCode} ${plan.entity} standings${roundLabel} with ${Number(leader.points)} points.`,
        wecEvidence: { title: `${championship.name}${roundLabel}`, columns: ['Rank', plan.entity === 'drivers' ? 'Driver' : plan.entity === 'teams' ? 'Entry' : 'Manufacturer', 'Points'], rows: rows.map(row => [row.position, row.name, Number(row.points), null, plan.entity === 'teams' ? resourcePath('wec', 'entry', row.entityId) : rowLink(plan.entity, row.entityId)]) },
        methodology: { source: 'Official WEC championship standings stored in the Racelytic archive.', coverage: `${plan.targetSeason} ${plan.classCode}${roundLabel}`, sample: `${rows.length} standing entries.`, href: resourcePath('wec', 'season', plan.targetSeason) },
        assumptions: [plan.standingRound ? `Only the recorded table after round ${plan.standingRound} is used; its leader is not treated as the final champion.` : 'The latest recorded standings round is used. In an ongoing season this is a leader, not a champion.', 'Team championships are entry based, so car numbers remain distinct.'],
        interpretation: plan,
        grounding: { grounded: true, tool: 'wec_official_standings', label: 'WEC championship standings', source: 'Official WEC standings', evidenceItems: rows.length }
    };
}

async function comparisonAnswer(connection, plan) {
    if (!plan.metric) throw askError('Choose wins, podiums or starts for the WEC comparison.');
    const subjects = await comparisonSubjects(connection, plan);
    const results = await Promise.all(subjects.map(subject => recordAnswer(connection, {
        ...plan, intent: 'record_subject_total', subjectId: subject.id, subjectName: subject.name
    })));
    const entries = results.map(result => result.record.entries[0]);
    const [first, second] = entries;
    const label = plan.metric === 'wins' ? 'wins' : plan.metric === 'podiums' ? 'podiums' : 'starts';
    const scope = results[0].methodology.coverage;
    return {
        intent: 'head_to_head',
        answer: `${first.name} has ${first.value} ${label} and ${second.name} has ${second.value} ${label} in ${scope}.`,
        wecEvidence: { title: `${label} · ${scope}`, linkColumn: 0, columns: [plan.entity === 'drivers' ? 'Driver' : plan.entity === 'teams' ? 'Team' : 'Manufacturer', label, 'Starts'],
            rows: entries.map(entry => [entry.name, entry.value, entry.starts, null, entry.href]) },
        methodology: { source: 'Recorded WEC race classifications and event crews.', coverage: scope, sample: 'Two competitors compared.' },
        assumptions: results[0].assumptions,
        interpretation: { ...plan, subjectNames: subjects.map(subject => subject.name), placeName: results[0].interpretation.placeName },
        grounding: { grounded: true, tool: 'wec_head_to_head', label: 'WEC competitor comparison', source: 'Recorded WEC race classifications', evidenceItems: 2 }
    };
}

async function seasonSummaryAnswer(connection, plan) {
    if (!plan.targetSeason) throw askError('Include a season year for the competitor summary.');
    const result = await recordAnswer(connection, {
        ...plan, intent: 'record_subject_total', metric: 'wins', fromYear: plan.targetSeason, toYear: plan.targetSeason
    });
    const entry = result.record.entries[0];
    return {
        ...result, intent: 'season_summary',
        answer: `${entry.name} recorded ${entry.starts} starts, ${entry.wins} wins and ${entry.podiums} podiums in ${result.methodology.coverage}.`,
        wecEvidence: { title: `${entry.name} · ${plan.targetSeason}`, linkColumn: 0, columns: ['Competitor', 'Starts', 'Wins', 'Podiums'],
            rows: [[entry.name, entry.starts, entry.wins, entry.podiums, entry.href]] },
        interpretation: { ...result.interpretation, intent: 'season_summary', targetSeason: plan.targetSeason },
        grounding: { ...result.grounding, tool: 'wec_competitor_season', label: 'WEC competitor season summary' }
    };
}

function wecDate(value) {
    if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return String(value || '').slice(0, 10);
}

function chronologyEvidence(intent, plan, answer, title, rows, assumptions) {
    return {
        intent, answer,
        wecEvidence: { title, columns: ['Fact', 'Recorded value'], rows: rows.map(([label, value, href]) => [label, value, null, null, href || null]) },
        methodology: { source: 'Recorded WEC events and official race classifications.', coverage: title,
            sample: `${rows.length} supporting archive facts.` },
        assumptions,
        interpretation: plan,
        grounding: { grounded: true, tool: WEC_TOOL_CATALOG[intent].id,
            label: WEC_TOOL_CATALOG[intent].label, source: 'Recorded WEC events and race classifications', evidenceItems: rows.length }
    };
}

async function seasonOpenerAnswer(connection, plan) {
    if (!plan.targetSeason) throw askError('Include a WEC season year for the opening race.');
    const rows = await connection.query(`SELECT events.id, events.name, events.year, events.round, events.date,
            circuits.id AS circuitId, circuits.name AS circuitName, circuits.placeName
        FROM wec_events events JOIN wec_circuits circuits ON circuits.id = events.circuitId
        WHERE events.year = ? AND events.status = 'completed'
            AND EXISTS (SELECT 1 FROM wec_session_results results
                JOIN wec_sessions sessions ON sessions.id = results.sessionId
                WHERE results.eventId = events.id AND sessions.type = 'race')
        ORDER BY events.round, events.date LIMIT 1`, [plan.targetSeason]);
    const event = rows[0];
    if (!event) throw askError(`No completed WEC opening race is recorded for ${plan.targetSeason}.`);
    const date = wecDate(event.date);
    const answer = `The first recorded WEC race of ${plan.targetSeason} was ${event.name}, held at ${event.circuitName}${event.placeName ? ` in ${event.placeName}` : ''}${date ? ` on ${date}` : ''}.`;
    return chronologyEvidence('season_opener', plan, answer, `WEC ${plan.targetSeason} opening race`, [
        ['Race', event.name, resourcePath('wec', 'race', event.id, event.name)],
        ['Circuit', event.circuitName, resourcePath('wec', 'circuit', event.circuitId)],
        ['Round', Number(event.round)], ['Date', date || 'Not recorded']
    ], ['The first completed round with a recorded race classification is used.']);
}

async function driverDebutAnswer(connection, plan) {
    const driver = await matchingSubject(connection, plan.query, 'drivers', plan.subjectName);
    const rows = await connection.query(`SELECT events.id, events.name, events.year, events.round, events.date,
            circuits.name AS circuitName
        FROM wec_entry_drivers crew
        JOIN wec_session_results results ON results.entryId = crew.entryId AND results.eventId = crew.eventId
        JOIN wec_sessions sessions ON sessions.id = results.sessionId
        JOIN wec_events events ON events.id = crew.eventId
        LEFT JOIN wec_circuits circuits ON circuits.id = events.circuitId
        WHERE crew.driverId = ? AND sessions.type = 'race'
            AND results.status NOT IN ('not-started','did-not-start','dns','withdrawn')
        ORDER BY events.date, events.round LIMIT 1`, [driver.id]);
    const event = rows[0];
    if (!event) throw askError(`No recorded WEC race start was found for ${driver.name}.`);
    const date = wecDate(event.date);
    const answer = `${driver.name}'s first recorded WEC race start was ${event.name} in ${event.year}${date ? ` on ${date}` : ''}.`;
    return chronologyEvidence('driver_debut', { ...plan, subjectName: driver.name }, answer,
        `${driver.name} · first WEC race start`, [
            ['Driver', driver.name, rowLink('drivers', driver.id)],
            ['Race', event.name, resourcePath('wec', 'race', event.id, event.name)],
            ['Circuit', event.circuitName || 'Not recorded'], ['Date', date || 'Not recorded']
        ], ['Debut means the first recorded race start, not first entry or practice appearance.']);
}

async function latestTeamPointsAnswer(connection, plan) {
    const team = await matchingSubject(connection, plan.query, 'teams', plan.subjectName);
    const rows = await connection.query(`SELECT events.id, events.name, events.year, events.round, events.date,
            SUM(results.points) AS points
        FROM wec_session_results results
        JOIN wec_sessions sessions ON sessions.id = results.sessionId
        JOIN wec_classes classes ON classes.id = results.classId
        JOIN wec_entries entries ON entries.id = results.entryId AND entries.eventId = results.eventId
        JOIN wec_events events ON events.id = results.eventId
        WHERE entries.teamId = ? AND sessions.type = 'race' AND results.points > 0
            AND (? = 'overall' OR classes.code = ?)
        GROUP BY events.id, events.name, events.year, events.round, events.date
        ORDER BY events.date DESC, events.round DESC LIMIT 1`, [team.id, plan.classCode, plan.classCode]);
    const event = rows[0];
    if (!event) throw askError(`No WEC race points are recorded for ${team.name}.`);
    const date = wecDate(event.date);
    const points = Number(event.points || 0);
    const answer = `${team.name} last scored ${points} ${plan.classCode === 'overall' ? 'WEC' : `${plan.classCode} WEC`} points at the ${event.name}${date ? ` on ${date}` : ` in ${event.year}`}.`;
    return chronologyEvidence('latest_team_points', { ...plan, entity: 'teams', subjectName: team.name }, answer,
        `${team.name} · latest WEC race points`, [
            ['Team', team.name, rowLink('teams', team.id)],
            ['Race', event.name, resourcePath('wec', 'race', event.id, event.name)],
            ['Points', points], ['Date', date || 'Not recorded']
        ], ['Only recorded race classification points are included; championship bonuses are excluded.', `Scope: ${plan.classCode === 'overall' ? 'overall WEC' : plan.classCode}.`]);
}

async function executeWecQuestion(connection, query, context = null) {
    const wecDetail = parseWecDetail(query);
    if (wecDetail) return executeWecDetail(connection, query, wecDetail);
    const plan = planWecQuestion(query, context);
    if (['calendar_host_years', 'calendar_host_boundary', 'calendar_host_leader'].includes(plan.intent)) {
        if (yearFromQuestion(query) || plan.placeName || plan.classCode !== 'overall' || plan.standingRound
            || /\b(?:since|from|before|after|qualifying|wet|rainy|night|sprint)\b/i.test(query)) {
            throw askError('That year, place, class, round or condition filter is not supported for this WEC calendar history question.');
        }
        const result = await calculateCalendarHistory(connection, { ...plan, series: 'wec' });
        const tool = WEC_TOOL_CATALOG[plan.intent];
        return { ...result, interpretation: plan,
            wecEvidence: { title: result.fact.title, columns: ['Fact', 'Recorded value'],
                rows: result.fact.rows.map(row => [row.label, row.value, null, null, row.href || null]) },
            grounding: { grounded: true, tool: tool.id, label: tool.label,
                source: result.methodology.source, evidenceItems: result.fact.rows.length } };
    }
    if (['driver_last_start', 'team_boundary_start', 'competitor_milestone'].includes(plan.intent)) {
        if (yearFromQuestion(query) || plan.placeName || plan.standingRound || plan.proAm
            || /\b(?:qualifying|wet|rainy|night|sprint)\b/i.test(query)) {
            throw askError('That year, circuit, round, subclass or condition filter is not supported for this WEC chronology question.');
        }
        const result = await calculateCareerChronology(connection, { ...plan, series: 'wec' });
        const tool = WEC_TOOL_CATALOG[plan.intent];
        return { ...result, interpretation: plan,
            wecEvidence: { title: result.fact.title, columns: ['Fact', 'Recorded value'],
                rows: result.fact.rows.map(row => [row.label, row.value, null, null, row.href || null]) },
            scope: { entity: plan.entity, classCode: plan.classCode, subjectName: plan.subjectName },
            grounding: { grounded: true, tool: tool.id, label: tool.label,
                source: result.methodology.source, evidenceItems: result.fact.rows.length } };
    }
    if (['season_closer', 'season_calendar', 'season_event_count', 'adjacent_event'].includes(plan.intent)) {
        if (plan.placeName || plan.classCode !== 'overall' || plan.standingRound || /\b(?:sprint|qualifying|wet|rainy|night)\b/i.test(query)) {
            throw askError('That circuit, class, round or condition filter is not supported for this WEC calendar question.');
        }
        const result = await calculateCalendarQuestion(connection, { ...plan, series: 'wec' });
        const tool = WEC_TOOL_CATALOG[plan.intent];
        return { ...result, interpretation: plan,
            wecEvidence: { title: result.fact.title, columns: ['Fact', 'Recorded value'],
                rows: result.fact.rows.map(row => [row.label, row.value, null, null, row.href || null]) },
            scope: { targetSeason: plan.targetSeason, countUnit: plan.countUnit, calendarDirection: plan.calendarDirection },
            grounding: { grounded: true, tool: tool.id, label: tool.label,
                source: result.methodology.source, evidenceItems: result.fact.rows.length } };
    }
    const inventoryHandlers = {
        lineup_record: require('./ask-result-analytics').lineupRecord,
        consecutive_event_wins: require('./ask-result-analytics').consecutiveEventWins,
        team_change_comparison: require('./ask-result-analytics').teamChangeComparison,
        compare_seasons: require('./ask-result-analytics').compareSeasons,
        longest_milestone_gap: require('./ask-result-analytics').longestMilestoneGap,
        best_worst_result: require('./ask-result-analytics').bestWorstResult,
        result_distribution: require('./ask-result-analytics').resultDistribution,
        latest_failure: require('./ask-result-analytics').latestFailure,
        milestone_threshold: inventoryCalculations.milestoneThreshold,
        debut_milestone: inventoryCalculations.debutMilestone,
        milestone_never_reached: inventoryCalculations.milestoneNeverReached,
        team_tenure: inventoryCalculations.teamTenure,
        team_seasons: inventoryCalculations.teamSeasons,
        teammate_events: inventoryCalculations.teammateEvents,
        debut_to_milestone: inventoryCalculations.firstMilestone,
        standings_gap: inventoryCalculations.standingsGap,
        season_standings_gap: inventoryCalculations.seasonStandingsGap,
        top_four_spread: inventoryCalculations.topFourSpread,
        latest_team_milestone: inventoryCalculations.latestTeamMilestone,
        points_without_win: inventoryCalculations.mostPointsWithoutWin,
        driver_team_history: require('./ask-team-history').driverTeamHistory
    };
    if (inventoryHandlers[plan.intent]) {
        if (['debut_milestone', 'milestone_never_reached', 'milestone_threshold'].includes(plan.intent)
            && /\b(?:teams?|manufacturers?|entries|cars?)\b/i.test(query)) {
            throw askError('This calculation covers drivers. Ask for WEC drivers in one class.');
        }
        if (/\b(?:sprint|qualifying|wet|rainy|night)\b/i.test(query)) {
            throw askError('That race-format or condition filter is not supported by this WEC calculation.');
        }
        if (!['season_standings_gap', 'result_distribution', 'compare_seasons', 'team_change_comparison'].includes(plan.intent) && yearFromQuestion(query) || plan.intent !== 'consecutive_event_wins' && plan.placeName || plan.standingRound || /\b(?:since|from|before|after)\s+20\d{2}\b/i.test(query)) {
            throw askError('That year, circuit or round filter is not supported for this WEC calculation.');
        }
        if (plan.intent === 'best_worst_result' && plan.resultMetric !== 'race_finish' && plan.classCode === 'overall') {
            throw askError('Choose one WEC class for a driver’s final standings comparison.');
        }
        if (plan.intent === 'compare_seasons' && plan.classCode === 'overall') throw askError('Choose one WEC class for the two-season comparison.');
        if (plan.intent === 'team_change_comparison' && plan.classCode === 'overall') throw askError('Choose one WEC class for the team-stint comparison.');
        if (plan.intent === 'consecutive_event_wins' && plan.classCode === 'overall') throw askError('Choose one WEC class for consecutive event wins.');
        if (plan.intent === 'lineup_record' && plan.classCode === 'overall') throw askError('Choose one WEC class to rank car crews.');
        if (['standings_gap', 'season_standings_gap', 'top_four_spread', 'points_without_win', 'debut_to_milestone', 'debut_milestone', 'milestone_never_reached', 'milestone_threshold'].includes(plan.intent) && plan.classCode === 'overall') {
            throw askError('Choose a WEC class for final championship comparisons, for example Hypercar or LMP2.');
        }
        if (['standings_gap', 'season_standings_gap', 'top_four_spread'].includes(plan.intent) && plan.entity === 'teams') {
            throw askError('WEC team standings are entry based. Ask for driver or manufacturer standings for this comparison.');
        }
        if (plan.intent === 'points_without_win' && plan.entityExplicit && plan.entity !== 'drivers') {
            throw askError('This question ranks driver seasons. Ask for WEC drivers in one class.');
        }
        if (/\bprivate(?:er)?\b/i.test(query) || plan.proAm && !['standings_gap', 'top_four_spread'].includes(plan.intent)) {
            throw askError('That WEC subclass is not supported by this calculation.');
        }
        const result = await inventoryHandlers[plan.intent](connection, { ...plan, series: 'wec',
            recordCategory: inventoryQuestion(query)?.recordCategory || null,
            fromYear: plan.intent === 'compare_seasons' ? plan.comparisonFromYear : plan.fromYear,
            toYear: plan.intent === 'compare_seasons' ? plan.comparisonToYear : plan.toYear,
            entity: plan.entity === 'manufacturers' ? 'constructors' : 'drivers' });
        const tool = WEC_TOOL_CATALOG[plan.intent];
        return { ...result, interpretation: plan,
            grounding: { grounded: true, tool: tool.id, label: tool.label,
                source: result.methodology.source, evidenceItems: result.fact.rows.length } };
    }
    if (!plan.intent) throw askError('I can calculate WEC race results, class or overall records, and class championship standings. Try asking for one of those.');
    if (/\b(?:qualifying|practice|wet|rainy|dry|tyre|tires?|fuel|lap times?|fastest laps?)\b/i.test(query)) {
        throw askError('That modifier is not supported by this WEC calculation. Ask about race wins, podiums, starts, results or standings.');
    }
    if (/\b(?:between\s+20\d{2}\s+and\s+20\d{2}|before\s+20\d{2}|until\s+20\d{2})\b/i.test(query)) {
        throw askError('That year range is not supported here. Ask for one season or use “since” followed by a year.');
    }
    if (plan.standingRound && plan.intent !== 'season_standings') {
        throw askError('A round filter can only be applied to WEC championship standings.');
    }
    if (plan.placeName && plan.intent === 'season_standings') {
        throw askError('WEC championship standings are season-wide; a circuit filter cannot be applied.');
    }
    if (['season_opener', 'driver_debut'].includes(plan.intent)
        && (plan.placeName || plan.classCode !== 'overall' || plan.standingRound)) {
        throw askError('That circuit, class or round filter is not supported for this WEC chronology question.');
    }
    if (plan.intent === 'latest_team_points' && (plan.placeName || plan.standingRound)) {
        throw askError('That circuit or round filter is not supported for this WEC chronology question.');
    }
    if (plan.intent === 'latest_team_points' && plan.proAm) {
        throw askError('A Pro/Am filter is not supported for this WEC points lookup.');
    }
    if (['driver_debut', 'latest_team_points'].includes(plan.intent) && yearFromQuestion(query)) {
        throw askError('A season filter is not supported for this WEC chronology question.');
    }
    if (plan.intent === 'driver_debut' && /\b(?:debut(?:ed|ing)?|first\s+(?:race|start|appear(?:ed|ance)?))\b.*\b(?:for|with|under|during|since|before|after|until|only|on|as)\b/i.test(query)) {
        throw askError('That team, time or condition filter is not supported for a WEC debut lookup.');
    }
    if (/\b(?:since|from)\s+20\d{2}\b/i.test(query) && !['record_leader', 'record_subject_total', 'head_to_head'].includes(plan.intent)) {
        throw askError('A starting year filter is supported for WEC records and comparisons, not this answer.');
    }
    if (!plan.placeName && /\b(?:at|in)\s+(?!20\d{2}\b|the\b|a\b|round\b|race\b|hypercar\b|lmp\b|lmgt\b|gte\b|wec\b)[a-z][a-z -]+/i.test(query)
        && ['record_leader', 'record_subject_total', 'head_to_head', 'season_summary'].includes(plan.intent)) {
        throw askError('I could not apply the requested place filter. Name a supported WEC circuit.');
    }
    const tool = WEC_INTENT_CATALOG.some(intent => intent.id === plan.intent) ? WEC_TOOL_CATALOG[plan.intent] : null;
    if (!tool) throw askError('No trusted WEC calculation is registered for that question.');
    const result = plan.intent === 'season_opener' ? await seasonOpenerAnswer(connection, plan)
        : plan.intent === 'driver_debut' ? await driverDebutAnswer(connection, plan)
            : plan.intent === 'latest_team_points' ? await latestTeamPointsAnswer(connection, plan)
    : plan.intent === 'race_result' ? await raceAnswer(connection, plan)
        : plan.intent === 'season_standings' ? await standingsAnswer(connection, plan)
            : plan.intent === 'head_to_head' ? await comparisonAnswer(connection, plan)
                : plan.intent === 'season_summary' ? await seasonSummaryAnswer(connection, plan)
                    : await recordAnswer(connection, plan);
    const interpreted = result.interpretation;
    return { ...result,
        scope: { entity: interpreted.entity, classCode: interpreted.classCode,
            targetSeason: interpreted.targetSeason, fromYear: interpreted.fromYear,
            toYear: interpreted.toYear, circuitName: interpreted.placeName,
            standingRound: interpreted.standingRound },
        grounding: { ...result.grounding, tool: tool.id, label: tool.label }
    };
}

module.exports = { classFromQuestion, executeWecQuestion, planWecQuestion };
