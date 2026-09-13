const { INTENT_CATALOG } = require('./ask-intents');
const { normalizeQuestion } = require('./ask-language');

const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'at', 'be', 'by', 'did', 'do', 'does', 'for', 'from', 'give',
    'has', 'have', 'i', 'in', 'is', 'it', 'me', 'of', 'on', 'or', 'show', 'the', 'to',
    'under', 'using', 'was', 'were', 'what', 'which', 'who', 'with', 'would'
]);

const CANONICAL_TERMS = Object.freeze({
    victories: 'win', victory: 'win', wins: 'win', won: 'win', winning: 'win',
    podiums: 'podium', rostrum: 'podium', rostrums: 'podium',
    poles: 'pole', championships: 'championship', titles: 'championship', title: 'championship',
    crowns: 'championship', champion: 'championship', champions: 'championship',
    constructors: 'constructor', teams: 'constructor', manufacturers: 'constructor', marques: 'constructor',
    drivers: 'driver', racers: 'driver', pilots: 'driver',
    leaderboard: 'rank', leader: 'rank', leaders: 'rank', leading: 'rank', highest: 'rank',
    greatest: 'rank', most: 'rank', ranking: 'rank', ranked: 'rank', top: 'rank',
    tally: 'total', totals: 'total', count: 'total',
    compare: 'compare', comparison: 'compare', versus: 'compare', vs: 'compare', against: 'compare',
    battle: 'compare', duel: 'compare',
    classifications: 'result', classification: 'result', results: 'result', result: 'result',
    standings: 'standings', table: 'standings', order: 'result',
    consecutive: 'streak', streaks: 'streak', run: 'streak', runs: 'streak',
    scoring: 'rules', systems: 'rules', system: 'rules', rulebook: 'rules', rulebooks: 'rules',
    changed: 'change', changes: 'change', different: 'change', differ: 'change', flips: 'change', switched: 'change'
});

function localIntentTokens(value) {
    const normalized = normalizeQuestion(value)
        .toLowerCase()
        .replace(/\bhow\s+many\b/g, ' total ')
        .replace(/\bseason\s+leaderboard\b/g, ' season standings ')
        .replace(/\bfinishing\s+order\b/g, ' race result ')
        .replace(/\bhead[- ]to[- ]head\b/g, ' compare ')
        .replace(/\b(?:19|20)\d{2}\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    return [...new Set(normalized.split(/\s+/)
        .map(token => CANONICAL_TERMS[token] || token)
        .filter(token => token && !STOP_WORDS.has(token) && token.length > 1))];
}

function similarity(first, second) {
    const firstSet = new Set(first);
    const secondSet = new Set(second);
    const shared = [...firstSet].filter(token => secondSet.has(token)).length;
    if (shared < 2) return { score: 0, shared };
    return { score: (2 * shared) / (firstSet.size + secondSet.size), shared };
}

const EXAMPLE_INDEX = Object.freeze(INTENT_CATALOG.flatMap(definition => definition.examples.map(example => Object.freeze({
    intent: definition.id,
    example,
    tokens: Object.freeze(localIntentTokens(example))
}))));

function localFallbackCandidates(query, options = {}) {
    const threshold = Number(options.threshold) || 0.58;
    const tokens = localIntentTokens(query);
    if (tokens.length < 2) return [];
    const bestByIntent = new Map();
    EXAMPLE_INDEX.forEach(entry => {
        const match = similarity(tokens, entry.tokens);
        if (match.score < threshold) return;
        const candidate = {
            intent: entry.intent,
            similarity: Number(match.score.toFixed(3)),
            sharedTerms: match.shared,
            example: entry.example
        };
        if (!bestByIntent.has(entry.intent) || bestByIntent.get(entry.intent).similarity < candidate.similarity) {
            bestByIntent.set(entry.intent, candidate);
        }
    });
    return [...bestByIntent.values()]
        .sort((first, second) => second.similarity - first.similarity || second.sharedTerms - first.sharedTerms)
        .slice(0, 3)
        .map(candidate => Object.freeze({
            intent: candidate.intent,
            score: Number((0.70 + candidate.similarity * 0.12).toFixed(3)),
            evidence: Object.freeze(['local example similarity', candidate.example]),
            fallback: true
        }));
}

module.exports = {
    localFallbackCandidates,
    localIntentTokens,
    similarity
};
