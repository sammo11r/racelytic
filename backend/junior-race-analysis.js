function juniorRaceGridContext(series, session, sessions, resultsBySession, raceType, year) {
    const sessionNumber = Number(session.sessionNumber || 0);
    const explicitGrid = sessions
        .filter(candidate => /grid/i.test(String(candidate.name || ''))
            && Number(candidate.sessionNumber || 0) < sessionNumber
            && resultsBySession.get(String(candidate.id))?.length)
        .sort((first, second) => Number(second.sessionNumber || 0) - Number(first.sessionNumber || 0))[0];
    const qualifying = sessions
        .filter(candidate => /qualif/i.test(String(candidate.name || ''))
            && Number(candidate.sessionNumber || 0) < sessionNumber
            && resultsBySession.get(String(candidate.id))?.length)
        .sort((first, second) => Number(second.sessionNumber || 0) - Number(first.sessionNumber || 0))[0];
    const qualifyingResults = qualifying ? resultsBySession.get(String(qualifying.id)) || [] : [];
    const qualificationByDriver = new Map(qualifyingResults.map(result => [String(result.driverId), result.positionNumber]));

    if (explicitGrid) {
        const gridResults = resultsBySession.get(String(explicitGrid.id)) || [];
        return {
            qualificationByDriver,
            gridByDriver: new Map(gridResults.map(result => [String(result.driverId), result.positionNumber])),
            source: 'official',
            gridNote: null
        };
    }

    const modernFormat = Number(year) >= 2022;
    if (!qualifyingResults.length || (!modernFormat && raceType !== 'F')) {
        return { qualificationByDriver, gridByDriver: new Map(), source: null, gridNote: null };
    }
    const reverseLimit = raceType === 'S' ? (series === 'f3' ? 12 : 10) : 0;
    const gridByDriver = new Map(qualifyingResults.map(result => {
        const position = Number(result.positionNumber);
        const grid = reverseLimit && position >= 1 && position <= reverseLimit
            ? reverseLimit + 1 - position
            : result.positionNumber;
        return [String(result.driverId), grid];
    }));
    return {
        qualificationByDriver,
        gridByDriver,
        source: 'derived',
        gridNote: reverseLimit
            ? `Starting grid derived from the reverse top ${reverseLimit} in qualifying.`
            : 'Starting grid derived from qualifying.'
    };
}

module.exports = { juniorRaceGridContext };
