const { all: SERIES } = require('../frontend/js/series-config');
const { SERIES_PAGE_TEMPLATES } = require('./series-pages');

const FORMULA_E_SERIES = Object.freeze({ ...SERIES.fe, firstSeason: 2015 });
const FORMULA_E_PAGES = SERIES_PAGE_TEMPLATES.fe;

const PAGE_COPY = Object.freeze({
    'f3-database.html': [
        ['Practice, qualifying, sprint and feature classifications connected by race weekend.', 'Practice, qualifying and race classifications connected by E-Prix weekend.'],
        ['The two Dallara generations, their technical specifications and championship usage.', 'The four Spark generations, their technical specifications and championship usage.']
    ],
    'f3-analysis.html': [
        ['Follow points progression, title margins and results through every sprint and feature race.', 'Follow points progression, title margins and results through every E-Prix.'],
        ['Championship progression, title margins and every sprint and feature result.', 'Championship progression, title margins and every E-Prix result.']
    ],
    'f3-races.html': [['Practice, qualifying, grids, sprint races and feature races from every Formula E round.', 'Practice, qualifying and race classifications from every Formula E round.']],
    'f3-driver.html': [['Sprint and feature races', 'E-Prix history']],
    'f3-season.html': [['Feature pole', 'Pole position']],
    'f3-chassis.html': [
        ['The two Dallara generations used in the Formula E Championship.', 'The Spark generations that have powered Formula E from the inaugural season to today.']
    ],
    'f3-about.html': [
        ['The archive preserves the complete classified field for practice, qualifying, sprint and feature sessions rather than recording only the leading finishers.', 'The archive preserves the official classifications for practice, qualifying and races rather than recording only the leading finishers.'],
        ['since 2019', 'from the inaugural 2014–15 season']
    ],
    'race-analysis.html': [
        ['Grand Prix', 'E-Prix']
    ],
    'f3-simulator.html': [
        ['every race format', 'every E-Prix'],
        ['race formats and bonuses', 'E-Prix formats and bonuses']
    ],
    'f3-simulate-season.html': [
        ['alternate feature, sprint and bonus-point rules', 'alternate E-Prix and bonus-point rules']
    ],
    'f3-scenario-calculator.html': [
        ['feature and sprint result', 'E-Prix result'],
        ['feature results and retain each sprint classification', 'E-Prix results']
    ],
    'f3-championship-builder.html': [
        ['sprint and feature races', 'E-Prix'],
        ['Race weekend', 'E-Prix']
    ],
    'points-systems.html': [
        ['race, sprint and bonus-point scoring systems', 'E-Prix and bonus-point scoring systems']
    ],
    'f2-games.html': [
        ['Formula E games will draw from complete seasons, drivers, teams, circuits and race classifications in the Racelytic archive.', 'Formula E games draw on complete seasons, drivers, teams, circuits and E-Prix classifications in the Racelytic archive.'],
        ['href="/idle-racing-manager"', `href="${FORMULA_E_SERIES.path}/idle-racing-manager"`]
    ],
    'f2-quizzes.html': [
        ['Name every champion from the modern Formula E era.', 'Name every Formula E Drivers’ Champion from the inaugural season.'],
        ['Name every Formula E feature and sprint race winner.', 'Name every Formula E E-Prix winner.'],
        ['Choose a Formula E season and name the winner of every feature and sprint race.', 'Choose a Formula E season and name the winner of every E-Prix.'],
        ['Since 2017', 'Since 2014–15'],
        ['<strong>GP</strong>', '<strong>EP</strong>']
    ],
    'f2-champions-quiz.html': [
        ['Name every FIA Formula E Drivers\' Champion.', 'Name every Formula E Drivers\' Champion.']
    ],
    'f2-race-winners-quiz.html': [
        ['Enter any feature or sprint race winner. Their place in the all-time Formula E winners table will be revealed.', 'Enter any E-Prix winner. Their place in the all-time Formula E winners table will be revealed.'],
        ['Win totals, nationality, feature wins and sprint wins remain visible as hints.', 'Win totals, nationality and first winning season remain visible as hints.']
    ],
    'f2-season-race-winners-quiz.html': [
        ['data-quiz-event-label="Race"', 'data-quiz-event-label="E-Prix"'],
        ['Choose a season and name the winner of every completed Formula E feature and sprint race.', 'Choose a season and name the winner of every completed E-Prix.'],
        ['Rounds, sessions and winning teams remain visible as hints.', 'Rounds, E-Prix and winning teams remain visible as hints.']
    ],
    'idle-racing-manager.html': [
        ['<body>', '<body class="fe-mode">'],
        ['href="/games"', `href="${FORMULA_E_SERIES.path}/games"`]
    ],
    'lights-out.html': [
        ['<body>', '<body class="fe-mode">'],
        ['href="/games"', `href="${FORMULA_E_SERIES.path}/games"`]
    ],
    'f2-season-analysis.html': [
        ['/assets/favicon-f2.svg', FORMULA_E_SERIES.favicon],
        ['/f2/analysis', `${FORMULA_E_SERIES.path}/analysis`],
        ['f2-mode', FORMULA_E_SERIES.modeClass],
        ['Formula 2', FORMULA_E_SERIES.name],
        ['FORMULA 2', 'FORMULA E'],
        ['sprint and feature race', 'E-Prix']
    ]
});

function replaceAll(content, replacements) {
    return replacements.reduce((result, [source, target]) => result.replaceAll(source, target), content);
}

function renderFormulaEHtml(file, content) {
    let rendered = replaceAll(content, [
        ['/assets/favicon-f3.svg', FORMULA_E_SERIES.favicon],
        ['/assets/favicon-f2.svg', FORMULA_E_SERIES.favicon],
        ['/assets/favicon.svg', FORMULA_E_SERIES.favicon],
        ['/js/f3', '/__FORMULA_E_F3_SCRIPT__'],
        ['/f3', FORMULA_E_SERIES.path],
        ['/f2', FORMULA_E_SERIES.path],
        ['/__FORMULA_E_F3_SCRIPT__', '/formula-e-js/f3'],
        ['#f3-archive', '#formula-e-archive'],
        ['id="f3-archive"', 'id="formula-e-archive"'],
        ['series=f3', 'series=fe'],
        ['FORMULA 3', 'FORMULA E'],
        ['FIA Formula 3', 'Formula E'],
        ['Formula 3', 'Formula E'],
        ['FIA Formula 2', 'Formula E'],
        ['FORMULA 2', 'FORMULA E'],
        ['Formula 2', 'Formula E'],
        ['FORMULA 1', 'FORMULA E'],
        ['Formula 1', 'Formula E'],
        ['f3-mode', FORMULA_E_SERIES.modeClass],
        ['f2-mode', FORMULA_E_SERIES.modeClass],
        ['since 2019', 'since 2014–15'],
        ['from 2019', 'from 2014–15']
    ]);
    rendered = rendered.replace(/\bF3\b/g, 'Formula E').replace(/\bF2\b/g, 'Formula E');
    if (/\/(?:js\/simulator|js\/scenario-calculator|js\/championship-builder|js\/points-systems)\.js/.test(rendered)) {
        rendered = rendered.replace(/(<script src="\/js\/(?:simulator|scenario-calculator|championship-builder|points-systems)\.js"><\/script>)/,
            '<script src="/js/formula-e-points-systems.js"></script>\n  $1');
    }
    if (file === 'f3-analysis.html') rendered = rendered.replace(/\s*<section class="analysis-ask-entry"[\s\S]*?<\/section>/, '');
    return replaceAll(rendered, PAGE_COPY[file] || []);
}

function renderFormulaEScript(content) {
    return replaceAll(content, [
        ['/f3', FORMULA_E_SERIES.path],
        ['FORMULA 3', 'FORMULA E'],
        ['FIA Formula 3', 'Formula E'],
        ['Formula 3', 'Formula E'],
        ['series=f3', 'series=fe'],
        ["series: 'f3'", "series: 'fe'"],
        ['series: "f3"', 'series: "fe"']
    ]).replace(/\bF3\b/g, 'Formula E');
}

module.exports = { FORMULA_E_PAGES, FORMULA_E_SERIES, renderFormulaEHtml, renderFormulaEScript };
