const { academyRaceGridContext } = require('./academy-race-analysis');

function comparisonRaceGroups(rows) {
    const sharedRaces = rows.map(row => ({
        ...row,
        sameTeam: row.sameTeam === true || Number(row.sameTeam) === 1 || String(row.sameTeam).toLowerCase() === 'true'
    }));
    return {
        sharedRaces,
        teammateRaces: sharedRaces.filter(row => row.sameTeam)
    };
}

function academyComparisonLookups(sharedRaces, qualifyingResults) {
    const sessionsByRace = new Map();
    const resultsBySession = new Map();
    const addSession = (raceId, session) => {
        const key = String(raceId);
        if (!sessionsByRace.has(key)) sessionsByRace.set(key, new Map());
        sessionsByRace.get(key).set(String(session.id), session);
    };
    sharedRaces.forEach(row => addSession(row.raceId, {
        id: row.sessionId, name: row.sessionName, sessionNumber: Number(row.sessionNumber), isRace: true
    }));
    qualifyingResults.forEach(row => {
        addSession(row.raceId, {
            id: row.sessionId, name: row.sessionName, sessionNumber: Number(row.sessionNumber), isRace: false
        });
        const key = String(row.sessionId);
        if (!resultsBySession.has(key)) resultsBySession.set(key, []);
        if (row.driverId) resultsBySession.get(key).push({ driverId: row.driverId, positionNumber: Number(row.positionNumber) });
    });
    const contexts = new Map();
    sharedRaces.forEach(row => {
        const sessions = [...(sessionsByRace.get(String(row.raceId))?.values() || [])]
            .sort((a, b) => a.sessionNumber - b.sessionNumber);
        contexts.set(String(row.sessionId), academyRaceGridContext(
            sessions.find(session => String(session.id) === String(row.sessionId)),
            sessions,
            resultsBySession,
            row.year
        ));
    });
    return {
        gridPosition(row, driverId) {
            return contexts.get(String(row.sessionId))?.gridByDriver.get(String(driverId)) ?? null;
        },
        qualifyingPosition(row, driverId) {
            return contexts.get(String(row.sessionId))?.qualificationByDriver.get(String(driverId)) ?? null;
        }
    };
}

module.exports = { academyComparisonLookups, comparisonRaceGroups };
