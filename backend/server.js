require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const frontendDirectory = path.join(__dirname, '../frontend');

// Nginx terminates HTTPS locally and forwards the original protocol. Trust only
// loopback proxies so origin checks see https without accepting spoofed headers
// from direct external connections.
app.set('trust proxy', 'loopback');

app.use(express.json());

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

app.use(express.static(frontendDirectory));

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendDirectory, 'index.html'));
});

for (const route of ['core', 'seasons', 'drivers', 'circuits', 'constructors', 'chassis', 'races', 'records', 'games', 'account', 'points-systems', 'custom-championships']) {
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
