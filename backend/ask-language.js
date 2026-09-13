const ENTITY_PATTERNS = Object.freeze({
    drivers: /\b(?:drivers?|racers?|pilots?|wdcs?|world\s+drivers?'?\s+championships?)\b/i,
    constructors: /\b(?:constructors?|teams?|manufacturers?|marques?|wccs?|world\s+constructors?'?\s+championships?)\b/i
});

const RANKING_LANGUAGE_PATTERN = /\b(?:most|highest|best|lowest|greatest|record(?:\s+holder)?|leader|leads?|leading|top|rank(?:ed|ing)?|all[- ]time|winningest|number\s+one)\b/i;

const RECORD_CATEGORY_PATTERNS = Object.freeze([
    Object.freeze({ id: 'fastestLaps', pattern: /\b(?:fastest[ -]laps?)\b/i }),
    Object.freeze({ id: 'poles', pattern: /\b(?:pole\s+positions?|poles?)\b/i }),
    Object.freeze({ id: 'podiumRate', pattern: /\b(?:podium\s+(?:percentage|rate))\b/i }),
    Object.freeze({ id: 'podiums', pattern: /\b(?:podiums?|podium\s+finishes?|rostrums?|rostrum\s+finishes?)\b/i }),
    Object.freeze({ id: 'dnfs', pattern: /\b(?:dnfs?|did\s+not\s+finish|non[- ]finishes?|retirements?)\b/i }),
    Object.freeze({ id: 'gridGain', pattern: /\b(?:average\s+)?(?:positions?|places?)\s+gained\b|\bgrid\s+gain\b/i }),
    Object.freeze({ id: 'averageFinish', pattern: /\baverage\s+finish(?:ing\s+position)?\b/i }),
    Object.freeze({ id: 'finishRate', pattern: /\b(?:finish(?:ing)?|classified)\s+(?:percentage|rate)\b/i }),
    Object.freeze({ id: 'winRate', pattern: /\bwin(?:ning)?\s+(?:percentage|rate)\b/i }),
    Object.freeze({ id: 'starts', pattern: /\b(?:race\s+starts?|starts?|grand\s+prix\s+starts?)\b/i }),
    Object.freeze({ id: 'points', pattern: /\b(?:championship\s+)?points?\b/i }),
    Object.freeze({ id: 'wins', pattern: /\b(?:race\s+wins?|wins?|victor(?:y|ies)|triumphs?|races?\s+won)\b/i })
]);

const NUMBER_WORDS = Object.freeze({
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
    twentyfive: 25, thirty: 30, forty: 40, fifty: 50
});

const RECORD_METRIC_FRAGMENT = '(?:(?:formula\\s+[123]|f[123]|f1\\s+academy)\\s+|grand\\s+prix\\s+|race\\s+)?(?:wins?|victor(?:y|ies)|triumphs?|podiums?|podium\\s+finishes?|rostrums?|poles?|pole\\s+positions?|fastest[ -]laps?|starts?|points?|championships?|titles?|dnfs?|retirements?|non[- ]finishes?|positions?\\s+gained|places?\\s+gained|average\\s+finish(?:ing\\s+position)?|finish(?:ing)?\\s+rate|classified\\s+rate|win(?:ning)?\\s+rate|podium\\s+rate)';

function normalizeQuestion(query) {
    return String(query || '')
        .trim()
        .replace(/[’]/g, "'")
        .replace(/[–—]/g, '-')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\bformula\s+one\b/gi, 'Formula 1')
        .replace(/\s+/g, ' ');
}

function recordCategoryFromText(query) {
    const text = normalizeQuestion(query);
    for (const category of RECORD_CATEGORY_PATTERNS) {
        if (category.id === 'points' && /\bpoints?\s+(?:system|rules?|format|scheme)\b/i.test(text)) continue;
        if (category.pattern.test(text)) return category.id;
    }
    return null;
}

function parseResultLimit(value) {
    if (/^\d+$/.test(value)) return Number(value);
    return NUMBER_WORDS[value.toLowerCase().replace(/[ -]/g, '')] || null;
}

module.exports = {
    ENTITY_PATTERNS,
    RANKING_LANGUAGE_PATTERN,
    RECORD_CATEGORY_PATTERNS,
    RECORD_METRIC_FRAGMENT,
    normalizeQuestion,
    parseResultLimit,
    recordCategoryFromText
};
