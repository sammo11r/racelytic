const {
    DEFAULT_CONFIGURATION, MODEL_VERSION, actualScore, compareEvents, comparisonWeight, configuration,
    effectiveK, elapsedYears, eventSequence, expectedScore, inactivityKMultiplier, kFactor, updateUncertainty
} = require('./rating-engine');
const { evaluateRatings } = require('./rating-evaluation');
const { aggregate, score } = require('./rating-calibration');

const JOINT_MODEL_VERSION = `${MODEL_VERSION}-joint-0.2`;
const F1_JOINT_CONFIGURATION = Object.freeze({ driverShare: 3 / 7, driverKMultiplier: .75,
    constructorKMultiplier: 1, constructorSeasonRetention: 1, constructorFieldNormalization: 0 });

function jointConfiguration(options = {}) {
    const base = configuration(options);
    const requested = Number(options.driverShare);
    const driverShare = Number.isFinite(requested) && requested >= 0 && requested <= 1 ? requested : .5;
    const bounded = (value, fallback, minimum = 0, maximum = 2) => {
        const number = Number(value);
        return Number.isFinite(number) && number >= minimum && number <= maximum ? number : fallback;
    };
    return {
        ...base,
        driverShare,
        driverKMultiplier: bounded(options.driverKMultiplier, driverShare, 0, 3),
        constructorKMultiplier: bounded(options.constructorKMultiplier, 1 - driverShare, 0, 3),
        constructorSeasonRetention: bounded(options.constructorSeasonRetention, 1, 0, 1),
        constructorFieldNormalization: bounded(options.constructorFieldNormalization, 0, 0, 1)
    };
}

function teamId(participant) {
    const id = String(participant.constructorId || '').trim();
    return id || null;
}

function mapIncrement(map, key, change) {
    if (key != null) map.set(key, (map.get(key) || 0) + change);
}

function calculateJointRatings(events, options = {}) {
    const config = jointConfiguration(options);
    const driverRatings = new Map(), constructorRatings = new Map(), constructorYears = new Map(), experience = new Map();
    const evidence = new Map(), driverComponentEvidence = new Map(), constructorEvidence = new Map();
    const lastDates = new Map(), constructorLastDates = new Map(), rows = [], comparisons = [];
    for (const event of [...events].sort(compareEvents)) {
        const field = (event.participants || []).filter(driver => driver.started !== false && driver.driverId);
        if (field.length < 2) continue;
        const fieldTeamCounts = new Map();
        for (const driver of field) mapIncrement(fieldTeamCounts, teamId(driver), 1);
        for (const constructorId of fieldTeamCounts.keys()) {
            if (constructorId == null) continue;
            const previousYear = constructorYears.get(constructorId), currentYear = Number(event.year);
            if (Number.isFinite(previousYear) && Number.isFinite(currentYear) && currentYear > previousYear) {
                const retained = config.constructorSeasonRetention ** (currentYear - previousYear);
                constructorRatings.set(constructorId, (constructorRatings.get(constructorId) || 0) * retained);
            }
            if (Number.isFinite(currentYear)) constructorYears.set(constructorId, currentYear);
        }
        const driverBefore = new Map(), teamBefore = new Map(), combinedBefore = new Map();
        const driverDeltas = new Map(), teamDeltas = new Map(), expectedTotals = new Map(), actualTotals = new Map(), weightTotals = new Map();
        const inactivityYears = new Map(), uncertaintyBefore = new Map(), teammateWeightTotals = new Map();
        const constructorUncertaintyBefore = new Map();
        for (const driver of field) {
            const id = String(driver.driverId), constructorId = teamId(driver);
            driverBefore.set(id, driverRatings.get(id) ?? config.startingRating);
            teamBefore.set(constructorId, constructorId == null ? 0 : constructorRatings.get(constructorId) || 0);
            combinedBefore.set(id, driverBefore.get(id) + teamBefore.get(constructorId));
            driverDeltas.set(id, 0); expectedTotals.set(id, 0); actualTotals.set(id, 0);
            weightTotals.set(id, 0); teammateWeightTotals.set(id, 0);
            const inactive = elapsedYears(lastDates.get(id), event.date);
            inactivityYears.set(id, inactive);
            uncertaintyBefore.set(id, updateUncertainty(evidence.get(id), 0, inactive, config));
            if (constructorId != null && !constructorUncertaintyBefore.has(constructorId)) {
                constructorUncertaintyBefore.set(constructorId, updateUncertainty(constructorEvidence.get(constructorId), 0,
                    elapsedYears(constructorLastDates.get(constructorId), event.date), config));
            }
        }
        const suppliedWeight = event.weight == null ? 1 : Number(event.weight);
        const eventWeight = Number.isFinite(suppliedWeight) ? suppliedWeight : 1;
        for (let firstIndex = 0; firstIndex < field.length; firstIndex++) {
            for (let secondIndex = firstIndex + 1; secondIndex < field.length; secondIndex++) {
                const first = field[firstIndex], second = field[secondIndex];
                const firstId = String(first.driverId), secondId = String(second.driverId);
                const firstTeam = teamId(first), secondTeam = teamId(second);
                const expected = expectedScore(combinedBefore.get(firstId), combinedBefore.get(secondId), config.eloScale);
                const actual = actualScore(first, second);
                const weight = comparisonWeight(first, second, config.retirementFloor, config.retirementExponent);
                const evaluationWeight = comparisonWeight(first, second, DEFAULT_CONFIGURATION.retirementFloor,
                    DEFAULT_CONFIGURATION.retirementExponent);
                const firstExperience = experience.get(firstId) || 0, secondExperience = experience.get(secondId) || 0;
                const firstK = kFactor(firstExperience, config) * inactivityKMultiplier(inactivityYears.get(firstId), config);
                const secondK = kFactor(secondExperience, config) * inactivityKMultiplier(inactivityYears.get(secondId), config);
                const pairK = effectiveK(firstK, secondK, 0);
                const signal = eventWeight * weight * (actual - expected) / (field.length - 1);
                const driverChange = pairK * config.driverKMultiplier * signal;
                const teamFieldSize = Math.max(fieldTeamCounts.get(firstTeam) || 1, fieldTeamCounts.get(secondTeam) || 1);
                const teamNormalization = teamFieldSize ** config.constructorFieldNormalization;
                const teamChange = pairK * config.constructorKMultiplier * signal / teamNormalization;
                mapIncrement(driverDeltas, firstId, driverChange);
                mapIncrement(driverDeltas, secondId, -driverChange);
                if (firstTeam !== secondTeam) {
                    mapIncrement(teamDeltas, firstTeam, teamChange);
                    mapIncrement(teamDeltas, secondTeam, -teamChange);
                }
                mapIncrement(expectedTotals, firstId, expected * weight);
                mapIncrement(expectedTotals, secondId, (1 - expected) * weight);
                mapIncrement(actualTotals, firstId, actual * weight);
                mapIncrement(actualTotals, secondId, (1 - actual) * weight);
                mapIncrement(weightTotals, firstId, weight);
                mapIncrement(weightTotals, secondId, weight);
                if (firstTeam && firstTeam === secondTeam) {
                    mapIncrement(teammateWeightTotals, firstId, weight);
                    mapIncrement(teammateWeightTotals, secondId, weight);
                }
                if (options.collectComparisons) comparisons.push({
                    eventId: String(event.id), date: event.date, year: Number(event.year),
                    round: event.round == null ? null : Number(event.round), eventSequence: eventSequence(event),
                    sessionType: event.sessionType, eventWeight, firstId, secondId,
                    firstRating: combinedBefore.get(firstId), secondRating: combinedBefore.get(secondId),
                    firstDriverRating: driverBefore.get(firstId), secondDriverRating: driverBefore.get(secondId),
                    firstConstructorRating: teamBefore.get(firstTeam), secondConstructorRating: teamBefore.get(secondTeam),
                    firstConstructorId: firstTeam, secondConstructorId: secondTeam,
                    firstConstructorName: first.constructorName || '', secondConstructorName: second.constructorName || '',
                    sameConstructor: Boolean(firstTeam && firstTeam === secondTeam), expected, actual, weight, evaluationWeight,
                    firstExperience, secondExperience, firstClassified: Boolean(first.classified),
                    secondClassified: Boolean(second.classified), firstDisqualified: Boolean(first.disqualified),
                    secondDisqualified: Boolean(second.disqualified), firstUncertainty: uncertaintyBefore.get(firstId).before,
                    secondUncertainty: uncertaintyBefore.get(secondId).before,
                    firstEvidence: uncertaintyBefore.get(firstId).evidenceBefore,
                    secondEvidence: uncertaintyBefore.get(secondId).evidenceBefore
                });
            }
        }
        for (const [constructorId, delta] of teamDeltas) {
            constructorRatings.set(constructorId, (constructorRatings.get(constructorId) || 0) + delta);
        }
        const constructorUncertaintyAfter = new Map();
        for (const [constructorId] of fieldTeamCounts) {
            if (constructorId == null) continue;
            const state = updateUncertainty(constructorEvidence.get(constructorId), eventWeight,
                elapsedYears(constructorLastDates.get(constructorId), event.date), config);
            constructorEvidence.set(constructorId, state.evidenceAfter);
            constructorLastDates.set(constructorId, event.date);
            constructorUncertaintyAfter.set(constructorId, state);
        }
        for (const driver of field) {
            const id = String(driver.driverId), constructorId = teamId(driver);
            const driverRatingBefore = driverBefore.get(id), constructorRatingBefore = teamBefore.get(constructorId);
            const driverChange = driverDeltas.get(id), constructorChange = teamDeltas.get(constructorId) || 0;
            const driverRatingAfter = driverRatingBefore + driverChange;
            const constructorRatingAfter = constructorId == null ? 0 : constructorRatings.get(constructorId) || 0;
            const comparisonTotal = weightTotals.get(id) || 1;
            const effectiveEvidence = eventWeight * (weightTotals.get(id) || 0) / (field.length - 1);
            const uncertainty = updateUncertainty(evidence.get(id), effectiveEvidence,
                elapsedYears(lastDates.get(id), event.date), config);
            const teamSize = fieldTeamCounts.get(constructorId) || 1;
            const directTeammateEvidence = teammateWeightTotals.get(id) / Math.max(1, teamSize - 1);
            const componentEventEvidence = eventWeight * (directTeammateEvidence + .1 * effectiveEvidence);
            const driverComponent = updateUncertainty(driverComponentEvidence.get(id), componentEventEvidence,
                elapsedYears(lastDates.get(id), event.date), config);
            const constructorComponent = constructorUncertaintyAfter.get(constructorId)
                || updateUncertainty(0, 0, 0, config);
            const combinedUncertaintyBefore = Math.hypot(driverComponent.before,
                constructorUncertaintyBefore.get(constructorId)?.before || config.initialUncertainty);
            const combinedUncertaintyAfter = Math.hypot(driverComponent.after, constructorComponent.after);
            driverRatings.set(id, driverRatingAfter);
            experience.set(id, (experience.get(id) || 0) + 1);
            evidence.set(id, uncertainty.evidenceAfter);
            driverComponentEvidence.set(id, driverComponent.evidenceAfter);
            lastDates.set(id, event.date);
            rows.push({
                modelVersion: JOINT_MODEL_VERSION, series: event.series, eventId: String(event.id), eventDate: event.date,
                year: Number(event.year), round: event.round == null ? null : Number(event.round),
                eventSequence: eventSequence(event), eventName: event.name, sessionType: event.sessionType,
                driverId: id, driverName: driver.driverName, constructorId, constructorName: driver.constructorName || '',
                positionNumber: driver.positionNumber, positionText: driver.positionText || '',
                driverRatingBefore, driverRatingAfter, constructorRatingBefore, constructorRatingAfter,
                driverRatingChange: driverChange, constructorRatingChange: constructorChange,
                ratingBefore: driverRatingBefore + constructorRatingBefore,
                ratingAfter: driverRatingAfter + constructorRatingAfter,
                ratingChange: driverChange + constructorChange,
                expectedScore: expectedTotals.get(id) / comparisonTotal,
                actualScore: actualTotals.get(id) / comparisonTotal,
                expectedPosition: 1 + (field.length - 1) * (1 - expectedTotals.get(id) / comparisonTotal),
                finishOrder: Number(driver.finishOrder), fieldSize: field.length,
                completion: Number(driver.completion ?? 1), eventWeight,
                fieldStrength: [...combinedBefore.values()].reduce((sum, value) => sum + value, 0) / field.length,
                effectiveEvidence, uncertaintyBefore: combinedUncertaintyBefore, uncertaintyAfter: combinedUncertaintyAfter,
                evidenceBefore: driverComponent.evidenceBefore, evidenceAfter: driverComponent.evidenceAfter,
                driverUncertaintyBefore: driverComponent.before, driverUncertaintyAfter: driverComponent.after,
                driverEvidenceBefore: driverComponent.evidenceBefore, driverEvidenceAfter: driverComponent.evidenceAfter,
                constructorUncertaintyBefore: constructorComponent.before,
                constructorUncertaintyAfter: constructorComponent.after,
                constructorEvidenceBefore: constructorComponent.evidenceBefore,
                constructorEvidenceAfter: constructorComponent.evidenceAfter
            });
        }
    }
    const driverValues = [...driverRatings.values()].map(value => value - config.startingRating);
    const constructorValues = [...constructorRatings.values()];
    const range = values => values.length ? { minimum: Math.min(...values), maximum: Math.max(...values) } : { minimum: 0, maximum: 0 };
    return {
        modelVersion: JOINT_MODEL_VERSION, configuration: config, rows, comparisons,
        ratings: driverRatings, driverRatings, constructorRatings,
        decomposition: { drivers: driverRatings.size, constructors: constructorRatings.size,
            driverRange: range(driverValues), constructorRange: range(constructorValues) }
    };
}

function competitiveControl() {
    return { id: 'competitive-control', driverShare: 1, driverKMultiplier: 1, constructorKMultiplier: 0,
        constructorSeasonRetention: 1, constructorFieldNormalization: 1 };
}

function jointStructureCandidates() {
    const candidates = [];
    for (const constructorSeasonRetention of [0, .25, .5, .75, 1]) {
        for (const constructorFieldNormalization of [0, 1]) candidates.push({
            id: `retention-${constructorSeasonRetention}_normalization-${constructorFieldNormalization}`,
            driverShare: .25, driverKMultiplier: .25, constructorKMultiplier: .75,
            constructorSeasonRetention, constructorFieldNormalization
        });
    }
    return [...candidates, competitiveControl()];
}

function jointRateCandidates(structure = {}) {
    const candidates = [];
    const driverRates = [.5, .75, 1, 1.25, 1.5, 2, 2.5];
    for (const driverKMultiplier of driverRates) {
        for (const constructorKMultiplier of [.5, .75, 1, 1.25, 1.5]) candidates.push({
            id: `driver-k-${driverKMultiplier}_constructor-k-${constructorKMultiplier}`,
            driverShare: driverKMultiplier / (driverKMultiplier + constructorKMultiplier),
            driverKMultiplier, constructorKMultiplier,
            constructorSeasonRetention: structure.constructorSeasonRetention ?? 1,
            constructorFieldNormalization: structure.constructorFieldNormalization ?? 1
        });
    }
    for (const driverKMultiplier of driverRates) candidates.push({
        id: driverKMultiplier === 1 ? 'competitive-control' : `driver-only-k-${driverKMultiplier}`,
        driverShare: 1, driverKMultiplier, constructorKMultiplier: 0,
        constructorSeasonRetention: 1, constructorFieldNormalization: 1
    });
    return candidates;
}

function validateJointAllocation(events, options = {}) {
    if (!Array.isArray(options.folds) || !options.folds.length) throw new Error('Joint validation requires rolling folds.');
    const holdoutYear = Number(options.holdoutYear);
    if (!Number.isInteger(holdoutYear)) throw new Error('Joint validation requires a holdout year.');
    const shares = options.driverShares || [0, .25, .5, .75, 1];
    const configurations = options.candidates || shares.map(driverShare => ({
        id: `driver-share-${driverShare}`, driverShare
    }));
    const hasControl = configurations.some(candidate => Number(candidate.driverKMultiplier ?? candidate.driverShare) === 1
        && Number(candidate.constructorKMultiplier ?? (1 - candidate.driverShare)) === 0);
    if (!hasControl) throw new Error('Joint validation requires the driver-only control.');
    const candidates = configurations.map((candidate, index) => {
        const candidateConfiguration = jointConfiguration({ ...(options.baseConfiguration || {}), ...candidate });
        const result = calculateJointRatings(events, { ...candidateConfiguration,
            collectComparisons: true });
        const folds = options.folds.map(fold => ({ ...fold, ...score(evaluateRatings(result, {
            fromYear: fold.validationFromYear, toYear: fold.validationToYear, bootstrapSamples: 0
        })) }));
        const tuning = score(evaluateRatings(result, { fromYear: options.tuningFromYear,
            toYear: holdoutYear - 1, bootstrapSamples: 0 }));
        const holdout = score(evaluateRatings(result, { fromYear: holdoutYear,
            toYear: options.toYear, bootstrapSamples: 0 }));
        return { id: candidate.id || `joint-candidate-${index}`, configuration: candidateConfiguration,
            driverShare: candidateConfiguration.driverShare, folds, rolling: aggregate(folds), tuning, holdout };
    });
    const control = candidates.find(candidate => candidate.configuration.driverKMultiplier === 1
        && candidate.configuration.constructorKMultiplier === 0);
    const rollingOrder = [...candidates].sort((a, b) => a.rolling.brier - b.rolling.brier
        || a.rolling.logLoss - b.rolling.logLoss);
    const eventOrder = [...candidates].sort((a, b) => a.rolling.eventBrier - b.rolling.eventBrier
        || a.rolling.eventLogLoss - b.rolling.eventLogLoss);
    const tuningOrder = [...candidates].sort((a, b) => a.tuning.brier - b.tuning.brier
        || a.tuning.logLoss - b.tuning.logLoss);
    const selected = rollingOrder[0], eventSelected = eventOrder[0], tuningSelected = tuningOrder[0];
    const delta = (baseline, candidate) => ({
        brier: Number((baseline.brier - candidate.brier).toFixed(6)),
        eventBrier: Number((baseline.eventBrier - candidate.eventBrier).toFixed(6)),
        logLoss: Number((baseline.logLoss - candidate.logLoss).toFixed(6))
    });
    const rollingDelta = delta(control.rolling, selected.rolling);
    const holdoutDelta = delta(control.holdout, tuningSelected.holdout);
    const minimum = Number(options.minimumImprovement ?? .0005);
    const foldWins = selected.folds.filter((fold, index) => fold.brier < control.folds[index].brier).length;
    const reasons = [];
    if (selected.id !== eventSelected.id) reasons.push('rolling-objectives-disagree');
    if (selected.id !== tuningSelected.id) reasons.push('rolling-tuning-selection-differs');
    if (foldWins !== options.folds.length) reasons.push('rolling-folds-inconsistent');
    if (rollingDelta.brier < minimum || rollingDelta.eventBrier < minimum) reasons.push('rolling-improvement-below-threshold');
    if (holdoutDelta.brier < minimum || holdoutDelta.eventBrier < minimum) reasons.push('holdout-improvement-below-threshold');
    if (holdoutDelta.logLoss <= 0) reasons.push('holdout-log-loss-does-not-improve');
    if (selected.configuration.constructorKMultiplier === 0) reasons.push('driver-only-alternative-selected');
    return {
        candidates: candidates.length, selected, eventSelected, tuningSelected, control,
        foldWins, rollingDelta, holdoutDelta, minimumImprovement: minimum,
        decision: { recommended: reasons.length === 0 && selected.id !== control.id, reasons },
        runnersUp: rollingOrder.slice(1).map(candidate => ({ id: candidate.id, configuration: candidate.configuration,
            driverShare: candidate.driverShare,
            rolling: candidate.rolling, tuning: candidate.tuning, holdout: candidate.holdout }))
    };
}

function nestedJointValidation(events, options = {}) {
    const outerFolds = options.outerFolds || [];
    if (!outerFolds.length) throw new Error('Nested joint validation requires outer folds.');
    const configurations = options.candidates || jointRateCandidates({ constructorSeasonRetention: 1,
        constructorFieldNormalization: 0 });
    const evaluated = configurations.map(candidate => {
        const result = calculateJointRatings(events, { ...(options.baseConfiguration || {}), ...candidate,
            collectComparisons: true });
        const metrics = outerFolds.map(outer => {
            const inner = outer.innerFolds.map(range => score(evaluateRatings(result, {
                fromYear: range.fromYear, toYear: range.toYear, bootstrapSamples: 0
            })));
            return { tuning: aggregate(inner), validation: score(evaluateRatings(result, {
                fromYear: outer.fromYear, toYear: outer.toYear, bootstrapSamples: 0
            })) };
        });
        return { candidate, metrics };
    });
    const controlIndex = configurations.findIndex(candidate => Number(candidate.driverKMultiplier) === 1
        && Number(candidate.constructorKMultiplier) === 0);
    if (controlIndex < 0) throw new Error('Nested joint validation requires the competitive control.');
    const folds = outerFolds.map((outer, outerIndex) => {
        const scored = evaluated.map(({ candidate, metrics }) => ({ candidate,
            tuning: metrics[outerIndex].tuning, validation: metrics[outerIndex].validation }));
        const selected = [...scored].sort((a, b) => a.tuning.brier - b.tuning.brier
            || a.tuning.logLoss - b.tuning.logLoss)[0];
        const control = scored[controlIndex];
        return { fromYear: outer.fromYear, toYear: outer.toYear, selected: selected.candidate.id,
            configuration: jointConfiguration(selected.candidate), tuning: selected.tuning,
            validation: selected.validation, control: control.validation,
            delta: { brier: Number((control.validation.brier - selected.validation.brier).toFixed(6)),
                eventBrier: Number((control.validation.eventBrier - selected.validation.eventBrier).toFixed(6)),
                logLoss: Number((control.validation.logLoss - selected.validation.logLoss).toFixed(6)) } };
    });
    const selectedAggregate = aggregate(folds.map(fold => fold.validation));
    const controlAggregate = aggregate(folds.map(fold => fold.control));
    const delta = { brier: Number((controlAggregate.brier - selectedAggregate.brier).toFixed(6)),
        eventBrier: Number((controlAggregate.eventBrier - selectedAggregate.eventBrier).toFixed(6)),
        logLoss: Number((controlAggregate.logLoss - selectedAggregate.logLoss).toFixed(6)) };
    const reasons = [];
    if (folds.some(fold => fold.delta.brier <= 0 || fold.delta.eventBrier <= 0)) reasons.push('outer-fold-regression');
    if (folds.some(fold => fold.configuration.constructorKMultiplier === 0)) reasons.push('driver-only-selected');
    if (delta.brier < .0005 || delta.eventBrier < .0005) reasons.push('aggregate-improvement-below-threshold');
    return { candidates: configurations.length, folds, selectedAggregate, controlAggregate, delta,
        decision: { recommended: reasons.length === 0, reasons } };
}

module.exports = { F1_JOINT_CONFIGURATION, JOINT_MODEL_VERSION, calculateJointRatings, competitiveControl, jointConfiguration,
    jointRateCandidates, jointStructureCandidates, nestedJointValidation, teamId, validateJointAllocation };
