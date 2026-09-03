const { juniorRaceGridContext } = require('./junior-race-analysis');
const { academyRaceGridContext } = require('./academy-race-analysis');
const { juniorClassificationPosition, juniorClassificationStatus } = require('./junior-classification');

const isTrue = value => value === true || Number(value) === 1 || String(value).toLowerCase() === 'true';
const optionalNumber = value => value == null || value === '' ? null : Number(value);

function buildJuniorCircuitAnalysis(circuit, rows, series, sessionType) {
    const weekends = new Map();
    for (const row of rows) {
        const weekend = weekends.get(String(row.raceId)) || { row, sessions: new Map(), results: new Map() };
        const id = String(row.sessionId);
        weekend.sessions.set(id, { id, name: row.sessionName, sessionNumber: Number(row.sessionNumber),
            startTimeUtc: row.startTimeUtc, isRace: isTrue(row.isRace), cancelled: isTrue(row.cancelled) });
        if (!weekend.results.has(id)) weekend.results.set(id, []);
        if (row.driverId) weekend.results.get(id).push({ ...row, positionNumber: juniorClassificationPosition(row.positionNumber),
            status: juniorClassificationStatus(row.positionText, row.positionNumber, isTrue(row.isRace)) });
        weekends.set(String(row.raceId), weekend);
    }
    const races = [];
    for (const weekend of weekends.values()) {
        const sessions = [...weekend.sessions.values()].sort((a, b) => a.sessionNumber - b.sessionNumber);
        const raceSessions = sessions.filter(session => session.isRace);
        const types = raceSessions.map((session, index) => sessionType(session, index, raceSessions.length, Number(weekend.row.year)));
        raceSessions.forEach((session, index) => {
            const results = weekend.results.get(session.id) || [];
            if (session.cancelled || !results.length) return;
            const row = weekend.row, year = Number(row.year);
            const type = types[index];
            const sprintCount = types.filter(value => value === 'S').length;
            const sprintIndex = types.slice(0, index + 1).filter(value => value === 'S').length;
            const label = series === 'academy' ? (/^race$/i.test(session.name) ? `Race ${index + 1}` : session.name)
                : type === 'F' ? 'Feature Race' : `Sprint Race${sprintCount > 1 ? ` ${sprintIndex}` : ''}`;
            const context = series === 'academy'
                ? academyRaceGridContext(session, sessions, weekend.results, year)
                : juniorRaceGridContext(series, session, sessions, weekend.results, type, year);
            const gridSource = context.source || (context.gridByDriver.size ? 'derived' : null);
            races.push({ id: row.raceId, sessionId: session.id, sessionNumber: session.sessionNumber,
                year, round: Number(row.round), date: session.startTimeUtc || row.date,
                officialName: `${row.raceName} · ${label}`, raceType: type,
                gridSource, gridNote: context.gridNote || (gridSource === 'derived' ? 'Grid derived from qualifying and the race format; penalties may not be reflected.' : null),
                laps: Math.max(...results.map(result => Number(result.laps || 0))),
                results: results.map(result => {
                    const driver = String(result.driverId), status = result.status;
                    const nonstarter = /^(DNS|DNQ|DNPQ|WD|W|DNP|DNA|DNE|EX)$/i.test(status || '');
                    const disqualified = /^(DSQ|DQ|DISQ|DISQUALIFIED|EXC|EXCLUDED)$/i.test(status || '');
                    const grid = juniorClassificationPosition(context.gridByDriver.get(driver));
                    return { driverId: result.driverId, driverName: result.driverName,
                        constructorId: result.constructorId, constructorName: result.constructorName,
                        position: nonstarter || disqualified ? null : result.positionNumber, positionText: status,
                        grid, qualifying: juniorClassificationPosition(context.qualificationByDriver.get(driver)),
                        laps: Number(result.laps || 0), gapMillis: optionalNumber(result.gapMillis), gapLaps: optionalNumber(result.gapLaps),
                        gap: result.gapMillis == null ? null : Number(result.gapMillis) / 1000,
                        reasonRetired: /^(DNF|RET|RETIRED)$/i.test(status || '') ? status : null,
                        polePosition: isTrue(result.polePosition), fastestLap: isTrue(result.fastestLap),
                        points: disqualified ? 0 : Number(result.points || 0) };
                }) });
        });
    }
    return { circuit, races };
}

module.exports = { buildJuniorCircuitAnalysis };
