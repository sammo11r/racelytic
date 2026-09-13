const FOLLOW_UP_PREFIX_PATTERN = /^(?:and\b|now\b|only\b|instead\b|what\s+about\b|how\s+about\b|show\b|make\s+that\b|at\b|in\b|with\b|without\b|from\b|since\b|through\b|until\b|between\b|before\b|after\b|use\b|using\b|all\b|remove\b|clear\b|as\s+team-?mates?\b|career\b|shared\b)/i;

const SLOT_DEFINITIONS = Object.freeze({
    entity: Object.freeze({ kind: 'enum', values: Object.freeze(['drivers', 'constructors']) }),
    pointsSystemYear: Object.freeze({ kind: 'year', clearPattern: /\b(?:official|original|actual)\s+(?:points?|scoring|rules?)\b/i }),
    fromYear: Object.freeze({ kind: 'year', clearPattern: /\b(?:all[- ]time|all\s+(?:years|seasons)|entire\s+(?:history|archive))\b/i }),
    toYear: Object.freeze({ kind: 'year', clearPattern: /\b(?:all[- ]time|all\s+(?:years|seasons)|entire\s+(?:history|archive))\b/i }),
    subjectName: Object.freeze({ kind: 'name' }),
    subjectNames: Object.freeze({ kind: 'names', minimumItems: 2 }),
    constructorName: Object.freeze({ kind: 'name', clearPattern: /\b(?:without|remove|clear|no)\s+(?:the\s+)?(?:team|constructor)(?:\s+filter)?\b|\b(?:all|any)\s+(?:teams|constructors)\b/i }),
    circuitName: Object.freeze({ kind: 'name', clearPattern: /\b(?:without|remove|clear|no)\s+(?:the\s+)?circuit(?:\s+filter)?\b|\b(?:all|any)\s+circuits\b/i }),
    venueCountryName: Object.freeze({ kind: 'name', clearPattern: /\b(?:without|remove|clear|no)\s+(?:the\s+)?(?:country|venue)(?:\s+filter)?\b|\b(?:all|any)\s+countries\b/i }),
    nationalityName: Object.freeze({ kind: 'name', clearPattern: /\b(?:without|remove|clear|no)\s+(?:the\s+)?nationality(?:\s+filter)?\b|\b(?:all|any)\s+nationalities\b/i }),
    minStarts: Object.freeze({ kind: 'integer', clearPattern: /\b(?:without|remove|clear|no)\s+(?:the\s+)?minimum(?:\s+starts?)?\b/i }),
    standingRound: Object.freeze({ kind: 'integer', clearPattern: /\b(?:final|end[- ]of[- ]season)\s+standings?\b/i })
});

function explicitSlotClears(query) {
    const text = String(query || '').trim();
    return new Set(Object.entries(SLOT_DEFINITIONS)
        .filter(([, definition]) => definition.clearPattern?.test(text))
        .map(([field]) => field));
}

function extractFollowUpDirectives(query) {
    const text = String(query || '').trim();
    const replacement = text.match(/^(?:what|how)\s+about\s+(.+?)[?.!]*$/i)?.[1]?.trim() || null;
    return {
        isFollowUp: FOLLOW_UP_PREFIX_PATTERN.test(text),
        clearFields: explicitSlotClears(text),
        subjectReplacement: replacement && !/^(?:drivers?|constructors?|teams?|manufacturers?)$/i.test(replacement) ? replacement : null,
        comparisonScope: /\b(?:as\s+)?team-?mates?\b|\bsame\s+team\b/i.test(text) ? 'teammates'
            : /\bshared\s+races?\b/i.test(text) ? 'shared'
            : /\bcareer\b|\ball[- ]time\b/i.test(text) ? 'career' : null,
        resultView: /\bfull\s+classification\b|\bfull\s+results?\b/i.test(text) ? 'classification'
            : /\bpodium\b/i.test(text) ? 'podium' : null
    };
}

function mergeFollowUpSlot(interpreted, context, field, clearFields, fallback = null) {
    if (clearFields.has(field)) return null;
    const value = interpreted[field];
    return value !== null && value !== undefined && value !== '' ? value : context[field] ?? fallback;
}

module.exports = {
    FOLLOW_UP_PREFIX_PATTERN,
    SLOT_DEFINITIONS,
    explicitSlotClears,
    extractFollowUpDirectives,
    mergeFollowUpSlot
};
