const { juniorClassificationPosition } = require('./junior-classification');

function juniorRaceGridContext(series, session, sessions, resultsBySession, raceType, year) {
    const sessionNumber = Number(session.sessionNumber || 0);
    const previousRaceNumber = Math.max(0, ...sessions.filter(candidate => candidate.isRace
        && Number(candidate.sessionNumber) < sessionNumber).map(candidate => Number(candidate.sessionNumber)));
    const raceResults = resultsBySession.get(String(session.id)) || [];
    const explicitGrid = sessions
        .filter(candidate => /grid/i.test(String(candidate.name || ''))
            && Number(candidate.sessionNumber || 0) < sessionNumber
            && Number(candidate.sessionNumber || 0) > previousRaceNumber
            && resultsBySession.get(String(candidate.id))?.length
            // Legacy F2 feeds contain three-row podium snippets mislabeled "Grid".
            // They are not full starting classifications and cannot establish a grid.
            && !(series === 'f2' && Number(year) <= 2020 && raceResults.length > 3
                && resultsBySession.get(String(candidate.id)).length <= 3))
        .sort((first, second) => Number(second.sessionNumber || 0) - Number(first.sessionNumber || 0))[0];
    const qualifying = sessions
        .filter(candidate => /qualif/i.test(String(candidate.name || ''))
            && Number(candidate.sessionNumber || 0) < sessionNumber
            && resultsBySession.get(String(candidate.id))?.length)
        .sort((first, second) => Number(second.sessionNumber || 0) - Number(first.sessionNumber || 0))[0];
    const qualifyingResults = qualifying ? resultsBySession.get(String(qualifying.id)) || [] : [];
    const qualificationByDriver = new Map(qualifyingResults.map(result => [String(result.driverId), juniorClassificationPosition(result.positionNumber)]));

    if (explicitGrid) {
        const gridResults = resultsBySession.get(String(explicitGrid.id)) || [];
        return {
            qualificationByDriver,
            gridByDriver: new Map(gridResults.map(result => [String(result.driverId), juniorClassificationPosition(result.positionNumber)])),
            source: 'official',
            gridNote: null
        };
    }

    let basis = qualifyingResults;
    let basisLabel = 'qualifying';
    // Separate qualifying groups need a combined grid classification; one group's
    // positions cannot be treated as the overall starting order.
    const qualifyingDrivers = new Set(qualifyingResults.map(result => String(result.driverId)));
    const splitQualifying = sessions.some(candidate => /qualif/i.test(String(candidate.name || ''))
        && Number(candidate.sessionNumber) < sessionNumber && candidate.id !== qualifying?.id
        && (resultsBySession.get(String(candidate.id)) || []).some(result => !qualifyingDrivers.has(String(result.driverId))));
    if (splitQualifying) basis = [];
    let reverseLimit = raceType === 'S' ? (series === 'f3' ? 12 : 10) : 0;
    if (raceType === 'S' && (Number(year) <= 2020 || (Number(year) === 2021 && previousRaceNumber > 0))) {
        const previousRace = sessions.find(candidate => candidate.isRace && Number(candidate.sessionNumber) === previousRaceNumber);
        basis = previousRace && !previousRace.cancelled ? resultsBySession.get(String(previousRace.id)) || [] : [];
        basisLabel = 'the preceding race classification';
        // F2 Sporting Regulations 2020 §35.1; F3 reversed eight in 2019, ten in 2020.
        if (Number(year) <= 2020) reverseLimit = series === 'f3' && Number(year) === 2020 ? 10 : 8;
    }
    const validBasis = basis.filter(result => Number(result.positionNumber) > 0 && Number(result.positionNumber) < 999);
    const gridByDriver = new Map(validBasis.map(result => {
        const position = Number(result.positionNumber);
        const grid = reverseLimit && position >= 1 && position <= reverseLimit
            ? reverseLimit + 1 - position
            : result.positionNumber;
        return [String(result.driverId), grid];
    }));
    return {
        qualificationByDriver,
        gridByDriver,
        source: gridByDriver.size ? 'derived' : null,
        gridNote: !gridByDriver.size ? null : reverseLimit
            ? `Starting grid derived from the reverse top ${reverseLimit} in ${basisLabel}.`
            : 'Starting grid derived from qualifying.'
    };
}

module.exports = { juniorRaceGridContext };
