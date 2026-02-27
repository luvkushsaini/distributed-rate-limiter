/**
 * Main application entry point
 * Sets up Express server with middleware, routes, and error handling
 */
const express = require('express');
const { PORT, NODE_ENV } = require('./config');
const { connectRedis } = require('./store/redisClient');
const logger = require('./utils/logger');

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

/**
 * Health check endpoint
 * Used by monitoring tools to verify the service is running
 */
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
    });
});

/**
 * Global error handling middleware
 * Catches any unhandled errors and returns a clean JSON response
 */
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { error: err.message });
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
    });
});

/**
 * Start the server
 * Connect to Redis first, then start listening for requests
 */
const startServer = async () => {
    await connectRedis();
    app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
    });
};

startServer();

module.exports = app;
