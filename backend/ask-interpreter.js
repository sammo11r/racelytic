const POINT_SYSTEMS = require('../frontend/js/f1-points-systems');

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

function detectIntent(query) {
    const text = normalizedQuery(query);
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
    const subjectName = extractSubjectName(normalized) || extractComparisonSubjectName(normalized);
    return {
        intent,
        entity: ['recalculate_entity_titles', 'compare_points_systems'].includes(intent) && subjectName && !entity.explicit ? null : entity.value,
        entityExplicit: entity.explicit,
        entityAmbiguous: entity.ambiguous,
        pointsSystemYear: intent === 'compare_points_systems' ? comparisonPointsSystemYears[0] || null : extractPointsSystemYear(normalized),
        comparisonPointsSystemYears,
        targetSeason: extractTargetSeason(normalized),
        subjectName,
        ...extractSeasonRange(normalized)
    };
}

function interpretLocally(query) {
    const slots = extractSlots(query);
    const availableSystem = slots.intent === 'compare_points_systems'
        ? slots.comparisonPointsSystemYears.length >= 2 && slots.comparisonPointsSystemYears.every(pointsSystemExists)
        : pointsSystemExists(slots.pointsSystemYear);
    const ambiguousFields = slots.entityAmbiguous ? ['entity'] : [];
    const missingFields = [];
    let reason = 'Ask who would have the most Formula 1 Drivers’ or Constructors’ Championships under a historical scoring system.';
    if (slots.entityAmbiguous) {
        reason = 'Should Racelytic calculate the Drivers’ Championship or the Constructors’ Championship?';
    } else if (slots.intent === 'compare_points_systems' && slots.comparisonPointsSystemYears.length < 2) {
        reason = 'Which two scoring systems should Racelytic compare? Include two rules years, for example “1982 versus 1991 rules”.';
        missingFields.push('comparisonPointsSystemYears');
    } else if (slots.intent && slots.pointsSystemYear === null) {
        reason = 'Which scoring rules should Racelytic use? Include a year, for example “1982 points system”, or say “current rules”.';
        missingFields.push('pointsSystemYear');
    } else if (slots.intent && !availableSystem) {
        reason = `Racelytic does not have an official Formula 1 points system for ${slots.pointsSystemYear}. Choose a rules year from 1950 onwards.`;
        missingFields.push('pointsSystemYear');
    }
    if (slots.intent === 'recalculate_season_champion' && !slots.targetSeason) missingFields.push('targetSeason');
    if (slots.intent === 'recalculate_entity_titles' && !slots.subjectName) missingFields.push('subjectName');
    const supported = slots.intent && availableSystem && !ambiguousFields.length && !missingFields.length;
    return {
        intent: supported ? slots.intent : 'unsupported',
        detectedIntent: slots.intent,
        entity: slots.entity,
        pointsSystemYear: slots.pointsSystemYear,
        comparisonPointsSystemYears: slots.comparisonPointsSystemYears,
        targetSeason: slots.targetSeason,
        subjectName: slots.subjectName,
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
    extractComparisonPointsSystemYears,
    extractComparisonSubjectName,
    extractPointsSystemYear,
    extractSeasonRange,
    extractEntity,
    extractSubjectName,
    extractTargetSeason,
    extractSlots,
    interpretLocally,
    interpretQuestion,
    pointsSystemExists
};
