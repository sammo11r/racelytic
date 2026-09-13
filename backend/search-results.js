const SERIES_ORDER = Object.freeze(['f1', 'f2', 'f3', 'academy']);
const SERIES_LABELS = Object.freeze({ f1: 'F1', f2: 'F2', f3: 'F3', academy: 'F1 Academy' });
const GROUPS = Object.freeze([
    ['circuit', 'Circuits', 2],
    ['race', 'Race weekends', 5],
    ['driver', 'Drivers', 4],
    ['team', 'Teams', 3],
    ['season', 'Seasons', 4],
    ['page', 'Pages and tools', 3],
    ['chassis', 'Chassis', 2]
]);

function normalise(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim();
}

function searchLikePattern(value) {
    return `%${String(value).replace(/[!%_]/g, character => `!${character}`)}%`;
}

function circuitKey(result) {
    const place = String(result.place || '').split(',')[0];
    const labelKey = normalise(result.label)
        .replace(/\b(grand prix|international|street|racing|raceway|circuit|track)\b/g, '')
        .replace(/\b(de|the)\b/g, '')
        .replace(/\s+/g, ' ').trim();
    const placeKey = normalise(place)
        .replace(/\b(grand prix|international|street|racing|raceway|circuit|track)\b/g, '')
        .replace(/\s+/g, ' ').trim();
    return labelKey || placeKey;
}

function resultAliases(result) {
    const explicit = Array.isArray(result.aliases) ? result.aliases : [result.aliases];
    const label = String(result.label || '');
    const generated = [
        label.replace(/\bgrand prix\b/gi, 'GP'),
        label.replace(/\bformula one\b/gi, 'F1').replace(/\bformula 1\b/gi, 'F1')
    ];
    return [...new Set([...explicit, ...generated].map(normalise).filter(alias => alias && alias !== normalise(label)))];
}

function orderedTokenPrefixMatch(value, query) {
    const words = normalise(value).split(' ').filter(Boolean);
    const tokens = normalise(query).split(' ').filter(Boolean);
    let wordIndex = -1;
    return Boolean(tokens.length) && tokens.every(token => {
        wordIndex = words.findIndex((word, index) => index > wordIndex && word.startsWith(token));
        return wordIndex !== -1;
    });
}

function completionFor(result, query) {
    if (!result) return '';
    const typed = String(query || '').trim();
    const lowerTyped = typed.toLocaleLowerCase();
    const label = String(result.label || '');
    if (label.toLocaleLowerCase().startsWith(lowerTyped)) return `${typed}${label.slice(typed.length)}`;
    const matchingWord = label.split(/\s+/).find(word => word.toLocaleLowerCase().startsWith(lowerTyped));
    if (matchingWord) return `${typed}${matchingWord.slice(typed.length)}`;
    const explicitAliases = Array.isArray(result.aliases) ? result.aliases : [result.aliases];
    const matchingAlias = explicitAliases.map(alias => String(alias || ''))
        .find(alias => alias.toLocaleLowerCase().startsWith(lowerTyped));
    return matchingAlias ? `${typed}${matchingAlias.slice(typed.length)}` : '';
}

function editDistance(left, right) {
    const a = normalise(left);
    const b = normalise(right);
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let aIndex = 1; aIndex <= a.length; aIndex += 1) {
        let diagonal = previous[0];
        previous[0] = aIndex;
        for (let bIndex = 1; bIndex <= b.length; bIndex += 1) {
            const above = previous[bIndex];
            previous[bIndex] = Math.min(
                previous[bIndex] + 1,
                previous[bIndex - 1] + 1,
                diagonal + (a[aIndex - 1] === b[bIndex - 1] ? 0 : 1)
            );
            diagonal = above;
        }
    }
    return previous[b.length];
}

function fuzzyTokenMatch(result, query) {
    const needle = normalise(query);
    if (needle.length < 4 || needle.includes(' ')) return false;
    const threshold = needle.length >= 7 ? 2 : 1;
    const candidates = [result.label, ...(Array.isArray(result.aliases) ? result.aliases : [result.aliases])]
        .flatMap(value => normalise(value).split(' ')).filter(Boolean);
    return candidates.some(candidate => Math.abs(candidate.length - needle.length) <= threshold
        && editDistance(candidate, needle) <= threshold);
}

function relevanceDetails(result, query, preferredSeries) {
    const needle = normalise(query);
    const categoryPatterns = [
        ['circuit', /\b(circuit|track|venue)\b/],
        ['race', /\b(race|grand prix|gp|weekend)\b/],
        ['driver', /\b(driver|racer)\b/],
        ['team', /\b(team|constructor)\b/],
        ['season', /\b(season|championship)\b/],
        ['chassis', /\b(chassis|car)\b/]
    ];
    const explicitCategoryEntry = categoryPatterns.find(([, pattern]) => pattern.test(needle));
    const explicitCategory = explicitCategoryEntry?.[0];
    const matchNeedle = explicitCategoryEntry && needle.includes(' ')
        ? (needle.replace(explicitCategoryEntry[1], ' ').replace(/\s+/g, ' ').trim() || needle)
        : needle;
    const label = normalise(result.label);
    const meta = normalise(result.meta);
    const aliases = resultAliases(result);
    const searchable = normalise(result.searchText || `${result.label} ${result.meta}`);
    let tier = 11;
    if (label === matchNeedle) tier = 0;
    else if (aliases.includes(matchNeedle)) tier = 1;
    else if (label.startsWith(matchNeedle)) tier = 2;
    else if (orderedTokenPrefixMatch(label, matchNeedle)) tier = 3;
    else if (label.split(' ').some(word => word.startsWith(matchNeedle))) tier = 4;
    else if (aliases.some(alias => alias.startsWith(matchNeedle) || orderedTokenPrefixMatch(alias, matchNeedle))) tier = 5;
    else if (label.includes(matchNeedle)) tier = 6;
    else if (aliases.some(alias => alias.includes(matchNeedle))) tier = 7;
    else if (meta === matchNeedle || meta.startsWith(matchNeedle)) tier = 8;
    else if (searchable.includes(matchNeedle)) tier = 9;
    else if (fuzzyTokenMatch(result, matchNeedle)) tier = 10;

    const series = Array.isArray(result.series) ? result.series : [result.series];
    const contextBonus = series.includes(preferredSeries) ? 120 : 0;
    const categoryBonus = explicitCategory === result.category ? 900 : 0;
    const venueTerms = result.category === 'circuit'
        ? [result.place, circuitKey(result), label.replace(/\b(grand prix|international|street|racing|raceway|circuit|track)\b/g, '').trim()].map(normalise).filter(Boolean)
        : [];
    const venueBonus = venueTerms.some(term => term === matchNeedle) ? 4200
        : venueTerms.some(term => term.startsWith(matchNeedle) && matchNeedle.length >= 3) ? 2000 : 0;
    const prominence = Number(result.prominence) || 0;
    const prominenceBonus = Math.min(35, Math.log2(Math.max(0, prominence) + 1) * 5);
    const recencyBonus = result.category === 'race' && Number(result.year)
        ? Math.min(20, Math.max(0, Number(result.year) - 1950) / 4) : 0;
    const lengthPenalty = Math.min(99, Math.max(0, label.length - matchNeedle.length));
    const score = tier * 1000 + lengthPenalty - contextBonus - categoryBonus - venueBonus - prominenceBonus - recencyBonus;
    const confidence = [1, .98, .95, .91, .88, .8, .7, .62, .48, .35, .28, .05][tier];
    return { score, tier, confidence };
}

function relevance(result, query, preferredSeries) {
    return relevanceDetails(result, query, preferredSeries).score;
}

function dedupeCircuits(results, preferredSeries) {
    const grouped = new Map();
    for (const result of results) {
        const key = circuitKey(result) || normalise(result.label);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(result);
    }

    return [...grouped.values()].map(matches => {
        const ordered = [...matches].sort((a, b) => {
            const aRank = a.series === preferredSeries ? -1 : SERIES_ORDER.indexOf(a.series);
            const bRank = b.series === preferredSeries ? -1 : SERIES_ORDER.indexOf(b.series);
            return aRank - bRank;
        });
        const chosen = ordered[0];
        const series = SERIES_ORDER.filter(key => matches.some(match => match.series === key));
        const place = String(chosen.place || '').split(',')[0] || chosen.meta;
        return {
            ...chosen,
            type: 'Circuit',
            meta: [place, series.map(key => SERIES_LABELS[key]).join(' · ')].filter(Boolean).join(' · '),
            series
        };
    });
}

function diverseSlice(results, limit, preferredSeries) {
    if (!results.length || limit <= 0) return [];
    const selected = [results[0]];
    if (limit === 1) return selected;
    const remaining = results.slice(1);
    const order = [preferredSeries, ...SERIES_ORDER].filter((series, index, values) => series && values.indexOf(series) === index);
    for (const series of order) {
        if (selected.some(result => result.series === series)) continue;
        const index = remaining.findIndex(result => result.series === series);
        if (index !== -1) selected.push(...remaining.splice(index, 1));
        if (selected.length === limit) return selected;
    }
    const preferredIndex = remaining.findIndex(result => result.series === preferredSeries);
    if (preferredIndex !== -1 && selected.length < limit) selected.push(...remaining.splice(preferredIndex, 1));
    return [...selected, ...remaining].slice(0, limit);
}

function buildSearchResponse(rawResults, options = {}) {
    const query = String(options.query || '').trim();
    const preferredSeries = SERIES_ORDER.includes(options.preferredSeries) ? options.preferredSeries : 'f1';
    const seriesFilter = SERIES_ORDER.includes(options.seriesFilter) ? options.seriesFilter : 'all';
    const mode = options.mode === 'full' ? 'full' : 'quick';
    const visible = rawResults.filter(result => seriesFilter === 'all'
        || result.series === seriesFilter
        || (Array.isArray(result.series) && result.series.includes(seriesFilter)));
    const circuits = dedupeCircuits(visible.filter(result => result.category === 'circuit'), preferredSeries);
    const withoutCircuits = visible.filter(result => result.category !== 'circuit');
    const ranked = [...circuits, ...withoutCircuits]
        .map(result => ({ ...result, ...relevanceDetails(result, query, preferredSeries) }))
        .filter(result => result.tier < 11)
        .sort((a, b) => a.score - b.score || String(a.label).localeCompare(String(b.label)));
    const total = ranked.length;
    let remaining = mode === 'quick' ? 14 : Number.POSITIVE_INFINITY;
    const groups = [];

    const orderedGroups = GROUPS.map(([key, label, quickLimit], order) => ({
        key,
        label,
        quickLimit,
        order,
        matches: ranked.filter(result => result.category === key)
    })).filter(group => group.matches.length)
        .sort((a, b) => a.matches[0].score - b.matches[0].score || a.order - b.order);

    for (const { key, label, quickLimit, matches } of orderedGroups) {
        if (!matches.length || remaining <= 0) continue;
        const limit = mode === 'quick' ? Math.min(quickLimit, remaining) : matches.length;
        const results = mode === 'quick' && key === 'race'
            ? diverseSlice(matches, limit, preferredSeries)
            : matches.slice(0, limit);
        remaining -= results.length;
        groups.push({ key, label, results: results.map(({ score, tier, confidence, searchText, aliases, prominence, place, ...result }) => result) });
    }

    const bestMatch = ranked[0]
        ? (({ score, tier, searchText, aliases, prominence, place, ...result }) => result)(ranked[0])
        : null;
    return { query, total, bestMatch, completion: completionFor(ranked[0], query), groups };
}

module.exports = { GROUPS, SERIES_LABELS, buildSearchResponse, circuitKey, completionFor, diverseSlice, editDistance, fuzzyTokenMatch, normalise, orderedTokenPrefixMatch, relevance, relevanceDetails, resultAliases, searchLikePattern };
