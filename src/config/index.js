/**
 * Central configuration file
 * Loads all environment variables from .env and exports them
 */
require('dotenv').config();

module.exports = {
    // Server configuration
    PORT: process.env.PORT || 3000,

    // Redis configuration - used for rate limit counters
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

    // App environment - development, production, test
    NODE_ENV: process.env.NODE_ENV || 'development',

    // PostgreSQL configuration - used in Week 3 for rules storage
    DB_HOST: process.env.DB_HOST || 'localhost',
    DB_PORT: process.env.DB_PORT || 5432,
    DB_NAME: process.env.DB_NAME || 'rate_limiter',
    DB_USER: process.env.DB_USER || 'postgres',
    DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',
};
