const EPSILON = 1e-12;
const { uncertaintyAdjustedScore } = require('./rating-engine');

function round(value, digits = 6) {
    return Number(Number(value || 0).toFixed(digits));
}

function comparisonMetrics(comparisons) {
    let weightTotal = 0, correct = 0, brier = 0, logLoss = 0;
    for (const item of comparisons) {
        const weight = Number(item.evaluationWeight ?? item.weight) || 0;
        const probability = Math.max(EPSILON, Math.min(1 - EPSILON, Number(item.expected)));
        const actual = Number(item.actual);
        const predicted = probability === .5 ? .5 : probability > .5 ? 1 : 0;
        const accuracy = actual === .5 ? 1 - Math.abs(predicted - .5) : predicted === actual ? 1 : predicted === .5 ? .5 : 0;
        weightTotal += weight;
        correct += weight * accuracy;
        brier += weight * (probability - actual) ** 2;
        logLoss += weight * -(actual * Math.log(probability) + (1 - actual) * Math.log(1 - probability));
    }
    return {
        comparisons: comparisons.length,
        effectiveComparisons: round(weightTotal, 2),
        accuracy: weightTotal ? round(correct / weightTotal) : 0,
        brierScore: weightTotal ? round(brier / weightTotal) : 0,
        logLoss: weightTotal ? round(logLoss / weightTotal) : 0
    };
}

function grouped(items, key) {
    const groups = new Map();
    for (const item of items) {
        const value = String(key(item));
        if (!groups.has(value)) groups.set(value, []);
        groups.get(value).push(item);
    }
    return groups;
}

function eventNormalizedMetrics(comparisons) {
    const events = [...grouped(comparisons, item => item.bootstrapEventId || item.eventId).values()].map(comparisonMetrics);
    const average = key => events.length ? events.reduce((sum, event) => sum + event[key], 0) / events.length : 0;
    return {
        events: events.length,
        comparisons: comparisons.length,
        effectiveComparisons: round(events.reduce((sum, event) => sum + event.effectiveComparisons, 0), 2),
        accuracy: round(average('accuracy')),
        brierScore: round(average('brierScore')),
        logLoss: round(average('logLoss'))
    };
}

function metricBreakdown(comparisons, key, order = []) {
    const groups = grouped(comparisons, key);
    const names = [...groups.keys()].sort((first, second) => {
        const firstIndex = order.indexOf(first), secondIndex = order.indexOf(second);
        if (firstIndex !== -1 || secondIndex !== -1) return (firstIndex === -1 ? Infinity : firstIndex)
            - (secondIndex === -1 ? Infinity : secondIndex);
        return first.localeCompare(second);
    });
    return names.map(name => ({ name, ...comparisonMetrics(groups.get(name)),
        eventNormalized: eventNormalizedMetrics(groups.get(name)) }));
}

function weekendKey(item) {
    const roundNumber = Number(item.round);
    return item.round != null && Number.isFinite(roundNumber)
        ? `${item.year}:${roundNumber}` : `${item.year}:${String(item.date).slice(0, 10)}`;
}

function seededRandom(seed) {
    let state = Number(seed) >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function confidenceInterval(values, confidenceLevel) {
    if (!values.length) return { lower: 0, upper: 0 };
    const ordered = [...values].sort((a, b) => a - b);
    const tail = (1 - confidenceLevel) / 2;
    const at = probability => ordered[Math.min(ordered.length - 1,
        Math.max(0, Math.floor(probability * ordered.length)))];
    return { lower: round(at(tail)), upper: round(at(1 - tail)) };
}

function bootstrapByWeekend(comparisons, options = {}) {
    const samples = Math.max(0, Math.round(Number(options.samples) || 0));
    const confidenceLevel = Math.min(.999, Math.max(.5, Number(options.confidenceLevel) || .95));
    const weekends = [...grouped(comparisons, weekendKey).values()];
    if (!samples || !weekends.length) return null;
    const random = seededRandom(options.seed == null ? 20260908 : options.seed);
    const pairwise = [], eventNormalized = [];
    for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
        const sample = [];
        for (let index = 0; index < weekends.length; index++) {
            const selected = weekends[Math.floor(random() * weekends.length)];
            sample.push(...selected.map(item => ({ ...item, bootstrapEventId: `${index}:${item.eventId}` })));
        }
        pairwise.push(comparisonMetrics(sample));
        eventNormalized.push(eventNormalizedMetrics(sample));
    }
    const intervals = metrics => Object.fromEntries(['accuracy', 'brierScore', 'logLoss']
        .map(key => [key, confidenceInterval(metrics.map(item => item[key]), confidenceLevel)]));
    return { samples, weekends: weekends.length, confidenceLevel,
        pairwise: intervals(pairwise), eventNormalized: intervals(eventNormalized) };
}

function pairedBootstrapDelta(candidateComparisons, baselineComparisons, options = {}) {
    const fromYear = Number(options.fromYear) || -Infinity, toYear = Number(options.toYear) || Infinity;
    const eligible = items => items.filter(item => item.year >= fromYear && item.year <= toYear);
    const candidates = eligible(candidateComparisons), baselines = eligible(baselineComparisons);
    const key = item => `${item.eventId}:${item.firstId}:${item.secondId}`;
    const baselineByKey = new Map(baselines.map(item => [key(item), item]));
    const pairs = candidates.map(candidate => ({ candidate, baseline: baselineByKey.get(key(candidate)) }));
    if (pairs.some(pair => !pair.baseline) || pairs.length !== baselines.length) {
        throw new Error('Paired bootstrap requires identical comparison samples.');
    }
    const pointCandidate = comparisonMetrics(candidates), pointBaseline = comparisonMetrics(baselines);
    const pointEventCandidate = eventNormalizedMetrics(candidates), pointEventBaseline = eventNormalizedMetrics(baselines);
    const point = {
        brier: round(pointBaseline.brierScore - pointCandidate.brierScore),
        eventBrier: round(pointEventBaseline.brierScore - pointEventCandidate.brierScore),
        logLoss: round(pointBaseline.logLoss - pointCandidate.logLoss)
    };
    const samples = Math.max(0, Math.round(Number(options.samples) || 0));
    const confidenceLevel = Math.min(.999, Math.max(.5, Number(options.confidenceLevel) || .95));
    const weekends = [...grouped(pairs, pair => weekendKey(pair.candidate)).values()];
    if (!samples || !weekends.length) return { samples, weekends: weekends.length, confidenceLevel, point, intervals: null };
    const random = seededRandom(options.seed == null ? 20260908 : options.seed);
    const deltas = { brier: [], eventBrier: [], logLoss: [] };
    for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
        const candidateSample = [], baselineSample = [];
        for (let index = 0; index < weekends.length; index++) {
            const selected = weekends[Math.floor(random() * weekends.length)];
            for (const pair of selected) {
                const bootstrapEventId = `${index}:${pair.candidate.eventId}`;
                candidateSample.push({ ...pair.candidate, bootstrapEventId });
                baselineSample.push({ ...pair.baseline, bootstrapEventId });
            }
        }
        const candidatePairwise = comparisonMetrics(candidateSample), baselinePairwise = comparisonMetrics(baselineSample);
        const candidateEvents = eventNormalizedMetrics(candidateSample), baselineEvents = eventNormalizedMetrics(baselineSample);
        deltas.brier.push(baselinePairwise.brierScore - candidatePairwise.brierScore);
        deltas.eventBrier.push(baselineEvents.brierScore - candidateEvents.brierScore);
        deltas.logLoss.push(baselinePairwise.logLoss - candidatePairwise.logLoss);
    }
    return { samples, weekends: weekends.length, confidenceLevel, point,
        intervals: Object.fromEntries(Object.entries(deltas).map(([name, values]) => [name, confidenceInterval(values, confidenceLevel)])) };
}

function uncertaintyMetrics(comparisons, configuration) {
    const adjusted = comparisons.map(item => ({ ...item, expected: uncertaintyAdjustedScore(
        item.firstRating, item.secondRating, item.firstUncertainty, item.secondUncertainty,
        configuration.eloScale, configuration.uncertaintyPredictionWeight
    ) }));
    const cohorts = [
        { name: 'stable', minimum: 50, maximum: Infinity },
        { name: 'measured', minimum: 10, maximum: 50 },
        { name: 'provisional', minimum: 0, maximum: 10 }
    ].map(cohort => {
        const sample = adjusted.filter((item, index) => {
            const source = comparisons[index];
            const evidence = Math.min(Number(source.firstEvidence) || 0, Number(source.secondEvidence) || 0);
            return evidence >= cohort.minimum && evidence < cohort.maximum;
        });
        return { name: cohort.name, ...comparisonMetrics(sample) };
    });
    return { adjustedPairwise: comparisonMetrics(adjusted), cohorts };
}

function positionMetrics(rows) {
    const eligible = rows.filter(row => Number.isFinite(row.finishOrder) && row.finishOrder > 0);
    if (!eligible.length) return { predictions: 0, meanAbsoluteError: 0, rootMeanSquaredError: 0 };
    const errors = eligible.map(row => Number(row.expectedPosition) - Number(row.finishOrder));
    return {
        predictions: eligible.length,
        meanAbsoluteError: round(errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length, 3),
        rootMeanSquaredError: round(Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length), 3)
    };
}

function poolMetrics(rows) {
    const events = new Map();
    for (const row of rows) {
        if (!events.has(row.eventId)) events.set(row.eventId, []);
        events.get(row.eventId).push(row);
    }
    const ordered = [...events.values()].sort((first, second) => new Date(first[0].eventDate) - new Date(second[0].eventDate)
        || Number(first[0].eventSequence || 0) - Number(second[0].eventSequence || 0)
        || String(first[0].eventId).localeCompare(String(second[0].eventId)));
    const summaries = ordered.map(eventRows => ({
        change: eventRows.reduce((sum, row) => sum + Number(row.ratingChange || 0), 0),
        meanBefore: eventRows.reduce((sum, row) => sum + Number(row.ratingBefore || 0), 0) / eventRows.length,
        meanAfter: eventRows.reduce((sum, row) => sum + Number(row.ratingAfter || 0), 0) / eventRows.length
    }));
    const changes = summaries.map(event => event.change);
    const activeMeans = summaries.flatMap(event => [event.meanBefore, event.meanAfter]);
    return {
        events: changes.length,
        totalDrift: round(changes.reduce((sum, value) => sum + value, 0), 3),
        meanAbsoluteEventDrift: changes.length
            ? round(changes.reduce((sum, value) => sum + Math.abs(value), 0) / changes.length, 4) : 0,
        activeFieldMean: summaries.length ? {
            first: round(summaries[0].meanBefore, 3), last: round(summaries.at(-1).meanAfter, 3),
            change: round(summaries.at(-1).meanAfter - summaries[0].meanBefore, 3),
            minimum: round(Math.min(...activeMeans), 3), maximum: round(Math.max(...activeMeans), 3)
        } : { first: 0, last: 0, change: 0, minimum: 0, maximum: 0 }
    };
}

function calibration(comparisons) {
    const bins = Array.from({ length: 10 }, (_, index) => ({ from: index / 10, to: (index + 1) / 10, count: 0, weight: 0, predicted: 0, actual: 0 }));
    for (const item of comparisons) {
        const probability = Number(item.expected), weight = Number(item.evaluationWeight ?? item.weight) || 0;
        const bin = bins[Math.min(9, Math.max(0, Math.floor(probability * 10)))];
        bin.count += 1;
        bin.weight += weight;
        bin.predicted += probability * weight;
        bin.actual += Number(item.actual) * weight;
    }
    return bins.filter(bin => bin.count).map(bin => ({
        from: bin.from, to: bin.to, comparisons: bin.count,
        predicted: round(bin.predicted / bin.weight, 3), actual: round(bin.actual / bin.weight, 3)
    }));
}

function evaluateRatings(result, options = {}) {
    const fromYear = Number(options.fromYear) || -Infinity, toYear = Number(options.toYear) || Infinity;
    const comparisons = result.comparisons.filter(item => item.year >= fromYear && item.year <= toYear);
    const rows = result.rows.filter(item => item.year >= fromYear && item.year <= toYear);
    const years = [...new Set(comparisons.map(item => item.year))].sort((a, b) => a - b);
    const threshold = result.configuration.provisionalEvents;
    const established = comparisons.filter(item => item.firstExperience >= threshold && item.secondExperience >= threshold);
    const experienceName = item => {
        const experience = Math.min(item.firstExperience, item.secondExperience);
        if (experience >= result.configuration.establishedEvents) return 'stable';
        if (experience >= threshold) return 'measured';
        return 'provisional';
    };
    const outcomeName = item => item.firstDisqualified || item.secondDisqualified ? 'disqualification'
        : !item.firstClassified || !item.secondClassified ? 'retirement' : 'classified';
    return {
        modelVersion: result.modelVersion,
        configuration: result.configuration,
        range: { fromYear: years[0] || null, toYear: years.at(-1) || null },
        events: new Set(comparisons.map(item => item.eventId)).size,
        pairwise: comparisonMetrics(comparisons),
        eventNormalized: eventNormalizedMetrics(comparisons),
        establishedPairwise: comparisonMetrics(established),
        uncertainty: uncertaintyMetrics(comparisons, result.configuration),
        positions: positionMetrics(rows),
        pool: poolMetrics(rows),
        baseline: { brierScore: .25, logLoss: round(Math.log(2)) },
        calibration: calibration(comparisons),
        confidenceIntervals: bootstrapByWeekend(comparisons, { samples: options.bootstrapSamples,
            confidenceLevel: options.confidenceLevel, seed: options.bootstrapSeed }),
        breakdowns: {
            sessionType: metricBreakdown(comparisons, item => item.sessionType || 'unknown'),
            experience: metricBreakdown(comparisons, experienceName, ['provisional', 'measured', 'stable']),
            relationship: metricBreakdown(comparisons, item => item.sameConstructor ? 'teammates' : 'other',
                ['teammates', 'other']),
            outcome: metricBreakdown(comparisons, outcomeName, ['classified', 'retirement', 'disqualification'])
        },
        byYear: years.map(year => ({ year, ...comparisonMetrics(comparisons.filter(item => item.year === year)) }))
    };
}

module.exports = { bootstrapByWeekend, calibration, comparisonMetrics, confidenceInterval, evaluateRatings,
    eventNormalizedMetrics, metricBreakdown, pairedBootstrapDelta, poolMetrics, positionMetrics,
    uncertaintyMetrics, weekendKey };
