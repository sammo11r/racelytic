const {
    DEFAULT_CONFIGURATION, configuration, effectiveK, elapsedYears, expectedScore,
    inactivityKMultiplier, kFactor, updateUncertainty
} = require('./rating-engine');

const WEC_MODEL_VERSION = 'wec-crew-1.1';

function actualScore(first, second) {
    if (Number(first.finishOrder) === Number(second.finishOrder)) return 0.5;
    return Number(first.finishOrder) < Number(second.finishOrder) ? 1 : 0;
}

function comparisonWeight(first, second, config) {
    if (first.classified && second.classified) return 1;
    if (first.disqualified || second.disqualified) return 1;
    const incomplete = [first, second].filter(entry => !entry.classified);
    const completion = Math.min(...incomplete.map(entry => Number(entry.completion) || 0));
    return Math.max(config.retirementFloor, completion ** config.retirementExponent);
}

function crewStrength(entry, ratings, startingRating) {
    const values = entry.drivers.map(driver => ratings.get(String(driver.id)) ?? startingRating);
    return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function calculateWecRatings(events, options = {}) {
    const config = configuration(options);
    const ratings = new Map(), experience = new Map(), evidence = new Map(), lastDates = new Map();
    const rows = [], comparisons = [];
    const ordered = [...events].sort((first, second) => new Date(first.date) - new Date(second.date)
        || Number(first.round) - Number(second.round) || String(first.id).localeCompare(String(second.id)));

    for (const event of ordered) {
        const poolKey = driverId => `${event.classScope || event.classId || 'other'}:${driverId}`;
        const entries = (event.entries || []).filter(entry => entry.started !== false && entry.drivers?.length);
        if (entries.length < 2) continue;
        const eventWeight = Number.isFinite(Number(event.weight)) ? Number(event.weight) : 1;
        const driverRows = entries.flatMap(entry => entry.drivers.map(driver => ({ entry, driver })));
        const before = new Map(driverRows.map(({ driver }) => {
            const id = String(driver.id);
            return [id, ratings.get(poolKey(id)) ?? config.startingRating];
        }));
        const scopedRatings = new Map(driverRows.map(({ driver }) => {
            const id = String(driver.id);
            return [id, ratings.get(poolKey(id)) ?? config.startingRating];
        }));
        const strengths = new Map(entries.map(entry => [entry.id, crewStrength(entry, scopedRatings, config.startingRating)]));
        const deltas = new Map(driverRows.map(({ driver }) => [String(driver.id), 0]));
        const entryExpected = new Map(entries.map(entry => [entry.id, 0]));
        const entryActual = new Map(entries.map(entry => [entry.id, 0]));
        const entryWeights = new Map(entries.map(entry => [entry.id, 0]));
        const entryMatchups = new Map(entries.map(entry => [entry.id, []]));
        const inactivity = new Map(driverRows.map(({ driver }) => {
            const id = String(driver.id);
            return [id, elapsedYears(lastDates.get(poolKey(id)), event.date)];
        }));
        const uncertaintyStateBefore = new Map(driverRows.map(({ driver }) => {
            const id = String(driver.id), stateKey = poolKey(id);
            return [id, updateUncertainty(evidence.get(stateKey), 0, inactivity.get(id), config)];
        }));

        for (let firstIndex = 0; firstIndex < entries.length; firstIndex++) {
            for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex++) {
                const first = entries[firstIndex], second = entries[secondIndex];
                const firstStrength = strengths.get(first.id), secondStrength = strengths.get(second.id);
                const expected = expectedScore(firstStrength, secondStrength, config.eloScale);
                const actual = actualScore(first, second);
                const weight = comparisonWeight(first, second, config);
                const signal = eventWeight * weight * (actual - expected) / (entries.length - 1);
                const firstCrewK = first.drivers.reduce((sum, driver) => sum + kFactor(experience.get(poolKey(String(driver.id))) || 0, config), 0) / first.drivers.length;
                const secondCrewK = second.drivers.reduce((sum, driver) => sum + kFactor(experience.get(poolKey(String(driver.id))) || 0, config), 0) / second.drivers.length;
                for (const driver of first.drivers) {
                    const id = String(driver.id);
                    const ownK = kFactor(experience.get(poolKey(id)) || 0, config) * inactivityKMultiplier(inactivity.get(id), config);
                    deltas.set(id, deltas.get(id) + effectiveK(ownK, secondCrewK, config.individualKWeight) * signal);
                }
                for (const driver of second.drivers) {
                    const id = String(driver.id);
                    const ownK = kFactor(experience.get(poolKey(id)) || 0, config) * inactivityKMultiplier(inactivity.get(id), config);
                    deltas.set(id, deltas.get(id) - effectiveK(ownK, firstCrewK, config.individualKWeight) * signal);
                }
                entryExpected.set(first.id, entryExpected.get(first.id) + expected * weight);
                entryExpected.set(second.id, entryExpected.get(second.id) + (1 - expected) * weight);
                entryActual.set(first.id, entryActual.get(first.id) + actual * weight);
                entryActual.set(second.id, entryActual.get(second.id) + (1 - actual) * weight);
                entryWeights.set(first.id, entryWeights.get(first.id) + weight);
                entryWeights.set(second.id, entryWeights.get(second.id) + weight);
                entryMatchups.get(first.id).push({ entry: second, rating: secondStrength, actual, expected, signal });
                entryMatchups.get(second.id).push({ entry: first, rating: firstStrength, actual: 1 - actual,
                    expected: 1 - expected, signal: -signal });
                if (options.collectComparisons) comparisons.push({
                    eventId: event.id, bootstrapEventId: event.sourceEventId || event.id, date: event.date,
                    year: event.year, round: event.round, eventSequence: event.eventSequence || 0,
                    sessionType: 'race', eventWeight, firstId: first.id, secondId: second.id,
                    firstRating: firstStrength, secondRating: secondStrength, expected, actual, weight,
                    evaluationWeight: weight, firstExperience: Math.min(...first.drivers.map(driver => experience.get(poolKey(String(driver.id))) || 0)),
                    secondExperience: Math.min(...second.drivers.map(driver => experience.get(poolKey(String(driver.id))) || 0)),
                    firstInactivityYears: Math.max(...first.drivers.map(driver => inactivity.get(String(driver.id)) || 0)),
                    secondInactivityYears: Math.max(...second.drivers.map(driver => inactivity.get(String(driver.id)) || 0)),
                    firstConstructorName: first.teamName, secondConstructorName: second.teamName,
                    sameConstructor: first.teamName === second.teamName,
                    firstClassified: first.classified, secondClassified: second.classified,
                    firstDisqualified: first.disqualified, secondDisqualified: second.disqualified,
                    firstUncertainty: Math.max(...first.drivers.map(driver => uncertaintyStateBefore.get(String(driver.id)).before)),
                    secondUncertainty: Math.max(...second.drivers.map(driver => uncertaintyStateBefore.get(String(driver.id)).before)),
                    firstEvidence: Math.min(...first.drivers.map(driver => uncertaintyStateBefore.get(String(driver.id)).evidenceBefore)),
                    secondEvidence: Math.min(...second.drivers.map(driver => uncertaintyStateBefore.get(String(driver.id)).evidenceBefore))
                });
            }
        }

        // Pairwise entry changes cancel, but unequal crew sizes otherwise create or destroy
        // driver rating points. Center the event across the drivers who actually started.
        const meanDelta = [...deltas.values()].reduce((sum, delta) => sum + delta, 0) / deltas.size;
        for (const [id, delta] of deltas) deltas.set(id, delta - meanDelta);

        const fieldStrength = [...strengths.values()].reduce((sum, value) => sum + value, 0) / entries.length;
        for (const entry of entries) {
            const comparisonTotal = entryWeights.get(entry.id) || 1;
            const expected = entryExpected.get(entry.id) / comparisonTotal;
            const actual = entryActual.get(entry.id) / comparisonTotal;
            const matchups = entryMatchups.get(entry.id);
            for (const driver of entry.drivers) {
                const id = String(driver.id), ratingBefore = before.get(id), delta = deltas.get(id);
                const effectiveEvidence = eventWeight * (entryWeights.get(entry.id) || 0) / (entries.length - 1);
                const stateKey = poolKey(id);
                const uncertainty = updateUncertainty(evidence.get(stateKey), effectiveEvidence, inactivity.get(id), config);
                const keyMatchup = matchups.reduce((selected, matchup) => !selected
                    || (delta >= 0 ? matchup.signal > selected.signal : matchup.signal < selected.signal) ? matchup : selected, null);
                const ratingAfter = ratingBefore + delta;
                ratings.set(stateKey, ratingAfter);
                experience.set(stateKey, (experience.get(stateKey) || 0) + 1);
                evidence.set(stateKey, uncertainty.evidenceAfter);
                lastDates.set(stateKey, event.date);
                rows.push({
                    modelVersion: WEC_MODEL_VERSION, series: 'wec', eventId: String(event.id), eventDate: event.date,
                    year: Number(event.year), round: Number(event.round), eventSequence: Number(event.eventSequence || 0),
                    eventName: event.name, sessionType: 'race', driverId: id, driverName: driver.name,
                    constructorName: entry.teamName || entry.manufacturerName || '', positionNumber: entry.positionNumber,
                    positionText: entry.status, ratingBefore, ratingAfter, ratingChange: delta,
                    expectedScore: expected, actualScore: actual, expectedPosition: 1 + (entries.length - 1) * (1 - expected),
                    fieldSize: entries.length, completion: entry.completion, finishOrder: Number(entry.finishOrder),
                    eventWeight, fieldStrength, effectiveEvidence,
                    uncertaintyBefore: uncertainty.before, uncertaintyAfter: uncertainty.after,
                    evidenceBefore: uncertainty.evidenceBefore, evidenceAfter: uncertainty.evidenceAfter,
                    opponentsBeaten: matchups.filter(matchup => matchup.actual === 1).length,
                    higherRatedBeaten: matchups.filter(matchup => matchup.actual === 1 && matchup.rating > strengths.get(entry.id)).length,
                    keyRivalId: keyMatchup?.entry.id || null,
                    keyRivalName: keyMatchup ? `#${keyMatchup.entry.carNumber} ${keyMatchup.entry.teamName || keyMatchup.entry.manufacturerName}`.trim() : '',
                    keyRivalRating: keyMatchup?.rating ?? null,
                    keyRivalOutcome: keyMatchup ? keyMatchup.actual === 1 ? 'beat' : keyMatchup.actual === 0 ? 'lost' : 'tied' : null,
                    classId: event.classId, classCode: event.classCode, className: event.className,
                    classScope: event.classScope, entryId: entry.id, carNumber: entry.carNumber,
                    manufacturerName: entry.manufacturerName || '', crewSize: entry.drivers.length
                });
            }
        }
    }
    return { modelVersion: WEC_MODEL_VERSION, configuration: config, rows, ratings, comparisons };
}

module.exports = { WEC_MODEL_VERSION, calculateWecRatings, crewStrength };
