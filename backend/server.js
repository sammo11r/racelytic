require('dotenv').config();
const express = require('express');
const path = require('path');
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
    app.get(route, (req, res) => res.sendFile(path.join(frontendDirectory, file)));
    app.get(`/${file}`, (req, res) => {
        const queryIndex = req.originalUrl.indexOf('?');
        const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
        res.redirect(308, `${route}${query}`);
    });
}

for (const [route, file] of [
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
    ['/f2/quizzes', 'f2-quizzes.html'],
    ['/f2/champions-quiz', 'f2-champions-quiz.html'],
    ['/f2/race-winners-quiz', 'f2-race-winners-quiz.html']
]) {
    app.get(route, (req, res) => res.sendFile(path.join(frontendDirectory, file)));
}

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
