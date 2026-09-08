function pointsFor(position, scale = []) {
    const index = Number(position) - 1;
    return index >= 0 && index < scale.length ? Number(scale[index] || 0) : 0;
}

function isTrue(value) {
    return value === true || value === 1 || ['1', 'true'].includes(String(value).toLowerCase());
}

function compareCountback(first, second) {
    const pointsDifference = Number(second.points) - Number(first.points);
    if (Math.abs(pointsDifference) > 1e-9) return pointsDifference;
    for (let position = 1; position <= 30; position += 1) {
        const difference = Number(second.finishes[position] || 0) - Number(first.finishes[position] || 0);
        if (difference) return difference;
    }
    return first.name.localeCompare(second.name);
}

function scoreResult(result, system, { isFinalRound = false, mode = 'drivers' } = {}) {
    if (!result) return { racePoints: 0, sprintPoints: 0, points: 0 };
    const positionShare = mode === 'constructors' ? 1 : Math.max(1, Number(result.positionShare || 1));
    const fastestLapShare = Math.max(1, Number(result.fastestLapShare || 1));
    const racePointsMultiplier = Number.isFinite(Number(result.racePointsMultiplier))
        ? Number(result.racePointsMultiplier)
        : 1;
    const raceScale = mode === 'constructors' && system.constructorRace ? system.constructorRace : system.race;
    let racePoints = pointsFor(result.position, raceScale) / positionShare;
    const sprintPoints = (result.sprintResults || []).reduce(
        (total, sprint) => total + pointsFor(sprint.position, system.sprint),
        0
    );
    if (isTrue(result.polePosition)) racePoints += Number(system.poleBonus || 0);
    const fastestLapBonus = Number(mode === 'constructors' && system.constructorFastestLapBonus !== undefined
        ? system.constructorFastestLapBonus
        : system.fastestLapBonus || 0);
    const fastestLapEligible = system.fastestLapMaxPosition == null
        || Number(result.position) <= Number(system.fastestLapMaxPosition);
    if (fastestLapBonus && isTrue(result.fastestLap) && fastestLapEligible) {
        racePoints += fastestLapBonus / fastestLapShare;
    }
    racePoints *= racePointsMultiplier;
    if (system.doublePointsFinalRound && isFinalRound) racePoints *= 2;
    return { racePoints, sprintPoints, points: racePoints + sprintPoints };
}

function countRoundDetails(rounds, system, { mode = 'drivers' } = {}) {
    const score = round => system.sprintCountsTowardRound === false ? round.racePoints : round.points;
    const constructorOverride = mode === 'constructors' && system.constructorCountBest !== undefined;
    const countBest = constructorOverride ? system.constructorCountBest : system.countBest;
    const bestFirstRounds = constructorOverride ? null : system.bestFirstRounds;
    const firstRoundsWindow = constructorOverride ? null : system.firstRoundsWindow;
    const bestLastRounds = constructorOverride ? null : system.bestLastRounds;
    const lastRoundsWindow = constructorOverride ? null : system.lastRoundsWindow;
    let countedIndexes;
    if (bestFirstRounds || bestLastRounds) {
        const selected = new Set();
        const firstWindow = Math.min(Number(firstRoundsWindow || 0), rounds.length);
        const lastWindow = Math.min(Number(lastRoundsWindow || 0), rounds.length);
        rounds.forEach((round, index) => {
            const inFirst = firstWindow && index < firstWindow;
            const inLast = lastWindow && index >= rounds.length - lastWindow;
            if (!inFirst && !inLast && !system.countOnlySegments) selected.add(index);
        });
        if (firstWindow) [...rounds.slice(0, firstWindow).keys()]
            .sort((a, b) => score(rounds[b]) - score(rounds[a]))
            .slice(0, Number(bestFirstRounds)).forEach(index => selected.add(index));
        if (lastWindow) rounds.map((round, index) => index).slice(rounds.length - lastWindow)
            .sort((a, b) => score(rounds[b]) - score(rounds[a]))
            .slice(0, Number(bestLastRounds)).forEach(index => selected.add(index));
        countedIndexes = [...selected];
    } else {
        countedIndexes = rounds.map((round, index) => ({ round, index }))
            .sort((first, second) => score(second.round) - score(first.round))
            .slice(0, countBest ?? Infinity)
            .map(entry => entry.index);
    }
    const counted = countedIndexes.map(index => rounds[index]);
    const countedPoints = counted.reduce((total, round) => total + score(round), 0);
    const independentSprintPoints = system.sprintCountsTowardRound === false
        ? rounds.reduce((total, round) => total + round.sprintPoints, 0)
        : 0;
    const points = countedPoints + independentSprintPoints;
    const earnedPoints = rounds.reduce((total, round) => total + Number(round.points || 0), 0);
    return {
        points,
        earnedPoints,
        droppedPoints: Math.max(0, earnedPoints - points),
        countedRoundIndexes: countedIndexes.sort((first, second) => first - second)
    };
}

function countRounds(rounds, system, options = {}) {
    return countRoundDetails(rounds, system, options).points;
}

function simulateConstructors(data, system) {
    const finalRound = Math.max(...data.calendar.map(race => Number(race.round)), 0);
    const constructors = new Map(data.constructorChampionship.map(constructor => [String(constructor.constructorId), {
        id: constructor.constructorId,
        name: constructor.name,
        originalPosition: Number(constructor.position || 0),
        originalPoints: Number(constructor.points || 0),
        finishes: {},
        rounds: new Map(data.calendar.map(race => [Number(race.round), {
            racePoints: 0, sprintPoints: 0, points: 0
        }]))
    }]));

    data.driverChampionship.forEach(driver => Object.entries(driver.raceResults || {}).forEach(([roundText, result]) => {
        const roundNumber = Number(roundText);
        const scored = scoreResult(result, system, {
            isFinalRound: roundNumber === finalRound,
            mode: 'constructors'
        });
        const raceConstructor = constructors.get(String(result.constructorId || ''));
        const sprintConstructor = constructors.get(String(result.sprintConstructorId || result.constructorId || ''));
        if (raceConstructor) {
            const round = raceConstructor.rounds.get(roundNumber);
            if (system.constructorScoringCars === 1) round.racePoints = Math.max(round.racePoints, scored.racePoints);
            else round.racePoints += scored.racePoints;
            round.points = round.racePoints + round.sprintPoints;
            if (Number(result.position) > 0) {
                raceConstructor.finishes[result.position] = Number(raceConstructor.finishes[result.position] || 0) + 1;
            }
        }
        if (sprintConstructor) {
            const round = sprintConstructor.rounds.get(roundNumber);
            round.sprintPoints += scored.sprintPoints;
            round.points = round.racePoints + round.sprintPoints;
        }
    }));

    return [...constructors.values()].map(({ rounds, ...constructor }) => {
        const roundScores = [...rounds.entries()].map(([round, score]) => ({ round, ...score }));
        const counted = countRoundDetails(roundScores, system, { mode: 'constructors' });
        return {
            ...constructor,
            points: counted.points,
            earnedPoints: counted.earnedPoints,
            droppedPoints: counted.droppedPoints,
            roundScores: roundScores.map((round, index) => ({
                ...round, counted: counted.countedRoundIndexes.includes(index)
            }))
        };
    }).sort(compareCountback).map((entry, index) => ({
        ...entry,
        simulatedPosition: index + 1
    }));
}

function simulateDrivers(data, system) {
    const finalRound = Math.max(...data.calendar.map(race => Number(race.round)), 0);
    return data.driverChampionship.map(driver => {
        const finishes = {};
        const rounds = data.calendar.map(race => {
            const result = driver.raceResults?.[String(race.round)] || null;
            if (Number(result?.position) > 0) {
                finishes[result.position] = Number(finishes[result.position] || 0) + 1;
            }
            return { round: Number(race.round), ...scoreResult(result, system, { isFinalRound: Number(race.round) === finalRound }) };
        });
        const counted = countRoundDetails(rounds, system);
        return {
            id: driver.driverId,
            name: driver.name,
            originalPosition: Number(driver.position || 0),
            originalPoints: Number(driver.points || 0),
            points: counted.points,
            earnedPoints: counted.earnedPoints,
            droppedPoints: counted.droppedPoints,
            roundScores: rounds.map((round, index) => ({
                ...round, counted: counted.countedRoundIndexes.includes(index)
            })),
            finishes
        };
    }).sort(compareCountback).map((entry, index) => ({
        ...entry,
        simulatedPosition: index + 1
    }));
}

module.exports = { compareCountback, countRoundDetails, countRounds, pointsFor, scoreResult, simulateConstructors, simulateDrivers };
