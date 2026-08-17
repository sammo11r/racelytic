const crypto = require('node:crypto');
const express = require('express');
const { pool, sendError, withConnection } = require('../route-helpers');
const {
    createSession,
    ensureAuthSchema,
    getUserFromRequest,
    hashPassword,
    parseCookies,
    sessionCookie,
    tokenHash,
    verifyPassword,
    SESSION_COOKIE
} = require('../auth');

const router = express.Router();
const attempts = new Map();

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function clientKey(req) {
    return `${req.ip}:${normalizeEmail(req.body?.email)}`;
}

function rateLimited(req) {
    const key = clientKey(req);
    const now = Date.now();
    const recent = (attempts.get(key) || []).filter(time => now - time < 15 * 60 * 1000);
    recent.push(now);
    attempts.set(key, recent);
    return recent.length > 10;
}

function validateOrigin(req, res, next) {
    const origin = req.get('origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
        return res.status(403).json({ error: 'Invalid request origin.' });
    }
    next();
}

router.use('/api/account', validateOrigin);

router.get('/api/account', async (req, res) => {
    try {
        const user = await getUserFromRequest(req);
        res.json({ user });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/api/account/register', async (req, res) => {
    if (rateLimited(req)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const email = normalizeEmail(req.body.email);
    const displayName = String(req.body.displayName || '').trim();
    const password = String(req.body.password || '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (displayName.length < 2 || displayName.length > 80) {
        return res.status(400).json({ error: 'Display name must be 2–80 characters.' });
    }
    if (password.length < 10 || password.length > 200) {
        return res.status(400).json({ error: 'Password must be at least 10 characters.' });
    }

    try {
        await ensureAuthSchema();
        const result = await withConnection(async connection => {
            const existing = await connection.query('SELECT id FROM app_users WHERE email = ?', [email]);
            if (existing.length) return null;
            const id = crypto.randomUUID();
            const passwordHash = await hashPassword(password);
            await connection.query(
                'INSERT INTO app_users (id, email, display_name, password_hash) VALUES (?, ?, ?, ?)',
                [id, email, displayName, passwordHash]
            );
            const token = await createSession(connection, id);
            return { token, user: { id, email, displayName } };
        });
        if (!result) return res.status(409).json({ error: 'An account with that email already exists.' });
        res.setHeader('Set-Cookie', sessionCookie(result.token));
        res.status(201).json({ user: result.user });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/api/account/login', async (req, res) => {
    if (rateLimited(req)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    try {
        await ensureAuthSchema();
        const result = await withConnection(async connection => {
            const rows = await connection.query(
                'SELECT id, email, display_name AS displayName, password_hash AS passwordHash FROM app_users WHERE email = ?',
                [email]
            );
            const record = rows[0];
            if (!record || !await verifyPassword(password, record.passwordHash)) return null;
            const token = await createSession(connection, record.id);
            return { token, user: { id: record.id, email: record.email, displayName: record.displayName } };
        });
        if (!result) return res.status(401).json({ error: 'Email or password is incorrect.' });
        attempts.delete(clientKey(req));
        res.setHeader('Set-Cookie', sessionCookie(result.token));
        res.json({ user: result.user });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/api/account/logout', async (req, res) => {
    try {
        await ensureAuthSchema();
        const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
        if (token) await pool.query('DELETE FROM app_sessions WHERE id = ?', [tokenHash(token)]);
        res.setHeader('Set-Cookie', sessionCookie('', 0));
        res.status(204).end();
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;
