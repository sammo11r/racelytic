require('dotenv').config();
const mariadb = require('mariadb');

if (process.env.NODE_ENV === 'production') {
    const missing = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'].filter(name => !String(process.env[name] || '').trim());
    if (missing.length) throw new Error(`Missing production database configuration: ${missing.join(', ')}`);
    if (String(process.env.DB_USER).toLowerCase() === 'root') {
        throw new Error('DB_USER must be a restricted application account in production.');
    }
}

const pool = mariadb.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'racelytics',
    connectionLimit: 10,
    bigIntAsNumber: true
});

module.exports = pool;
