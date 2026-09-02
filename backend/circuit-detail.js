function buildCircuitDetail(circuit, rows) {
    const racesById = new Map();
    for (const row of rows) {
        const key = String(row.id);
        if (!racesById.has(key)) racesById.set(key, { ...row, hasResults: Boolean(Number(row.hasResults)), winners: [] });
        const race = racesById.get(key);
        if (row.winnerDriverId && !race.winners.some(winner => winner.driverId === row.winnerDriverId)) {
            race.winners.push({ driverId: row.winnerDriverId, name: row.winnerName, constructorId: row.winnerConstructorId, constructorName: row.winnerConstructorName });
        }
    }
    const races = [...racesById.values()];
    const completed = races.filter(race => race.hasResults);
    const years = completed.map(race => Number(race.year));
    const drivers = new Map(), constructors = new Map();
    for (const race of completed) {
        const teams = new Set();
        for (const winner of race.winners) {
            const driver = drivers.get(winner.driverId) || { id: winner.driverId, name: winner.name, wins: 0 };
            driver.wins++; drivers.set(winner.driverId, driver);
            if (winner.constructorId && !teams.has(winner.constructorId)) {
                teams.add(winner.constructorId);
                const team = constructors.get(winner.constructorId) || { id: winner.constructorId, name: winner.constructorName, wins: 0 };
                team.wins++; constructors.set(winner.constructorId, team);
            }
        }
    }
    const leaders = map => [...map.values()].sort((a, b) => b.wins - a.wins || String(a.name).localeCompare(String(b.name))).slice(0, 5);
    return {
        circuit: { ...circuit, totalRacesHeld: completed.length, firstHeldYear: years.length ? Math.min(...years) : null, lastHeldYear: years.length ? Math.max(...years) : null },
        races,
        records: { drivers: leaders(drivers), constructors: leaders(constructors) }
    };
}

function buildJuniorCircuitDetail(circuit, weekends, sessions, series, classify) {
    const isTrue = value => value === true || Number(value) === 1 || String(value).toLowerCase() === 'true';
    const history = [];
    const races = weekends.map(weekend => {
        const allSessions = sessions.filter(session => String(session.raceId) === String(weekend.id)).map(session => ({ ...session, isRace: isTrue(session.isRace), cancelled: isTrue(session.cancelled) }));
        const raceSessions = allSessions.filter(session => session.isRace || (session.cancelled && /race/i.test(session.name))).sort((a, b) => Number(a.sessionNumber) - Number(b.sessionNumber));
        const unique = [...new Map(raceSessions.map(session => [session.id, session])).values()];
        const types = unique.map((session, index) => classify(session, index, unique.length, weekend.year));
        for (const session of raceSessions) {
            const index = unique.findIndex(item => item.id === session.id);
            let label = session.name;
            if (/^race(?:\s*\d+)?$/i.test(label || '')) {
                if (series === 'academy') label = `Race ${index + 1}`;
                else if (types[index] === 'F') label = 'Feature Race';
                else label = `Sprint Race${types.filter(type => type === 'S').length > 1 ? ` ${types.slice(0, index + 1).filter(type => type === 'S').length}` : ''}`;
            }
            const completed = !session.cancelled && isTrue(session.hasResults);
            history.push({
                ...weekend, id: session.id, raceId: weekend.id, sessionId: session.id,
                sessionNumber: Number(session.sessionNumber), name: `${weekend.name} · ${label}`,
                date: String(session.startTimeUtc || weekend.endDate || weekend.date || '').slice(0, 10) || null,
                dateIsWeekend: !session.startTimeUtc, weekendDate: weekend.date,
                hasResults: completed, cancelled: session.cancelled, laps: completed ? session.laps : null,
                winnerDriverId: completed ? session.winnerDriverId : null, winnerName: completed ? session.winnerName : null,
                winnerConstructorId: completed ? session.winnerConstructorId : null, winnerConstructorName: completed ? session.winnerConstructorName : null
            });
        }
        if (!raceSessions.length) history.push({ ...weekend, raceId: weekend.id, date: weekend.endDate || weekend.date, hasResults: false });
        return { ...weekend, sessions: allSessions };
    });
    const detail = buildCircuitDetail(circuit, history);
    return { ...detail, history: detail.races, races };
}

module.exports = { buildCircuitDetail, buildJuniorCircuitDetail };
