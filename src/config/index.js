/**
 * Central configuration
 * Loads environment variables from .env with sensible defaults
 */
require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3000,
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    NODE_ENV: process.env.NODE_ENV || 'development',

    // PostgreSQL — used in Week 3 for persistent rules storage
    DB_HOST: process.env.DB_HOST || 'localhost',
    DB_PORT: process.env.DB_PORT || 5432,
    DB_NAME: process.env.DB_NAME || 'rate_limiter',
    DB_USER: process.env.DB_USER || 'postgres',
    DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',
};
