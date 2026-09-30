const { normalizeQuestion } = require('./ask-language');

// Each entry composes an intent cue with a subject slot. Adding a wording variant
// to either side does not require enumerating every complete question.
const SEMANTIC_FRAMES = Object.freeze([
    Object.freeze({
        intent: 'team_boundary_start',
        cue: /\b(?:team|constructor)\b.*\b(?:first|last|final)\s+(?:recorded\s+)?(?:race|start)\b|\b(?:first|last|final)\s+(?:recorded\s+)?(?:race|start)\b.*\b(?:team|constructor)\b/i,
        remove: /\b(?:team|constructor|first|last|final|recorded|race|start|started)\b/gi,
        role: 'team'
    }),
    Object.freeze({
        intent: 'driver_last_start',
        cue: /\b(?:last|final)\s+(?:recorded\s+)?(?:race|start)\b/i,
        remove: /\b(?:last|final|recorded|race|start|started)\b/gi,
        role: 'driver'
    }),
    Object.freeze({
        intent: 'competitor_milestone',
        cue: /\b(?:first|last|latest|final)\s+(?:(?:recorded|race)\s+)?(?:scor(?:e|ed)|earn(?:ed)?|win|won|reach(?:ed)?|take|took|points?|podiums?)\b/i,
        remove: /\b(?:first|last|latest|final|recorded|race|scor(?:e|ed)|earn(?:ed)?|win|won|reach(?:ed)?|take|took|points?|podiums?|finish)\b/gi,
        role: 'competitor'
    }),
    Object.freeze({
        intent: 'driver_debut',
        cue: /\b(?:debut(?:ed|ing)?|first\s+(?:(?:recorded|race)\s+)?(?:race|start|appear(?:ed|ance)?))\b/i,
        remove: /\b(?:debut(?:ed|ing)?|first\s+(?:(?:recorded|race)\s+)?(?:race|start|appear(?:ed|ance)?))\b/gi,
        role: 'driver'
    }),
    Object.freeze({
        intent: 'latest_team_points',
        cue: /\b(?:last|latest|most\s+recent(?:ly)?)\b.*\b(?:points?|scor(?:e|ed|ing)|earn(?:ed)?)\b/i,
        remove: /\b(?:last|latest|most|recent|recently|points?|scor(?:e|ed|ing)|earn(?:ed)?|finish)\b/gi,
        role: 'team'
    }),
    Object.freeze({
        intent: 'latest_team_milestone',
        cue: /\b(?:last|latest|most\s+recent(?:ly)?)\b.*\b(?:podiums?|wins?|won|victor(?:y|ies))\b/i,
        remove: /\b(?:last|latest|most|recent|recently|podiums?|wins?|won|victor(?:y|ies)|reach(?:ed)?|score(?:d)?|earn(?:ed)?)\b/gi,
        role: 'team'
    }),
    Object.freeze({
        intent: 'team_tenure',
        cue: /\b(?:stayed|served|tenure)\b.*\b(?:longest|most\s+time)\b|\b(?:longest|most\s+(?:calendar\s+)?time)\b.*\b(?:tenure|with|for)\b/i,
        remove: /\b(?:stayed|served|logged|tenure|longest|most|calendar|time|for|with|driver|drove|driving)\b/gi,
        role: 'team'
    }),
    Object.freeze({
        intent: 'season_opener',
        cue: /\b(?:season\s+(?:begin|began|start|started|kick(?:ed)?\s+off)|(?:begin|began|start|started|kick(?:ed)?\s+off)\s+(?:the\s+)?season)\b/i,
        remove: /\b(?:season|begin|began|start|started|kick|kicked|off)\b/gi,
        role: null
    })
]);

const QUESTION_WORDS = /\b(?:when|where|what|which|who|did|does|do|was|were|is|the|a|an|make|made|his|her|their|date|year|race|event|grand|prix|gp|held|take|place|of|in|for|on|at|about|please|tell|me|show|driver|drivers)\b/gi;
const SERIES_WORDS = /\b(?:formula\s*[123e]|f[123]|f1\s+academy|wec|world\s+endurance\s+championship)\b/gi;
const GENERIC_SUBJECTS = /^(?:someone|anyone|driver|drivers|team|constructor|he|she|they|it|first|last|latest)$/i;

function extractSemanticSubject(query, frame) {
    let text = normalizeQuestion(query);
    text = text.replace(/^\s*(?:(?:can you answer this|could you check this|i want to know|quick question|history question|just curious)\s*:\s*)+/i, ' ');
    // Keep qualifiers out of the name. The interpreter audits whether the
    // selected calculation can apply them before any tool is executed.
    text = text.replace(/\b(?:at|in|during|since|before|after|until|only)\s+(?:the\s+)?(?:19|20)\d{2}\b.*$/i, ' ')
        .replace(/\b(?:at|in|during|since|before|after|until|only)\s+(?:the\s+)?(?:circuit|track|race|grand\s+prix|gp|season|round|event|sprint)\b.*$/i, ' ')
        .replace(/\b(?:at|in)\s+[A-Z][\p{L}-]+(?:\s+[A-Z][\p{L}-]+)*\s*[?.!]*$/u, ' ');
    if (frame.intent === 'driver_debut') text = text.replace(/\b(?:for|with|under|during|since|before|after|until|only)\s+.+$/i, ' ');
    text = text.replace(frame.remove, ' ')
        .replace(SERIES_WORDS, ' ')
        .replace(/['’]s\b/gi, ' ')
        .replace(QUESTION_WORDS, ' ')
        .replace(/\bits\b/gi, ' ')
        .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
        .trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 4 || GENERIC_SUBJECTS.test(text) || /\d/.test(text)) return null;
    return text;
}

function semanticFallbackProposal(query) {
    const normalized = normalizeQuestion(query);
    for (const frame of SEMANTIC_FRAMES) {
        if (!frame.cue.test(normalized)) continue;
        if (frame.intent === 'competitor_milestone' && /\b(?:last|latest|final)\b/i.test(normalized)
            && !/[\w’']+['’]s\s+(?:last|latest|final)\b/i.test(normalized)) continue;
        if (frame.intent === 'competitor_milestone' && /\b(?:last|latest|final)\b/i.test(normalized)
            && /\b(?:points?|scor(?:e|ed|ing)|earn(?:ed)?)\b/i.test(normalized)) continue;
        if (frame.intent === 'driver_debut' && /\b(?:longest|most\s+time|waited|from\s+debut\s+to)\b/i.test(normalized)) continue;
        const subjectName = frame.role ? extractSemanticSubject(normalized, frame) : null;
        const targetSeason = frame.intent === 'season_opener' ? Number(normalized.match(/\b((?:19|20)\d{2})\b/)?.[1]) || null : null;
        const milestone = frame.intent === 'latest_team_milestone'
            ? /\bpodiums?\b/i.test(normalized) ? 'podium' : 'win'
            : frame.intent === 'competitor_milestone' ? /\bpoints?|scor(?:e|ed)|earn(?:ed)?\b/i.test(normalized) ? 'points'
                : /\bpodiums?\b/i.test(normalized) ? 'podium' : 'win' : null;
        const chronologyDirection = frame.intent === 'team_boundary_start'
            ? /\b(?:last|final)\b/i.test(normalized) ? 'last' : 'first'
            : frame.intent === 'competitor_milestone' ? /\b(?:last|latest|final)\b/i.test(normalized) ? 'last' : 'first' : null;
        return Object.freeze({
            intent: frame.intent,
            subjectName,
            targetSeason,
            milestone,
            chronologyDirection,
            score: subjectName || targetSeason ? 0.96 : 0.76,
            evidence: Object.freeze(['local semantic frame', frame.role || 'season', subjectName ? 'named subject' : targetSeason ? 'named season' : 'required slot needed']),
            fallback: true
        });
    }
    return null;
}

module.exports = { semanticFallbackProposal, extractSemanticSubject };
