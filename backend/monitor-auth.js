const crypto = require('node:crypto');
const { MemoryRateLimiter } = require('./rate-limit');

const failedAttempts = new MemoryRateLimiter({ windowMs: 15 * 60 * 1000, limit: 10, maxEntries: 5000 });

if (process.env.NODE_ENV === 'production'
    && process.env.MONITOR_PASSWORD === 'change-this-to-a-long-random-password') {
    throw new Error('MONITOR_PASSWORD still uses the example value.');
}

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
        if (failedAttempts.consume(req.ip)) return res.status(429).send('Too many authentication attempts.');
        res.setHeader('WWW-Authenticate', 'Basic realm="Racelytic Monitor", charset="UTF-8"');
        return res.status(401).send('Authentication required.');
    }
    failedAttempts.reset(req.ip);
    next();
}

module.exports = { requireMonitorAuth, safeEqual };
