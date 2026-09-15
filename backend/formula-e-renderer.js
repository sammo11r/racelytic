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
        ['/assets/favicon.svg', FORMULA_E_SERIES.favicon],
        ['/js/f3', '/__FORMULA_E_F3_SCRIPT__'],
        ['/f3', FORMULA_E_SERIES.path],
        ['/__FORMULA_E_F3_SCRIPT__', '/formula-e-js/f3'],
        ['#f3-archive', '#formula-e-archive'],
        ['id="f3-archive"', 'id="formula-e-archive"'],
        ['series=f3', 'series=fe'],
        ['FORMULA 3', 'FORMULA E'],
        ['FIA Formula 3', 'Formula E'],
        ['Formula 3', 'Formula E'],
        ['FORMULA 1', 'FORMULA E'],
        ['Formula 1', 'Formula E'],
        ['f3-mode', FORMULA_E_SERIES.modeClass],
        ['since 2019', 'since 2014–15'],
        ['from 2019', 'from 2014–15']
    ]);
    rendered = rendered.replace(/\bF3\b/g, 'Formula E');
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
