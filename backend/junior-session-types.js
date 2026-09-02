function f2SessionType(session, sessionIndex, sessionCount, year) {
    const name = String(session.name || '').toLowerCase();
    if (name.includes('feature')) return 'F';
    if (name.includes('sprint')) return 'S';
    const sessionNumber = Number(session.sessionNumber || 0);
    if (sessionNumber) {
        if (Number(year) <= 2020) return sessionNumber <= 4 ? 'F' : 'S';
        if (Number(year) === 2021) return sessionNumber >= 8 ? 'F' : 'S';
        return sessionNumber >= 6 ? 'F' : 'S';
    }
    if (Number(year) <= 2020) return sessionIndex === 0 ? 'F' : 'S';
    return sessionIndex === sessionCount - 1 ? 'F' : 'S';
}

function f3SessionType(session, sessionIndex, sessionCount, year) {
    const name = String(session.name || '').toLowerCase();
    if (name.includes('feature')) return 'F';
    if (name.includes('sprint')) return 'S';
    const sessionNumber = Number(session.sessionNumber || 0);
    if (sessionNumber) {
        if (Number(year) <= 2020) return sessionNumber <= 4 ? 'F' : 'S';
        if (Number(year) === 2021) return sessionNumber >= 8 ? 'F' : 'S';
        return sessionNumber >= 6 ? 'F' : 'S';
    }
    return sessionIndex === sessionCount - 1 ? 'F' : 'S';
}

module.exports = { f2SessionType, f3SessionType };
