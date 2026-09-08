const SERIES = Object.freeze(['f1', 'f2', 'f3', 'academy']);

// These are separate historical entrants that intentionally share a normalized
// display name in F1DB. Keep the exception exact so a new ID reusing either name
// still fails the strict identity audit.
const KNOWN_CONSTRUCTOR_NAME_COLLISIONS = Object.freeze({
    f1: Object.freeze({
        lotus: Object.freeze(['lotus', 'lotus-f1']),
        ats: Object.freeze(['ats', 'ats-wheels'])
    })
});

function normalizedIdentity(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/\b(junior|jr)\b/g, 'jr').replace(/[^a-z0-9]+/g, ' ').trim();
}

function add(map, key, value) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
}

function collisions(map, label) {
    return [...map.entries()].filter(([, values]) => values.size > 1).map(([key, values]) => ({
        [label]: key, values: [...values].sort()
    }));
}

function splitKnownConstructorCollisions(items, series) {
    const known = KNOWN_CONSTRUCTOR_NAME_COLLISIONS[series] || {};
    const approved = [], unexpected = [];
    for (const item of items) {
        const expected = known[item.name];
        const matches = expected && expected.length === item.values.length
            && expected.every((value, index) => value === item.values[index]);
        (matches ? approved : unexpected).push(item);
    }
    return { approved, unexpected };
}

function graphHealth(driverTeams) {
    const parent = new Map();
    const find = value => {
        if (!parent.has(value)) parent.set(value, value);
        if (parent.get(value) !== value) parent.set(value, find(parent.get(value)));
        return parent.get(value);
    };
    const union = (first, second) => {
        const firstRoot = find(first), secondRoot = find(second);
        if (firstRoot !== secondRoot) parent.set(secondRoot, firstRoot);
    };
    let edges = 0;
    for (const [driver, teams] of driverTeams) for (const team of teams) {
        union(`driver:${driver}`, `team:${team}`);
        edges += 1;
    }
    const componentDrivers = new Map();
    for (const driver of driverTeams.keys()) {
        const root = find(`driver:${driver}`);
        componentDrivers.set(root, (componentDrivers.get(root) || 0) + 1);
    }
    const sizes = [...componentDrivers.values()].sort((a, b) => b - a);
    return {
        edges,
        components: sizes.length,
        largestComponentDrivers: sizes[0] || 0,
        largestDriverShare: driverTeams.size ? Number(((sizes[0] || 0) / driverTeams.size).toFixed(4)) : 0,
        transferDrivers: [...driverTeams.values()].filter(teams => teams.size > 1).length
    };
}

function auditSeries(events, series = '') {
    const driverNames = new Map(), namesToDrivers = new Map(), teamNames = new Map(), namesToTeams = new Map();
    const driverTeams = new Map();
    let participantRows = 0, missingDriverId = 0, missingDriverName = 0, missingConstructorId = 0, missingConstructorName = 0;
    for (const event of events || []) for (const participant of event.participants || []) {
        participantRows += 1;
        const driverId = String(participant.driverId || '').trim();
        const driverName = normalizedIdentity(participant.driverName);
        const teamId = String(participant.constructorId || '').trim();
        const teamName = normalizedIdentity(participant.constructorName);
        if (!driverId) missingDriverId += 1;
        if (!driverName) missingDriverName += 1;
        if (!teamId) missingConstructorId += 1;
        if (!teamName) missingConstructorName += 1;
        if (!driverId) continue;
        if (!driverTeams.has(driverId)) driverTeams.set(driverId, new Set());
        if (driverName) { add(driverNames, driverId, driverName); add(namesToDrivers, driverName, driverId); }
        if (teamId) driverTeams.get(driverId).add(teamId);
        if (teamId && teamName) { add(teamNames, teamId, teamName); add(namesToTeams, teamName, teamId); }
    }
    const constructorCollisions = splitKnownConstructorCollisions(collisions(namesToTeams, 'name'), series);
    const report = {
        events: (events || []).length, participantRows, drivers: driverTeams.size,
        constructors: teamNames.size, missingDriverId, missingDriverName, missingConstructorId, missingConstructorName,
        driverIdNameConflicts: collisions(driverNames, 'driverId'),
        driverNameCollisions: collisions(namesToDrivers, 'name'),
        constructorIdNameConflicts: collisions(teamNames, 'constructorId'),
        constructorNameCollisions: constructorCollisions.unexpected,
        approvedConstructorNameCollisions: constructorCollisions.approved,
        graph: graphHealth(driverTeams)
    };
    report.issueCount = missingDriverId + missingDriverName + missingConstructorId + missingConstructorName
        + report.driverIdNameConflicts.length + report.driverNameCollisions.length
        + report.constructorIdNameConflicts.length + report.constructorNameCollisions.length;
    return { report, driverNames, namesToDrivers };
}

function crossSeriesDrivers(seriesAudits) {
    const byName = new Map(), byId = new Map();
    for (const [series, audit] of Object.entries(seriesAudits)) {
        for (const [name, ids] of audit.namesToDrivers) for (const id of ids) add(byName, name, `${series}:${id}`);
        for (const [id, names] of audit.driverNames) for (const name of names) add(byId, id, `${series}:${name}`);
    }
    const sharedNames = [...byName.entries()].filter(([, identities]) =>
        new Set([...identities].map(value => value.split(':')[0])).size > 1);
    const matches = sharedNames.map(([name, identities]) => {
        const values = [...identities].sort(), ids = new Set(values.map(value => value.slice(value.indexOf(':') + 1)));
        return { name, identities: values, linked: ids.size === 1 };
    });
    const idConflicts = [...byId.entries()].filter(([, identities]) => {
        const values = [...identities], series = new Set(values.map(value => value.split(':')[0]));
        const names = new Set(values.map(value => value.slice(value.indexOf(':') + 1)));
        return series.size > 1 && names.size > 1;
    }).map(([driverId, identities]) => ({ driverId, identities: [...identities].sort() }));
    return {
        matchedNames: matches.length,
        linkedNames: matches.filter(match => match.linked).length,
        unlinkedNames: matches.filter(match => !match.linked),
        idNameConflicts: idConflicts
    };
}

function auditRatingIdentities(eventsBySeries) {
    const internal = {}, series = {};
    for (const name of SERIES) {
        internal[name] = auditSeries(eventsBySeries?.[name] || [], name);
        series[name] = internal[name].report;
    }
    const crossSeries = crossSeriesDrivers(internal);
    const issueCount = Object.values(series).reduce((sum, report) => sum + report.issueCount, 0)
        + crossSeries.unlinkedNames.length + crossSeries.idNameConflicts.length;
    return { issueCount, series, crossSeries };
}

module.exports = { auditRatingIdentities, auditSeries, graphHealth, normalizedIdentity };
