function configuration(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Championship configuration must be an object.');
    const identifiers = (value, limit) => Array.isArray(value)
        ? [...new Set(value.map(item => String(item).trim().slice(0, 100)).filter(Boolean))].slice(0, limit) : [];
    const points = input.pointsSystem || {};
    const scale = (value, label, required = false) => {
        if (!Array.isArray(value) || value.length > 30) throw new Error(`${label} must contain ${required ? '1–30' : 'at most 30'} positions.`);
        const numbers = value.map(Number);
        if (numbers.some(number => !Number.isFinite(number) || number < 0 || number > 1000)) {
            throw new Error(`${label} values must be between 0 and 1000.`);
        }
        while (numbers.length && numbers.at(-1) === 0) numbers.pop();
        if (required && !numbers.length) throw new Error('Award points to at least one race position.');
        return numbers;
    };
    const raceIds = identifiers(input.raceIds, 100);
    if (!raceIds.length) throw new Error('Add at least one race.');
    const series = ['f1', 'f2', 'f3', 'academy', 'fe', 'wec'].includes(input.series) ? input.series : 'f1';
    const driverIds = identifiers(input.driverIds, 1000);
    const constructorIds = identifiers(input.constructorIds, 500);
    const teamIds = identifiers(input.teamIds, 500);
    const manufacturerIds = identifiers(input.manufacturerIds, 500);
    const classCode = typeof input.classCode === 'string' && /^[A-Z0-9 -]{1,40}$/.test(input.classCode) ? input.classCode : '';
    if (series === 'wec' && !classCode) throw new Error('Choose a WEC class.');
    if (series === 'wec' && !driverIds.length && !teamIds.length && !manufacturerIds.length) throw new Error('Select at least one eligible WEC competitor.');
    const raceWeights = Object.fromEntries(Object.entries(input.raceWeights || {})
        .filter(([id, weight]) => raceIds.includes(id) && ['standard', 'extended', 'le-mans'].includes(weight)));
    const multiplier = (value, fallback, label) => {
        const number = value === undefined || value === null ? fallback : Number(value);
        if (!Number.isFinite(number) || number < 0 || number > 5 || Math.abs(Math.round(number * 100) - number * 100) > 1e-8) {
            throw new Error(`${label} must be between 0 and 5 with at most two decimal places.`);
        }
        return number;
    };
    return {
        series,
        raceIds,
        driverIds, constructorIds, teamIds, manufacturerIds, classCode,
        raceWeights,
        pointsSystem: {
            id: String(points.id || 'modern').slice(0, 100), name: String(points.name || 'Modern').slice(0, 100),
            race: scale(points.race, 'Race points', true), sprint: scale(points.sprint || [], 'Sprint points'), qualifying: scale(points.qualifying || [], 'Qualifying points'),
            poleBonus: Number(points.poleBonus || 0), fastestLapBonus: Number(points.fastestLapBonus || 0),
            fastestLapMaxPosition: points.fastestLapMaxPosition == null ? null : Number(points.fastestLapMaxPosition),
            countBest: points.countBest == null ? null : Number(points.countBest),
            bestFirstRounds: points.bestFirstRounds == null ? null : Number(points.bestFirstRounds),
            firstRoundsWindow: points.firstRoundsWindow == null ? null : Number(points.firstRoundsWindow),
            bestLastRounds: points.bestLastRounds == null ? null : Number(points.bestLastRounds),
            lastRoundsWindow: points.lastRoundsWindow == null ? null : Number(points.lastRoundsWindow),
            sprintCountsTowardRound: points.sprintCountsTowardRound !== false,
            extended: multiplier(points.extended, 1.5, 'Extended-race multiplier'), leMans: multiplier(points.leMans, 2, 'Le Mans multiplier')
        }
    };
}

module.exports = { configuration };
