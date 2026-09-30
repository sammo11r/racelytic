const { resourcePath } = require('./resource-routes');
const { normaliseSeries } = require('./series-config');

function problem(message) {
    const error = new Error(message);
    error.statusCode = 422;
    return error;
}

function identity(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim();
}

async function seasonRows(connection, interpretation) {
    if (normaliseSeries(interpretation.series) !== 'f1') throw problem('Round-by-round standings history is currently available for Formula 1.');
    const year = Number(interpretation.targetSeason);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) throw problem('Name one Formula 1 season.');
    const entity = interpretation.entity === 'constructors' ? 'constructors' : 'drivers';
    const table = entity === 'constructors' ? 'races_constructor_standings' : 'races_driver_standings';
    const idColumn = entity === 'constructors' ? 'constructorId' : 'driverId';
    const rows = await connection.query(`SELECT standings.round, standings.positionNumber AS position,
            standings.points, subjects.id, subjects.name,
            races.id AS raceId, COALESCE(NULLIF(gp.fullName,''), races.officialName) AS raceName
        FROM ${table} standings JOIN ${entity} subjects ON subjects.id = standings.${idColumn}
        JOIN races ON races.id = standings.raceId
        LEFT JOIN grands_prix gp ON gp.id = races.grandPrixId
        WHERE standings.year = ? ORDER BY standings.round, standings.positionDisplayOrder`, [year]);
    if (!rows.length) throw problem(`No recorded ${year} Formula 1 round standings are available.`);
    return { rows: rows.map(row => ({ ...row, round: Number(row.round), position: Number(row.position), points: Number(row.points) })), entity, year };
}

function subject(rows, requested) {
    const search = identity(requested);
    const names = [...new Map(rows.map(row => [String(row.id), { id: row.id, name: row.name }])).values()];
    const exact = names.filter(row => identity(row.name) === search);
    const found = exact.length ? exact : names.filter(row => identity(row.name).includes(search));
    if (found.length !== 1) throw problem(found.length ? `Several competitors match “${requested}”. Name one more precisely.`
        : `No recorded competitor matches “${requested}” in these standings.`);
    return found[0];
}

function fact(intent, answer, entity, year, evidence, assumptions, scope = {}) {
    return { intent, answer, fact: { title: `${year} Formula 1 ${entity} standings`, rows: evidence },
        methodology: { source: 'Official cumulative Formula 1 standings after each recorded round.',
            coverage: `${year} Formula 1 season`, sample: `${evidence.length} supporting standings rows.` },
        assumptions, scope: { series: 'f1', targetSeason: year, entity, ...scope } };
}

function raceLink(row) {
    return resourcePath('f1', 'race', row.raceId, row.raceName);
}

async function roundStandingsChange(connection, interpretation) {
    const { rows, entity, year } = await seasonRows(connection, interpretation);
    const firstRound = Number(interpretation.roundStart);
    const lastRound = Number(interpretation.roundEnd);
    if (!Number.isInteger(firstRound) || !Number.isInteger(lastRound) || firstRound < 1 || lastRound <= firstRound || lastRound > 100) {
        throw problem('Name two increasing round numbers within the same season.');
    }
    const competitor = subject(rows, interpretation.subjectName);
    const first = rows.find(row => row.round === firstRound && String(row.id) === String(competitor.id));
    const last = rows.find(row => row.round === lastRound && String(row.id) === String(competitor.id));
    if (!first || !last) throw problem(`${competitor.name} has no recorded standings position at one of those rounds.`);
    const rankChange = first.position - last.position;
    const pointChange = last.points - first.points;
    return fact('round_standings_change', `${competitor.name} moved from P${first.position} after round ${firstRound} to P${last.position} after round ${lastRound} (${rankChange >= 0 ? '+' : ''}${rankChange} places), gaining ${pointChange} championship points.`,
        entity, year, [
            { label: `After round ${firstRound}`, value: `P${first.position} · ${first.points} points`, href: raceLink(first) },
            { label: `After round ${lastRound}`, value: `P${last.position} · ${last.points} points`, href: raceLink(last) }
        ], ['Standings points and ranks are cumulative official values at the two selected cutoffs.'],
        { subjectName: competitor.name, roundStart: firstRound, roundEnd: lastRound });
}

async function roundRivalSwing(connection, interpretation) {
    const { rows, entity, year } = await seasonRows(connection, interpretation);
    const round = Number(interpretation.standingRound);
    if (!Number.isInteger(round) || round < 1 || round > 100) throw problem('Name a round number for the points swing.');
    const names = interpretation.subjectNames || [];
    if (names.length !== 2) throw problem('Name exactly two competitors for the points swing.');
    const first = subject(rows, names[0]);
    const second = subject(rows, names[1]);
    if (String(first.id) === String(second.id)) throw problem('Name two different competitors.');
    const at = competitor => rows.find(row => row.round === round && String(row.id) === String(competitor.id));
    const before = competitor => rows.filter(row => row.round < round && String(row.id) === String(competitor.id))
        .sort((a, b) => b.round - a.round)[0];
    const firstNow = at(first);
    const secondNow = at(second);
    if (!firstNow || !secondNow) throw problem('Both competitors need a recorded standings row after that round.');
    const firstGain = firstNow.points - (before(first)?.points || 0);
    const secondGain = secondNow.points - (before(second)?.points || 0);
    const swing = firstGain - secondGain;
    return fact('round_rival_swing', `${first.name} ${swing >= 0 ? 'gained' : 'lost'} ${Math.abs(swing)} championship points ${swing >= 0 ? 'on' : 'to'} ${second.name} in round ${round} of ${year} (${firstGain} versus ${secondGain} points scored).`,
        entity, year, [
            { label: first.name, value: `${firstGain} round points · ${firstNow.points} cumulative`, href: raceLink(firstNow) },
            { label: second.name, value: `${secondGain} round points · ${secondNow.points} cumulative`, href: raceLink(secondNow) }
        ], ['Each round gain is the difference between cumulative official standings after this and the previous round; round one starts from zero.'],
        { subjectNames: [first.name, second.name], standingRound: round });
}

async function championshipLeadChanges(connection, interpretation) {
    const { rows, entity, year } = await seasonRows(connection, interpretation);
    const rounds = [...new Set(rows.map(row => row.round))].sort((a, b) => a - b);
    let previous = null;
    const changes = [];
    for (const round of rounds) {
        const leaders = rows.filter(row => row.round === round && row.position === 1);
        if (leaders.length !== 1) throw problem(`Round ${round} has no unique official P1 standings row; the lead-change count is ambiguous.`);
        const leader = leaders[0];
        if (previous && String(previous.id) !== String(leader.id)) changes.push({ ...leader, previousName: previous.name });
        previous = leader;
    }
    return fact('championship_lead_changes', `The ${year} Formula 1 ${entity} championship lead changed ${changes.length} ${changes.length === 1 ? 'time' : 'times'} after the first recorded round.`,
        entity, year, changes.map(row => ({ label: `Round ${row.round} · ${row.raceName}`,
            value: `${row.previousName} → ${row.name} (${row.points} points)`, href: raceLink(row) })),
        ['A lead change occurs when official P1 in the round standings changes identity; round one establishes the initial leader.'],
        { leadChanges: changes.length });
}

module.exports = { roundStandingsChange, roundRivalSwing, championshipLeadChanges };
