const { loadStarts, loadFinalStandings, qualifies } = require('./ask-inventory-calculations');
const { resolveCompetitor } = require('./ask-career-chronology');
const { normaliseSeries } = require('./series-config');
const { resourcePath } = require('./resource-routes');
const { completedCalendar } = require('./ask-calendar-calculations');

const SERIES_NAMES = { f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy', fe: 'Formula E', wec: 'WEC' };

function problem(message) {
    const error = new Error(message);
    error.statusCode = 422;
    return error;
}

function isFinish(row, series) {
    if (!Number.isInteger(row.position) || row.position < 1) return false;
    const status = String(row.status || '').toLowerCase();
    if (series === 'wec') return status === 'classified';
    return !/^(?:r|ret|retired|dnf|dns|dsq|dq|disqualified|excluded|nc|not classified|withdrawn)$/.test(status);
}

function rowsForSubject(starts, subject, year = null) {
    return starts.filter(row => String(subject.type === 'drivers' ? row.driverId : row.teamId) === String(subject.id)
        && (year === null || Number(row.year) === year));
}

function subjectLink(series, subject) {
    return resourcePath(series, subject.type === 'drivers' ? 'driver' : series === 'wec' ? 'team' : 'constructor', subject.id);
}

function result(intent, answer, title, rows, coverage, assumptions) {
    return { intent, answer, fact: { title, rows },
        methodology: { source: 'Recorded race classifications and official final standings in the Racelytic archive.', coverage,
            sample: `${rows.length} displayed evidence rows.` }, assumptions };
}

async function bestWorstResult(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const subject = resolveCompetitor(starts, interpretation.subjectName, 'drivers');
    const metric = interpretation.resultMetric;
    const extreme = interpretation.extreme === 'smallest' ? 'worst' : 'best';
    if (!['race_finish', 'season_points', 'season_rank'].includes(metric)) throw problem('Choose race finish, season points, or final championship rank.');
    let ranked;
    let bestValue;
    if (metric === 'race_finish') {
        ranked = rowsForSubject(starts, subject).filter(row => isFinish(row, series)).map(row => ({
            value: row.position, label: `${row.year} · ${row.eventName}${row.sessionName ? ` · ${row.sessionName}` : ''}`,
            detail: `P${row.position}`, href: resourcePath(series, 'race', row.eventId, row.eventName)
        }));
        ranked.sort((a, b) => extreme === 'best' ? a.value - b.value : b.value - a.value);
    } else {
        const standings = await loadFinalStandings(connection, series, 'drivers', interpretation.classCode || 'overall');
        ranked = standings.filter(row => String(row.id) === String(subject.id)).map(row => ({
            value: metric === 'season_points' ? row.points : row.position,
            label: `${row.year} final standings`, detail: `${row.points} points · P${row.position}`,
            href: resourcePath(series, 'season', row.year)
        }));
        ranked.sort((a, b) => (extreme === 'best') === (metric === 'season_points') ? b.value - a.value : a.value - b.value);
    }
    if (!ranked.length) throw problem(`No eligible ${metric.replace('_', ' ')} results were recorded for ${subject.name}.`);
    bestValue = ranked[0].value;
    const tied = ranked.filter(row => row.value === bestValue);
    const measure = metric === 'race_finish' ? `race finish of P${bestValue}`
        : metric === 'season_rank' ? `final championship rank of P${bestValue}` : `season total of ${bestValue} points`;
    return result('best_worst_result', `${subject.name}'s ${extreme} recorded ${measure} came in ${tied.map(row => row.label).join(', ')}.`,
        `${subject.name} · ${extreme} ${metric.replace('_', ' ')}`,
        [{ label: 'Driver', value: subject.name, href: subjectLink(series, subject) },
            ...tied.slice(0, 30).map(row => ({ label: row.label, value: row.detail, href: row.href }))],
        `${SERIES_NAMES[series]} ${interpretation.classCode && series === 'wec' ? interpretation.classCode : ''}`.trim(),
        [metric === 'race_finish' ? 'Only classified race starts with a numeric finishing position are ranked.'
            : 'Only completed seasons with official final standings are ranked.',
        'Equal best or worst values are shown together; evidence is limited to the first 30 tied rows.']);
}

async function resultDistribution(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const subject = resolveCompetitor(starts, interpretation.subjectName, interpretation.entityExplicit ? interpretation.entity : null);
    const year = interpretation.targetSeason ? Number(interpretation.targetSeason) : null;
    const selectedRows = rowsForSubject(starts, subject, year);
    const selected = series === 'wec' && subject.type === 'teams'
        ? [...new Map(selectedRows.map(row => [`${row.eventId}|${row.entryId}`, row])).values()]
        : selectedRows;
    if (!selected.length) throw problem(`No race starts were recorded for ${subject.name}${year ? ` in ${year}` : ''}.`);
    const metric = interpretation.distributionMetric || 'finishes';
    if (!['finishes', 'points'].includes(metric)) throw problem('Choose a finishing-position or points distribution.');
    const counts = new Map();
    for (const row of selected) {
        const key = metric === 'finishes' ? isFinish(row, series) ? `P${row.position}` : 'Unclassified'
            : String(Number(row.points || 0));
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    const ordered = [...counts].sort(([a], [b]) => a === 'Unclassified' ? 1 : b === 'Unclassified' ? -1
        : Number(a.replace('P', '')) - Number(b.replace('P', '')));
    const entries = ordered.map(([key, count]) => `${key}${metric === 'points' ? ' points' : ''}: ${count}`);
    return result('result_distribution', `${subject.name}'s ${year || 'recorded career'} ${metric === 'finishes' ? 'race-finish' : 'race-points'} distribution across ${selected.length} starts: ${entries.join('; ')}.`,
        `${subject.name} · ${metric} distribution`,
        [{ label: subject.type === 'drivers' ? 'Driver' : 'Team', value: subject.name, href: subjectLink(series, subject) },
            { label: 'Recorded starts', value: selected.length },
            ...ordered.map(([key, count]) => ({ label: metric === 'points' ? `${key} points` : key, value: `${count} starts` }))],
        `${SERIES_NAMES[series]}${year ? ` ${year}` : ''}${series === 'wec' ? ` ${interpretation.classCode || 'overall'}` : ''}`,
        [metric === 'finishes' ? 'Unclassified includes non-finish classifications with no eligible numeric finish.'
            : 'Points are the value recorded on each race result; official season totals can include bonus or sprint points.',
        series === 'wec' ? 'For WEC teams, each car entry is counted once per event.'
            : 'For teams, each driver start is counted separately.']);
}

async function latestFailure(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const subject = resolveCompetitor(starts, interpretation.subjectName, interpretation.entityExplicit ? interpretation.entity : null);
    const metric = interpretation.failureMetric || 'points';
    if (!['points', 'finish'].includes(metric)) throw problem('Choose no points or no finish.');
    const rows = rowsForSubject(starts, subject);
    const events = new Map();
    for (const row of rows) {
        const key = `${row.eventId}|${row.sessionId || 'race'}`;
        if (!events.has(key)) events.set(key, []);
        events.get(key).push(row);
    }
    const sprintPoints = new Map();
    if (metric === 'points' && series === 'f1') {
        const sprintRows = await connection.query('SELECT raceId, driverId, constructorId, points FROM races_sprint_race_results WHERE points > 0');
        for (const row of sprintRows) {
            if (String(subject.type === 'drivers' ? row.driverId : row.constructorId) !== String(subject.id)) continue;
            const key = String(row.raceId);
            sprintPoints.set(key, (sprintPoints.get(key) || 0) + Number(row.points || 0));
        }
    }
    const failures = [...events.values()].filter(group => metric === 'points'
        ? group.every(row => Number(row.points || 0) === 0) && !sprintPoints.get(String(group[0].eventId))
        : group.every(row => !isFinish(row, series)));
    failures.sort((a, b) => String(b[0].eventDate).localeCompare(String(a[0].eventDate))
        || Number(b[0].sessionNumber || 0) - Number(a[0].sessionNumber || 0));
    if (!failures.length) throw problem(`No recorded ${metric === 'points' ? 'non-scoring' : 'non-finish'} race start was found for ${subject.name}.`);
    const group = failures[0];
    const event = group[0];
    const phrase = metric === 'points' ? 'failed to score points' : 'failed to finish';
    return result('latest_failure', `${subject.name} last ${phrase} at ${event.eventName}${event.sessionName ? ` (${event.sessionName})` : ''} on ${event.eventDate}.`,
        `${subject.name} · latest ${metric === 'points' ? 'non-scoring race' : 'non-finish'}`,
        [{ label: subject.type === 'drivers' ? 'Driver' : 'Team', value: subject.name, href: subjectLink(series, subject) },
            { label: 'Event', value: event.eventName, href: resourcePath(series, 'race', event.eventId, event.eventName) },
            { label: 'Date', value: event.eventDate },
            ...(metric === 'points' && series === 'f1' ? [{ label: 'Sprint points', value: sprintPoints.get(String(event.eventId)) || 0 }] : []),
            ...group.map(row => ({ label: row.driverName, value: `P${row.position || '—'} · ${row.points} race points · ${row.status || 'status not recorded'}` }))],
        `${SERIES_NAMES[series]} recorded race starts${series === 'wec' ? ` · ${interpretation.classCode || 'overall'}` : ''}`,
        [subject.type === 'teams' ? 'A team fails only when every recorded starter in the same race session fails the criterion.'
            : 'Only actual recorded starts are considered.',
        metric === 'finish' ? 'A finish requires a classified numeric result.'
            : series === 'f1' ? 'Non-scoring includes both Grand Prix and recorded sprint points at the event.'
                : 'Non-scoring uses recorded race-result points; bonuses outside these classifications are not included.']);
}

async function compareSeasons(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const firstYear = Number(interpretation.fromYear);
    const secondYear = Number(interpretation.toYear);
    if (!Number.isInteger(firstYear) || !Number.isInteger(secondYear) || firstYear === secondYear
        || firstYear < 1950 || secondYear > 2100) throw problem('Name two different seasons to compare.');
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const subject = resolveCompetitor(starts, interpretation.subjectName, interpretation.entityExplicit ? interpretation.entity : null);
    const entity = subject.type === 'drivers' ? 'drivers' : 'constructors';
    if (series === 'wec' && entity === 'constructors') throw problem('WEC team entries do not have matching final team standings. Compare a named driver within one class.');
    const standings = await loadFinalStandings(connection, series, entity, interpretation.classCode || 'overall');
    const seasons = [firstYear, secondYear].map(year => {
        const resultRows = rowsForSubject(starts, subject, year);
        const standing = standings.find(row => row.year === year && String(row.id) === String(subject.id));
        if (!resultRows.length || !standing) throw problem(`No complete race-start and final-standing data was recorded for ${subject.name} in ${year}.`);
        const unique = series === 'wec' && subject.type === 'teams'
            ? [...new Map(resultRows.map(row => [`${row.eventId}|${row.entryId}`, row])).values()]
            : resultRows;
        return { year, starts: unique.length, wins: unique.filter(row => qualifies(row, 'win', series)).length,
            podiums: unique.filter(row => qualifies(row, 'podium', series)).length,
            points: standing.points, rank: standing.position };
    });
    const [first, second] = seasons;
    const delta = second.points - first.points;
    const seasonText = row => `${row.starts} ${row.starts === 1 ? 'start' : 'starts'}, ${row.wins} ${row.wins === 1 ? 'win' : 'wins'}, ${row.podiums} ${row.podiums === 1 ? 'podium' : 'podiums'}, ${row.points} points and P${row.rank}`;
    return result('compare_seasons', `${subject.name} went from ${seasonText(first)} in ${firstYear} to ${seasonText(second)} in ${secondYear}. That is ${delta >= 0 ? '+' : ''}${delta} official points.`,
        `${subject.name} · ${firstYear} versus ${secondYear}`,
        [{ label: subject.type === 'drivers' ? 'Driver' : 'Team', value: subject.name, href: subjectLink(series, subject) },
            ...seasons.flatMap(row => [
                { label: `${row.year} starts, wins, podiums`, value: `${row.starts} · ${row.wins} · ${row.podiums}`, href: resourcePath(series, 'season', row.year) },
                { label: `${row.year} final standing`, value: `${row.points} points · P${row.rank}`, href: resourcePath(series, 'season', row.year) }
            ])],
        `${SERIES_NAMES[series]} ${firstYear} and ${secondYear}${series === 'wec' ? ` · ${interpretation.classCode || 'overall'}` : ''}`,
        ['Both seasons use the same championship and class. Official points reflect each season’s scoring rules and are not normalized.',
            'Starts, wins, and podiums use recorded race classifications; final rank and points use official final standings.']);
}

async function longestMilestoneGap(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const milestone = interpretation.milestone || 'win';
    if (!['win', 'podium', 'points', 'starts'].includes(milestone)) throw problem('Choose wins, podiums, points, or starts.');
    if (milestone === 'starts' && interpretation.gapMeasure === 'starts') throw problem('A gap between consecutive starts has zero intervening starts. Ask for the longest calendar-time gap between starts.');
    if (series === 'wec' && (!interpretation.classCode || interpretation.classCode === 'overall')) {
        throw problem('Choose a WEC class so milestone results are comparable.');
    }
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const byDriver = new Map();
    for (const row of starts) {
        const key = String(row.driverId);
        if (!byDriver.has(key)) byDriver.set(key, []);
        byDriver.get(key).push(row);
    }
    const gaps = [];
    for (const rows of byDriver.values()) {
        rows.sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate))
            || Number(a.round || 0) - Number(b.round || 0)
            || Number(a.sessionNumber || 0) - Number(b.sessionNumber || 0));
        let previous = null;
        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            if (milestone !== 'starts' && !qualifies(row, milestone, series)) continue;
            if (previous !== null) {
                const before = rows[previous];
                const days = Math.round((Date.parse(`${row.eventDate}T00:00:00Z`) - Date.parse(`${before.eventDate}T00:00:00Z`)) / 86400000);
                if (Number.isFinite(days)) gaps.push({ driverId: row.driverId, driverName: row.driverName,
                    before, after: row, days, interveningStarts: index - previous - 1 });
            }
            previous = index;
        }
    }
    if (!gaps.length) throw problem(`No driver has two recorded ${milestone === 'starts' ? 'starts' : milestone === 'points' ? 'point-scoring starts' : `${milestone} results`} in that scope.`);
    const measure = interpretation.gapMeasure === 'starts' ? 'interveningStarts' : 'days';
    gaps.sort((a, b) => b[measure] - a[measure] || b.days - a.days || a.driverName.localeCompare(b.driverName));
    const top = gaps.filter(row => row[measure] === gaps[0][measure]);
    const winner = top[0];
    return result('longest_milestone_gap', `${winner.driverName} had the longest gap between recorded ${milestone === 'starts' ? 'starts' : milestone === 'points' ? 'point-scoring races' : `${milestone}s`}: ${winner.days} calendar days and ${winner.interveningStarts} intervening starts, from ${winner.before.eventName} on ${winner.before.eventDate} to ${winner.after.eventName} on ${winner.after.eventDate}${top.length > 1 ? ` (tied by ${top.length} gaps)` : ''}.`,
        `${SERIES_NAMES[series]} · longest gap between ${milestone === 'points' ? 'point-scoring races' : milestone === 'starts' ? 'starts' : `${milestone}s`}`,
        top.slice(0, 20).flatMap(row => [
            { label: row.driverName, value: `${row.days} days · ${row.interveningStarts} intervening starts`, href: resourcePath(series, 'driver', row.driverId) },
            { label: 'Start boundary', value: `${row.before.eventName} · ${row.before.eventDate}`, href: resourcePath(series, 'race', row.before.eventId, row.before.eventName) },
            { label: 'End boundary', value: `${row.after.eventName} · ${row.after.eventDate}`, href: resourcePath(series, 'race', row.after.eventId, row.after.eventName) }
        ]), `${SERIES_NAMES[series]} recorded race starts${series === 'wec' ? ` · ${interpretation.classCode}` : ''}`,
        [`Gaps are ranked by ${measure === 'days' ? 'elapsed calendar days' : 'intervening race starts'}; both measures are shown.`,
            'A gap requires two qualifying boundary starts; the time before a first milestone and after a last milestone is not counted.']);
}

async function teamChangeComparison(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    if (series === 'wec' && (!interpretation.classCode || interpretation.classCode === 'overall')) {
        throw problem('Choose a WEC class to compare team stints.');
    }
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const driver = resolveCompetitor(starts, interpretation.subjectName, 'drivers');
    const driverRows = rowsForSubject(starts, driver).sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate))
        || Number(a.round || 0) - Number(b.round || 0) || Number(a.sessionNumber || 0) - Number(b.sessionNumber || 0));
    const teamSearch = String(interpretation.newTeamName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!teamSearch) throw problem('Name the team the driver joined.');
    const teams = [...new Map(driverRows.map(row => [String(row.teamId), { id: row.teamId, name: row.teamName }])).values()];
    const exact = teams.filter(team => team.name.toLowerCase() === teamSearch);
    const matches = exact.length ? exact : teams.filter(team => team.name.toLowerCase().includes(teamSearch));
    if (matches.length !== 1) throw problem(matches.length
        ? `More than one team matches “${interpretation.newTeamName}”. Name one precisely.`
        : `${driver.name} has no recorded starts for ${interpretation.newTeamName}.`);
    const target = matches[0];
    const stints = [];
    for (const row of driverRows) {
        if (stints.at(-1)?.teamId !== row.teamId) stints.push({ teamId: row.teamId, teamName: row.teamName, rows: [] });
        stints.at(-1).rows.push(row);
    }
    const targetStints = stints.map((stint, index) => ({ stint, index })).filter(({ stint }) => String(stint.teamId) === String(target.id)
        && (!interpretation.targetSeason || stint.rows.some(row => Number(row.year) === Number(interpretation.targetSeason))));
    if (targetStints.length !== 1) throw problem(targetStints.length
        ? `${driver.name} has multiple recorded stints with ${target.name}. Name a season in the target stint.`
        : `No ${target.name} stint matches that season for ${driver.name}.`);
    const after = targetStints[0].stint;
    const before = stints[targetStints[0].index - 1];
    if (!before) throw problem(`${target.name} is ${driver.name}'s first recorded team; there is no earlier team stint to compare.`);
    const summarize = stint => ({ teamName: stint.teamName, first: stint.rows[0], last: stint.rows.at(-1),
        starts: stint.rows.length, wins: stint.rows.filter(row => qualifies(row, 'win', series)).length,
        podiums: stint.rows.filter(row => qualifies(row, 'podium', series)).length,
        racePoints: stint.rows.reduce((total, row) => total + Number(row.points || 0), 0) });
    const first = summarize(before);
    const second = summarize(after);
    const evidence = [first, second].flatMap((stint, index) => [
        { label: index === 0 ? 'Before team' : 'After team', value: `${stint.teamName} · ${stint.first.eventDate} to ${stint.last.eventDate}`,
            href: subjectLink(series, { type: 'teams', id: index === 0 ? before.teamId : after.teamId }) },
        { label: `${stint.teamName} results`, value: `${stint.starts} starts · ${stint.wins} wins · ${stint.podiums} podiums · ${stint.racePoints} race points` }
    ]);
    const summary = stint => `${stint.starts} ${stint.starts === 1 ? 'start' : 'starts'}, ${stint.wins} ${stint.wins === 1 ? 'win' : 'wins'}, ${stint.podiums} ${stint.podiums === 1 ? 'podium' : 'podiums'} and ${stint.racePoints} race points`;
    return result('team_change_comparison', `${driver.name}'s final stint before joining ${target.name} was with ${first.teamName}: ${summary(first)}. In the ${target.name} stint from ${second.first.eventDate} to ${second.last.eventDate}: ${summary(second)}.`,
        `${driver.name} · ${first.teamName} to ${target.name}`, [{ label: 'Driver', value: driver.name, href: subjectLink(series, driver) }, ...evidence],
        `${SERIES_NAMES[series]} recorded starts${series === 'wec' ? ` · ${interpretation.classCode}` : ''}`,
        ['The comparison uses the entire immediately preceding team stint and the selected target team stint, including partial seasons.',
            'Points are summed from recorded race results; official championship points and sprint bonuses may differ.']);
}

async function consecutiveEventWins(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    if (series === 'wec' && (!interpretation.classCode || interpretation.classCode === 'overall')) {
        throw problem('Choose a WEC class for consecutive event wins.');
    }
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const subject = resolveCompetitor(starts, interpretation.subjectName, interpretation.entityExplicit ? interpretation.entity : null);
    const name = String(interpretation.eventName || '').toLowerCase().trim();
    if (name.length < 3) throw problem('Name the event for the consecutive-appearance comparison.');
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/\b(?:grand prix|gp|e-prix|the)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    const requested = normalize(name);
    const calendar = await completedCalendar(connection, series, null);
    const scored = calendar.map(row => {
        const event = normalize(row.name);
        const place = normalize(row.placeName);
        const circuit = normalize(row.circuitName);
        const score = event === requested || place === requested ? 4
            : circuit === requested || circuit.includes(requested) ? 3
                : event.includes(requested) ? 2 : 0;
        return { row, score };
    });
    const maxScore = Math.max(0, ...scored.map(item => item.score));
    if (!maxScore) throw problem(`No completed ${SERIES_NAMES[series]} event matches “${interpretation.eventName}”.`);
    const eventIds = new Set(scored.filter(item => item.score === maxScore).map(item => String(item.row.id)));
    const appearances = new Map();
    for (const row of rowsForSubject(starts, subject)) {
        if (!eventIds.has(String(row.eventId))) continue;
        const key = String(row.eventId);
        if (!appearances.has(key)) appearances.set(key, { event: row, rows: [] });
        appearances.get(key).rows.push(row);
    }
    const ordered = [...appearances.values()].sort((a, b) => String(a.event.eventDate).localeCompare(String(b.event.eventDate))
        || Number(a.event.round || 0) - Number(b.event.round || 0));
    if (!ordered.length) throw problem(`${subject.name} has no recorded starts at an event matching “${interpretation.eventName}”.`);
    const runs = [];
    let current = [];
    for (const appearance of ordered) {
        if (appearance.rows.some(row => qualifies(row, 'win', series))) current.push(appearance);
        else {
            if (current.length >= 2) runs.push(current);
            current = [];
        }
    }
    if (current.length >= 2) runs.push(current);
    const pairs = runs.reduce((count, run) => count + run.length - 1, 0);
    const longest = runs.length ? Math.max(...runs.map(run => run.length)) : 0;
    const eventLabel = ordered.at(-1).event.eventName;
    return result('consecutive_event_wins', `${subject.name} won at consecutive appearances of ${eventLabel} ${pairs} ${pairs === 1 ? 'time' : 'times'} across ${runs.length} ${runs.length === 1 ? 'run' : 'runs'}${longest ? `; the longest run was ${longest} appearances` : ''}.`,
        `${subject.name} · consecutive ${eventLabel} wins`,
        [{ label: subject.type === 'drivers' ? 'Driver' : 'Team', value: subject.name, href: subjectLink(series, subject) },
            { label: 'Recorded appearances', value: ordered.length },
            ...runs.flatMap((run, index) => run.map(appearance => ({
                label: `Run ${index + 1} · ${appearance.event.year}`, value: appearance.event.eventName,
                href: resourcePath(series, 'race', appearance.event.eventId, appearance.event.eventName)
            })))], `${SERIES_NAMES[series]} event appearances${series === 'wec' ? ` · ${interpretation.classCode}` : ''}`,
        ['Consecutive means consecutive recorded appearances by the subject at this event, even if calendar years were skipped.',
            'One race weekend counts once; a team wins the appearance if any of its recorded starters won. A run of N wins contains N−1 consecutive pairs.']);
}

async function lineupRecord(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const metric = interpretation.recordCategory || 'wins';
    if (!['wins', 'points'].includes(metric)) throw problem('Choose lineup wins or recorded race points.');
    if (series === 'wec' && (!interpretation.classCode || interpretation.classCode === 'overall')) {
        throw problem('Choose a WEC class to compare car crews.');
    }
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const sessions = new Map();
    for (const row of starts) {
        const key = `${row.eventId}|${row.sessionId || 'race'}|${series === 'wec' ? row.entryId : row.teamId}`;
        if (!sessions.has(key)) sessions.set(key, []);
        sessions.get(key).push(row);
    }
    const lineups = new Map();
    for (const sessionRows of sessions.values()) {
        const drivers = [...new Map(sessionRows.map(row => [String(row.driverId), { id: row.driverId, name: row.driverName }])).values()]
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
        if (drivers.length < 2) continue;
        const team = sessionRows[0];
        const key = `${team.teamId}|${drivers.map(driver => driver.id).join(',')}`;
        if (!lineups.has(key)) lineups.set(key, { teamId: team.teamId, teamName: team.teamName, drivers,
            starts: 0, wins: 0, points: 0, events: [] });
        const lineup = lineups.get(key);
        const uniqueResults = series === 'wec' ? [team] : [...new Map(sessionRows.map(row => [String(row.driverId), row])).values()];
        const won = uniqueResults.some(row => qualifies(row, 'win', series));
        const points = uniqueResults.reduce((sum, row) => sum + Number(row.points || 0), 0);
        lineup.starts++;
        lineup.wins += Number(won);
        lineup.points += points;
        lineup.events.push({ eventId: team.eventId, eventName: team.eventName, eventDate: team.eventDate, won, points });
    }
    const ranked = [...lineups.values()].sort((a, b) => b[metric] - a[metric] || b.starts - a.starts);
    if (!ranked.length) throw problem('No repeated multi-driver lineup or WEC car crew was found in recorded race starts.');
    const top = ranked.filter(row => Math.abs(row[metric] - ranked[0][metric]) < 1e-9);
    const winner = top[0];
    const lineupName = row => `${row.drivers.map(driver => driver.name).join(', ')} (${row.teamName})`;
    return result('lineup_record', `${lineupName(winner)} recorded the most ${metric} together in ${SERIES_NAMES[series]}: ${winner[metric]} across ${winner.starts} race starts${top.length > 1 ? `, tied with ${top.length - 1} other lineups` : ''}.`,
        `${SERIES_NAMES[series]} · lineup ${metric}`,
        top.slice(0, 10).flatMap(row => [
            { label: 'Lineup', value: lineupName(row), href: subjectLink(series, { type: 'teams', id: row.teamId }) },
            { label: 'Record', value: `${row.wins} wins · ${row.points} recorded race points · ${row.starts} joint starts` },
            ...row.events.filter(event => metric === 'points' ? event.points > 0 : event.won).slice(0, 20).map(event => ({
                label: event.eventDate, value: `${event.eventName} · ${event.won ? 'win' : 'no win'} · ${event.points} points`,
                href: resourcePath(series, 'race', event.eventId, event.eventName)
            }))
        ]), `${SERIES_NAMES[series]} recorded race sessions${series === 'wec' ? ` · ${interpretation.classCode}` : ''}`,
        ['A lineup is the same set of at least two drivers starting for the same team in one race session; WEC crews share one car entry.',
            'WEC car points count once per entry. Other series sum each driver’s recorded race points; official season bonuses are not added.',
            'Equal top totals are shown together; evidence lists up to 20 scoring events per lineup.']);
}

module.exports = { bestWorstResult, resultDistribution, latestFailure, compareSeasons, longestMilestoneGap,
    teamChangeComparison, consecutiveEventWins, lineupRecord, isFinish };
