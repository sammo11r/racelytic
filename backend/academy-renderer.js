const ACADEMY_SERIES = Object.freeze({
    key: 'academy',
    name: 'F1 Academy',
    path: '/academy',
    modeClass: 'academy-mode',
    favicon: '/assets/favicon-academy.svg',
    firstSeason: 2023
});

const ACADEMY_PAGES = Object.freeze({
    '': 'f3.html', database: 'f3-database.html', seasons: 'f3-seasons.html', season: 'f3-season.html',
    races: 'f3-races.html', race: 'f3-race.html', drivers: 'f3-drivers.html', driver: 'f3-driver.html',
    teams: 'f3-teams.html', team: 'f3-team.html', circuits: 'f3-circuits.html', circuit: 'f3-circuit.html',
    chassis: 'f3-chassis.html', analysis: 'f3-analysis.html',
    'season-analysis': 'f2-season-analysis.html', 'season-comparison': 'season-comparison.html',
    'race-analysis': 'race-analysis.html', 'driver-comparison': 'driver-comparison.html',
    'driver-form': 'driver-form.html', 'teammate-battles': 'teammate-battles.html',
    'circuit-analysis': 'circuit-analysis.html', records: 'records.html', simulator: 'f3-simulator.html',
    'simulate-season': 'f3-simulate-season.html', 'scenario-calculator': 'f3-scenario-calculator.html',
    'championship-builder': 'f3-championship-builder.html', 'points-systems': 'points-systems.html',
    games: 'f3-games.html', 'idle-racing-manager': 'idle-racing-manager.html', 'lights-out': 'lights-out.html',
    about: 'f3-about.html'
});

const PAGE_COPY = Object.freeze({
    'f3.html': [
        ['The archive is collected. Dedicated season, race, driver, team and circuit pages are the next step.', 'Explore dedicated season, race, driver, team and circuit pages across the complete archive.'],
        ['Connect practice, qualifying, sprint and feature classifications across the championship calendar.', 'Connect practice, qualifying and every race classification across the championship calendar.'],
        ['Use the same Racelytic account across Formula 1, Formula 2 and F1 Academy as the new archive grows.', 'Use the same Racelytic account across Formula 1, Formula 2, Formula 3 and F1 Academy.']
    ],
    'f3-database.html': [
        ['Practice, qualifying, sprint and feature classifications connected by race weekend.', 'Practice, qualifying and every race classification connected by race weekend.'],
        ['The two Dallara generations, their technical specifications and championship usage.', 'The Tatuus chassis, its technical specifications and championship usage.']
    ],
    'f3-analysis.html': [
        ['Follow points progression, title margins and results through every sprint and feature race.', 'Follow points progression, title margins and results through every race.']
    ],
    'f3-driver.html': [
        ['Sprint and feature races', 'Race history']
    ],
    'f3-season.html': [
        ['Feature pole', 'Pole position']
    ],
    'f3-races.html': [
        ['Practice, qualifying, grids, sprint races and feature races from every F1 Academy round.', 'Practice, qualifying, grids and every race from each F1 Academy round.']
    ],
    'f3-chassis.html': [
        ['The two Dallara generations used in the F1 Academy Championship.', 'The Tatuus T-421-F1A chassis and Autotecnica powertrain used in the F1 Academy Championship.']
    ],
    'f3-simulator.html': [
        ['F1 Academy simulation tools preserve sprint and feature formats while letting you change points, results, calendars and fields.', 'F1 Academy simulation tools preserve its race formats while letting you change points, results, calendars and fields.'],
        ['Combine individual F1 Academy sprint and feature races into a custom driver and team championship.', 'Combine individual F1 Academy races into a custom driver and team championship.'],
        ['Create reusable feature, sprint, pole and fastest-lap scoring rules.', 'Create reusable standard-race, reverse-grid, pole and fastest-lap scoring rules.']
    ],
    'f3-simulate-season.html': [
        ['Recalculate any F1 Academy season with alternate feature, sprint and bonus-point rules.', 'Recalculate any F1 Academy season with alternate standard-race, reverse-grid and bonus-point rules.'],
        ['Apply a different feature, sprint and bonus-points system to any F1 Academy season.', 'Apply different standard-race, reverse-grid and bonus-points rules to any F1 Academy season.']
    ],
    'f3-scenario-calculator.html': [
        ['Project F1 Academy championship scenarios by changing the remaining sprint and feature-race results.', 'Project F1 Academy championship scenarios by changing the remaining race results.'],
        ['Freeze the F1 Academy standings after any completed round, rewrite the remaining sprint and feature results, and see who can still win.', 'Freeze the F1 Academy standings after any completed race, rewrite the remaining results, and see who can still win.']
    ],
    'f3-championship-builder.html': [
        ['Build a custom F1 Academy championship from individual sprint and feature races.', 'Build a custom F1 Academy championship from individual races.'],
        ['Combine individual F1 Academy sprint and feature races from any season, choose the field and calculate a custom driver and team championship.', 'Combine individual F1 Academy races from any season, choose the field and calculate a custom driver and team championship.']
    ],
    'f3-about.html': [
        ['The archive preserves the complete classified field for practice, qualifying, sprint and feature sessions rather than recording only the leading finishers.', 'The archive preserves the complete classified field for practice, qualifying and every race rather than recording only the leading finishers.'],
        ['See the analysis tools planned for the F1 Academy archive.', 'Use the complete analysis toolkit across the F1 Academy archive.'],
        ['Preview the simulation tools that will use complete F1 Academy results.', 'Use complete F1 Academy results in the championship simulation tools.']
    ],
    'f2-season-analysis.html': [
        ['/assets/favicon-f2.svg', ACADEMY_SERIES.favicon],
        ['/f2/analysis', `${ACADEMY_SERIES.path}/analysis`],
        ['f2-mode', ACADEMY_SERIES.modeClass],
        ['Analyse Formula 2 championship progression, points and results.', 'Analyse F1 Academy championship progression, points and results.'],
        ['Formula 2 Season Analysis · Racelytic', 'F1 Academy Season Analysis · Racelytic'],
        ['FORMULA 2 SEASON ANALYSIS', 'F1 ACADEMY SEASON ANALYSIS'],
        ['Formula 2 season analysis visualization', 'F1 Academy season analysis visualization'],
        ['Follow how the standings changed through every sprint and feature race without applying Formula 1 assumptions.', 'Follow how the standings changed through every F1 Academy race without applying another series’ format.'],
        ['Sprint and feature', 'Every race'],
        ['Sprint and feature shown separately', 'Each race shown separately']
    ],
    'points-systems.html': [
        ['Sprint points by position', 'Reverse-grid race points by position'],
        ['Leave empty to award no sprint points.', 'Leave empty to award no reverse-grid race points.'],
        ['Include sprint points in a round before applying the best-round limit', 'Include reverse-grid race points in a round before applying the best-round limit']
    ],
    'records.html': [
        ['Include sprint races', 'Include reverse-grid races'],
        ['Count sprint starts, wins, podiums and points', 'Count reverse-grid race starts, wins, podiums and points']
    ]
});

function replaceAll(content, replacements) {
    return replacements.reduce((result, [source, target]) => result.replaceAll(source, target), content);
}

function renderAcademyHtml(file, content) {
    let rendered = replaceAll(content, [
        ['/assets/favicon-f3.svg', ACADEMY_SERIES.favicon],
        ['/assets/favicon.svg', ACADEMY_SERIES.favicon],
        ['/js/f3', '/__ACADEMY_F3_SCRIPT__'],
        ['/f3', ACADEMY_SERIES.path],
        ['/__ACADEMY_F3_SCRIPT__', '/academy-js/f3'],
        ['#f3-archive', '#academy-archive'],
        ['id="f3-archive"', 'id="academy-archive"'],
        ['series=f3', `series=${ACADEMY_SERIES.key}`],
        ['FORMULA 3', 'F1 ACADEMY'],
        ['FIA Formula 3', ACADEMY_SERIES.name],
        ['Formula 3', ACADEMY_SERIES.name],
        ['f3-mode', ACADEMY_SERIES.modeClass],
        ['since 2019', `since ${ACADEMY_SERIES.firstSeason}`],
        ['from 2019', `from ${ACADEMY_SERIES.firstSeason}`]
    ]);

    rendered = rendered.replace(/\bF3\b/g, ACADEMY_SERIES.name);
    return replaceAll(rendered, PAGE_COPY[file] || []);
}

function renderAcademyScript(content) {
    return replaceAll(content, [
        ['/f3', ACADEMY_SERIES.path],
        ['FORMULA 3', 'F1 ACADEMY'],
        ['FIA Formula 3', ACADEMY_SERIES.name],
        ['Formula 3', ACADEMY_SERIES.name],
        ['series=f3', `series=${ACADEMY_SERIES.key}`],
        ["series: 'f3'", `series: '${ACADEMY_SERIES.key}'`],
        ['series: "f3"', `series: "${ACADEMY_SERIES.key}"`]
    ]).replace(/\bF3\b/g, ACADEMY_SERIES.name);
}

module.exports = { ACADEMY_PAGES, ACADEMY_SERIES, PAGE_COPY, renderAcademyHtml, renderAcademyScript };
