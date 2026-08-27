require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('node:fs');
const { requireMonitorAuth } = require('./monitor-auth');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const frontendDirectory = path.join(__dirname, '../frontend');

// Nginx terminates HTTPS locally and forwards the original protocol. Trust only
// loopback proxies so origin checks see https without accepting spoofed headers
// from direct external connections.
app.set('trust proxy', 'loopback');

app.use(express.json());

app.get('/monitor', requireMonitorAuth, (req, res) => res.sendFile(path.join(frontendDirectory, 'monitor.html')));

const publicPages = require('node:fs').readdirSync(frontendDirectory)
    .filter(file => file.endsWith('.html') && file !== 'index.html');

for (const file of publicPages) {
    const route = `/${file.slice(0, -'.html'.length)}`;
    const juniorMatch = route.match(/^\/(f[23])-(.+)$/);
    const canonicalRoute = juniorMatch ? `/${juniorMatch[1]}/${juniorMatch[2]}` : route;

    if (canonicalRoute !== route) {
        app.get(route, (req, res) => {
            const queryIndex = req.originalUrl.indexOf('?');
            const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
            res.redirect(308, `${canonicalRoute}${query}`);
        });
    } else {
        app.get(route, (req, res) => res.sendFile(path.join(frontendDirectory, file)));
    }
    app.get(`/${file}`, (req, res) => {
        const queryIndex = req.originalUrl.indexOf('?');
        const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
        res.redirect(308, `${canonicalRoute}${query}`);
    });
}

for (const [route, file] of [
    ['/f3/database', 'f3-database.html'],
    ['/f3/seasons', 'f3-seasons.html'],
    ['/f3/season', 'f3-season.html'],
    ['/f3/races', 'f3-races.html'],
    ['/f3/race', 'f3-race.html'],
    ['/f3/drivers', 'f3-drivers.html'],
    ['/f3/driver', 'f3-driver.html'],
    ['/f3/teams', 'f3-teams.html'],
    ['/f3/team', 'f3-team.html'],
    ['/f3/circuits', 'f3-circuits.html'],
    ['/f3/circuit', 'f3-circuit.html'],
    ['/f3/chassis', 'f3-chassis.html'],
    ['/f3/analysis', 'f3-analysis.html'],
    ['/f3/season-analysis', 'f2-season-analysis.html'],
    ['/f3/season-comparison', 'season-comparison.html'],
    ['/f3/race-analysis', 'race-analysis.html'],
    ['/f3/driver-comparison', 'driver-comparison.html'],
    ['/f3/driver-form', 'driver-form.html'],
    ['/f3/teammate-battles', 'teammate-battles.html'],
    ['/f3/circuit-analysis', 'circuit-analysis.html'],
    ['/f3/records', 'records.html'],
    ['/f3/simulator', 'f3-simulator.html'],
    ['/f3/simulate-season', 'f3-simulate-season.html'],
    ['/f3/scenario-calculator', 'f3-scenario-calculator.html'],
    ['/f3/championship-builder', 'f3-championship-builder.html'],
    ['/f3/points-systems', 'points-systems.html'],
    ['/f3/games', 'f3-games.html'],
    ['/f3/idle-racing-manager', 'idle-racing-manager.html'],
    ['/f3/lights-out', 'lights-out.html'],
    ['/f3/about', 'f3-about.html'],
    ['/f2/database', 'f2-database.html'],
    ['/f2/seasons', 'f2-seasons.html'],
    ['/f2/season', 'f2-season.html'],
    ['/f2/races', 'f2-races.html'],
    ['/f2/race', 'f2-race.html'],
    ['/f2/drivers', 'f2-drivers.html'],
    ['/f2/driver', 'f2-driver.html'],
    ['/f2/circuits', 'f2-circuits.html'],
    ['/f2/circuit', 'f2-circuit.html'],
    ['/f2/constructors', 'f2-constructors.html'],
    ['/f2/constructor', 'f2-constructor.html'],
    ['/f2/chassis', 'f2-chassis.html'],
    ['/f2/about', 'f2-about.html'],
    ['/f2/analysis', 'f2-analysis.html'],
    ['/f2/season-analysis', 'f2-season-analysis.html'],
    ['/f2/season-comparison', 'season-comparison.html'],
    ['/f2/race-analysis', 'race-analysis.html'],
    ['/f2/driver-comparison', 'driver-comparison.html'],
    ['/f2/driver-form', 'driver-form.html'],
    ['/f2/teammate-battles', 'teammate-battles.html'],
    ['/f2/circuit-analysis', 'circuit-analysis.html'],
    ['/f2/records', 'records.html'],
    ['/f2/simulator', 'f2-simulator.html'],
    ['/f2/simulate-season', 'simulator.html'],
    ['/f2/scenario-calculator', 'scenario-calculator.html'],
    ['/f2/championship-builder', 'championship-builder.html'],
    ['/f2/points-systems', 'points-systems.html'],
    ['/f2/games', 'f2-games.html'],
    ['/f2/idle-racing-manager', 'idle-racing-manager.html'],
    ['/f2/lights-out', 'lights-out.html'],
    ['/f2/quizzes', 'f2-quizzes.html'],
    ['/f2/champions-quiz', 'f2-champions-quiz.html'],
    ['/f2/race-winners-quiz', 'f2-race-winners-quiz.html']
]) {
    app.get(route, (req, res) => res.sendFile(path.join(frontendDirectory, file)));
}

const academyPages = {
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
    games: 'f3-games.html', 'idle-racing-manager': 'idle-racing-manager.html', 'lights-out': 'lights-out.html', about: 'f3-about.html'
};

function academyCopy(content) {
    return content
        .replaceAll('/assets/favicon-f3.svg', '/assets/favicon-academy.svg')
        .replaceAll('/assets/favicon.svg', '/assets/favicon-academy.svg')
        .replaceAll('/js/f3', '/__ACADEMY_F3_SCRIPT__')
        .replaceAll('/f3', '/academy')
        .replaceAll('/__ACADEMY_F3_SCRIPT__', '/academy-js/f3')
        .replaceAll('FORMULA 3', 'F1 ACADEMY')
        .replaceAll('FIA Formula 3', 'F1 Academy')
        .replaceAll('Formula 3', 'F1 Academy')
        .replaceAll('The two Dallara generations used in the F1 Academy Championship.', 'The spec Tatuus T-421-F1A chassis and Autotecnica powertrain used since 2023.')
        .replaceAll('after any completed round', 'after any completed race')
        .replaceAll('remaining sprint and feature results', 'remaining individual race results')
        .replace(/\bF3\b/g, 'F1 Academy')
        .replaceAll('f3-mode', 'academy-mode')
        .replaceAll('since 2019', 'since 2023')
        .replaceAll('from 2019', 'from 2023');
}

Object.entries(academyPages).forEach(([slug, file]) => {
    app.get(slug ? `/academy/${slug}` : '/academy', (req, res, next) => {
        fs.readFile(path.join(frontendDirectory, file), 'utf8', (error, content) => {
            if (error) return next(error);
            res.type('html').send(academyCopy(content));
        });
    });
});

app.get('/academy-js/:file', (req, res, next) => {
    if (!/^f3-[a-z0-9-]+\.js$|^f3\.js$/.test(req.params.file)) return res.sendStatus(404);
    fs.readFile(path.join(frontendDirectory, 'js', req.params.file), 'utf8', (error, content) => {
        if (error) return next(error);
        res.type('application/javascript').send(academyCopy(content)
            .replaceAll('series=f3', 'series=academy')
            .replaceAll("series: 'f3'", "series: 'academy'")
            .replaceAll('series: "f3"', 'series: "academy"'));
    });
});

app.use(express.static(frontendDirectory));

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendDirectory, 'index.html'));
});

for (const route of ['core', 'seasons', 'drivers', 'circuits', 'constructors', 'chassis', 'races', 'records', 'games', 'account', 'points-systems', 'custom-championships', 'analytics']) {
    app.use(require(`./routes/${route}`));
}

app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) return next(error);
    res.status(500).json({ error: 'Request failed.' });
});

app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found.' });
    }
    next();
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Racelytic running at http://localhost:${PORT}`);
    });
}

module.exports = app;
