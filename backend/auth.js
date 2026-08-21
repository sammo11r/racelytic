const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const pool = require('./db');

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'racelytics_session';
const SESSION_DAYS = 30;
let schemaReady;

function ensureAuthSchema() {
    if (!schemaReady) {
        schemaReady = (async () => {
            const sql = fs.readFileSync(path.join(__dirname, '../database/auth.sql'), 'utf8');
            const statements = sql.split(';').map(value => value.trim()).filter(Boolean);
            const connection = await pool.getConnection();
            try {
                for (const statement of statements) await connection.query(statement);
            } finally {
                connection.release();
            }
        })().catch(error => {
            schemaReady = null;
            throw error;
        });
    }
    return schemaReady;
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const derived = await scrypt(password, salt, 64);
    return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function verifyPassword(password, encoded) {
    const [algorithm, saltText, hashText] = String(encoded).split('$');
    if (algorithm !== 'scrypt' || !saltText || !hashText) return false;
    const expected = Buffer.from(hashText, 'base64url');
    const actual = await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length);
    return crypto.timingSafeEqual(expected, actual);
}

function parseCookies(header = '') {
    return Object.fromEntries(header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
        const index = part.indexOf('=');
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
    }).filter(([name]) => name));
}

function tokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function sessionCookie(token, maxAge = SESSION_DAYS * 86400) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function createSession(connection, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
    await connection.query(
        'INSERT INTO app_sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
        [tokenHash(token), userId, expiresAt]
    );
    return token;
}

async function getUserFromRequest(req) {
    await ensureAuthSchema();
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const rows = await pool.query(`
        SELECT u.id, u.username, u.display_name AS displayName
        FROM app_sessions s
        JOIN app_users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > NOW()
    `, [tokenHash(token)]);
    return rows[0] || null;
}

async function requireUser(req, res, next) {
    try {
        req.user = await getUserFromRequest(req);
        if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = {
    SESSION_COOKIE,
    createSession,
    ensureAuthSchema,
    getUserFromRequest,
    hashPassword,
    parseCookies,
    requireUser,
    sessionCookie,
    tokenHash,
    verifyPassword
};
