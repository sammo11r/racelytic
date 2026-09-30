const { loadStarts, loadFinalStandings, qualifies } = require('./ask-inventory-calculations');
const { normaliseSeries } = require('./series-config');
const { resourcePath } = require('./resource-routes');

function problem(message) {
    const error = new Error(message);
    error.statusCode = 422;
    return error;
}

function identity(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim();
}

function fact(intent, answer, series, title, rows, assumptions) {
    return { intent, answer, fact: { title, rows },
        methodology: { source: 'Recorded completed-season official standings and race classifications.',
            coverage: title, sample: `${rows.length} supporting facts.` }, assumptions,
        scope: { series } };
}

function subjectRows(rows, name) {
    const search = identity(name);
    const subjects = [...new Map(rows.map(row => [String(row.id), { id: row.id, name: row.name }])).values()];
    const exact = subjects.filter(row => identity(row.name) === search);
    const found = exact.length ? exact : subjects.filter(row => identity(row.name).includes(search));
    if (found.length !== 1) throw problem(found.length ? `Several teams match “${name}”. Name one more precisely.`
        : `No recorded team matches “${name}”.`);
    return found[0];
}

function aggregateStarts(starts, entity, metric, series) {
    const groups = new Map();
    const counted = new Set();
    for (const row of starts) {
        const id = entity === 'constructors' ? row.teamId : row.driverId;
        const name = entity === 'constructors' ? row.teamName : row.driverName;
        if (!id || !name) continue;
        const key = `${id}:${row.year}`;
        if (!groups.has(key)) groups.set(key, { id, name, year: Number(row.year), value: 0 });
        const sessionKey = `${key}:${row.eventId}:${row.sessionId || row.entryId || ''}`;
        if (entity === 'constructors' && series === 'wec' && counted.has(sessionKey)) continue;
        counted.add(sessionKey);
        if (metric === 'poles' && Number(row.polePosition) === 1) groups.get(key).value++;
        if (metric === 'wins' && qualifies(row, 'win', series)) groups.get(key).value++;
        if (metric === 'podiums' && qualifies(row, 'podium', series)) groups.get(key).value++;
    }
    return [...groups.values()];
}

async function seasonValues(connection, series, entity, metric) {
    if (series === 'wec') throw problem('Choose a defined WEC class championship for this season comparison.');
    if (metric === 'poles' && series !== 'f1') throw problem('Recorded official pole attribution for this calculation is currently available in Formula 1 only.');
    if (metric === 'points') {
        const standings = await loadFinalStandings(connection, series, entity);
        return standings.map(row => ({ id: row.id, name: row.name, year: row.year, value: row.points }));
    }
    const completed = new Set((await loadFinalStandings(connection, series, entity)).map(row => row.year));
    return aggregateStarts(await loadStarts(connection, series), entity, metric, series)
        .filter(row => completed.has(row.year));
}

async function singleSeasonRecord(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const entity = interpretation.entity === 'constructors' ? 'constructors' : 'drivers';
    const metric = interpretation.recordCategory;
    if (!['wins', 'podiums', 'poles', 'points'].includes(metric)) throw problem('Choose wins, podiums, poles, or points.');
    const values = await seasonValues(connection, series, entity, metric);
    if (!values.length) throw problem('No completed season values are recorded for that category.');
    const maximum = Math.max(...values.map(row => row.value));
    const winners = values.filter(row => row.value === maximum)
        .sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
    return fact('single_season_record', `${winners.map(row => `${row.name} (${row.year})`).join(' and ')} recorded the most ${metric} in one ${series.toUpperCase()} season: ${maximum}.`,
        series, `Single-season ${metric} record`, winners.map(row => ({ label: `${row.name} · ${row.year}`,
            value: `${row.value} ${metric}`, href: resourcePath(series, entity === 'constructors' ? 'constructor' : 'driver', row.id) })),
        [metric === 'points' ? 'Points use the final official season standings; scoring rules differ by season.'
            : 'Wins and podiums count recorded classified race results; sprints and feature races both count where present.']);
}

async function teamSeasonExtreme(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const metric = interpretation.recordCategory;
    if (!['wins', 'podiums', 'points'].includes(metric)) throw problem('Choose wins, podiums, or points.');
    let entity = 'constructors';
    let values = await seasonValues(connection, series, entity, metric);
    let subject;
    try { subject = subjectRows(values, interpretation.subjectName); }
    catch (error) {
        if (!/^No recorded team matches/.test(error.message)) throw error;
        entity = 'drivers';
        values = await seasonValues(connection, series, entity, metric);
        subject = subjectRows(values, interpretation.subjectName);
    }
    const seasons = values.filter(row => String(row.id) === String(subject.id));
    const extreme = interpretation.extreme === 'smallest' ? 'smallest' : 'largest';
    const value = extreme === 'smallest' ? Math.min(...seasons.map(row => row.value)) : Math.max(...seasons.map(row => row.value));
    const selected = seasons.filter(row => row.value === value).sort((a, b) => a.year - b.year);
    const result = fact('team_season_extreme', `${subject.name}'s ${extreme === 'smallest' ? 'least' : 'most'} successful recorded ${series.toUpperCase()} ${metric} season was ${selected.map(row => row.year).join(' and ')} with ${value} ${metric}.`,
        series, `${subject.name} · ${metric} by season`, selected.map(row => ({ label: String(row.year), value: `${value} ${metric}`,
            href: resourcePath(series, entity === 'constructors' ? 'constructor' : 'driver', subject.id) })),
        [metric === 'points' ? `Points use final official ${entity === 'drivers' ? 'driver' : 'constructor'} standings; scoring systems differ across seasons.`
            : `Each classified race result by the ${entity === 'drivers' ? 'driver' : 'team'} contributes to wins or podiums.`]);
    return { ...result, entity, scope: { ...result.scope, entity, subjectName: subject.name } };
}

async function standingsImprovement(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    if (series === 'wec') throw problem('Choose a defined WEC class championship for a season-to-season standings comparison.');
    const firstYear = Number(interpretation.fromYear);
    const lastYear = Number(interpretation.toYear);
    if (!Number.isInteger(firstYear) || !Number.isInteger(lastYear) || lastYear !== firstYear + 1) {
        throw problem('Name two consecutive completed seasons for the standings improvement comparison.');
    }
    const entity = interpretation.entity === 'constructors' ? 'constructors' : 'drivers';
    const standings = await loadFinalStandings(connection, series, entity);
    const first = new Map(standings.filter(row => row.year === firstYear).map(row => [String(row.id), row]));
    const last = standings.filter(row => row.year === lastYear);
    if (!first.size || !last.length) throw problem('Final standings are missing for one of those completed seasons.');
    const changes = last.filter(row => first.has(String(row.id))).map(row => ({ ...row,
        before: first.get(String(row.id)), gain: first.get(String(row.id)).position - row.position }));
    if (!changes.length) throw problem('No competitor appears in both final standings seasons.');
    const gain = Math.max(...changes.map(row => row.gain));
    const leaders = changes.filter(row => row.gain === gain).sort((a, b) => a.name.localeCompare(b.name));
    return fact('standings_improvement', `${leaders.map(row => row.name).join(' and ')} ${gain > 0 ? `improved the most: ${gain} championship places` : gain === 0 ? 'had the smallest change: 0 places' : `dropped the fewest places: ${Math.abs(gain)}`} from ${firstYear} to ${lastYear}.`,
        series, `${firstYear} → ${lastYear} final ${entity} standings`, leaders.map(row => ({ label: row.name,
            value: `P${row.before.position} → P${row.position} · ${gain >= 0 ? '+' : ''}${gain} places`,
            href: resourcePath(series, entity === 'constructors' ? 'constructor' : 'driver', row.id) })),
        ['Only competitors present in both final standings are compared; missing a season is not treated as a last-place finish.']);
}

async function championSeasonExtreme(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    if (series === 'wec') throw problem('Choose a defined WEC class championship for the champion-season comparison.');
    const entity = interpretation.entity === 'constructors' ? 'constructors' : 'drivers';
    const metric = interpretation.recordCategory;
    if (!['wins', 'points'].includes(metric)) throw problem('Choose race wins or championship points.');
    const standings = await loadFinalStandings(connection, series, entity);
    const champions = standings.filter(row => row.position === 1);
    if (!champions.length) throw problem('No completed-season champions are recorded for that scope.');
    const wins = metric === 'wins' ? await seasonValues(connection, series, entity, 'wins') : [];
    const bySeason = new Map(wins.map(row => [`${row.id}:${row.year}`, row.value]));
    const values = champions.map(row => ({ ...row, value: metric === 'points' ? row.points : bySeason.get(`${row.id}:${row.year}`) || 0 }));
    const smallest = interpretation.extreme === 'smallest';
    const extreme = smallest ? Math.min(...values.map(row => row.value)) : Math.max(...values.map(row => row.value));
    const selected = values.filter(row => row.value === extreme).sort((a, b) => a.year - b.year);
    return fact('champion_season_extreme', `${selected.map(row => `${row.name} (${row.year})`).join(' and ')} ${smallest ? 'had the fewest' : 'had the most'} ${metric} among recorded ${series.toUpperCase()} ${entity} champions: ${extreme}.`,
        series, `${series.toUpperCase()} champion seasons · ${metric}`, selected.map(row => ({
            label: `${row.name} · ${row.year}`, value: `${row.value} ${metric}`,
            href: resourcePath(series, entity === 'constructors' ? 'constructor' : 'driver', row.id)
        })), [metric === 'points' ? 'Official points are compared across different scoring eras; totals are not normalized.'
            : 'Race wins count classified race results; all recorded race formats are included.']);
}

module.exports = { singleSeasonRecord, teamSeasonExtreme, standingsImprovement, championSeasonExtreme };
