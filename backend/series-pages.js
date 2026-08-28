const { all: SERIES } = require('../frontend/js/series-config');

const SHARED_PAGE_TEMPLATES = Object.freeze({
    'season-comparison': 'season-comparison.html',
    'race-analysis': 'race-analysis.html',
    'driver-comparison': 'driver-comparison.html',
    'driver-form': 'driver-form.html',
    'teammate-battles': 'teammate-battles.html',
    'circuit-analysis': 'circuit-analysis.html',
    records: 'records.html',
    'points-systems': 'points-systems.html',
});

const SERIES_PAGE_TEMPLATES = Object.freeze({
    f2: Object.freeze({
        database: 'f2-database.html', seasons: 'f2-seasons.html', season: 'f2-season.html',
        races: 'f2-races.html', race: 'f2-race.html', drivers: 'f2-drivers.html', driver: 'f2-driver.html',
        circuits: 'f2-circuits.html', circuit: 'f2-circuit.html', constructors: 'f2-constructors.html',
        constructor: 'f2-constructor.html', chassis: 'f2-chassis.html', about: 'f2-about.html',
        analysis: 'f2-analysis.html', 'season-analysis': 'f2-season-analysis.html',
        ...SHARED_PAGE_TEMPLATES,
        simulator: 'f2-simulator.html', 'simulate-season': 'simulator.html',
        'scenario-calculator': 'scenario-calculator.html', 'championship-builder': 'championship-builder.html',
        games: 'f2-games.html', 'idle-racing-manager': 'idle-racing-manager.html', 'lights-out': 'lights-out.html',
        quizzes: 'f2-quizzes.html', 'champions-quiz': 'f2-champions-quiz.html',
        'race-winners-quiz': 'f2-race-winners-quiz.html',
    }),
    f3: Object.freeze({
        database: 'f3-database.html', seasons: 'f3-seasons.html', season: 'f3-season.html',
        races: 'f3-races.html', race: 'f3-race.html', drivers: 'f3-drivers.html', driver: 'f3-driver.html',
        teams: 'f3-teams.html', team: 'f3-team.html', circuits: 'f3-circuits.html', circuit: 'f3-circuit.html',
        chassis: 'f3-chassis.html', analysis: 'f3-analysis.html', 'season-analysis': 'f2-season-analysis.html',
        ...SHARED_PAGE_TEMPLATES,
        simulator: 'f3-simulator.html', 'simulate-season': 'f3-simulate-season.html',
        'scenario-calculator': 'f3-scenario-calculator.html', 'championship-builder': 'f3-championship-builder.html',
        games: 'f3-games.html', 'idle-racing-manager': 'idle-racing-manager.html', 'lights-out': 'lights-out.html',
        about: 'f3-about.html',
    }),
    academy: Object.freeze({
        '': 'f3.html', database: 'f3-database.html', seasons: 'f3-seasons.html', season: 'f3-season.html',
        races: 'f3-races.html', race: 'f3-race.html', drivers: 'f3-drivers.html', driver: 'f3-driver.html',
        teams: 'f3-teams.html', team: 'f3-team.html', circuits: 'f3-circuits.html', circuit: 'f3-circuit.html',
        chassis: 'f3-chassis.html', analysis: 'f3-analysis.html', 'season-analysis': 'f2-season-analysis.html',
        ...SHARED_PAGE_TEMPLATES,
        simulator: 'f3-simulator.html', 'simulate-season': 'f3-simulate-season.html',
        'scenario-calculator': 'f3-scenario-calculator.html', 'championship-builder': 'f3-championship-builder.html',
        games: 'f3-games.html', 'idle-racing-manager': 'idle-racing-manager.html', 'lights-out': 'lights-out.html',
        about: 'f3-about.html',
    }),
});

function seriesPageRoutes(seriesKeys = Object.keys(SERIES_PAGE_TEMPLATES)) {
    return seriesKeys.flatMap(seriesKey => Object.entries(SERIES_PAGE_TEMPLATES[seriesKey]).map(([slug, file]) => ({
        series: SERIES[seriesKey], slug, file,
        route: `${SERIES[seriesKey].path}${slug ? `/${slug}` : ''}`,
    })));
}

module.exports = { SERIES_PAGE_TEMPLATES, SHARED_PAGE_TEMPLATES, seriesPageRoutes };
