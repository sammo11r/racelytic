const crypto = require('node:crypto');
const express = require('express');
const { pool, sendError, withConnection } = require('../route-helpers');
const { PRIVACY_VERSION, TERMS_VERSION } = require('../legal');
const {
    createSession,
    ensureAuthSchema,
    getUserFromRequest,
    hashPassword,
    parseCookies,
    requireUser,
    sessionCookie,
    tokenHash,
    verifyPassword,
    SESSION_COOKIE
} = require('../auth');

const router = express.Router();
const attempts = new Map();

function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
}

function clientKey(req) {
    return `${req.ip}:${normalizeUsername(req.body?.username)}`;
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
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3–30 letters, numbers, dots, underscores or hyphens.' });
    }
    if (password.length < 10 || password.length > 200) {
        return res.status(400).json({ error: 'Password must be at least 10 characters.' });
    }
    if (req.body.legalAccepted !== true) {
        return res.status(400).json({ error: 'You must confirm your age, agree to the Terms, and acknowledge the Privacy Notice.' });
    }

    try {
        await ensureAuthSchema();
        const result = await withConnection(async connection => {
            const existing = await connection.query('SELECT id FROM app_users WHERE username = ?', [username]);
            if (existing.length) return null;
            const id = crypto.randomUUID();
            const passwordHash = await hashPassword(password);
            await connection.query(
                `INSERT INTO app_users
                    (id, username, display_name, password_hash, terms_version, privacy_version, legal_accepted_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [id, username, username, passwordHash, TERMS_VERSION, PRIVACY_VERSION]
            );
            const token = await createSession(connection, id);
            return { token, user: { id, username, displayName: username } };
        });
        if (!result) return res.status(409).json({ error: 'That username is already taken.' });
        res.setHeader('Set-Cookie', sessionCookie(result.token));
        res.status(201).json({ user: result.user });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/api/account/login', async (req, res) => {
    if (rateLimited(req)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    try {
        await ensureAuthSchema();
        const result = await withConnection(async connection => {
            const rows = await connection.query(
                'SELECT id, username, display_name AS displayName, password_hash AS passwordHash FROM app_users WHERE username = ?',
                [username]
            );
            const record = rows[0];
            if (!record || !await verifyPassword(password, record.passwordHash)) return null;
            const token = await createSession(connection, record.id);
            return { token, user: { id: record.id, username: record.username, displayName: record.displayName } };
        });
        if (!result) return res.status(401).json({ error: 'Username or password is incorrect.' });
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

router.post('/api/account/password', requireUser, async (req, res) => {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 10 || newPassword.length > 200) {
        return res.status(400).json({ error: 'New password must be at least 10 characters.' });
    }
    if (currentPassword === newPassword) {
        return res.status(400).json({ error: 'Choose a password different from your current password.' });
    }

    try {
        await ensureAuthSchema();
        const updated = await withConnection(async connection => {
            const rows = await connection.query('SELECT password_hash AS passwordHash FROM app_users WHERE id = ?', [req.user.id]);
            if (!rows[0] || !await verifyPassword(currentPassword, rows[0].passwordHash)) return false;
            const passwordHash = await hashPassword(newPassword);
            await connection.query('UPDATE app_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [passwordHash, req.user.id]);
            const currentToken = parseCookies(req.headers.cookie)[SESSION_COOKIE];
            if (currentToken) await connection.query('DELETE FROM app_sessions WHERE user_id = ? AND id <> ?', [req.user.id, tokenHash(currentToken)]);
            return true;
        });
        if (!updated) return res.status(401).json({ error: 'Current password is incorrect.' });
        res.status(204).end();
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;
