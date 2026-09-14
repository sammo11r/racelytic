const { all: SERIES } = require('../frontend/js/series-config');

const RECORD_QUESTIONS = Object.freeze({
    f1: [
        ['who-has-the-most-formula-1-race-wins', 'Who has the most Formula 1 race wins?', 'drivers', 'wins'],
        ['who-has-the-most-formula-1-podiums', 'Who has the most Formula 1 podiums?', 'drivers', 'podiums'],
        ['who-has-the-most-formula-1-pole-positions', 'Who has the most Formula 1 pole positions?', 'drivers', 'poles'],
        ['who-has-the-most-formula-1-fastest-laps', 'Who has the most Formula 1 fastest laps?', 'drivers', 'fastestLaps'],
        ['who-has-the-most-formula-1-race-starts', 'Who has the most Formula 1 race starts?', 'drivers', 'starts'],
        ['who-has-scored-the-most-formula-1-points', 'Who has scored the most Formula 1 points?', 'drivers', 'points'],
        ['who-has-won-the-most-formula-1-world-championships', 'Who has won the most Formula 1 World Championships?', 'drivers', 'championships'],
        ['which-constructor-has-the-most-formula-1-wins', 'Which constructor has the most Formula 1 race wins?', 'constructors', 'wins'],
        ['which-constructor-has-the-most-formula-1-podiums', 'Which constructor has the most Formula 1 podiums?', 'constructors', 'podiums'],
        ['which-constructor-has-the-most-formula-1-championships', 'Which constructor has won the most Formula 1 championships?', 'constructors', 'championships'],
        ['who-has-the-most-formula-1-wins-at-monaco', 'Who has the most Formula 1 race wins at Monaco?', 'drivers', 'wins', { circuitName: 'Monaco' }],
        ['who-has-the-most-formula-1-sprint-wins', 'Who has the most Formula 1 sprint race wins?', 'drivers', 'wins', { raceFormat: 'S' }]
    ],
    f2: [
        ['who-has-the-most-formula-2-race-wins', 'Who has the most Formula 2 race wins?', 'drivers', 'wins'],
        ['who-has-the-most-formula-2-podiums', 'Who has the most Formula 2 podiums?', 'drivers', 'podiums'],
        ['who-has-the-most-formula-2-pole-positions', 'Who has the most Formula 2 pole positions?', 'drivers', 'poles'],
        ['who-has-the-most-formula-2-race-starts', 'Who has the most Formula 2 race starts?', 'drivers', 'starts'],
        ['who-has-won-the-most-formula-2-championships', 'Who has won the most Formula 2 championships?', 'drivers', 'championships'],
        ['who-has-the-most-formula-2-wins-at-monaco', 'Who has the most Formula 2 race wins at Monaco?', 'drivers', 'wins', { circuitName: 'Monaco' }],
        ['who-has-the-most-formula-2-sprint-wins', 'Who has the most Formula 2 sprint race wins?', 'drivers', 'wins', { raceFormat: 'S' }]
    ],
    f3: [
        ['who-has-the-most-formula-3-race-wins', 'Who has the most Formula 3 race wins?', 'drivers', 'wins'],
        ['who-has-the-most-formula-3-podiums', 'Who has the most Formula 3 podiums?', 'drivers', 'podiums'],
        ['who-has-the-most-formula-3-pole-positions', 'Who has the most Formula 3 pole positions?', 'drivers', 'poles'],
        ['who-has-the-most-formula-3-race-starts', 'Who has the most Formula 3 race starts?', 'drivers', 'starts'],
        ['who-has-won-the-most-formula-3-championships', 'Who has won the most Formula 3 championships?', 'drivers', 'championships'],
        ['who-has-the-most-formula-3-wins-at-monza', 'Who has the most Formula 3 race wins at Monza?', 'drivers', 'wins', { circuitName: 'Monza' }],
        ['who-has-the-most-formula-3-sprint-wins', 'Who has the most Formula 3 sprint race wins?', 'drivers', 'wins', { raceFormat: 'S' }]
    ],
    academy: [
        ['who-has-the-most-f1-academy-race-wins', 'Who has the most F1 Academy race wins?', 'drivers', 'wins'],
        ['who-has-the-most-f1-academy-podiums', 'Who has the most F1 Academy podiums?', 'drivers', 'podiums'],
        ['who-has-the-most-f1-academy-pole-positions', 'Who has the most F1 Academy pole positions?', 'drivers', 'poles'],
        ['who-has-the-most-f1-academy-race-starts', 'Who has the most F1 Academy race starts?', 'drivers', 'starts'],
        ['who-has-won-the-most-f1-academy-championships', 'Who has won the most F1 Academy championships?', 'drivers', 'championships'],
        ['who-has-the-most-f1-academy-wins-at-zandvoort', 'Who has the most F1 Academy race wins at Zandvoort?', 'drivers', 'wins', { circuitName: 'Zandvoort' }],
        ['who-has-the-most-f1-academy-reverse-grid-wins', 'Who has the most F1 Academy reverse-grid race wins?', 'drivers', 'wins', { raceFormat: 'S' }]
    ]
});

function answerPath(series, slug) {
    return `${series === 'f1' ? '' : `/${series}`}/answers/${slug}`;
}

const ANSWER_CATALOG = Object.freeze(Object.entries(RECORD_QUESTIONS).flatMap(([series, questions]) => questions.map(
    ([slug, question, entity, recordCategory, extra = {}]) => Object.freeze({
        slug, series, seriesName: SERIES[series].name, path: answerPath(series, slug), question,
        interpretation: Object.freeze({ intent: 'record_leader', series, entity, recordCategory, resultLimit: 10, ...extra })
    })
)));

const ANSWER_BY_PATH = new Map(ANSWER_CATALOG.map(entry => [entry.path, entry]));

function answerForPath(pathname) {
    return ANSWER_BY_PATH.get(String(pathname || '').replace(/\/+$/, '')) || null;
}

module.exports = { ANSWER_CATALOG, answerForPath, answerPath };
