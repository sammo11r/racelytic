const pool = require('./db');

function sendError(res, error) {
    console.error(error);
    res.status(500).json({ error: 'Database request failed.' });
}

async function withConnection(fn) {
    let connection;
    try {
        connection = await pool.getConnection();
        return await fn(connection);
    } finally {
        if (connection) connection.release();
    }
}

module.exports = { pool, sendError, withConnection };
