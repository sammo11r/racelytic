function parsePoints(value, field) {
    if (!Array.isArray(value) || value.length > 30) throw new Error(`${field} must contain at most 30 positions.`);
    const points = value.map(Number);
    if (points.some(number => !Number.isFinite(number) || number < 0 || number > 1000)) {
        throw new Error(`${field} values must be between 0 and 1000.`);
    }
    while (points.length && points.at(-1) === 0) points.pop();
    return points;
}

function validatePointsSystem(input) {
    const name = String(input.name || '').trim();
    if (name.length < 2 || name.length > 100) throw new Error('Name must be 2–100 characters.');
    const racePoints = parsePoints(input.racePoints, 'Race points');
    const sprintPoints = parsePoints(input.sprintPoints || [], 'Sprint points');
    const qualifyingPoints = parsePoints(input.qualifyingPoints || [], 'Qualifying points');
    if (!racePoints.length) throw new Error('Award points to at least one race position.');

    const poleBonus = Number(input.poleBonus || 0);
    const fastestLapBonus = Number(input.fastestLapBonus || 0);
    if (![poleBonus, fastestLapBonus].every(value => Number.isFinite(value) && value >= 0 && value <= 1000)) {
        throw new Error('Bonus points must be between 0 and 1000.');
    }

    const fastestLapMaxPosition = input.fastestLapMaxPosition == null || input.fastestLapMaxPosition === ''
        ? null : Number(input.fastestLapMaxPosition);
    if (fastestLapMaxPosition !== null && (!Number.isInteger(fastestLapMaxPosition) || fastestLapMaxPosition < 1 || fastestLapMaxPosition > 30)) {
        throw new Error('Fastest-lap eligibility must be a finishing position from 1 to 30.');
    }

    const countBestRounds = input.countBestRounds == null || input.countBestRounds === ''
        ? null : Number(input.countBestRounds);
    if (countBestRounds !== null && (!Number.isInteger(countBestRounds) || countBestRounds < 1 || countBestRounds > 100)) {
        throw new Error('Best-round count must be between 1 and 100.');
    }

    const optionalRound = (value, label) => {
        if (value === null || value === '' || value === undefined) return null;
        const number = Number(value);
        if (!Number.isInteger(number) || number < 1 || number > 100) throw new Error(`${label} must be between 1 and 100.`);
        return number;
    };
    const bestFirstRounds = optionalRound(input.bestFirstRounds, 'Best-first count');
    const firstRoundsWindow = optionalRound(input.firstRoundsWindow, 'First-round window');
    const bestLastRounds = optionalRound(input.bestLastRounds, 'Best-last count');
    const lastRoundsWindow = optionalRound(input.lastRoundsWindow, 'Last-round window');
    if ((bestFirstRounds === null) !== (firstRoundsWindow === null)) throw new Error('Set both values for the first-round segment.');
    if ((bestLastRounds === null) !== (lastRoundsWindow === null)) throw new Error('Set both values for the last-round segment.');
    if (bestFirstRounds !== null && bestFirstRounds > firstRoundsWindow) throw new Error('Best-first count cannot exceed its round window.');
    if (bestLastRounds !== null && bestLastRounds > lastRoundsWindow) throw new Error('Best-last count cannot exceed its round window.');
    if (countBestRounds !== null && (bestFirstRounds !== null || bestLastRounds !== null)) {
        throw new Error('Use either a whole-season best-round limit or segmented first/last limits.');
    }

    const visibility = input.visibility === 'public' ? 'public' : 'private';
    return {
        name, racePoints, sprintPoints, qualifyingPoints, poleBonus, fastestLapBonus,
        fastestLapMaxPosition, countBestRounds, bestFirstRounds, firstRoundsWindow,
        bestLastRounds, lastRoundsWindow,
        sprintCountsTowardRound: input.sprintCountsTowardRound !== false,
        visibility, tieBreaker: 'countback'
    };
}

function serialize(row) {
    const json = value => Array.isArray(value) ? value : JSON.parse(value || '[]');
    return {
        id: row.id,
        userId: row.userId,
        ownerName: row.ownerName,
        name: row.name,
        racePoints: json(row.racePoints),
        sprintPoints: json(row.sprintPoints),
        qualifyingPoints: json(row.qualifyingPoints),
        poleBonus: Number(row.poleBonus),
        fastestLapBonus: Number(row.fastestLapBonus),
        fastestLapMaxPosition: row.fastestLapMaxPosition === null ? null : Number(row.fastestLapMaxPosition),
        countBestRounds: row.countBestRounds === null ? null : Number(row.countBestRounds),
        bestFirstRounds: row.bestFirstRounds === null ? null : Number(row.bestFirstRounds),
        firstRoundsWindow: row.firstRoundsWindow === null ? null : Number(row.firstRoundsWindow),
        bestLastRounds: row.bestLastRounds === null ? null : Number(row.bestLastRounds),
        lastRoundsWindow: row.lastRoundsWindow === null ? null : Number(row.lastRoundsWindow),
        sprintCountsTowardRound: Boolean(row.sprintCountsTowardRound),
        visibility: row.visibility,
        tieBreaker: row.tieBreaker,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

module.exports = { serialize, validatePointsSystem };
