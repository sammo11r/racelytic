const { isJuniorSeries, normaliseSeries, seriesPrefix } = require('./series-config');
const { resourcePath } = require('./resource-routes');

const SERIES_NAMES = { f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy', fe: 'Formula E', wec: 'WEC' };
const NON_START = new Set(['dns', 'dnq', 'dnpq', 'wd', 'wit', 'not-started', 'withdrawn']);

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

function dayNumber(value) {
    const date = dateText(value);
    return date ? Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000) : null;
}

function elapsedLabel(days) {
    const months = Math.floor(days / (365.2425 / 12));
    const years = Math.floor(months / 12);
    return `${days} calendar days${years || months ? ` (about ${years} years, ${months % 12} months)` : ''}`;
}

function fact(intent, answer, title, rows, assumptions, source = 'Recorded race classifications and official standings in the Racelytic archive.') {
    return { intent, answer, fact: { title, rows }, methodology: { source, coverage: title, sample: `${rows.length} supporting facts.` }, assumptions };
}

function link(series, type, id, name) {
    return id ? resourcePath(series, type, id, name) : null;
}

function seriesScope(series, classCode) {
    return series === 'wec' && classCode && classCode !== 'overall' ? `${classCode} WEC` : SERIES_NAMES[series];
}

function qualifies(row, milestone, series) {
    if (milestone === 'points') return row.points > 0;
    if (series === 'wec' && row.status !== 'classified') return false;
    if (['dsq', 'dq', 'disqualified', 'excluded'].includes(String(row.status || '').toLowerCase())) return false;
    return milestone === 'podium' ? row.position >= 1 && row.position <= 3 : row.position === 1;
}

async function loadStarts(connection, series, classCode = 'overall') {
    if (series === 'wec') {
        const rows = await connection.query(`SELECT events.id AS eventId, events.name AS eventName, events.date AS eventDate,
                events.year, events.round, drivers.id AS driverId, drivers.name AS driverName,
                teams.id AS teamId, teams.name AS teamName, entries.id AS entryId,
                results.points, results.classPosition, results.overallPosition,
                results.status, classes.code AS classCode
            FROM wec_entry_drivers crew
            JOIN wec_drivers drivers ON drivers.id = crew.driverId
            JOIN wec_entries entries ON entries.id = crew.entryId AND entries.eventId = crew.eventId
            JOIN wec_teams teams ON teams.id = entries.teamId
            JOIN wec_events events ON events.id = crew.eventId
            JOIN wec_session_results results ON results.entryId = entries.id AND results.eventId = events.id
            JOIN wec_sessions sessions ON sessions.id = results.sessionId AND sessions.type = 'race'
            JOIN wec_classes classes ON classes.id = results.classId
            WHERE events.status = 'completed' AND results.status NOT IN ('not-started', 'withdrawn')
                AND (? = 'overall' OR classes.code = ?)
            ORDER BY events.date, events.round`, [classCode, classCode]);
        return rows.map(row => ({ ...row, position: Number(classCode === 'overall' ? row.overallPosition : row.classPosition),
            eventDate: dateText(row.eventDate), points: Number(row.points || 0) }));
    }
    const prefix = seriesPrefix(series);
    const rows = isJuniorSeries(series)
        ? await connection.query(`SELECT races.id AS eventId, races.name AS eventName, races.date AS eventDate,
                races.year, races.round, results.driverId, drivers.name AS driverName,
                results.constructorId AS teamId, constructors.name AS teamName,
                results.sessionId, sessions.name AS sessionName, sessions.sessionNumber, results.points,
                results.positionNumber AS position, results.status
            FROM ${prefix}session_results results
            JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
            JOIN ${prefix}races races ON races.id = results.raceId
            JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
            JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
            WHERE LOWER(CAST(sessions.isRace AS CHAR)) IN ('1','true')
            ORDER BY races.date, races.round, sessions.sessionNumber`)
        : await connection.query(`SELECT races.id AS eventId, COALESCE(NULLIF(gp.fullName,''), races.officialName) AS eventName,
                races.date AS eventDate, races.year, races.round, results.driverId,
                drivers.name AS driverName, results.constructorId AS teamId, constructors.name AS teamName,
                results.points, results.polePosition, results.positionNumber AS position, results.positionText AS status
            FROM races_race_results results
            JOIN races ON races.id = results.raceId
            LEFT JOIN grands_prix gp ON gp.id = races.grandPrixId
            JOIN drivers ON drivers.id = results.driverId
            JOIN constructors ON constructors.id = results.constructorId
            ORDER BY races.date, races.round`);
    return rows.filter(row => !NON_START.has(String(row.status || '').toLowerCase()))
        .map(row => ({ ...row, eventDate: dateText(row.eventDate), points: Number(row.points || 0), position: Number(row.position) }));
}

function canonicalTeam(rows, requested) {
    const search = String(requested || '').toLowerCase().trim();
    const teams = [...new Map(rows.map(row => [String(row.teamId), { id: row.teamId, name: row.teamName }])).values()];
    const exact = teams.filter(team => team.name.toLowerCase() === search);
    const matches = exact.length ? exact : teams.filter(team => team.name.toLowerCase().includes(search));
    if (!search || !matches.length) throw problem(`No recorded team matches “${requested || ''}” in this championship.`);
    if (matches.length > 1) throw problem(`Several teams match “${requested}”: ${matches.slice(0, 5).map(team => team.name).join(', ')}. Name one team more precisely.`);
    return matches[0];
}

function grouped(rows, key) {
    const map = new Map();
    for (const row of rows) {
        const id = key(row);
        if (!map.has(id)) map.set(id, []);
        map.get(id).push(row);
    }
    return map;
}

function leaderRows(ranking, series, description, max = 5) {
    return ranking.slice(0, max).map((entry, index) => ({
        label: `${index + 1}. ${entry.name}`,
        value: `${entry.value} ${description}`,
        href: link(series, 'driver', entry.id)
    }));
}

async function teamTenure(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const scope = seriesScope(series, interpretation.classCode);
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const team = canonicalTeam(starts, interpretation.subjectName);
    const byDriver = grouped(starts, row => row.driverId);
    const ranking = [];
    for (const career of byDriver.values()) {
        career.sort((a, b) => a.eventDate.localeCompare(b.eventDate) || Number(a.round) - Number(b.round));
        const stints = [];
        let active = null;
        for (const row of career) {
            if (String(row.teamId) !== String(team.id)) { active = null; continue; }
            if (!active || Number(row.year) - Number(active.last.year) > 1) {
                active = { first: row, last: row };
                stints.push(active);
            } else active.last = row;
        }
        if (!stints.length) continue;
        const days = stints.reduce((sum, stint) => sum + dayNumber(stint.last.eventDate) - dayNumber(stint.first.eventDate), 0);
        ranking.push({ id: career[0].driverId, name: career[0].driverName, value: days, stints });
    }
    ranking.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    if (!ranking.length) throw problem(`No recorded race starts were found for ${team.name}.`);
    const winner = ranking[0];
    const evidence = [
        { label: 'Team', value: team.name, href: link(series, series === 'wec' ? 'team' : 'constructor', team.id) },
        ...leaderRows(ranking, series, 'calendar days across stints'),
        ...winner.stints.map((stint, index) => ({ label: `${winner.name} stint ${index + 1}`, value: `${stint.first.eventDate} to ${stint.last.eventDate} (${dayNumber(stint.last.eventDate) - dayNumber(stint.first.eventDate)} days)`, href: link(series, 'race', stint.first.eventId, stint.first.eventName) }))
    ];
    return fact('team_tenure', `${winner.name} has the longest recorded ${scope} driving tenure with ${team.name}: ${elapsedLabel(winner.value)} across ${winner.stints.length} stint${winner.stints.length === 1 ? '' : 's'}.`,
        `${team.name} · driving tenure`, evidence, ['Calendar time runs from the first to last recorded race start in each stint; time away from the team is excluded.', 'Contract dates are not recorded. A one-race stint contributes zero elapsed days.']);
}

async function teamSeasons(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const scope = seriesScope(series, interpretation.classCode);
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const pairs = grouped(starts, row => `${row.driverId}|${row.teamId}`);
    const ranking = [...pairs.values()].map(rows => ({ id: rows[0].driverId, name: rows[0].driverName,
        teamId: rows[0].teamId, teamName: rows[0].teamName,
        years: [...new Set(rows.map(row => Number(row.year)))].sort((a, b) => a - b) }))
        .map(entry => ({ ...entry, value: entry.years.length }))
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    if (!ranking.length) throw problem('No recorded team seasons are available in this championship.');
    const winner = ranking[0];
    return fact('team_seasons', `${winner.name} drove for ${winner.teamName} in ${winner.value} recorded ${scope} seasons, the most for one driver-team pair.`,
        `${scope} · seasons with one team`, ranking.slice(0, 10).map((entry, index) => ({ label: `${index + 1}. ${entry.name} · ${entry.teamName}`, value: `${entry.value} seasons (${entry.years.join(', ')})`, href: link(series, 'driver', entry.id) })),
        ['A season counts once when the driver has at least one recorded race start with that team.', 'Separate stints with the same team are added together.']);
}

async function teammateEvents(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const scope = seriesScope(series, interpretation.classCode);
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const events = grouped(starts, row => `${row.eventId}|${series === 'wec' ? row.entryId : row.teamId}`);
    const pairs = new Map();
    for (const rows of events.values()) {
        const drivers = [...new Map(rows.map(row => [row.driverId, row])).values()].sort((a, b) => String(a.driverId).localeCompare(String(b.driverId)));
        for (let i = 0; i < drivers.length; i++) for (let j = i + 1; j < drivers.length; j++) {
            const first = drivers[i], second = drivers[j];
            const key = `${first.driverId}|${second.driverId}`;
            if (!pairs.has(key)) pairs.set(key, { first, second, events: new Map() });
            pairs.get(key).events.set(first.eventId, first);
        }
    }
    const ranking = [...pairs.values()].map(pair => ({ ...pair, value: pair.events.size,
        ordered: [...pair.events.values()].sort((a, b) => a.eventDate.localeCompare(b.eventDate)) }))
        .sort((a, b) => b.value - a.value || a.first.driverName.localeCompare(b.first.driverName));
    if (!ranking.length) throw problem('No recorded teammate pairs were found in this championship.');
    const winner = ranking[0];
    return fact('teammate_events', `${winner.first.driverName} and ${winner.second.driverName} raced together for ${winner.value} ${scope} events, the most recorded teammate events.`,
        `${scope} · teammate events`, ranking.slice(0, 10).map((pair, index) => ({
            label: `${index + 1}. ${pair.first.driverName} and ${pair.second.driverName}`,
            value: `${pair.value} events; ${pair.ordered[0].eventName} (${pair.ordered[0].eventDate}) to ${pair.ordered.at(-1).eventName} (${pair.ordered.at(-1).eventDate})`,
            href: link(series, 'race', pair.ordered[0].eventId, pair.ordered[0].eventName)
        })), ['Both drivers must have recorded race starts at the same event for the same team; each event counts once.',
            ...(series === 'wec' ? ['In WEC, teammates must share the same car entry.'] : [])]);
}

async function firstMilestone(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const scope = seriesScope(series, interpretation.classCode);
    const milestone = interpretation.milestone || 'win';
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    if (milestone === 'points' && series === 'f1') {
        const sprints = await connection.query(`SELECT races.id AS eventId, COALESCE(NULLIF(gp.fullName,''), races.officialName) AS eventName,
                COALESCE(races.sprintRaceDate, races.date) AS eventDate, races.year, races.round,
                results.driverId, drivers.name AS driverName, results.constructorId AS teamId,
                constructors.name AS teamName, results.points, results.positionNumber AS position
            FROM races_sprint_race_results results JOIN races ON races.id = results.raceId
            LEFT JOIN grands_prix gp ON gp.id = races.grandPrixId
            JOIN drivers ON drivers.id = results.driverId
            JOIN constructors ON constructors.id = results.constructorId
            WHERE results.points > 0`);
        starts.push(...sprints.map(row => ({ ...row, eventDate: dateText(row.eventDate), points: Number(row.points), position: Number(row.position), sprint: true })));
    }
    const byDriver = grouped(starts, row => row.driverId);
    const ranking = [];
    for (const rows of byDriver.values()) {
        const races = rows.filter(row => !row.sprint).sort((a, b) => a.eventDate.localeCompare(b.eventDate)
            || Number(a.sessionNumber || 0) - Number(b.sessionNumber || 0));
        if (!races.length) continue;
        const first = races[0];
        const achieved = rows.filter(row => qualifies(row, milestone, series))
            .sort((a, b) => a.eventDate.localeCompare(b.eventDate)
                || Number(a.sessionNumber || 0) - Number(b.sessionNumber || 0))[0];
        if (!achieved) continue;
        const days = dayNumber(achieved.eventDate) - dayNumber(first.eventDate);
        if (days < 0) continue;
        ranking.push({ id: first.driverId, name: first.driverName, first, achieved, value: days,
            starts: achieved.sprint ? races.filter(row => row.eventDate <= achieved.eventDate).length : races.indexOf(achieved) + 1 });
    }
    const measure = interpretation.milestoneMeasure === 'starts' ? 'starts' : 'value';
    const shortest = interpretation.extreme === 'smallest';
    ranking.sort((a, b) => (shortest ? a[measure] - b[measure] : b[measure] - a[measure]) || a.name.localeCompare(b.name));
    if (!ranking.length) throw problem(`No drivers with a recorded first ${milestone} were found.`);
    const winner = ranking[0];
    const tied = ranking.filter(row => row[measure] === winner[measure]);
    const answer = shortest
        ? `${winner.name} reached ${milestone === 'points' ? 'first points' : `a first ${milestone}`} in ${winner[measure]} ${measure === 'starts' ? `race ${winner.starts === 1 ? 'start' : 'starts'}` : 'calendar days'} from ${scope} debut, the fewest recorded${tied.length > 1 ? ` (tied by ${tied.length} drivers)` : ''}.`
        : `${winner.name} waited ${winner.value} calendar days from ${scope} debut to first ${milestone}, the longest recorded wait among drivers who reached that milestone.`;
    return fact('debut_to_milestone', answer,
        `${scope} · debut to first ${milestone}`, [
            { label: 'Debut', value: `${winner.first.eventName} · ${winner.first.eventDate}`, href: link(series, 'race', winner.first.eventId, winner.first.eventName) },
            { label: `First ${milestone}`, value: `${winner.achieved.eventName} · ${winner.achieved.eventDate}${winner.achieved.sprint ? ' (sprint)' : ''}`, href: link(series, 'race', winner.achieved.eventId, winner.achieved.eventName) },
            { label: 'Race starts through milestone', value: winner.starts },
            ...leaderRows(shortest ? tied : ranking, series, measure === 'starts' ? 'race starts' : 'calendar days', shortest ? tied.length : 5)
        ], [series === 'wec' && interpretation.classCode !== 'overall' ? 'Debut is the first recorded race start in the selected WEC class.' : 'Debut is the first recorded race start in this championship.', 'Drivers who never reached the requested milestone are excluded from the ranking.']);
}

async function debutMilestone(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const milestone = interpretation.milestone;
    if (!['points', 'podium', 'win'].includes(milestone)) throw problem('Choose points, podium, or win for a debut result.');
    if (series === 'wec' && (!interpretation.classCode || interpretation.classCode === 'overall'))
        throw problem('Choose a WEC class for debut results, for example Hypercar or LMP2.');
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const firstByDriver = new Map();
    for (const row of starts) {
        const current = firstByDriver.get(row.driverId);
        if (!current || row.eventDate < current.eventDate || row.eventDate === current.eventDate && Number(row.sessionNumber || 0) < Number(current.sessionNumber || 0))
            firstByDriver.set(row.driverId, row);
    }
    const winners = [...firstByDriver.values()].filter(row => qualifies(row, milestone, series))
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.driverName.localeCompare(b.driverName));
    if (!winners.length) throw problem(`No driver with a recorded ${milestone} on debut was found in this championship scope.`);
    const scope = seriesScope(series, interpretation.classCode);
    return fact('debut_milestone', `${winners.length} ${scope} ${winners.length === 1 ? 'driver' : 'drivers'} ${milestone === 'win' ? 'won' : milestone === 'podium' ? 'reached the podium' : 'scored points'} on their first recorded race start: ${winners.slice(0, 8).map(row => row.driverName).join(', ')}${winners.length > 8 ? ', and others' : ''}.`,
        `${scope} · ${milestone} on debut`, winners.map(row => ({ label: row.driverName, value: `${row.eventName} · ${row.eventDate} · P${row.position || row.status || '—'}${milestone === 'points' ? ` · ${row.points} points` : ''}`,
            href: link(series, 'race', row.eventId, row.eventName) })),
        ['Debut means the first recorded race start in the selected championship and WEC class; Formula 1 uses Grand Prix starts and results.',
            'For championships with multiple race sessions at an event, only the first recorded race session is the debut.']);
}

async function milestoneNeverReached(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const milestone = interpretation.milestone;
    const minStarts = Number(interpretation.minStarts);
    if (!['points', 'podium', 'win'].includes(milestone) || !Number.isInteger(minStarts) || minStarts < 1 || minStarts > 1000)
        throw problem('Name points, podium, or win and a minimum from 1 to 1000 race starts.');
    if (series === 'wec' && (!interpretation.classCode || interpretation.classCode === 'overall'))
        throw problem('Choose a WEC class for milestone records, for example Hypercar or LMP2.');
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const byDriver = grouped(starts, row => row.driverId);
    const f1SprintScorers = milestone === 'points' && series === 'f1'
        ? new Set((await connection.query('SELECT DISTINCT driverId FROM races_sprint_race_results WHERE points > 0')).map(row => String(row.driverId)))
        : new Set();
    const missing = [...byDriver.values()].filter(rows => rows.length >= minStarts && !rows.some(row => qualifies(row, milestone, series))
        && !f1SprintScorers.has(String(rows[0].driverId)))
        .map(rows => ({ name: rows[0].driverName, count: rows.length, first: rows[0], last: rows.at(-1) }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const scope = seriesScope(series, interpretation.classCode);
    const condition = milestone === 'points' ? 'scoring points' : milestone === 'podium' ? 'a podium' : 'a win';
    const answer = interpretation.extreme === 'largest' && missing.length
        ? `${missing[0].name} has the most recorded ${scope} race starts without ${condition}: ${missing[0].count} starts.`
        : `${missing.length} ${scope} ${missing.length === 1 ? 'driver has' : 'drivers have'} at least ${minStarts} recorded race starts without ${condition}.`;
    return fact('milestone_never_reached', answer,
        `${scope} · no ${milestone} after ${minStarts} starts`, missing.map(entry => ({ label: entry.name,
            value: `${entry.count} starts; ${entry.first.eventName} (${entry.first.eventDate}) to ${entry.last.eventName} (${entry.last.eventDate})`,
            href: link(series, 'driver', entry.first.driverId) })),
        ['This is a record through the latest classified race in the archive, not a claim about future results.',
            ...(series === 'f1' && milestone === 'points' ? ['Formula 1 sprint points are checked in addition to Grand Prix points.'] : []),
            'Starts include recorded race sessions; a double-header weekend can contribute more than one start.']);
}

async function milestoneThreshold(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const milestone = interpretation.milestone;
    const threshold = Number(interpretation.milestoneCount);
    if (!['win', 'podium', 'points', 'starts'].includes(milestone) || !Number.isInteger(threshold) || threshold < 1 || threshold > 10000)
        throw problem('Name a positive milestone count, such as 10 wins or 100 points.');
    if (series === 'wec' && (!interpretation.classCode || interpretation.classCode === 'overall'))
        throw problem('Choose a WEC class for career milestone records, for example Hypercar or LMP2.');
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    if (milestone === 'points' && series === 'f1') {
        const sprints = await connection.query(`SELECT raceId AS eventId, driverId, SUM(points) AS points
            FROM races_sprint_race_results WHERE points > 0 GROUP BY raceId, driverId`);
        const byEvent = new Map(sprints.map(row => [`${row.eventId}|${row.driverId}`, Number(row.points)]));
        for (const row of starts) row.points += byEvent.get(`${row.eventId}|${row.driverId}`) || 0;
    }
    const ranking = [];
    for (const rows of grouped(starts, row => row.driverId).values()) {
        rows.sort((a, b) => a.eventDate.localeCompare(b.eventDate) || Number(a.round) - Number(b.round)
            || Number(a.sessionNumber || 0) - Number(b.sessionNumber || 0));
        let total = 0;
        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            total += milestone === 'starts' ? 1 : milestone === 'points' ? row.points : qualifies(row, milestone, series) ? 1 : 0;
            if (total < threshold) continue;
            ranking.push({ name: row.driverName, id: row.driverId, debut: rows[0], reached: row,
                starts: index + 1, elapsedDays: dayNumber(row.eventDate) - dayNumber(rows[0].eventDate), total });
            break;
        }
    }
    if (!ranking.length) throw problem(`No driver reached ${threshold} ${milestone} in the recorded ${seriesScope(series, interpretation.classCode)} archive.`);
    const chronological = interpretation.chronologyDirection === 'first';
    ranking.sort((a, b) => chronological
        ? a.reached.eventDate.localeCompare(b.reached.eventDate) || a.starts - b.starts || a.name.localeCompare(b.name)
        : a.starts - b.starts || a.elapsedDays - b.elapsedDays || a.name.localeCompare(b.name));
    const winner = ranking[0];
    const tied = ranking.filter(row => chronological ? row.reached.eventDate === winner.reached.eventDate : row.starts === winner.starts);
    const scope = seriesScope(series, interpretation.classCode);
    const unit = threshold === 1
        ? milestone === 'points' ? 'point' : milestone === 'starts' ? 'start' : milestone
        : milestone === 'win' ? 'wins' : milestone === 'podium' ? 'podiums' : milestone;
    const answer = chronological
        ? `${winner.name} was the first recorded ${scope} driver to reach ${threshold} ${unit}, at ${winner.reached.eventName} on ${winner.reached.eventDate}${tied.length > 1 ? ` (tied on that date by ${tied.length} drivers)` : ''}.`
        : `${winner.name} reached ${threshold} ${unit} in ${winner.starts} recorded ${scope} race ${winner.starts === 1 ? 'start' : 'starts'}, the fewest${tied.length > 1 ? ` (tied by ${tied.length} drivers)` : ''}.`;
    return fact('milestone_threshold', answer, `${scope} · ${threshold} ${unit} milestone`, [
        { label: 'Debut', value: `${winner.debut.eventName} · ${winner.debut.eventDate}`, href: link(series, 'race', winner.debut.eventId, winner.debut.eventName) },
        { label: 'Milestone event', value: `${winner.reached.eventName} · ${winner.reached.eventDate}`, href: link(series, 'race', winner.reached.eventId, winner.reached.eventName) },
        ...tied.map(row => ({ label: row.name, value: `${row.starts} starts · reached ${row.total} ${unit} on ${row.reached.eventDate}`,
            href: link(series, 'driver', row.id) }))
    ], ['Cumulative counts use recorded race starts and classifications in chronological order.',
        ...(series === 'f1' && milestone === 'points' ? ['Formula 1 sprint points are added to the points earned at the same Grand Prix weekend.'] : []),
        'Point thresholds use recorded race and sprint points, not season standings adjustments.']);
}

async function completedYears(connection, series) {
    const prefix = seriesPrefix(series);
    const rows = await connection.query(isJuniorSeries(series)
        ? `SELECT races.year, races.round, races.date, EXISTS(SELECT 1 FROM ${prefix}session_results results WHERE results.raceId = races.id) AS recorded FROM ${prefix}races races ORDER BY races.year, races.round`
        : `SELECT races.year, races.round, races.date, EXISTS(SELECT 1 FROM races_race_results results WHERE results.raceId = races.id) AS recorded FROM races ORDER BY races.year, races.round`);
    const seasons = grouped(rows, row => Number(row.year));
    const today = dateText(new Date());
    return new Set([...seasons].filter(([, events]) => {
        const last = events.at(-1);
        return last && Number(last.recorded) === 1 && dateText(last.date) <= today;
    }).map(([year]) => year));
}

async function loadFinalStandings(connection, series, entity = 'drivers', classCode = 'overall', proAm = false) {
    if (series === 'wec') {
        if (classCode === 'overall') throw problem('Choose a WEC class for final standings comparisons, for example Hypercar or LMP2.');
        const type = entity === 'constructors' ? 'manufacturer' : 'driver';
        const rows = await connection.query(`SELECT seasons.year, championships.id AS championshipId,
                championships.name AS championshipName, classes.code AS classCode,
                standings.position, standings.points, standings.entityId AS id,
                COALESCE(drivers.name, manufacturers.name) AS name
            FROM wec_championships championships
            JOIN wec_seasons seasons ON seasons.id = championships.seasonId AND seasons.status = 'completed'
            JOIN wec_classes classes ON classes.id = championships.classId
            JOIN wec_standings standings ON standings.championshipId = championships.id
                AND standings.round = (SELECT MAX(s2.round) FROM wec_standings s2 WHERE s2.championshipId = championships.id)
            LEFT JOIN wec_drivers drivers ON drivers.id = standings.entityId AND championships.entityType = 'driver'
            LEFT JOIN wec_manufacturers manufacturers ON manufacturers.id = standings.entityId AND championships.entityType = 'manufacturer'
            WHERE classes.code = ? AND championships.entityType = ?`, [classCode, type]);
        return rows.filter(row => row.name && (proAm ? /pro-am/i.test(row.championshipId) : !/pro-am|private/i.test(row.championshipId)))
            .map(row => ({ ...row, year: Number(row.year), position: Number(row.position), points: Number(row.points) }));
    }
    const prefix = seriesPrefix(series);
    const table = isJuniorSeries(series) ? `${prefix}season_${entity === 'drivers' ? 'driver' : 'constructor'}_standings`
        : `seasons_${entity === 'drivers' ? 'driver' : 'constructor'}_standings`;
    const subjectTable = `${prefix}${entity}`;
    const idColumn = entity === 'drivers' ? 'driverId' : 'constructorId';
    const rows = await connection.query(`SELECT standings.year, standings.positionNumber AS position,
            standings.points, subjects.id, subjects.name
        FROM ${table} standings JOIN ${subjectTable} subjects ON subjects.id = standings.${idColumn}`);
    const complete = await completedYears(connection, series);
    return rows.filter(row => complete.has(Number(row.year)))
        .map(row => ({ ...row, year: Number(row.year), position: Number(row.position), points: Number(row.points) }));
}

async function standingsGap(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const entity = interpretation.entity === 'constructors' ? 'constructors' : 'drivers';
    const firstPosition = Number(interpretation.firstPosition || 1);
    const secondPosition = Number(interpretation.secondPosition || 2);
    if (!Number.isInteger(firstPosition) || !Number.isInteger(secondPosition) || firstPosition < 1 || firstPosition >= secondPosition || secondPosition > 100) throw problem('Name two standings positions such as P3 and P4, with the first position ahead of the second.');
    const rows = await loadFinalStandings(connection, series, entity, interpretation.classCode || 'overall', interpretation.proAm);
    const championships = grouped(rows, row => `${row.year}|${row.championshipId || ''}`);
    const gaps = [];
    let missingPositions = 0;
    for (const group of championships.values()) {
        const first = group.find(row => row.position === firstPosition);
        const second = group.find(row => row.position === secondPosition);
        if (first && second) gaps.push({ first, second, gap: first.points - second.points });
        else missingPositions++;
    }
    if (!gaps.length) throw problem(`No completed ${SERIES_NAMES[series]} standings contain both P${firstPosition} and P${secondPosition} in that scope.`);
    const extreme = interpretation.extreme === 'largest' ? 'largest' : 'smallest';
    gaps.sort((a, b) => (extreme === 'largest' ? b.gap - a.gap : a.gap - b.gap) || a.first.year - b.first.year);
    const tied = gaps.filter(row => Math.abs(row.gap - gaps[0].gap) < 1e-9);
    const winner = gaps[0];
    const scope = `${SERIES_NAMES[series]} ${entity === 'drivers' ? 'driver' : series === 'wec' ? 'manufacturer' : 'team'} standings${series === 'wec' ? ` · ${interpretation.classCode}` : ''}`;
    return fact('standings_gap', `The ${extreme} final P${firstPosition}–P${secondPosition} points gap in ${scope} was ${winner.gap} ${winner.gap === 1 ? 'point' : 'points'} in ${winner.first.year}${tied.length > 1 ? `, tied across ${tied.length} seasons or championships` : ''}.`,
        `${scope} · ${extreme} P${firstPosition}–P${secondPosition} gap`, tied.slice(0, 20).flatMap(({ first, second, gap }) => [
            { label: `${first.year} P${firstPosition}`, value: `${first.name}: ${first.points} points`, href: link(series, entity === 'drivers' ? 'driver' : series === 'wec' ? 'manufacturer' : 'constructor', first.id) },
            { label: `${first.year} P${secondPosition}`, value: `${second.name}: ${second.points} points; gap ${gap}`, href: link(series, entity === 'drivers' ? 'driver' : series === 'wec' ? 'manufacturer' : 'constructor', second.id) }
        ]), [`Only completed seasons with both requested positions are compared; ${missingPositions} season or championship tables lacked one of them.`, 'Official points totals are compared without normalizing different scoring eras.']);
}

async function seasonStandingsGap(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const entity = interpretation.entity === 'constructors' ? 'constructors' : 'drivers';
    const year = Number(interpretation.targetSeason);
    const firstPosition = Number(interpretation.firstPosition);
    const secondPosition = Number(interpretation.secondPosition);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) throw problem('Name a completed season for the final standings gap.');
    if (!Number.isInteger(firstPosition) || !Number.isInteger(secondPosition) || firstPosition < 1 || firstPosition >= secondPosition || secondPosition > 100) {
        throw problem('Name two standings positions such as P3 and P4, with the first position ahead of the second.');
    }
    const rows = (await loadFinalStandings(connection, series, entity, interpretation.classCode || 'overall', interpretation.proAm))
        .filter(row => row.year === year);
    if (!rows.length) throw problem(`No completed ${SERIES_NAMES[series]} final standings are recorded for ${year} in that scope.`);
    const groups = grouped(rows, row => row.championshipId || `${year}|${entity}`);
    const matches = [...groups.values()].map(group => ({
        first: group.find(row => row.position === firstPosition),
        second: group.find(row => row.position === secondPosition)
    })).filter(pair => pair.first && pair.second);
    if (matches.length !== 1) throw problem(matches.length
        ? 'Several championships match that scope. Specify the championship more precisely.'
        : `The ${year} standings do not contain both P${firstPosition} and P${secondPosition} in that scope.`);
    const { first, second } = matches[0];
    const gap = first.points - second.points;
    const scope = `${year} ${SERIES_NAMES[series]} ${entity === 'drivers' ? 'driver' : series === 'wec' ? 'manufacturer' : 'team'} standings${series === 'wec' ? ` · ${interpretation.classCode}` : ''}`;
    const type = entity === 'drivers' ? 'driver' : series === 'wec' ? 'manufacturer' : 'constructor';
    const response = fact('season_standings_gap', `The final P${firstPosition}–P${secondPosition} gap in the ${scope} was ${gap} ${gap === 1 ? 'point' : 'points'}: ${first.name} scored ${first.points} and ${second.name} scored ${second.points}.`,
        `${scope} · P${firstPosition}–P${secondPosition} gap`, [
            { label: `P${firstPosition}`, value: `${first.name}: ${first.points} points`, href: link(series, type, first.id) },
            { label: `P${secondPosition}`, value: `${second.name}: ${second.points} points`, href: link(series, type, second.id) },
            { label: 'Gap', value: `${first.points} − ${second.points} = ${gap} points` }
        ], ['Official final standings are used for one completed season.', 'Points are subtracted in the requested position order.']);
    response.scope = { targetSeason: year, entity, classCode: series === 'wec' ? interpretation.classCode : null,
        firstPosition, secondPosition };
    return response;
}

async function topFourSpread(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const entity = interpretation.entity === 'constructors' ? 'constructors' : 'drivers';
    const standings = await loadFinalStandings(connection, series, entity, interpretation.classCode || 'overall', interpretation.proAm);
    const groups = grouped(standings, row => `${row.year}|${row.championshipId || ''}`);
    const spreads = [];
    for (const rows of groups.values()) {
        const top = [1, 2, 3, 4].map(position => rows.find(row => row.position === position));
        if (top.every(Boolean)) spreads.push({ rows: top, spread: top[0].points - top[3].points });
    }
    if (!spreads.length) throw problem(`No completed ${SERIES_NAMES[series]} standings contain a full top four in that scope.`);
    spreads.sort((a, b) => a.spread - b.spread || a.rows[0].year - b.rows[0].year);
    const tied = spreads.filter(entry => Math.abs(entry.spread - spreads[0].spread) < 1e-9);
    const winner = tied[0];
    const scope = `${SERIES_NAMES[series]} ${entity === 'drivers' ? 'driver' : series === 'wec' ? 'manufacturer' : 'team'} standings${series === 'wec' ? ` · ${interpretation.classCode}` : ''}`;
    return fact('top_four_spread', `The tightest final top four points spread in ${scope} was ${winner.spread} ${winner.spread === 1 ? 'point' : 'points'} in ${winner.rows[0].year}${tied.length > 1 ? `, tied across ${tied.length} seasons or championships` : ''}.`,
        `${scope} · tightest top four`, tied.slice(0, 10).flatMap(entry => entry.rows.map(row => ({
            label: `${row.year} P${row.position}`, value: `${row.name}: ${row.points} points`,
            href: link(series, entity === 'drivers' ? 'driver' : series === 'wec' ? 'manufacturer' : 'constructor', row.id)
        }))), [`Only completed seasons with P1 through P4 are compared; ${groups.size - spreads.length} season or championship tables lacked a full top four.`, 'The spread is P1 points minus P4 points. Official points are not normalized across scoring eras.']);
}

async function latestTeamMilestone(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const milestone = interpretation.milestone || 'points';
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    let subject;
    let type = 'team';
    try { subject = canonicalTeam(starts, interpretation.subjectName); }
    catch (error) {
        if (!/^No recorded team matches/.test(error.message)) throw error;
        const search = String(interpretation.subjectName || '').toLowerCase().trim();
        const drivers = [...new Map(starts.map(row => [String(row.driverId), { id: row.driverId, name: row.driverName }])).values()];
        const exact = drivers.filter(driver => driver.name.toLowerCase() === search);
        const found = exact.length ? exact : drivers.filter(driver => driver.name.toLowerCase().includes(search));
        if (found.length !== 1) throw problem(found.length
            ? `Several drivers match “${interpretation.subjectName}”. Name one more precisely.`
            : `No recorded driver or team matches “${interpretation.subjectName}”.`);
        subject = found[0];
        type = 'driver';
    }
    const qualified = starts.filter(row => String(type === 'team' ? row.teamId : row.driverId) === String(subject.id)
        && qualifies(row, milestone, series));
    qualified.sort((a, b) => b.eventDate.localeCompare(a.eventDate) || Number(b.round) - Number(a.round) || Number(b.sessionNumber || 0) - Number(a.sessionNumber || 0));
    if (!qualified.length) throw problem(`No recorded ${milestone} was found for ${subject.name}.`);
    const row = qualified[0];
    const eventName = /\b(?:Grand Prix|E-Prix|Hours of)\b/i.test(row.eventName) ? `the ${row.eventName}` : row.eventName;
    return fact('latest_team_milestone', `${subject.name} last ${milestone === 'win' ? 'won' : milestone === 'podium' ? 'reached the podium' : 'scored points'} at ${eventName} on ${row.eventDate}.`,
        `${subject.name} · latest ${seriesScope(series, interpretation.classCode)} ${milestone}`, [
            { label: type === 'team' ? 'Team' : 'Driver', value: subject.name,
                href: link(series, type === 'driver' ? 'driver' : series === 'wec' ? 'team' : 'constructor', subject.id) },
            { label: 'Event', value: row.eventName, href: link(series, 'race', row.eventId, row.eventName) },
            { label: 'Date', value: row.eventDate },
            { label: 'Result', value: `P${row.position}${milestone === 'points' ? ` · ${row.points} points` : ''}` }
        ], [series === 'wec' ? `WEC ${interpretation.classCode || 'overall'} classification is used.` : 'Main and feature race classifications are used for wins and podiums.']);
}

async function mostPointsWithoutWin(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const scope = seriesScope(series, interpretation.classCode);
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const standings = await loadFinalStandings(connection, series, 'drivers', interpretation.classCode || 'overall', interpretation.proAm);
    const recordedStarts = new Set(starts.map(row => `${row.year}|${row.driverId}`));
    const startCounts = new Map();
    for (const row of starts) {
        const key = `${row.year}|${row.driverId}`;
        if (!startCounts.has(key)) startCounts.set(key, new Set());
        startCounts.get(key).add(row.sessionId || row.eventId);
    }
    const wins = new Set(starts.filter(row => qualifies(row, 'win', series)).map(row => `${row.year}|${row.driverId}`));
    const ranking = standings.filter(row => recordedStarts.has(`${row.year}|${row.id}`) && !wins.has(`${row.year}|${row.id}`))
        .map(row => ({ ...row, starts: startCounts.get(`${row.year}|${row.id}`).size }))
        .sort((a, b) => b.points - a.points || a.year - b.year);
    if (!ranking.length) throw problem('No completed driver season without a race win was found in that scope.');
    const winner = ranking[0];
    const tied = ranking.filter(row => Math.abs(row.points - winner.points) < 1e-9);
    return fact('points_without_win', `${winner.name} scored ${winner.points} ${scope} points in ${winner.year} without a race win, the most in a completed season${tied.length > 1 ? ` (tied by ${tied.length} drivers)` : ''}.`,
        `${scope} · most season points without a win`, tied.slice(0, 20).map(row => ({ label: `${row.year} · ${row.name}`, value: `${row.points} points, 0 wins, ${row.starts} race starts`, href: link(series, 'driver', row.id) })),
        ['Official final season points are used; sprint points and historical scoring rules remain in their recorded totals.', 'Wins use recorded main race classifications; point totals are not normalized across eras.']);
}

module.exports = { teamTenure, teamSeasons, teammateEvents, firstMilestone, standingsGap, topFourSpread, latestTeamMilestone, mostPointsWithoutWin,
    seasonStandingsGap, debutMilestone, milestoneNeverReached, milestoneThreshold, loadStarts, loadFinalStandings, qualifies };
