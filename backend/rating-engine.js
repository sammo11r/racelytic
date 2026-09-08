const MODEL_VERSION = 'elo-1.4';
const START_RATING = 1500;
const ELO_SCALE = 400;
const DEFAULT_CONFIGURATION = Object.freeze({
    startingRating: START_RATING,
    eloScale: ELO_SCALE,
    provisionalEvents: 10,
    establishedEvents: 50,
    provisionalK: 140,
    developingK: 98,
    establishedK: 70,
    kSmoothing: 0,
    returnKBoost: 0,
    returnKGraceYears: 1,
    returnKHalfLifeYears: 1,
    individualKWeight: 0,
    eventCentering: 1,
    retirementFloor: 0.15,
    retirementExponent: 1,
    featureWeight: 1,
    sprintWeight: 0.5,
    initialUncertainty: 260,
    minimumUncertainty: 45,
    evidenceHalfLifeYears: 3,
    uncertaintyPredictionWeight: 1
});

function configuration(options = {}) {
    const limits = {
        startingRating: [100, 3000], eloScale: [50, 2000], provisionalEvents: [1, 100], establishedEvents: [2, 500],
        provisionalK: [1, 400], developingK: [1, 400], establishedK: [1, 400], kSmoothing: [0, 1],
        returnKBoost: [0, 2], returnKGraceYears: [0, 5], returnKHalfLifeYears: [0.1, 10],
        individualKWeight: [0, 1], eventCentering: [0, 1], retirementFloor: [0, 1],
        retirementExponent: [0.25, 4],
        featureWeight: [0, 2], sprintWeight: [0, 2], initialUncertainty: [25, 1000],
        minimumUncertainty: [1, 500], evidenceHalfLifeYears: [0.1, 25], uncertaintyPredictionWeight: [0, 10]
    };
    const configured = Object.fromEntries(Object.entries(DEFAULT_CONFIGURATION).map(([key, fallback]) => {
        const value = Number(options[key]);
        const [minimum, maximum] = limits[key];
        return [key, Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback];
    }));
    configured.provisionalEvents = Math.round(configured.provisionalEvents);
    configured.establishedEvents = Math.max(configured.provisionalEvents + 1, Math.round(configured.establishedEvents));
    configured.initialUncertainty = Math.max(configured.minimumUncertainty, configured.initialUncertainty);
    return configured;
}

function elapsedYears(previousDate, currentDate) {
    if (!previousDate) return 0;
    const milliseconds = new Date(currentDate).getTime() - new Date(previousDate).getTime();
    return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds / (365.25 * 86400000) : 0;
}

function uncertaintyFromEvidence(evidence, config = DEFAULT_CONFIGURATION) {
    const usefulEvidence = Math.max(0, Number(evidence) || 0);
    return config.minimumUncertainty
        + (config.initialUncertainty - config.minimumUncertainty) / Math.sqrt(1 + usefulEvidence);
}

function updateUncertainty(previousEvidence, eventEvidence, yearsInactive = 0, config = DEFAULT_CONFIGURATION) {
    const decay = 2 ** (-Math.max(0, yearsInactive) / config.evidenceHalfLifeYears);
    const evidenceBefore = Math.max(0, Number(previousEvidence) || 0) * decay;
    const evidenceAfter = evidenceBefore + Math.max(0, Number(eventEvidence) || 0);
    return {
        evidenceBefore, evidenceAfter,
        before: uncertaintyFromEvidence(evidenceBefore, config),
        after: uncertaintyFromEvidence(evidenceAfter, config)
    };
}

function uncertaintyAtDate(evidence, lastDate, asOfDate, config = DEFAULT_CONFIGURATION) {
    const state = updateUncertainty(evidence, 0, elapsedYears(lastDate, asOfDate), config);
    return { evidence: state.evidenceBefore, uncertainty: state.before, asOfDate };
}

function expectedScore(rating, opponentRating, scale = ELO_SCALE) {
    return 1 / (1 + 10 ** ((opponentRating - rating) / scale));
}

function uncertaintyAdjustedScore(rating, opponentRating, uncertainty, opponentUncertainty, scale = ELO_SCALE, weight = 1) {
    const variance = Math.max(0, Number(uncertainty) || 0) ** 2 + Math.max(0, Number(opponentUncertainty) || 0) ** 2;
    const effectiveScale = Math.sqrt(scale ** 2 + Math.max(0, Number(weight) || 0) * variance);
    return expectedScore(rating, opponentRating, effectiveScale);
}

function kFactor(experience, config = DEFAULT_CONFIGURATION) {
    const staged = experience < config.provisionalEvents ? config.provisionalK
        : experience < config.establishedEvents ? config.developingK : config.establishedK;
    const firstSpan = Math.max(1, config.provisionalEvents);
    const secondSpan = Math.max(1, config.establishedEvents - config.provisionalEvents);
    const smooth = experience < config.provisionalEvents
        ? config.provisionalK + (config.developingK - config.provisionalK) * Math.max(0, experience) / firstSpan
        : config.developingK + (config.establishedK - config.developingK)
            * Math.min(1, Math.max(0, experience - config.provisionalEvents) / secondSpan);
    const smoothing = Math.min(1, Math.max(0, Number(config.kSmoothing) || 0));
    return staged + smoothing * (smooth - staged);
}

function inactivityKMultiplier(yearsInactive, config = DEFAULT_CONFIGURATION) {
    const boost = Math.max(0, Number(config.returnKBoost) || 0);
    const grace = Math.max(0, Number(config.returnKGraceYears) || 0);
    const halfLife = Math.max(.1, Number(config.returnKHalfLifeYears) || 1);
    const qualifyingAbsence = Math.max(0, (Number(yearsInactive) || 0) - grace);
    return 1 + boost * (1 - 2 ** (-qualifyingAbsence / halfLife));
}

function effectiveK(ownK, opponentK, individualWeight = DEFAULT_CONFIGURATION.individualKWeight) {
    const pairK = (ownK + opponentK) / 2;
    return pairK + individualWeight * (ownK - pairK);
}

function comparisonWeight(first, second, floor = DEFAULT_CONFIGURATION.retirementFloor,
    exponent = DEFAULT_CONFIGURATION.retirementExponent) {
    if (first.classified && second.classified) return 1;
    if (first.disqualified || second.disqualified) return 1;
    const incomplete = [first, second].filter(driver => !driver.classified);
    const completion = Math.min(...incomplete.map(driver => Number(driver.completion) || 0));
    return Math.max(floor, completion ** Math.max(.25, Number(exponent) || 1));
}

function actualScore(first, second) {
    const firstOrder = Number(first.finishOrder);
    const secondOrder = Number(second.finishOrder);
    if (firstOrder === secondOrder) return 0.5;
    return firstOrder < secondOrder ? 1 : 0;
}

function eventBaseWeight(sessionType, config = DEFAULT_CONFIGURATION) {
    return sessionType === 'sprint' || sessionType === 'reverse-grid'
        ? config.sprintWeight : config.featureWeight;
}

function eventSequence(event) {
    const sequence = Number(event.eventSequence);
    if (Number.isFinite(sequence)) return sequence;
    if (event.sessionType === 'sprint' || event.sessionType === 'reverse-grid') return 1;
    if (event.sessionType === 'race' || event.sessionType === 'feature') return 2;
    return 0;
}

function compareEvents(first, second) {
    return new Date(first.date) - new Date(second.date)
        || (Number(first.round) || 0) - (Number(second.round) || 0)
        || eventSequence(first) - eventSequence(second)
        || String(first.id).localeCompare(String(second.id));
}

function calculateRatings(events, options = {}) {
    const config = configuration(options);
    const ratings = new Map(), experience = new Map(), evidence = new Map(), lastDates = new Map();
    const rows = [], comparisons = [];
    const orderedEvents = [...events].sort(compareEvents);

    for (const event of orderedEvents) {
        const field = event.participants.filter(driver => driver.started !== false && driver.driverId);
        if (field.length < 2) continue;
        const before = new Map(field.map(driver => [String(driver.driverId), ratings.get(String(driver.driverId)) ?? config.startingRating]));
        const deltas = new Map(field.map(driver => [String(driver.driverId), 0]));
        const expectedTotals = new Map(field.map(driver => [String(driver.driverId), 0]));
        const actualTotals = new Map(field.map(driver => [String(driver.driverId), 0]));
        const weightTotals = new Map(field.map(driver => [String(driver.driverId), 0]));
        const matchups = new Map(field.map(driver => [String(driver.driverId), []]));
        const suppliedWeight = event.weight == null ? 1 : Number(event.weight);
        const eventWeight = Number.isFinite(suppliedWeight) ? suppliedWeight : 1;
        const inactivityYears = new Map(field.map(driver => {
            const id = String(driver.driverId);
            return [id, elapsedYears(lastDates.get(id), event.date)];
        }));
        const uncertaintyStateBefore = new Map(field.map(driver => {
            const id = String(driver.driverId);
            return [id, updateUncertainty(evidence.get(id), 0, inactivityYears.get(id), config)];
        }));

        for (let firstIndex = 0; firstIndex < field.length; firstIndex++) {
            for (let secondIndex = firstIndex + 1; secondIndex < field.length; secondIndex++) {
                const first = field[firstIndex], second = field[secondIndex];
                const firstId = String(first.driverId), secondId = String(second.driverId);
                const expected = expectedScore(before.get(firstId), before.get(secondId), config.eloScale);
                const actual = actualScore(first, second);
                const weight = comparisonWeight(first, second, config.retirementFloor, config.retirementExponent);
                const evaluationWeight = comparisonWeight(first, second, DEFAULT_CONFIGURATION.retirementFloor,
                    DEFAULT_CONFIGURATION.retirementExponent);
                const firstExperience = experience.get(firstId) || 0, secondExperience = experience.get(secondId) || 0;
                const firstK = kFactor(firstExperience, config) * inactivityKMultiplier(inactivityYears.get(firstId), config);
                const secondK = kFactor(secondExperience, config) * inactivityKMultiplier(inactivityYears.get(secondId), config);
                const signal = eventWeight * weight * (actual - expected) / (field.length - 1);
                const firstChange = effectiveK(firstK, secondK, config.individualKWeight) * signal;
                const secondChange = -effectiveK(secondK, firstK, config.individualKWeight) * signal;
                deltas.set(firstId, deltas.get(firstId) + firstChange);
                deltas.set(secondId, deltas.get(secondId) + secondChange);
                expectedTotals.set(firstId, expectedTotals.get(firstId) + expected * weight);
                expectedTotals.set(secondId, expectedTotals.get(secondId) + (1 - expected) * weight);
                actualTotals.set(firstId, actualTotals.get(firstId) + actual * weight);
                actualTotals.set(secondId, actualTotals.get(secondId) + (1 - actual) * weight);
                weightTotals.set(firstId, weightTotals.get(firstId) + weight);
                weightTotals.set(secondId, weightTotals.get(secondId) + weight);
                matchups.get(firstId).push({ opponentId: secondId, opponentName: second.driverName,
                    opponentRating: before.get(secondId), actual, expected, weight, signal });
                matchups.get(secondId).push({ opponentId: firstId, opponentName: first.driverName,
                    opponentRating: before.get(firstId), actual: 1 - actual, expected: 1 - expected,
                    weight, signal: -signal });
                if (options.collectComparisons) comparisons.push({
                    eventId: String(event.id), date: event.date, year: Number(event.year),
                    bootstrapEventId: event.sourceEventId == null ? undefined : String(event.sourceEventId),
                    round: event.round == null ? null : Number(event.round), eventSequence: eventSequence(event),
                    sessionType: event.sessionType, eventWeight,
                    firstId, secondId, firstRating: before.get(firstId), secondRating: before.get(secondId),
                    expected, actual, weight, evaluationWeight, firstExperience, secondExperience,
                    firstInactivityYears: inactivityYears.get(firstId), secondInactivityYears: inactivityYears.get(secondId),
                    firstConstructorName: first.constructorName || '', secondConstructorName: second.constructorName || '',
                    sameConstructor: Boolean(first.constructorName && second.constructorName
                        && first.constructorName === second.constructorName),
                    firstClassified: Boolean(first.classified), secondClassified: Boolean(second.classified),
                    firstDisqualified: Boolean(first.disqualified), secondDisqualified: Boolean(second.disqualified),
                    firstUncertainty: uncertaintyStateBefore.get(firstId).before,
                    secondUncertainty: uncertaintyStateBefore.get(secondId).before,
                    firstEvidence: uncertaintyStateBefore.get(firstId).evidenceBefore,
                    secondEvidence: uncertaintyStateBefore.get(secondId).evidenceBefore
                });
            }
        }

        if (config.individualKWeight && config.eventCentering) {
            const meanDelta = [...deltas.values()].reduce((sum, value) => sum + value, 0) / field.length;
            for (const [id, delta] of deltas) deltas.set(id, delta - meanDelta * config.eventCentering);
        }

        for (const driver of field) {
            const id = String(driver.driverId), ratingBefore = before.get(id), delta = deltas.get(id);
            const ratingAfter = ratingBefore + delta, comparisonTotal = weightTotals.get(id) || 1;
            const expected = expectedTotals.get(id) / comparisonTotal;
            const driverMatchups = matchups.get(id);
            const effectiveEvidence = eventWeight * (weightTotals.get(id) || 0) / (field.length - 1);
            const uncertainty = updateUncertainty(evidence.get(id), effectiveEvidence,
                elapsedYears(lastDates.get(id), event.date), config);
            const keyMatchup = driverMatchups.reduce((selected, matchup) => !selected
                || (delta >= 0 ? matchup.signal > selected.signal : matchup.signal < selected.signal) ? matchup : selected, null);
            const opponentsBeaten = driverMatchups.filter(matchup => matchup.actual === 1).length;
            const higherRatedBeaten = driverMatchups.filter(matchup => matchup.actual === 1
                && matchup.opponentRating > ratingBefore).length;
            ratings.set(id, ratingAfter);
            experience.set(id, (experience.get(id) || 0) + 1);
            evidence.set(id, uncertainty.evidenceAfter);
            lastDates.set(id, event.date);
            rows.push({
                modelVersion: MODEL_VERSION, series: event.series, eventId: String(event.id), eventDate: event.date,
                year: Number(event.year), round: event.round == null ? null : Number(event.round),
                eventSequence: eventSequence(event), eventName: event.name,
                sessionType: event.sessionType, driverId: id, driverName: driver.driverName,
                constructorName: driver.constructorName || '', positionNumber: driver.positionNumber,
                positionText: driver.positionText || '', ratingBefore, ratingAfter, ratingChange: delta,
                expectedScore: expected, actualScore: actualTotals.get(id) / comparisonTotal,
                expectedPosition: 1 + (field.length - 1) * (1 - expected), fieldSize: field.length,
                completion: Number(driver.completion ?? 1), finishOrder: Number(driver.finishOrder),
                eventWeight, fieldStrength: [...before.values()].reduce((sum, value) => sum + value, 0) / field.length,
                effectiveEvidence, uncertaintyBefore: uncertainty.before, uncertaintyAfter: uncertainty.after,
                evidenceBefore: uncertainty.evidenceBefore, evidenceAfter: uncertainty.evidenceAfter,
                opponentsBeaten, higherRatedBeaten, keyRivalId: keyMatchup?.opponentId || null,
                keyRivalName: keyMatchup?.opponentName || '', keyRivalRating: keyMatchup?.opponentRating ?? null,
                keyRivalOutcome: keyMatchup ? keyMatchup.actual === 1 ? 'beat' : keyMatchup.actual === 0 ? 'lost' : 'tied' : null
            });
        }
    }
    return { modelVersion: MODEL_VERSION, configuration: config, rows, ratings, comparisons };
}

module.exports = { DEFAULT_CONFIGURATION, ELO_SCALE, MODEL_VERSION, START_RATING, actualScore, calculateRatings,
    compareEvents, comparisonWeight, configuration, effectiveK, elapsedYears, eventBaseWeight, eventSequence,
    expectedScore, inactivityKMultiplier, kFactor, uncertaintyAdjustedScore, uncertaintyAtDate,
    uncertaintyFromEvidence, updateUncertainty };
