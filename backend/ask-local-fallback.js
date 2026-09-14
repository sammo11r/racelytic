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
    changed: 'change', changes: 'change', different: 'change', differ: 'change', flips: 'change', switched: 'change',
    summarise: 'summary', summarize: 'summary', overview: 'summary', recap: 'summary',
    biography: 'profile', bio: 'profile', career: 'profile', history: 'profile',
    circuit: 'circuit', circuits: 'circuit', track: 'circuit', tracks: 'circuit', venue: 'circuit',
    explain: 'explain', define: 'explain', meaning: 'explain'
});

const LOCAL_PLANNER_VERSION = 'racelytic-intent-nb-v1';
const DOMAIN_TERMS = new Set([
    'win', 'podium', 'pole', 'championship', 'constructor', 'driver', 'rank', 'total', 'compare',
    'result', 'standings', 'streak', 'rules', 'change', 'season', 'race', 'qualifying', 'points',
    'profile', 'circuit', 'summary', 'explain', 'drs', 'undercut', 'countback', 'sprint', 'dnf'
]);

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

function modelFeatures(value) {
    const tokens = localIntentTokens(value);
    return [...tokens, ...tokens.slice(0, -1).map((token, index) => `${token}_${tokens[index + 1]}`)];
}

const EXAMPLE_INDEX = Object.freeze(INTENT_CATALOG.flatMap(definition => definition.examples.map(example => Object.freeze({
    intent: definition.id,
    example,
    tokens: Object.freeze(localIntentTokens(example))
}))));

function trainLocalIntentModel() {
    const vocabulary = new Set();
    const classes = new Map();
    INTENT_CATALOG.forEach(definition => {
        const counts = new Map();
        let total = 0;
        const samples = [...definition.examples, definition.description, definition.label];
        samples.forEach(sample => modelFeatures(sample).forEach(feature => {
            vocabulary.add(feature);
            counts.set(feature, (counts.get(feature) || 0) + 1);
            total++;
        }));
        classes.set(definition.id, Object.freeze({ counts, total, samples: samples.length }));
    });
    return Object.freeze({ vocabularySize: vocabulary.size, classes });
}

const LOCAL_INTENT_MODEL = trainLocalIntentModel();

function localModelCandidates(query) {
    const tokens = localIntentTokens(query);
    if (tokens.length < 2 || !tokens.some(token => DOMAIN_TERMS.has(token))) return [];
    const features = modelFeatures(query);
    const scored = [...LOCAL_INTENT_MODEL.classes].map(([intent, model]) => {
        let logProbability = Math.log(model.samples / EXAMPLE_INDEX.length);
        const denominator = model.total + LOCAL_INTENT_MODEL.vocabularySize;
        features.forEach(feature => {
            logProbability += Math.log(((model.counts.get(feature) || 0) + 1) / denominator);
        });
        return { intent, logProbability };
    }).sort((first, second) => second.logProbability - first.logProbability);
    const max = scored[0]?.logProbability || 0;
    const probabilities = scored.slice(0, 3).map(entry => ({ ...entry, weight: Math.exp(entry.logProbability - max) }));
    const totalWeight = probabilities.reduce((sum, entry) => sum + entry.weight, 0);
    return probabilities.map(entry => ({ ...entry, probability: entry.weight / totalWeight }))
        .filter((entry, index) => index === 0 || entry.probability >= 0.25)
        .map(entry => Object.freeze({
            intent: entry.intent,
            score: Number((0.70 + Math.min(0.11, entry.probability * 0.14)).toFixed(3)),
            evidence: Object.freeze(['local statistical intent model', LOCAL_PLANNER_VERSION]),
            fallback: true,
            planner: LOCAL_PLANNER_VERSION
        }));
}

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
    const matches = [...bestByIntent.values()]
        .sort((first, second) => second.similarity - first.similarity || second.sharedTerms - first.sharedTerms)
        .slice(0, 3)
        .map(candidate => Object.freeze({
            intent: candidate.intent,
            score: Number((0.70 + candidate.similarity * 0.12).toFixed(3)),
            evidence: Object.freeze(['local example similarity', candidate.example]),
            fallback: true
        }));
    return matches.length ? matches : localModelCandidates(query);
}

module.exports = {
    localFallbackCandidates,
    localModelCandidates,
    localIntentTokens,
    similarity,
    LOCAL_PLANNER_VERSION
};
