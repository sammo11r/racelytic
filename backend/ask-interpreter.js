const POINT_SYSTEMS = require('../frontend/js/f1-points-systems');
const { intentDefinition, missingRequiredSlots } = require('./ask-intents');

const RECORD_CATEGORIES = Object.freeze({
    wins: 'wins', victories: 'wins',
    podiums: 'podiums',
    poles: 'poles',
    starts: 'starts',
    points: 'points',
    championships: 'championships', championship: 'championships', titles: 'championships', title: 'championships'
});

function normalizedQuery(query) {
    return String(query || '').trim().replace(/[’]/g, "'").replace(/[–—]/g, '-');
}

function pointsSystemExists(year) {
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear)) return false;
    return Object.keys(POINT_SYSTEMS).some(key => {
        const [startText, endText = startText] = String(key).split('-');
        const start = Number(startText);
        const end = endText === 'present' ? Infinity : Number(endText);
        return numericYear >= start && numericYear <= end;
    });
}

function extractPointsSystemYear(query) {
    const text = normalizedQuery(query);
    if (/(?:current|present-day|today's)\s+(?:f1\s+)?(?:points?(?:\s+(?:system|rules?|format|scheme))?|scoring(?:\s+(?:system|rules?|format))?|rules?)/i.test(text)
        || /(?:points?(?:\s+(?:system|rules?|format|scheme))?|scoring(?:\s+(?:system|rules?|format))?|rules?)\s+(?:used\s+)?(?:today|currently)/i.test(text)) {
        return 2025;
    }
    const patterns = [
        /(?:score|scored|scoring)\s+(?:it\s+)?(?:as|like)\s+(?:in\s+)?((?:19|20)\d{2})/i,
        /((?:19|20)\d{2})\s*-\s*style\s+(?:points?|scoring|rules?|format)/i,
        /(?:rules?|system|format)\s+(?:that\s+were\s+)?(?:used|in\s+place)\s+(?:during|in)\s+(?:the\s+)?((?:19|20)\d{2})(?:\s+season)?/i,
        /(?:use|uses|using|under|with|apply|applying|on|based\s+on|according\s+to)\s+(?:the\s+)?((?:19|20)\d{2})(?:\s*-\s*(?:19|20)?\d{2})?\s+(?:f1\s+)?(?:points?(?:\s+(?:system|rules?|format|scheme))?|scoring(?:\s+(?:system|rules?|format))?|rules?|system|format)/i,
        /((?:19|20)\d{2})(?:\s*-\s*(?:19|20)?\d{2})?\s+(?:f1\s+)?(?:points?(?:\s+(?:system|rules?|format|scheme))?|scoring(?:\s+(?:system|rules?|format))?|rules?|system|format)/i,
        /(?:points?(?:\s+(?:system|rules?|format|scheme))?|scoring(?:\s+(?:system|rules?|format))?|rules?)\s+(?:from\s+(?:the\s+)?|of\s+|used\s+(?:in|for)\s+(?:the\s+)?|in\s+)?((?:19|20)\d{2})(?:\s+season)?/i,
        /(?:system|format)\s+(?:from\s+|of\s+|used\s+in\s+|in\s+)((?:19|20)\d{2})/i
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return Number(match[1]);
    }
    return null;
}

function withoutScoringReference(query) {
    return normalizedQuery(query)
        .replace(/(?:score|scored|scoring)\s+(?:it\s+)?(?:as|like)\s+(?:in\s+)?(?:19|20)\d{2}/gi, ' ')
        .replace(/(?:19|20)\d{2}\s*-\s*style\s+(?:points?|scoring|rules?|format)/gi, ' ')
        .replace(/(?:rules?|system|format)\s+(?:that\s+were\s+)?(?:used|in\s+place)\s+(?:during|in)\s+(?:the\s+)?(?:19|20)\d{2}(?:\s+season)?/gi, ' ')
        .replace(/(?:use|uses|using|under|with|apply|applying|on|based\s+on|according\s+to)\s+(?:the\s+)?(?:19|20)\d{2}(?:\s*-\s*(?:19|20)?\d{2})?\s+(?:f1\s+)?(?:points?(?:\s+(?:system|rules?|format|scheme))?|scoring(?:\s+(?:system|rules?|format))?|rules?|system|format)/gi, ' ')
        .replace(/(?:19|20)\d{2}(?:\s*-\s*(?:19|20)?\d{2})?\s+(?:f1\s+)?(?:points?(?:\s+(?:system|rules?|format|scheme))?|scoring(?:\s+(?:system|rules?|format))?|rules?|system|format)/gi, ' ')
        .replace(/(?:points?(?:\s+(?:system|rules?|format|scheme))?|scoring(?:\s+(?:system|rules?|format))?|rules?|system|format)\s+(?:from\s+|of\s+|used\s+(?:in|for)\s+|in\s+)?(?:19|20)\d{2}/gi, ' ')
        .replace(/(?:current|present-day|today's)\s+(?:f1\s+)?(?:points?(?:\s+(?:system|rules?|format|scheme))?|scoring(?:\s+(?:system|rules?|format))?|rules?)/gi, ' ');
}

function extractSeasonRange(query) {
    const text = withoutScoringReference(query);
    const exclusiveStart = text.match(/\bafter\s+((?:19|20)\d{2})\s+(?:and\s+)?(?:until|through|up\s+to|before)\s+((?:19|20)\d{2})\b/i);
    if (exclusiveStart) {
        return {
            fromYear: Number(exclusiveStart[1]) + 1,
            toYear: Number(exclusiveStart[2]) - (/\bbefore\b/i.test(exclusiveStart[0]) ? 1 : 0)
        };
    }
    const explicitPatterns = [
        /(?:between|from|during|over|across|for|covering|only)\s+(?:the\s+)?(?:seasons?\s+)?((?:19|20)\d{2})\s*(?:and|to|through|until|-)\s*((?:19|20)\d{2})(?:\s+seasons?)?/i,
        /(?:seasons?|years?)\s+((?:19|20)\d{2})\s*(?:-|to|through|until)\s*((?:19|20)\d{2})/i,
        /\b((?:19|20)\d{2})\s*(?:-|to|through)\s*((?:19|20)\d{2})(?:\s+seasons?)?\b/i
    ];
    for (const pattern of explicitPatterns) {
        const match = text.match(pattern);
        if (match) return { fromYear: Number(match[1]), toYear: Number(match[2]) };
    }
    const since = text.match(/\b(?:since|from)\s+((?:19|20)\d{2})(?:\s+onwards?)?\b/i);
    const after = text.match(/\bafter\s+((?:19|20)\d{2})\b/i);
    const until = text.match(/\b(?:until|through|up\s+to|before)\s+((?:19|20)\d{2})\b/i);
    return {
        fromYear: since ? Number(since[1]) : after ? Number(after[1]) + 1 : null,
        toYear: until ? Number(until[1]) - (/\bbefore\b/i.test(until[0]) ? 1 : 0) : null
    };
}

function extractRecordSeasonRange(query) {
    const range = extractSeasonRange(query);
    if (range.fromYear !== null || range.toYear !== null) return range;
    const text = withoutScoringReference(query);
    const through = text.match(/\b(?:(?:by|at)\s+(?:the\s+)?end\s+of|through)\s+((?:19|20)\d{2})(?:\s+season)?\b/i);
    if (through) return { fromYear: null, toYear: Number(through[1]) };
    const singleSeason = text.match(/\b(?:in|during|for)\s+(?:the\s+)?((?:19|20)\d{2})(?:\s+season)?\b/i);
    return singleSeason
        ? { fromYear: Number(singleSeason[1]), toYear: Number(singleSeason[1]) }
        : range;
}

function extractEntity(query) {
    const text = normalizedQuery(query);
    const mentionsDrivers = /\b(?:drivers?|racers?|pilots?|wdcs?|world\s+drivers?'?\s+championships?)\b/i.test(text);
    const mentionsConstructors = /\b(?:constructors?|teams?|manufacturers?|marques?|wccs?|world\s+constructors?'?\s+championships?)\b/i.test(text);
    if (mentionsDrivers && mentionsConstructors) return { value: null, explicit: true, ambiguous: true };
    if (mentionsConstructors) return { value: 'constructors', explicit: true, ambiguous: false };
    return { value: 'drivers', explicit: mentionsDrivers, ambiguous: false };
}

function extractTargetSeason(query) {
    const text = withoutScoringReference(query);
    const patterns = [
        /\b(?:the\s+)?((?:19|20)\d{2})\s+(?:formula\s+1\s+|f1\s+)?(?:drivers?'?\s+|constructors?'?\s+)?championship\b/i,
        /\b(?:in|for|during)\s+(?:the\s+)?((?:19|20)\d{2})(?:\s+season)?\b/i,
        /\b((?:19|20)\d{2})\s+season\b/i
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return Number(match[1]);
    }
    return null;
}

function extractSubjectName(query) {
    const text = normalizedQuery(query);
    const patterns = [
        /\bhow\s+many\s+(?:(?:world|drivers?'?|constructors?'?)\s+)?(?:championships?|titles?|wdcs?|wccs?)\s+(?:would|does|did|could)\s+(.+?)\s+(?:have|win|hold|get|earn)\b/i,
        /\bhow\s+many\s+(?:(?:world|drivers?'?|constructors?'?)\s+)?(?:championships?|titles?|wdcs?|wccs?)\s+(?:for|by)\s+(.+?)(?=\s+(?:under|using|with|on|from|between|since|after|before|through|until)\b|[?.!,]|$)/i
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const subject = match[1].trim().replace(/^(?:driver|constructor|team)\s+/i, '');
            const genericChampionship = /^(?:the\s+)?(?:drivers?|constructors?|teams?|world)?\s*(?:championships?|titles?)$/i.test(subject);
            if (!genericChampionship && !/(?:19|20)\d{2}|\b(?:points?|rules?|systems?|scoring)\b/i.test(subject)) return subject;
        }
    }
    return null;
}

function extractComparisonSubjectName(query) {
    const text = normalizedQuery(query);
    const patterns = [
        /\bhow\s+(?:does|would)\s+(.+?)\s+(?:perform|fare|compare)\b/i,
        /\bcompare\s+(.+?)\s+(?:under|using|with)\b/i,
        /\bdoes\s+(.+?)\s+(?:win|have|get|earn)\s+more\s+(?:championships?|titles?)\b/i,
        /\bwhich\s+(?:points?|scoring)\s+(?:system|rules?)\s+(?:gives?|would\s+give)\s+(.+?)\s+(?:the\s+)?most\s+(?:championships?|titles?)\b/i
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const subject = match[1].trim().replace(/^(?:driver|constructor|team)\s+/i, '');
            const genericChampionship = /^(?:the\s+)?(?:drivers?|constructors?|teams?|world)?\s*(?:championships?|titles?)$/i.test(subject);
            if (!genericChampionship && !/(?:19|20)\d{2}|\b(?:points?|rules?|systems?|scoring)\b/i.test(subject)) return subject;
        }
    }
    return null;
}

function extractRecordSubjectName(query) {
    const text = normalizedQuery(query);
    const metric = '(?:(?:formula\\s+[123]|f[123]|f1\\s+academy)\\s+|grand\\s+prix\\s+|race\\s+)?(?:wins?|victories|podiums?|poles?|pole\\s+positions?|fastest[ -]laps?|starts?|points?|championships?|titles?)';
    const patterns = [
        new RegExp(`\\bhow\\s+many\\s+${metric}\\s+(?:does|did|has|have)\\s+(.+?)\\s+(?:have|score|scored|record|recorded|achieve|achieved|get|got|take|earn|earned|win|won)\\b`, 'i'),
        new RegExp(`\\bhow\\s+many\\s+${metric}\\s+(?:for|by)\\s+(.+?)(?=\\s+(?:in|during|from|between|since|after|before|through|until|by)\\b|[?.!,]|$)`, 'i'),
        new RegExp(`\\b(?:what\\s+is|what's)\\s+(.+?)(?:'s|s')\\s+${metric}(?:\\s+(?:total|record))?\\b`, 'i')
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const subject = match[1].trim().replace(/^(?:driver|constructor|team)\s+/i, '');
        if (subject && !/(?:19|20)\d{2}/.test(subject)) return subject;
    }
    return null;
}

function extractRecordConstructorName(query) {
    const text = normalizedQuery(query);
    const patterns = [
        /\b(?:with|for|driving\s+for|while\s+driving\s+for)\s+(?:the\s+)?(.+?)(?=\s+(?:at|around|with|for|in|during|from|between|since|after|before|through|until|by|only|including)\b|[?.!,]|$)/i,
        /\b(?:which|what)\s+(.+?)\s+drivers?\s+(?:has|have|had|holds?|held|scored?|recorded?|achieved?|earned?|won)\b/i,
        /\b(?:most|highest|greatest|record|top)\s+([a-z][a-z0-9&.' -]+?)\s+(?:race\s+wins?|victories|podiums?|poles?|pole\s+positions?|fastest[ -]laps?|starts?|points?)\b/i
    ];
    const generic = /^(?:(?:formula\s+[123]|f[123]|f1\s+academy)|race|grand\s+prix|drivers?(?:\s+for)?|constructors?(?:\s+for)?|teams?(?:\s+for)?|wins?|victories|podiums?|poles?|pole\s+positions?|fastest[ -]laps?|starts?|points?|championships?|titles?|most|least|current\s+rules?)$/i;
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const name = match[1].trim().replace(/^(?:constructor|team)\s+/i, '');
        if (extractRecordNationalityName(`${name} driver`)) continue;
        if (name && !generic.test(name)) return name;
    }
    return null;
}

function extractComparisonPointsSystemYears(query) {
    const text = normalizedQuery(query);
    const found = [];
    const add = (year, index) => {
        const numericYear = Number(year);
        if (Number.isInteger(numericYear) && !found.some(entry => entry.year === numericYear)) found.push({ year: numericYear, index });
    };
    const pairPatterns = [
        /(?:compare|difference\s+between)\s+(?:the\s+)?((?:19|20)\d{2})\s+(?:and|with|vs\.?|versus|or)\s+(?:the\s+)?((?:19|20)\d{2})(?:\s+(?:points?\s+)?(?:systems?|rules?|scoring))?/gi,
        /(?:under|using|with)\s+(?:the\s+)?((?:19|20)\d{2})\s+(?:and|with|vs\.?|versus|or)\s+(?:the\s+)?((?:19|20)\d{2})\s+(?:points?\s+)?(?:systems?|rules?|scoring)/gi,
        /((?:19|20)\d{2})\s+(?:points?\s+)?(?:systems?|rules?|scoring)\s+(?:and|with|vs\.?|versus|or)\s+((?:19|20)\d{2})\s+(?:points?\s+)?(?:systems?|rules?|scoring)/gi
    ];
    pairPatterns.forEach(pattern => {
        for (const match of text.matchAll(pattern)) {
            add(match[1], match.index);
            add(match[2], match.index + match[0].lastIndexOf(match[2]));
        }
    });
    const direct = /((?:19|20)\d{2})\s+(?:f1\s+)?(?:points?(?:\s+(?:system|rules?|format|scheme))?|scoring(?:\s+(?:system|rules?|format))?|rules?|system|format)/gi;
    for (const match of text.matchAll(direct)) add(match[1], match.index);
    const current = /(?:current|present-day|today's)\s+(?:f1\s+)?(?:points?(?:\s+(?:system|rules?|format|scheme))?|scoring(?:\s+(?:system|rules?|format))?|rules?)/gi;
    for (const match of text.matchAll(current)) add(2025, match.index);
    return found.sort((first, second) => first.index - second.index).map(entry => entry.year);
}

function extractRecordCategory(query) {
    const text = normalizedQuery(query);
    if (/\b(?:won|winning)\s+(?:the\s+)?most\s+races?\b|\bmost\s+races?\s+won\b/i.test(text)) return 'wins';
    if (/\b(?:championships?|titles?)\b/i.test(text) && !/\b(?:under|using|apply|recalculate|(?:points?|scoring)\s+(?:system|rules?))\b/i.test(text)) return 'championships';
    if (/\b(?:fastest\s+laps?|fastest-lap)\b/i.test(text)) return 'fastestLaps';
    if (/\b(?:pole\s+positions?|poles?)\b/i.test(text)) return 'poles';
    if (/\bpodiums?\b/i.test(text)) return 'podiums';
    if (/\b(?:race\s+starts?|starts?|grand\s+prix\s+starts?)\b/i.test(text)) return 'starts';
    if (/\bpoints?\b/i.test(text) && !/\bpoints?\s+(?:system|rules?|format|scheme)\b/i.test(text)) return 'points';
    const direct = text.match(/\b(wins|victories)\b/i);
    return direct ? RECORD_CATEGORIES[direct[1].toLowerCase()] : null;
}

function detectRecordIntent(query) {
    const text = normalizedQuery(query);
    const category = extractRecordCategory(text);
    const rankingLanguage = /\b(?:most|highest|greatest|record|leader|leads?|leading|top|rank|ranking|all-time)\b/i.test(text)
        || (category === 'championships' && /\bwho\b.*\b(?:won|champion)\b/i.test(text));
    const counterfactual = extractPointsSystemYear(text) !== null || /\b(?:recalculate|alternative\s+rules?)\b/i.test(text);
    return category && rankingLanguage && !counterfactual ? 'record_leader' : null;
}

function extractRecordCircuitName(query) {
    const text = normalizedQuery(query).replace(/\bat\s+(?:the\s+)?(?:moment|present|time|end\s+of\s+(?:19|20)\d{2})\b/gi, ' ');
    const match = text.match(/\b(?:at|around)\s+(?:the\s+)?([a-z][a-z0-9&.' -]+?)(?=[?.!,]|\s+(?:with|for|in|from|between|since|after|before|through|until|by|only|including)\b|$)/i);
    return match ? match[1].trim() : null;
}

function extractRecordNationalityName(query) {
    const match = normalizedQuery(query).match(/\b(british|dutch|german|french|italian|spanish|brazilian|australian|american|argentine|austrian|belgian|canadian|finnish|japanese|mexican|monegasque|new\s+zealand(?:er)?|south\s+african|swedish|swiss|thai|chinese|indian|indonesian|danish|norwegian|irish|polish|portuguese|colombian|russian|venezuelan|chilean|czech|hungarian|romanian)\s+(?:drivers?|constructors?|teams?)\b/i);
    return match ? match[1].toLowerCase() : null;
}

function extractRaceFormat(query) {
    const text = normalizedQuery(query);
    if (/\b(?:feature|main|grand\s+prix|standard)\s+races?\s+only\b|\bonly\s+(?:feature|main|grand\s+prix|standard)\s+races?\b/i.test(text)) return 'F';
    if (/\b(?:sprint|reverse-grid|reverse\s+grid)\s+races?\s+only\b|\bonly\s+(?:sprint|reverse-grid|reverse\s+grid)\s+races?\b/i.test(text)) return 'S';
    if (/\b(?:all\s+race\s+formats|includ(?:e|ing)\s+(?:sprints?|reverse-grid|reverse\s+grid)|feature\s+and\s+sprint)\b/i.test(text)) return 'all';
    return null;
}

function extractRecordLimit(query) {
    const match = normalizedQuery(query).match(/\b(?:top|first|show)\s+(\d{1,3})\b/i);
    if (!match) return null;
    return Math.max(1, Math.min(50, Number(match[1])));
}

function unsupportedRecordQualifiers(query, category, circuitName, raceFormat) {
    const text = normalizedQuery(query);
    const unsupported = [];
    if (/\b(?:per|average(?:d)?\s+(?:per|by))\s+(?:race|start|season)\b|\b(?:average|percentage|rate)\b/i.test(text)) unsupported.push('averages or per-race rates');
    if (/\b(?:fewest|least|lowest|worst)\b/i.test(text)) unsupported.push('minimum rankings');
    if (/\b(?:active|current)\s+(?:drivers?|constructors?|teams?)\b/i.test(text)) unsupported.push('active status');
    if (/\b(?:wet|rain|dry|night|street|home)\s+races?\b/i.test(text)) unsupported.push('race conditions or circuit type');
    if (/\b(?:under|over|before|after)\s+(?:the\s+)?age\s+(?:of\s+)?\d+\b|\bage[ds]?\s+\d+\b/i.test(text)) unsupported.push('age');
    if (/\b(?:last|previous|this|current)\s+season\b/i.test(text)) unsupported.push('relative seasons');
    if (category === 'championships' && circuitName) unsupported.push('a circuit for championship totals');
    if (category === 'championships' && raceFormat) unsupported.push('a race format for championship totals');
    if (category === 'poles' && raceFormat === 'S') unsupported.push('sprint-only pole positions');
    return [...new Set(unsupported)];
}

function detectIntent(query) {
    const text = normalizedQuery(query);
    const recordSubject = extractRecordSubjectName(text);
    if (recordSubject && extractRecordCategory(text)) return 'record_subject_total';
    const recordIntent = detectRecordIntent(text);
    if (recordIntent) return recordIntent;
    const titleLanguage = /\b(?:championships?|titles?|wdcs?|wccs?|world\s+(?:drivers?'?\s+|constructors?'?\s+)?championships?|(?:world\s+)?crowns?|champions?)\b/i.test(text);
    const rankingLanguage = /\b(?:most|highest|greatest|record|leader|leads?|leading|top|winningest|often|rank|ranking)\b/i.test(text);
    const changedLanguage = /\b(?:change|changes|changed|different|differ|switch|switches|switched|flip|flips|flipped)\b/i.test(text);
    const changedSubject = /\b(?:championships?|seasons?|champions?|winners?)\b/i.test(text);
    const subjectName = extractSubjectName(text);
    const targetSeason = extractTargetSeason(text);
    const comparisonYears = extractComparisonPointsSystemYears(text);
    const comparisonLanguage = /\b(?:compare|comparison|versus|vs\.?|difference\s+between)\b/i.test(text)
        || /\bwhich\s+(?:points?|scoring)\s+(?:system|rules?)\b/i.test(text)
        || /\b(?:more|better|most)\b.*\b(?:under|using)\b.*\b(?:or|and)\b/i.test(text);
    const winnerLanguage = /\b(?:who|which\s+(?:driver|constructor|team))\b.*\b(?:wins?|won|would\s+win|champion)\b/i.test(text);

    if (comparisonLanguage && (comparisonYears.length || extractComparisonSubjectName(text))) return 'compare_points_systems';
    if (/\bwhy\b/i.test(text) && targetSeason && titleLanguage) return 'recalculate_season_champion';
    if (changedLanguage && changedSubject) return 'list_changed_championships';
    if (subjectName && titleLanguage) return 'recalculate_entity_titles';
    if (targetSeason && titleLanguage && winnerLanguage) return 'recalculate_season_champion';
    if (titleLanguage && rankingLanguage) return 'recalculate_title_counts';
    return null;
}

function extractSlots(query) {
    const normalized = normalizedQuery(query);
    const entity = extractEntity(normalized);
    const intent = detectIntent(normalized);
    const comparisonPointsSystemYears = extractComparisonPointsSystemYears(normalized);
    const subjectName = intent === 'record_subject_total'
        ? extractRecordSubjectName(normalized)
        : extractSubjectName(normalized) || extractComparisonSubjectName(normalized);
    const constructorName = extractRecordConstructorName(normalized);
    const range = intent && intentDefinition(intent)?.family === 'archive_records'
        ? extractRecordSeasonRange(normalized)
        : extractSeasonRange(normalized);
    if (intent && intentDefinition(intent)?.family === 'archive_records' && extractRecordCategory(normalized) === 'championships'
        && range.fromYear === null && range.toYear === null) {
        const season = normalized.match(/\b((?:19|20)\d{2})\b/);
        if (season) range.fromYear = range.toYear = Number(season[1]);
    }
    const recordCategory = extractRecordCategory(normalized);
    const circuitName = extractRecordCircuitName(normalized);
    const nationalityName = extractRecordNationalityName(normalized);
    const raceFormat = extractRaceFormat(normalized);
    const resultLimit = extractRecordLimit(normalized);
    return {
        intent,
        entity: ['record_subject_total', 'recalculate_entity_titles', 'compare_points_systems'].includes(intent) && subjectName && !entity.explicit ? null : entity.value,
        entityExplicit: entity.explicit,
        entityAmbiguous: entity.ambiguous,
        pointsSystemYear: intent === 'compare_points_systems' ? comparisonPointsSystemYears[0] || null : extractPointsSystemYear(normalized),
        comparisonPointsSystemYears,
        targetSeason: extractTargetSeason(normalized),
        subjectName,
        constructorName: intent && intentDefinition(intent)?.family === 'archive_records' || !intent ? constructorName : null,
        circuitName: intent && intentDefinition(intent)?.family === 'archive_records' || !intent ? circuitName : null,
        nationalityName: intent && intentDefinition(intent)?.family === 'archive_records' || !intent ? nationalityName : null,
        raceFormat: intent && intentDefinition(intent)?.family === 'archive_records' || !intent ? raceFormat : null,
        resultLimit: intent && intentDefinition(intent)?.family === 'archive_records' || !intent ? resultLimit : null,
        recordCategory,
        unsupportedQualifiers: unsupportedRecordQualifiers(normalized, recordCategory, circuitName, raceFormat),
        ...range
    };
}

function interpretLocally(query) {
    const slots = extractSlots(query);
    const definition = intentDefinition(slots.intent);
    const requiresRulebook = definition?.family === 'points_counterfactual';
    const availableSystem = !requiresRulebook ? true : slots.intent === 'compare_points_systems'
        ? slots.comparisonPointsSystemYears.length >= 2 && slots.comparisonPointsSystemYears.every(pointsSystemExists)
        : pointsSystemExists(slots.pointsSystemYear);
    const ambiguousFields = slots.entityAmbiguous ? ['entity'] : [];
    const missingFields = missingRequiredSlots(slots.intent, slots);
    let reason = 'Ask about Formula 1 records, or recalculate Drivers’ or Constructors’ Championships under a historical scoring system.';
    if (slots.entityAmbiguous) {
        reason = 'Should Racelytic calculate the Drivers’ Championship or the Constructors’ Championship?';
    } else if (slots.unsupportedQualifiers.length) {
        reason = `Racelytic cannot apply ${slots.unsupportedQualifiers.join(' or ')} to this record yet. Remove that qualifier or adjust the filters.`;
    } else if (slots.intent === 'compare_points_systems' && slots.comparisonPointsSystemYears.length < 2) {
        reason = 'Which two scoring systems should Racelytic compare? Include two rules years, for example “1982 versus 1991 rules”.';
    } else if (requiresRulebook && slots.intent && slots.pointsSystemYear === null) {
        reason = 'Which scoring rules should Racelytic use? Include a year, for example “1982 points system”, or say “current rules”.';
    } else if (slots.intent && !availableSystem) {
        reason = `Racelytic does not have an official Formula 1 points system for ${slots.pointsSystemYear}. Choose a rules year from 1950 onwards.`;
        if (!missingFields.includes('pointsSystemYear')) missingFields.push('pointsSystemYear');
    }
    const supported = slots.intent && availableSystem && !ambiguousFields.length && !missingFields.length && !slots.unsupportedQualifiers.length;
    return {
        intent: supported ? slots.intent : 'unsupported',
        detectedIntent: slots.intent,
        entity: slots.entity,
        entityExplicit: slots.entityExplicit,
        pointsSystemYear: slots.pointsSystemYear,
        comparisonPointsSystemYears: slots.comparisonPointsSystemYears,
        targetSeason: slots.targetSeason,
        subjectName: slots.subjectName,
        constructorName: slots.constructorName,
        circuitName: slots.circuitName,
        nationalityName: slots.nationalityName,
        raceFormat: slots.raceFormat,
        resultLimit: slots.resultLimit,
        recordCategory: slots.recordCategory,
        unsupportedQualifiers: slots.unsupportedQualifiers,
        fromYear: slots.fromYear,
        toYear: slots.toYear,
        confidence: supported ? (slots.entityExplicit ? 'high' : 'medium') : 'low',
        ambiguousFields,
        missingFields,
        reason,
    };
}

function interpretQuestion(query) {
    return interpretLocally(query);
}

module.exports = {
    detectIntent,
    detectRecordIntent,
    extractComparisonPointsSystemYears,
    extractComparisonSubjectName,
    extractRecordCategory,
    extractRecordSeasonRange,
    extractRecordConstructorName,
    extractRecordSubjectName,
    extractPointsSystemYear,
    extractSeasonRange,
    extractEntity,
    extractSubjectName,
    extractTargetSeason,
    extractRecordCircuitName,
    extractRecordNationalityName,
    extractRaceFormat,
    extractRecordLimit,
    extractSlots,
    interpretLocally,
    interpretQuestion,
    pointsSystemExists
};
