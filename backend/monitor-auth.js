const crypto = require('node:crypto');

function safeEqual(first, second) {
    const firstBuffer = Buffer.from(String(first || ''));
    const secondBuffer = Buffer.from(String(second || ''));
    return firstBuffer.length === secondBuffer.length && crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

function requireMonitorAuth(req, res, next) {
    const username = process.env.MONITOR_USERNAME;
    const password = process.env.MONITOR_PASSWORD;
    if (!username || !password) return res.status(503).send('Monitoring credentials are not configured.');
    const [scheme, encoded] = String(req.get('authorization') || '').split(' ');
    let suppliedUsername = '';
    let suppliedPassword = '';
    if (scheme === 'Basic' && encoded) {
        [suppliedUsername, suppliedPassword] = Buffer.from(encoded, 'base64').toString('utf8').split(/:(.*)/s);
    }
    if (!safeEqual(suppliedUsername, username) || !safeEqual(suppliedPassword, password)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Racelytic Monitor", charset="UTF-8"');
        return res.status(401).send('Authentication required.');
    }
    next();
}

module.exports = { requireMonitorAuth, safeEqual };
