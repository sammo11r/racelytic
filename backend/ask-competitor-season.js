const { loadStarts, loadFinalStandings, qualifies } = require('./ask-inventory-calculations');
const { resolveCompetitor } = require('./ask-career-chronology');
const { normaliseSeries } = require('./series-config');
const { resourcePath } = require('./resource-routes');

const SERIES_NAMES = Object.freeze({ f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy', fe: 'Formula E', wec: 'WEC' });

function problem(message) {
    const error = new Error(message);
    error.statusCode = 422;
    return error;
}

async function calculateCompetitorSeason(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const year = Number(interpretation.targetSeason);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) throw problem('Name a season for the competitor summary.');
    const starts = await loadStarts(connection, series, interpretation.classCode || 'overall');
    const entityHint = interpretation.entityExplicit ? interpretation.entity : null;
    const subject = resolveCompetitor(starts, interpretation.subjectName, entityHint);
    const subjectRows = starts.filter(row => Number(row.year) === year
        && String(subject.type === 'drivers' ? row.driverId : row.teamId) === String(subject.id));
    if (!subjectRows.length) throw problem(`${subject.name} has no recorded ${SERIES_NAMES[series]} race starts in ${year}.`);
    const entity = subject.type === 'drivers' ? 'drivers' : 'constructors';
    const standings = (await loadFinalStandings(connection, series, entity, interpretation.classCode || 'overall'))
        .filter(row => row.year === year && String(row.id) === String(subject.id));
    if (standings.length !== 1) throw problem(`No unambiguous completed ${year} final standing is recorded for ${subject.name}.`);
    const standing = standings[0];
    const wins = subjectRows.filter(row => qualifies(row, 'win', series));
    const podiums = subjectRows.filter(row => qualifies(row, 'podium', series));
    const type = subject.type === 'drivers' ? 'driver' : series === 'wec' ? 'team' : 'constructor';
    const summary = `${subjectRows.length} race ${subjectRows.length === 1 ? 'start' : 'starts'}, ${wins.length} ${wins.length === 1 ? 'win' : 'wins'}, ${podiums.length} ${podiums.length === 1 ? 'podium' : 'podiums'}, ${standing.points} official points, and P${standing.position} in the final standings`;
    const rows = [
        { label: subject.type === 'drivers' ? 'Driver' : 'Team', value: subject.name, href: resourcePath(series, type, subject.id) },
        { label: 'Race starts', value: subjectRows.length },
        { label: 'Wins', value: wins.length },
        { label: 'Podiums', value: podiums.length },
        { label: 'Official points', value: standing.points },
        { label: 'Final championship position', value: `P${standing.position}` },
        ...subjectRows.map(row => ({ label: `${row.eventName}${row.sessionName ? ` · ${row.sessionName}` : ''}`,
            value: `P${row.position || row.status || '—'} · ${row.points} recorded race points`,
            href: resourcePath(series, 'race', row.eventId, row.eventName) }))
    ];
    return { intent: 'competitor_season_summary', answer: `${subject.name}'s ${year} ${SERIES_NAMES[series]} season: ${summary}.`,
        entityLabel: SERIES_NAMES[series], fact: { title: `${subject.name} · ${year} season summary`, rows },
        methodology: { source: 'Recorded race starts and official final championship standings in the Racelytic archive.',
            coverage: `${SERIES_NAMES[series]} ${year}`, sample: `${subjectRows.length} recorded race starts and one final standing.` },
        scope: { targetSeason: year, subjectName: subject.name, entity, classCode: series === 'wec' ? interpretation.classCode : null },
        assumptions: ['A start is a classified race-session appearance, including feature and sprint races where recorded.',
            'Wins and podiums use recorded race classifications. Official final points may include bonuses and other scoring rules.'] };
}

module.exports = { calculateCompetitorSeason };
