const POINT_SYSTEMS = require('../frontend/js/f1-points-systems');
const { ASK_LANGUAGE_POLICY, intentDefinition, intentLabel, missingRequiredSlots } = require('./ask-intents');
const {
    ENTITY_PATTERNS,
    RANKING_LANGUAGE_PATTERN,
    RECORD_METRIC_FRAGMENT,
    normalizeQuestion,
    parseResultLimit,
    recordCategoryFromText
} = require('./ask-language');
const { localFallbackCandidates } = require('./ask-local-fallback');

function normalizedQuery(query) {
    return normalizeQuestion(query);
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
    const mentionsDrivers = ENTITY_PATTERNS.drivers.test(text);
    const mentionsConstructors = ENTITY_PATTERNS.constructors.test(text);
    if (mentionsDrivers && mentionsConstructors) return { value: null, explicit: true, ambiguous: true };
    if (mentionsConstructors) return { value: 'constructors', explicit: true, ambiguous: false };
    return { value: 'drivers', explicit: mentionsDrivers, ambiguous: false };
}

function extractTargetSeason(query) {
    const text = withoutScoringReference(query);
    const patterns = [
        /\b(?:the\s+)?((?:19|20)\d{2})\s+(?:formula\s+1\s+|f1\s+)?(?:drivers?'?\s+|constructors?'?\s+)?championship\b/i,
        /\b(?:the\s+)?((?:19|20)\d{2})\s+(?:formula\s+1\s+|f1\s+)?(?:drivers?'?\s+|constructors?'?\s+)?title\b/i,
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
    const metric = RECORD_METRIC_FRAGMENT;
    const patterns = [
        new RegExp(`\\bhow\\s+many\\s+${metric}\\s+(?:does|did|has|have)\\s+(.+?)\\s+(?:have|score|scored|record|recorded|achieve|achieved|get|got|take|earn|earned|win|won)\\b`, 'i'),
        new RegExp(`\\bhow\\s+many\\s+${metric}\\s+(?:for|by)\\s+(.+?)(?=\\s+(?:in|during|from|between|since|after|before|through|until|by)\\b|[?.!,]|$)`, 'i'),
        new RegExp(`\\b(?:what\\s+is|what's)\\s+(.+?)(?:'s|s')\\s+${metric}(?:\\s+(?:total|record))?\\b`, 'i'),
        new RegExp(`\\b(.+?)(?:'s|s')\\s+(?:total\\s+)?${metric}(?:\\s+(?:total|record))?(?=[?.!,]|$)`, 'i')
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const subject = match[1].trim().replace(/^(?:driver|constructor|team)\s+/i, '');
        const looksLikeQuestionText = /\b(?:who|which|what|most|highest|greatest|leading|top|rank)\b/i.test(subject);
        if (subject && !looksLikeQuestionText && !/(?:19|20)\d{2}/.test(subject)) return subject;
    }
    return null;
}

function extractRecordConstructorName(query) {
    const text = normalizedQuery(query).replace(/\b(?:at\s+least|minimum|min\.?)\s+\d{1,4}\s+(?:race\s+)?starts?\b/gi, ' ');
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
        if (/[a-z0-9]/i.test(name) && !generic.test(name)) return name;
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
    if (/\b(?:championships?|titles?)\b/i.test(text) && !/\bchampionship\s+points?\b/i.test(text)
        && !/\b(?:under|using|apply|recalculate|(?:points?|scoring)\s+(?:system|rules?))\b/i.test(text)) return 'championships';
    return recordCategoryFromText(text);
}

function extractRaceResultSlots(query) {
    const text = normalizedQuery(query);
    const resultLanguage = /\b(?:who\s+(?:won|wins)|winner|podium|classification|finishing\s+order|race\s+result|results?|where\s+did|finish(?:ed)?|qualif(?:y|ied|ying))\b/i.test(text);
    if (!resultLanguage || RANKING_LANGUAGE_PATTERN.test(text)
        || /\b(?:career|rate|championships?|titles?|crowns?|wdcs?|wccs?)\b/i.test(text)) return null;
    const yearMatch = text.match(/\b((?:19|20)\d{2})\b/);
    const eventPatterns = [
        /\b(?:the\s+)?((?:19|20)\d{2})\s+(.+?)(?:\s+grand\s+prix|\s+gp|\s+race)?(?=[?.!,]|$)/i,
        /\b(?:at|in)\s+(?:the\s+)?(.+?)(?:\s+grand\s+prix|\s+gp)?\s+(?:in\s+)?((?:19|20)\d{2})(?=[?.!,]|$)/i,
        /\b(?:won|winner\s+(?:of|at)|podium\s+(?:at|in)|classification\s+(?:at|for)|(?:finishing\s+order|race\s+results?)\s+(?:from|at|for))\s+(?:the\s+)?(.+?)(?:\s+grand\s+prix|\s+gp)?\s+(?:in\s+)?((?:19|20)\d{2})(?=[?.!,]|$)/i
    ];
    let eventName = null;
    for (const pattern of eventPatterns) {
        const match = text.match(pattern);
        if (!match) continue;
        eventName = (pattern === eventPatterns[0] ? match[2] : match[1]).trim();
        break;
    }
    const driverMatch = text.match(/\bwhere\s+did\s+(.+?)\s+(?:finish|qualif(?:y|ied))\b/i);
    const resultView = /\bqualif(?:y|ied|ying|ication)\b/i.test(text) ? 'driver'
        : /\bpodium\b/i.test(text) ? 'podium'
        : /\b(?:classification|full\s+results?)\b/i.test(text) ? 'classification'
        : driverMatch ? 'driver' : 'winner';
    return {
        eventName,
        targetSeason: yearMatch ? Number(yearMatch[1]) : null,
        subjectName: driverMatch ? driverMatch[1].trim() : null,
        resultView
    };
}

function extractComparisonMetric(query) {
    const text = normalizedQuery(query);
    return /\b(?:win(?:ning)?\s+rate)\b/i.test(text) ? 'winRate'
        : /\b(?:race\s+wins?|wins?|won\s+more\s+races?)\b/i.test(text) ? 'wins'
        : /\bpodiums?\b/i.test(text) ? 'podiums'
        : /\b(?:pole\s+positions?|poles?)\b/i.test(text) ? 'poles'
        : /\bfastest[ -]laps?\b/i.test(text) ? 'fastestLaps'
        : /\bpoints?\s+share\b/i.test(text) ? 'pointsShare'
        : /\baverage\s+qualif(?:y|ied|ying|ication)(?:\s+position)?\b/i.test(text) ? 'averageQualifying'
        : /\bpoints?\b/i.test(text) ? 'points'
        : /\bstarts?\b/i.test(text) ? 'starts'
        : /\b(?:dnfs?|retirements?)\b/i.test(text) ? 'dnfs'
        : /\bpositions?\s+gained\b|\bgrid\s+gain\b/i.test(text) ? 'gridGain'
        : /\b(?:average\s+finish(?:ing\s+position)?)\b/i.test(text) ? 'averageFinish'
        : /\b(?:finish(?:ing)?\s+rate)\b/i.test(text) ? 'finishRate'
        : /\b(?:podium\s+rate)\b/i.test(text) ? 'podiumRate'
        : /\bqualif(?:y|ied|ying|ication)\b/i.test(text) && !/\brace(?:s| results?)?\b/i.test(text) ? 'qualifying'
        : /\brace(?:s| results?)?\b/i.test(text) && !/\bqualif/i.test(text) ? 'race'
        : /\b(?:head[- ]to[- ]head|compare|comparison)\b/i.test(text) ? 'both' : null;
}

function extractHeadToHeadSlots(query) {
    const text = normalizedQuery(query);
    const comparisonLanguage = /\b(?:head[- ]to[- ]head|compare|versus|vs\.?|against|who\s+(?:was|is)\s+better|who\s+(?:won|has|had|scored|recorded)\s+(?:more|the\s+(?:better|higher|lower))|which(?:\s+(?:driver|constructor|team))?\s+(?:has|had)\s+(?:more|the\s+(?:better|higher|lower)))\b/i.test(text);
    if (!comparisonLanguage || extractComparisonPointsSystemYears(text).length >= 2) return null;
    const patterns = [
        /\bput\s+(.+?)\s+against\s+(.+?)(?=[?.!,]|$)/i,
        /\b(?:who|which(?:\s+(?:driver|constructor|team))?)\s+(?:won|has|had|scored|recorded)\s+(?:more|the\s+(?:better|higher|lower))\s+(?:races?|race\s+wins?|wins?|podiums?|poles?|pole\s+positions?|points?(?:\s+share)?|starts?|dnfs?|fastest[ -]laps?|average\s+(?:finish(?:ing\s+position)?|qualif(?:y|ied|ying|ication)(?:\s+position)?)|finish(?:ing)?\s+rate|win(?:ning)?\s+rate|podium\s+rate|positions?\s+gained)\s*[,;:]?\s*(.+?)\s+(?:or|than|versus|vs\.?)\s+(.+?)(?=\s+(?:as\s+teammates?|in\s+qualifying|in\s+(?:shared\s+)?races?|between|from|since|at|with)\b|[?.!,]|$)/i,
        /\b(.+?)\s+(?:versus|vs\.?)\s+(.+?)\s+(?:for|on|by)\s+(?:race\s+wins?|wins?|podiums?|poles?|pole\s+positions?|points?(?:\s+share)?|starts?|dnfs?|fastest[ -]laps?|average\s+(?:finish(?:ing\s+position)?|qualif(?:y|ied|ying|ication)(?:\s+position)?)|finish(?:ing)?\s+rate|win(?:ning)?\s+rate|podium\s+rate|positions?\s+gained)(?=[?.!,]|$)/i,
        /\bcompare\s+(.+?)\s+(?:and|with|versus|vs\.?)\s+(.+?)(?=\s+(?:head[- ]to[- ]head|as\s+teammates?|in\s+qualifying|in\s+(?:shared\s+)?races?|between|from|since|at|with|under|using)\b|[?.!,]|$)/i,
        /\b(.+?)\s+(?:versus|vs\.?|or)\s+(.+?)(?=\s+(?:head[- ]to[- ]head|as\s+teammates?|in\s+qualifying|in\s+(?:shared\s+)?races?|between|from|since|at|with)\b|[?.!,]|$)/i,
        /\bhead[- ]to[- ]head\s+(?:between\s+)?(.+?)\s+(?:and|with|versus|vs\.?)\s+(.+?)(?=[?.!,]|$)/i
    ];
    let names = null;
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) { names = [match[1].trim(), match[2].trim()]; break; }
    }
    if (!names) return null;
    names = names.map(name => name
        .replace(/^(?:drivers?|constructors?|teams?)\s+/i, '')
        .replace(/\s+(?:drivers?|constructors?|teams?)$/i, '')
        .replace(/\s+(?:for|on|by)\s+(?:race\s+wins?|wins?|podiums?|poles?|points?(?:\s+share)?|starts?|dnfs?|fastest[ -]laps?|average\s+(?:finish|qualif(?:y|ied|ying|ication)).*)$/i, '')
        .replace(/\s+(?:in|during|only)\s+(?:the\s+)?(?:19|20)\d{2}(?:\s+season)?$/i, '')
        .trim());
    const metric = extractComparisonMetric(text) || 'both';
    const explicitShared = /\b(?:shared|same)\s+races?\b/i.test(text);
    const teammates = /\b(?:team[- ]?mates?|same\s+team)\b/i.test(text);
    const recordMetric = ['wins', 'podiums', 'poles', 'fastestLaps', 'points', 'starts', 'dnfs', 'gridGain', 'averageFinish', 'finishRate', 'winRate', 'podiumRate'].includes(metric);
    return {
        subjectNames: names,
        comparisonScope: teammates ? 'teammates' : explicitShared ? 'shared' : recordMetric ? 'career' : 'shared',
        comparisonMetric: metric
    };
}

function extractStandingRound(query) {
    const match = normalizedQuery(query).match(/\b(?:after|through|at)\s+(?:round|race)\s+(\d{1,2})\b/i);
    return match ? Number(match[1]) : null;
}

function detectsSeasonStandings(query) {
    const text = normalizedQuery(query);
    return (/\b(?:standings|championship\s+(?:table|order|leader))\b/i.test(text))
        && !/\b(?:under|using|points?\s+(?:system|rules?)|recalculate)\b/i.test(text);
}

const MOTORSPORT_TOPICS = Object.freeze([
    ['countback', /\bcount\s*back\b/i],
    ['classification', /\bclassif(?:ied|ication)\b/i],
    ['constructor', /\bconstructor(?:s)?\b/i],
    ['fastest lap', /\bfastest[ -]laps?\b/i],
    ['pole position', /\bpole(?: position)?s?\b/i],
    ['sprint', /\bsprint(?: race)?s?\b/i],
    ['reverse grid', /\breverse[ -]grid\b/i],
    ['dropped scores', /\bdropped? scores?\b/i],
    ['shared drives', /\bshared drives?\b/i],
    ['parc ferme', /\bparc\s+ferm[eé]\b/i],
    ['undercut', /\bundercut\b/i],
    ['DRS', /\bdrs\b/i],
    ['safety car', /\bsafety cars?\b/i],
    ['Racelytic ratings', /\bracelytic\s+ratings?\b/i],
    ['alternate points', /\b(?:alternate|alternative|historical)\s+(?:points?|scoring)\b/i],
    ['DNF', /\b(?:dnfs?|retirements?|did not finish)\b/i],
    ['grid penalty', /\bgrid penalties|grid penalty\b/i]
]);

function extractMotorsportTopic(query) {
    const text = normalizedQuery(query);
    if (!/\b(?:what\s+(?:is|does)|explain|define|how\s+(?:does|do)|meaning\s+of)\b/i.test(text)) return null;
    return MOTORSPORT_TOPICS.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

function extractProfileName(query) {
    const text = normalizedQuery(query);
    const patterns = [
        /\b(?:profile|bio|biography|career\s+(?:summary|history|profile))\s+(?:for|on|of)\s+(?:the\s+)?(.+?)(?=[?.!,]|$)/i,
        /\b(?:tell me about|profile of|career of|overview of)\s+(?:the\s+)?(.+?)(?=[?.!,]|$)/i,
        /\bwho\s+(?:is|was)\s+(.+?)(?=[?.!,]|$)/i,
        /\bwhat\s+is\s+(?:the\s+)?(.+?)(?=[?.!,]|$)/i,
        /\bwhich\s+teams?\s+did\s+(.+?)\s+drive\s+for\b/i,
        /\bwho\s+drove\s+for\s+(.+?)(?=[?.!,]|$)/i
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const name = match[1].trim()
            .replace(/^(?:driver|constructor|team|circuit|track|venue)\s+/i, '')
            .replace(/\s+(?:driver|constructor|team|circuit|track|venue)$/i, '');
        if (name && !/^(?:a|an|the)$/i.test(name) && !/^(?:a|an|the)\s+(?:driver|constructor|team|circuit|track|venue)$/i.test(name)) return name;
    }
    return null;
}

function detectsSeasonSummary(query) {
    const text = normalizedQuery(query);
    return /\b(?:19|20)\d{2}\b/.test(text) && /\b(?:summari[sz]e|summary|overview|what happened|champions?)\b/i.test(text)
        && !/\b(?:standings|table|under|using|recalculate|scoring|points?\s+(?:system|rules?|format)|rulebook)\b/i.test(text);
}

function detectRecordIntent(query) {
    const text = normalizedQuery(query);
    const category = extractRecordCategory(text);
    const rankingLanguage = RANKING_LANGUAGE_PATTERN.test(text)
        || (category === 'championships' && /\bwho\b.*\b(?:won|champion)\b/i.test(text));
    const counterfactual = extractPointsSystemYear(text) !== null || /\b(?:recalculate|alternative\s+rules?)\b/i.test(text);
    return category && rankingLanguage && !counterfactual ? 'record_leader' : null;
}

function extractStreakCategory(query) {
    const text = normalizedQuery(query);
    if (!/\b(?:streak|consecutive|in\s+a\s+row)\b/i.test(text)) return null;
    if (/\bpodiums?\b/i.test(text)) return 'podiums';
    if (/\bpoints?|point-scoring\b/i.test(text)) return 'points';
    if (/\b(?:finish(?:es|ed|ing)?|classified)\b/i.test(text)) return 'finishes';
    if (/\b(?:wins?|winning|victories)\b/i.test(text)) return 'wins';
    return null;
}

function extractRecordVenue(query) {
    const text = normalizedQuery(query)
        .replace(/\b(?:at\s+least|minimum|min\.?)\s+\d{1,4}\s+(?:race\s+)?starts?\b/gi, ' ')
        .replace(/\bat\s+(?:the\s+)?(?:moment|present|time|end\s+of\s+(?:19|20)\d{2})\b/gi, ' ');
    const match = text.match(/\b(?:at|around|in)\s+(?:the\s+)?([a-z][a-z0-9&.' -]+?)(?=[?.!,]|\s+(?:with|for|in|from|between|since|after|before|through|until|by|only|including|using|under)\b|$)/i);
    if (!match) return { circuitName: null, venueCountryName: null };
    const candidate = match[1].trim();
    const nonCircuitScope = /^(?:years?\b.*|formula\s+[123]|f[123]|f1\s+academy|sprint(?:\s+races?)?|feature(?:\s+races?)?|main(?:\s+races?)?|grand\s+prix(?:\s+races?)?|standard(?:\s+races?)?|shared\s+races?|qualifying)$/i;
    if (nonCircuitScope.test(candidate)) return { circuitName: null, venueCountryName: null };
    return /^(?:at|around)\b/i.test(match[0])
        ? { circuitName: candidate, venueCountryName: null }
        : { circuitName: null, venueCountryName: candidate };
}

function extractRecordCircuitName(query) {
    const venue = extractRecordVenue(query);
    return venue.circuitName || venue.venueCountryName;
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
    const match = normalizedQuery(query).match(/\b(?:top|first|show|leading|list(?:\s+the)?)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|twenty[- ]five|thirty|forty|fifty)\b/i);
    if (!match) return null;
    return Math.max(1, Math.min(50, parseResultLimit(match[1])));
}

function extractMinimumStarts(query) {
    const match = normalizedQuery(query).match(/\b(?:minimum|at\s+least|min\.?)\s+(\d{1,4})\s+(?:race\s+)?starts?\b/i);
    return match ? Math.max(1, Math.min(1000, Number(match[1]))) : null;
}

function unsupportedRecordQualifiers(query, category, circuitName, raceFormat) {
    const text = normalizedQuery(query);
    const rankingText = text.replace(/\b(?:at\s+least|minimum|min\.?)\s+\d{1,4}\s+(?:race\s+)?starts?\b/gi, ' ');
    const unsupported = [];
    if (/\b(?:fewest|least|lowest|worst)\b/i.test(rankingText) && category !== 'averageFinish') unsupported.push('minimum rankings');
    if (/\b(?:active|current)\s+(?:drivers?|constructors?|teams?)\b/i.test(text)) unsupported.push('active status');
    if (/\b(?:wet|rain|dry|night|street|home)\s+races?\b/i.test(text)) unsupported.push('race conditions or circuit type');
    if (/\b(?:under|over|before|after)\s+(?:the\s+)?age\s+(?:of\s+)?\d+\b|\bage[ds]?\s+\d+\b/i.test(text)) unsupported.push('age');
    if (/\b(?:last|previous|this|current)\s+season\b/i.test(text)) unsupported.push('relative seasons');
    if (category === 'points' && /\bper\s+(?:race|start)\b/i.test(text)) unsupported.push('points per race');
    if (category === 'championships' && circuitName) unsupported.push('a circuit for championship totals');
    if (category === 'championships' && raceFormat) unsupported.push('a race format for championship totals');
    if (category === 'poles' && raceFormat === 'S') unsupported.push('sprint-only pole positions');
    return [...new Set(unsupported)];
}

function detectIntentCandidates(query) {
    const text = normalizedQuery(query);
    const comparisonYears = extractComparisonPointsSystemYears(text);
    const comparisonLanguage = /\b(?:compare|comparison|versus|vs\.?|difference\s+between)\b/i.test(text)
        || /\bwhich\s+(?:points?|scoring)\s+(?:system|rules?)\b/i.test(text)
        || /\b(?:more|better|most)\b.*\b(?:under|using)\b.*\b(?:or|and)\b/i.test(text);
    const headToHead = extractHeadToHeadSlots(text);
    const streakCategory = extractStreakCategory(text);
    const seasonStandings = detectsSeasonStandings(text);
    const seasonSummary = detectsSeasonSummary(text);
    const topic = extractMotorsportTopic(text);
    const profileName = extractProfileName(text);
    const raceResult = extractRaceResultSlots(text);
    const recordSubject = extractRecordSubjectName(text);
    const recordCategory = extractRecordCategory(text);
    const recordIntent = detectRecordIntent(text);
    const titleLanguage = /\b(?:championships?|titles?|wdcs?|wccs?|world\s+(?:drivers?'?\s+|constructors?'?\s+)?championships?|(?:world\s+)?crowns?|champions?)\b/i.test(text);
    const rankingLanguage = RANKING_LANGUAGE_PATTERN.test(text) || /\boften\b/i.test(text);
    const changedLanguage = /\b(?:change|changes|changed|different|differ|switch|switches|switched|flip|flips|flipped)\b/i.test(text);
    const changedSubject = /\b(?:championships?|seasons?|champions?|winners?)\b/i.test(text);
    const subjectName = extractSubjectName(text);
    const targetSeason = extractTargetSeason(text);
    const winnerLanguage = /\b(?:who|which\s+(?:driver|constructor|team))\b.*\b(?:wins?|won|would\s+win|champion)\b/i.test(text);
    const recalculatedPoints = extractPointsSystemYear(text) !== null
        && rankingLanguage
        && /\b(?:career|cumulative|total|all\s+seasons?|every\s+season|all[- ]time)?\s*points?\b/i.test(text)
        && !titleLanguage;
    const candidates = [];
    const add = (intent, score, evidence) => candidates.push(Object.freeze({ intent, score, evidence }));
    const profileEligible = profileName && !raceResult && !recordCategory && !titleLanguage && !seasonStandings && !seasonSummary
        && !comparisonLanguage && !/\b(?:weather|forecast|tomorrow|today|live|prediction|predict|opinion|best ever|greatest)\b/i.test(text);

    if (comparisonLanguage && comparisonYears.length >= 2) add('compare_points_systems', 0.99, ['comparison language', 'two rulebooks']);
    if (recalculatedPoints) add('recalculate_points_totals', 0.98, ['points ranking', 'historical rulebook']);
    if (headToHead) add('driver_head_to_head', 0.96, ['two named subjects', 'head-to-head language']);
    if (streakCategory) add('streak_leader', 0.94, ['streak language', streakCategory]);
    if (topic) add('motorsport_explanation', 0.98, ['explanation language', topic]);
    if (seasonSummary) add('season_summary', 0.95, ['season', 'summary language']);
    if (profileEligible && /\b(?:circuit|track|venue)\b/i.test(text)) add('circuit_profile', 0.94, ['named circuit', 'profile language']);
    if (profileEligible && /\b(?:who\s+drove\s+for|(?:constructor|team)\s+profile\s+of|(?:tell me about|what is)\s+(?:the\s+)?.+?\s+(?:constructor|team))\b/i.test(text)) add('constructor_profile', 0.93, ['named constructor', 'profile language']);
    if (profileEligible) add('driver_profile', 0.88, ['named subject', 'profile language']);
    if (seasonStandings) add('season_standings', 0.92, ['standings language']);
    if (raceResult) add('race_result', 0.90, ['race-result language']);
    if (recordSubject && recordCategory) add('record_subject_total', 0.91, ['named subject', recordCategory]);
    if (recordIntent) add(recordIntent, 0.86, ['ranking language', recordCategory]);
    if (comparisonLanguage && (comparisonYears.length || extractComparisonSubjectName(text))) add('compare_points_systems', 0.84, ['comparison language']);
    if (/\bwhy\b/i.test(text) && targetSeason && titleLanguage) add('recalculate_season_champion', 0.82, ['why question', 'season', 'championship language']);
    if (changedLanguage && changedSubject) add('list_changed_championships', 0.80, ['change language', 'championship subject']);
    if (subjectName && titleLanguage) add('recalculate_entity_titles', 0.78, ['named subject', 'championship language']);
    if (targetSeason && titleLanguage && winnerLanguage) add('recalculate_season_champion', 0.76, ['season', 'championship winner language']);
    if (titleLanguage && rankingLanguage) add('recalculate_title_counts', 0.74, ['ranking language', 'championship language']);

    if (!candidates.length) candidates.push(...localFallbackCandidates(text));

    const bestByIntent = new Map();
    candidates.forEach(candidate => {
        if (!bestByIntent.has(candidate.intent) || bestByIntent.get(candidate.intent).score < candidate.score) {
            bestByIntent.set(candidate.intent, candidate);
        }
    });
    return [...bestByIntent.values()].sort((first, second) => second.score - first.score);
}

function detectIntent(query) {
    const candidate = detectIntentCandidates(query)[0];
    return candidate && candidate.score >= ASK_LANGUAGE_POLICY.minimumIntentScore ? candidate.intent : null;
}

function competingIntentCandidates(candidates) {
    if (candidates.length < 2) return [];
    const [first, second] = candidates;
    return first.score - second.score <= ASK_LANGUAGE_POLICY.ambiguityMargin ? [first, second] : [];
}

const ASK_SLOT_EXTRACTORS = Object.freeze({
    entity: extractEntity,
    pointsSystemYear: extractPointsSystemYear,
    comparisonPointsSystemYears: extractComparisonPointsSystemYears,
    targetSeason: extractTargetSeason,
    subjectName: extractSubjectName,
    recordSubjectName: extractRecordSubjectName,
    comparisonSubjectName: extractComparisonSubjectName,
    recordCategory: extractRecordCategory,
    recordConstructorName: extractRecordConstructorName,
    recordSeasonRange: extractRecordSeasonRange,
    seasonRange: extractSeasonRange,
    recordVenue: extractRecordVenue,
    nationalityName: extractRecordNationalityName,
    raceFormat: extractRaceFormat,
    resultLimit: extractRecordLimit,
    minStarts: extractMinimumStarts,
    raceResult: extractRaceResultSlots,
    headToHead: extractHeadToHeadSlots,
    standingRound: extractStandingRound,
    comparisonMetric: extractComparisonMetric,
    streakCategory: extractStreakCategory,
    profileName: extractProfileName,
    topic: extractMotorsportTopic
});

function extractSlots(query) {
    const normalized = normalizedQuery(query);
    const entity = ASK_SLOT_EXTRACTORS.entity(normalized);
    let intentCandidates = detectIntentCandidates(normalized);
    let intent = intentCandidates[0]?.score >= ASK_LANGUAGE_POLICY.minimumIntentScore ? intentCandidates[0].intent : null;
    if (intent === 'driver_head_to_head' && /\b(?:constructors?|teams?)\b/i.test(normalized)) {
        intent = 'constructor_head_to_head';
        intentCandidates = intentCandidates.map(candidate => candidate.intent === 'driver_head_to_head'
            ? Object.freeze({ ...candidate, intent: 'constructor_head_to_head' })
            : candidate);
    }
    const comparisonPointsSystemYears = ASK_SLOT_EXTRACTORS.comparisonPointsSystemYears(normalized);
    const raceResult = intent === 'race_result' ? ASK_SLOT_EXTRACTORS.raceResult(normalized) : null;
    const headToHead = ASK_SLOT_EXTRACTORS.headToHead(normalized);
    const subjectName = intent === 'record_subject_total'
        ? ASK_SLOT_EXTRACTORS.recordSubjectName(normalized)
        : ['driver_profile', 'constructor_profile'].includes(intent) ? ASK_SLOT_EXTRACTORS.profileName(normalized)
        : raceResult?.subjectName || ASK_SLOT_EXTRACTORS.subjectName(normalized) || ASK_SLOT_EXTRACTORS.comparisonSubjectName(normalized);
    const constructorName = ASK_SLOT_EXTRACTORS.recordConstructorName(normalized);
    const range = intent && ['archive_records', 'archive_streaks'].includes(intentDefinition(intent)?.family)
        ? ASK_SLOT_EXTRACTORS.recordSeasonRange(normalized)
        : ASK_SLOT_EXTRACTORS.seasonRange(normalized);
    if (intent && intentDefinition(intent)?.family === 'comparisons' && range.fromYear === null && range.toYear === null) {
        const singleSeason = normalized.match(/\b(?:in|during|only)\s+(?:the\s+)?((?:19|20)\d{2})(?:\s+season)?\b/i);
        if (singleSeason) range.fromYear = range.toYear = Number(singleSeason[1]);
    }
    if (intent && intentDefinition(intent)?.family === 'archive_records' && extractRecordCategory(normalized) === 'championships'
        && range.fromYear === null && range.toYear === null) {
        const season = normalized.match(/\b((?:19|20)\d{2})\b/);
        if (season) range.fromYear = range.toYear = Number(season[1]);
    }
    const recordCategory = ASK_SLOT_EXTRACTORS.recordCategory(normalized);
    const venue = ASK_SLOT_EXTRACTORS.recordVenue(normalized);
    const circuitName = venue.circuitName;
    const venueCountryName = venue.venueCountryName;
    const nationalityName = ASK_SLOT_EXTRACTORS.nationalityName(normalized);
    const raceFormat = ASK_SLOT_EXTRACTORS.raceFormat(normalized);
    const resultLimit = ASK_SLOT_EXTRACTORS.resultLimit(normalized);
    const minStarts = ASK_SLOT_EXTRACTORS.minStarts(normalized);
    const competingIntents = competingIntentCandidates(intentCandidates);
    return {
        intent,
        intentCandidates,
        intentScore: intentCandidates[0]?.score || 0,
        interpretationSource: intentCandidates[0]?.fallback ? 'local_fallback' : intentCandidates.length ? 'rules' : 'none',
        competingIntents,
        intentAmbiguous: competingIntents.length > 1,
        entity: ['record_subject_total', 'recalculate_entity_titles', 'compare_points_systems'].includes(intent) && subjectName && !entity.explicit ? null : entity.value,
        entityExplicit: entity.explicit,
        entityAmbiguous: entity.ambiguous,
        pointsSystemYear: intent === 'compare_points_systems' ? comparisonPointsSystemYears[0] || null : ASK_SLOT_EXTRACTORS.pointsSystemYear(normalized),
        comparisonPointsSystemYears,
        targetSeason: raceResult?.targetSeason || ASK_SLOT_EXTRACTORS.targetSeason(normalized)
            || (['season_standings', 'season_summary'].includes(intent) ? Number(normalized.match(/\b((?:19|20)\d{2})\b/)?.[1]) || null : null),
        subjectName,
        subjectNames: headToHead?.subjectNames || [],
        eventName: raceResult?.eventName || null,
        resultView: raceResult?.resultView || null,
        standingRound: ASK_SLOT_EXTRACTORS.standingRound(normalized),
        comparisonScope: headToHead?.comparisonScope || null,
        comparisonMetric: headToHead?.comparisonMetric || ASK_SLOT_EXTRACTORS.comparisonMetric(normalized),
        streakCategory: ASK_SLOT_EXTRACTORS.streakCategory(normalized),
        constructorName: intent && ['archive_records', 'comparisons'].includes(intentDefinition(intent)?.family) || !intent || intentCandidates[0]?.fallback ? constructorName : null,
        circuitName: intent === 'circuit_profile' ? ASK_SLOT_EXTRACTORS.profileName(normalized)
            : intent && ['archive_records', 'comparisons'].includes(intentDefinition(intent)?.family) || !intent || intentCandidates[0]?.fallback ? circuitName : null,
        topic: ASK_SLOT_EXTRACTORS.topic(normalized),
        venueCountryName: intent && ['archive_records', 'comparisons'].includes(intentDefinition(intent)?.family) || !intent || intentCandidates[0]?.fallback ? venueCountryName : null,
        nationalityName: intent && intentDefinition(intent)?.family === 'archive_records' || !intent || intentCandidates[0]?.fallback ? nationalityName : null,
        raceFormat: intent && intentDefinition(intent)?.family === 'archive_records' || !intent || intentCandidates[0]?.fallback ? raceFormat : null,
        resultLimit: intent && intentDefinition(intent)?.family === 'archive_records' || intent === 'recalculate_points_totals' || !intent || intentCandidates[0]?.fallback ? resultLimit : null,
        minStarts: intent && intentDefinition(intent)?.family === 'archive_records' || !intent || intentCandidates[0]?.fallback ? minStarts : null,
        recordCategory,
        unsupportedQualifiers: unsupportedRecordQualifiers(normalized, recordCategory, circuitName || venueCountryName, raceFormat),
        ...range
    };
}

function interpretLocally(query) {
    const slots = extractSlots(query);
    const definition = intentDefinition(slots.intent);
    const requiresRulebook = definition?.family === 'points_counterfactual';
    const driverRulebookComparison = slots.intent === 'driver_head_to_head' && slots.pointsSystemYear !== null;
    const availableSystem = driverRulebookComparison ? pointsSystemExists(slots.pointsSystemYear)
        : !requiresRulebook ? true : slots.intent === 'compare_points_systems'
        ? slots.comparisonPointsSystemYears.length >= 2 && slots.comparisonPointsSystemYears.every(pointsSystemExists)
        : pointsSystemExists(slots.pointsSystemYear);
    const ambiguousFields = [
        ...(slots.entityAmbiguous ? ['entity'] : []),
        ...(slots.intentAmbiguous ? ['intent'] : [])
    ];
    const missingFields = missingRequiredSlots(slots.intent, slots);
    if (slots.intent === 'race_result' && slots.resultView === 'driver' && !slots.subjectName) missingFields.push('subjectName');
    let reason = 'Ask about Formula 1 records, or recalculate Drivers’ or Constructors’ Championships under a historical scoring system.';
    if (slots.entityAmbiguous) {
        reason = 'Should Racelytic calculate the Drivers’ Championship or the Constructors’ Championship?';
    } else if (slots.intentAmbiguous) {
        const labels = slots.competingIntents.map(candidate => intentLabel(candidate.intent));
        reason = `This could mean ${labels[0]} or ${labels[1]}. Ask for one of those results at a time.`;
    } else if (slots.unsupportedQualifiers.length) {
        reason = `Racelytic cannot apply ${slots.unsupportedQualifiers.join(' or ')} to this record yet. Remove that qualifier or adjust the filters.`;
    } else if (slots.intent === 'race_result' && missingFields.length) {
        reason = missingFields.includes('subjectName')
            ? 'Which driver should Racelytic look up? Include a driver name.'
            : 'Include both a season and race name, for example “Who won the 2024 Monaco Grand Prix?”.';
    } else if (['season_standings', 'season_summary'].includes(slots.intent) && missingFields.includes('targetSeason')) {
        reason = 'Include a season, for example “Show the 2024 driver standings”.';
    } else if (slots.intent === 'compare_points_systems' && slots.comparisonPointsSystemYears.length < 2) {
        reason = 'Which two scoring systems should Racelytic compare? Include two rules years, for example “1982 versus 1991 rules”.';
    } else if (driverRulebookComparison && !availableSystem) {
        reason = `Racelytic does not have an official Formula 1 points system for ${slots.pointsSystemYear}. Choose a rules year from 1950 onwards.`;
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
        intentCandidates: slots.intentCandidates,
        intentScore: slots.intentScore,
        interpretationSource: slots.interpretationSource,
        competingIntents: slots.competingIntents,
        entity: slots.entity,
        entityExplicit: slots.entityExplicit,
        pointsSystemYear: slots.pointsSystemYear,
        comparisonPointsSystemYears: slots.comparisonPointsSystemYears,
        targetSeason: slots.targetSeason,
        subjectName: slots.subjectName,
        subjectNames: slots.subjectNames,
        eventName: slots.eventName,
        resultView: slots.resultView,
        standingRound: slots.standingRound,
        comparisonScope: slots.comparisonScope,
        comparisonMetric: slots.comparisonMetric,
        streakCategory: slots.streakCategory,
        topic: slots.topic,
        constructorName: slots.constructorName,
        circuitName: slots.circuitName,
        venueCountryName: slots.venueCountryName,
        nationalityName: slots.nationalityName,
        raceFormat: slots.raceFormat,
        resultLimit: slots.resultLimit,
        minStarts: slots.minStarts,
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
    ASK_SLOT_EXTRACTORS,
    detectIntent,
    detectIntentCandidates,
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
    extractMinimumStarts,
    extractRaceResultSlots,
    extractHeadToHeadSlots,
    extractStandingRound,
    extractProfileName,
    extractMotorsportTopic,
    extractSlots,
    interpretLocally,
    interpretQuestion,
    pointsSystemExists
};
