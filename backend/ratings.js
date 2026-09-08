const fs = require('node:fs');
const path = require('node:path');
const pool = require('./db');

let schemaReady;

function ensureRatingsSchema() {
    if (!schemaReady) {
        schemaReady = (async () => {
            const sql = fs.readFileSync(path.join(__dirname, '../database/ratings.sql'), 'utf8');
            const connection = await pool.getConnection();
            try {
                for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) {
                    await connection.query(statement);
                }
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

module.exports = { ensureRatingsSchema };
