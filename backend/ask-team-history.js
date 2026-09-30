const { loadStarts } = require('./ask-inventory-calculations');
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

function driverFor(rows, name) {
    const requested = identity(name);
    const drivers = [...new Map(rows.map(row => [String(row.driverId), { id: row.driverId, name: row.driverName }])).values()];
    const exact = drivers.filter(row => identity(row.name) === requested);
    const found = exact.length ? exact : drivers.filter(row => identity(row.name).includes(requested));
    if (found.length !== 1) throw problem(found.length ? `Several drivers match “${name}”. Name one more precisely.`
        : `No recorded driver matches “${name}”.`);
    return found[0];
}

async function driverTeamHistory(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const classCode = interpretation.classCode || 'overall';
    const starts = await loadStarts(connection, series, classCode);
    const driver = driverFor(starts, interpretation.subjectName);
    const own = starts.filter(row => String(row.driverId) === String(driver.id))
        .sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate))
            || Number(a.round) - Number(b.round) || Number(a.sessionNumber || 0) - Number(b.sessionNumber || 0));
    const mode = interpretation.historyMode === 'teammates' ? 'teammates' : 'teams';
    let evidence;
    let answer;
    if (mode === 'teams') {
        const transitions = [];
        for (const row of own) {
            if (transitions.at(-1)?.teamId === row.teamId) continue;
            transitions.push({ teamId: row.teamId, teamName: row.teamName, first: row });
        }
        evidence = transitions.map((row, index) => ({ label: `${index + 1}. ${row.teamName}`,
            value: `${row.first.eventDate} · ${row.first.eventName}`,
            href: resourcePath(series, series === 'wec' ? 'team' : 'constructor', row.teamId) }));
        answer = `${driver.name} has ${transitions.length} recorded ${transitions.length === 1 ? 'team stint' : 'team stints'} in ${series.toUpperCase()}: ${transitions.map(row => row.teamName).join(' → ')}.`;
    } else {
        const pairs = new Map();
        for (const row of own) {
            const partners = starts.filter(other => String(other.driverId) !== String(driver.id)
                && String(other.teamId) === String(row.teamId) && String(other.eventId) === String(row.eventId)
                && (series === 'wec' ? String(other.entryId) === String(row.entryId)
                    : String(other.sessionId || '') === String(row.sessionId || '')));
            for (const partner of partners) {
                const key = `${partner.driverId}:${row.teamId}`;
                const current = pairs.get(key) || { driverId: partner.driverId, driverName: partner.driverName,
                    teamName: row.teamName, events: new Set() };
                current.events.add(row.eventId);
                pairs.set(key, current);
            }
        }
        const ranked = [...pairs.values()].sort((a, b) => b.events.size - a.events.size || a.driverName.localeCompare(b.driverName));
        evidence = ranked.map(row => ({ label: row.driverName,
            value: `${row.events.size} shared ${row.events.size === 1 ? 'event' : 'events'} · ${row.teamName}`,
            href: resourcePath(series, 'driver', row.driverId) }));
        answer = ranked.length ? `${driver.name} had ${ranked.length} recorded teammate ${ranked.length === 1 ? 'pairing' : 'pairings'} in ${series.toUpperCase()}; ${ranked[0].driverName} shared the most events (${ranked[0].events.size}).`
            : `No teammate pairing is recorded for ${driver.name} in ${series.toUpperCase()}.`;
    }
    return { intent: 'driver_team_history', answer,
        fact: { title: `${driver.name} · ${mode === 'teams' ? 'team chronology' : 'teammates'}`, rows: evidence },
        methodology: { source: 'Recorded race starts, team assignments and shared event entries.',
            coverage: `${series.toUpperCase()}${series === 'wec' && classCode !== 'overall' ? ` ${classCode}` : ''} career`,
            sample: `${own.length} recorded driver starts.` },
        assumptions: mode === 'teams' ? ['A new stint begins when the team in consecutive recorded starts changes; contract dates are not inferred.']
            : [series === 'wec' ? 'WEC teammates share the same car entry at an event.'
                : 'Teammates share the same team and race session at an event.'],
        scope: { series, subjectName: driver.name, historyMode: mode, classCode } };
}

module.exports = { driverTeamHistory };
