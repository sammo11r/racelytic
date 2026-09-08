const { compareEvents, DEFAULT_CONFIGURATION, eventBaseWeight, eventSequence } = require('./rating-engine');

function eventIdentity(event) {
    return { id: String(event.id), date: event.date, year: Number(event.year),
        round: event.round == null ? null : Number(event.round), eventSequence: eventSequence(event),
        name: event.name || '', sessionType: event.sessionType || '' };
}

function expectedTypeFromName(event) {
    const name = String(event.sessionName || event.name || '').toLowerCase();
    if (name.includes('feature')) return 'feature';
    if (name.includes('reverse')) return 'reverse-grid';
    if (name.includes('sprint')) return 'sprint';
    return null;
}

function auditRatingEvents(events, config = DEFAULT_CONFIGURATION) {
    const ordered = [...events].sort(compareEvents);
    const missingSequence = [], invalidWeights = [], smallFields = [], duplicateDrivers = [], formatMismatches = [];
    const orderingKeys = new Map(), weekendFormats = new Map();

    for (const event of ordered) {
        const identity = eventIdentity(event);
        const explicitSequence = Number(event.eventSequence);
        if (!Number.isFinite(explicitSequence) || explicitSequence <= 0) missingSequence.push(identity);

        const key = `${event.date}|${identity.round ?? ''}|${identity.eventSequence}`;
        if (!orderingKeys.has(key)) orderingKeys.set(key, []);
        orderingKeys.get(key).push(identity);

        const weight = Number(event.weight), maximumWeight = eventBaseWeight(event.sessionType, config);
        if (!Number.isFinite(weight) || weight < 0 || weight > maximumWeight + 1e-9) {
            invalidWeights.push({ ...identity, weight: event.weight, maximumWeight });
        }

        const field = (event.participants || []).filter(driver => driver.started !== false && driver.driverId);
        if (field.length < 2) smallFields.push({ ...identity, fieldSize: field.length });
        const counts = new Map();
        for (const driver of field) counts.set(String(driver.driverId), (counts.get(String(driver.driverId)) || 0) + 1);
        const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([driverId]) => driverId);
        if (duplicates.length) duplicateDrivers.push({ ...identity, driverIds: duplicates });

        const expectedType = expectedTypeFromName(event);
        if (expectedType && expectedType !== event.sessionType) {
            formatMismatches.push({ ...identity, expectedType });
        }

        const weekendKey = `${identity.year}:${identity.round ?? String(event.date).slice(0, 10)}`;
        if (!weekendFormats.has(weekendKey)) weekendFormats.set(weekendKey, []);
        weekendFormats.get(weekendKey).push(identity);
    }

    const orderingCollisions = [...orderingKeys.entries()].filter(([, items]) => items.length > 1)
        .map(([key, items]) => ({ key, events: items }));
    const fallbackDates = ordered.filter(event => event.datePrecision === 'date').map(eventIdentity);
    const formats = [...weekendFormats.entries()].map(([weekend, items]) => ({ weekend,
        sessions: items.sort((a, b) => a.eventSequence - b.eventSequence || a.id.localeCompare(b.id))
            .map(item => ({ id: item.id, sequence: item.eventSequence, type: item.sessionType })) }));
    const issueCount = missingSequence.length + invalidWeights.length + smallFields.length
        + duplicateDrivers.length + formatMismatches.length + orderingCollisions.length;

    return {
        summary: { events: ordered.length, weekends: weekendFormats.size, fallbackDateEvents: fallbackDates.length,
            issueCount, orderingCollisions: orderingCollisions.length },
        issues: { missingSequence, orderingCollisions, invalidWeights, smallFields, duplicateDrivers, formatMismatches },
        fallbackDates,
        weekendFormats: formats
    };
}

module.exports = { auditRatingEvents, expectedTypeFromName };
