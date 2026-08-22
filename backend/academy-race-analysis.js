function academyRaceDisplayName(session) {
    return String(session?.name || 'Race');
}

function academyRaceGridContext(session, sessions, resultsBySession, year) {
    const raceSessions = sessions.filter(candidate => candidate.isRace);
    const qualifyingSessions = sessions.filter(candidate => /qualif/i.test(candidate.name) && resultsBySession.get(String(candidate.id))?.length);
    const primaryQualifying = qualifyingSessions.find(candidate => /(?:qualifying\s*1|\bq1\b)/i.test(candidate.name)) || qualifyingSessions[0];
    const secondaryQualifying = qualifyingSessions.find(candidate => /(?:qualifying\s*2|\bq2\b)/i.test(candidate.name)) || qualifyingSessions[1];
    const raceIndex = raceSessions.findIndex(candidate => String(candidate.id) === String(session.id));
    const name = String(session.name || '').toLowerCase();
    let qualifying = primaryQualifying;
    let reverseTopEight = false;
    let gridNote = null;

    if (name.includes('opening')) {
        qualifying = secondaryQualifying || primaryQualifying;
    } else if (name.includes('reverse')) {
        reverseTopEight = true;
    } else if (Number(year) === 2023) {
        qualifying = raceIndex === 2 ? secondaryQualifying || primaryQualifying : primaryQualifying;
        reverseTopEight = raceIndex === 1;
    } else if (Number(year) === 2024) {
        qualifying = raceIndex === 1 ? secondaryQualifying || primaryQualifying : primaryQualifying;
    } else if (Number(year) === 2025 && raceSessions.length >= 3) {
        // Montreal Race 1 used the final Miami Race 2 grid, which is not part of
        // the Montreal classification feed. Leave it explicitly unavailable.
        if (raceIndex === 0) {
            qualifying = null;
            gridNote = 'Starting-grid data is unavailable: this race used the final Miami Race 2 grid.';
        }
        else reverseTopEight = raceIndex === 1;
    } else if (Number(year) >= 2025) {
        reverseTopEight = raceIndex === 0;
    }

    const qualificationResults = qualifying ? resultsBySession.get(String(qualifying.id)) || [] : [];
    const qualificationByDriver = new Map(qualificationResults.map(result => [String(result.driverId), result.positionNumber]));
    const gridByDriver = new Map(qualificationResults.map(result => {
        const position = Number(result.positionNumber);
        return [String(result.driverId), reverseTopEight && position >= 1 && position <= 8 ? 9 - position : result.positionNumber];
    }));
    return { qualificationByDriver, gridByDriver, gridNote };
}

function academyRaceAwardsPole(session, sessions, year) {
    const raceSessions = sessions.filter(candidate => candidate.isRace);
    const raceIndex = raceSessions.findIndex(candidate => String(candidate.id) === String(session.id));
    const name = String(session.name || '').toLowerCase();
    if (name.includes('opening') || name.includes('reverse')) return false;
    if (Number(year) === 2023) return raceIndex === 0 || raceIndex === 2;
    if (Number(year) === 2024) return true;
    return raceIndex === raceSessions.length - 1;
}

module.exports = { academyRaceAwardsPole, academyRaceDisplayName, academyRaceGridContext };
