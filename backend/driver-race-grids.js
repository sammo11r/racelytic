const { academyRaceGridContext } = require('./academy-race-analysis');
const { juniorRaceGridContext } = require('./junior-race-analysis');
const { juniorClassificationPosition } = require('./junior-classification');

// Build complete weekend contexts: a driver's own results alone omit other races
// and can give the wrong race index or reverse-grid format (especially in Academy).
function driverRaceGridContexts(series, rows, sessionType) {
    const weekends = new Map();
    const isTrue = value => value === true || Number(value) === 1 || String(value).toLowerCase() === 'true';
    rows.forEach(row => {
        const key = String(row.raceId);
        if (!weekends.has(key)) weekends.set(key, { year: Number(row.year), sessions: new Map(), results: new Map() });
        const weekend = weekends.get(key);
        const id = String(row.sessionId);
        weekend.sessions.set(id, { id, name: row.sessionName, sessionNumber: Number(row.sessionNumber), isRace: isTrue(row.isRace), cancelled: isTrue(row.cancelled) });
        if (!weekend.results.has(id)) weekend.results.set(id, []);
        if (row.driverId) weekend.results.get(id).push({
            driverId: row.driverId,
            positionNumber: juniorClassificationPosition(row.positionNumber)
        });
    });
    const contexts = new Map();
    weekends.forEach(weekend => {
        const sessions = [...weekend.sessions.values()].sort((a, b) => a.sessionNumber - b.sessionNumber);
        const races = sessions.filter(session => session.isRace);
        races.forEach((session, index) => {
            const context = series === 'academy'
                ? academyRaceGridContext(session, sessions, weekend.results, weekend.year)
                : juniorRaceGridContext(series, session, sessions, weekend.results, sessionType(session, index, races.length, weekend.year), weekend.year);
            contexts.set(session.id, { ...context, source: series === 'academy' && context.gridByDriver.size ? 'derived' : context.source,
                gridNote: context.gridNote || (series === 'academy' && context.gridByDriver.size ? 'Starting grid derived from the available qualifying classification and race format.' : null) });
        });
    });
    return contexts;
}

module.exports = { driverRaceGridContexts };
