const { Pool } = require('pg');
const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = require('../config');
const logger = require('../utils/logger');

const pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
});

pool.on('connect', () => {
    logger.info('PostgreSQL client connected');
});

pool.on('error', (err) => {
    logger.error('PostgreSQL pool error', { error: err.message });
});

const query = async (text, params) => {
    try {
        const result = await pool.query(text, params);
        return result;
    } catch (err) {
        logger.error('Database query error', {
            error: err.message,
            query: text,
        });
        throw err;
    }
};

const connectDB = async () => {
    try {
        await pool.query('SELECT 1');
        logger.info('PostgreSQL connection established successfully');
    } catch (err) {
        logger.error('Failed to connect to PostgreSQL', { error: err.message });
    }
};

module.exports = { query, connectDB };