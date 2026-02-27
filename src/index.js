/**
 * Main application entry point
 * Sets up Express server with middleware, routes, and error handling
 */
const express = require('express');
const { PORT, NODE_ENV } = require('./config');
const { connectRedis, isRedisConnected } = require('./store/redisClient');
const logger = require('./utils/logger');
const rateLimitMiddleware = require('./middleware/rateLimitMiddleware');
const rateLimitRoutes = require('./routes/rateLimitRoutes');

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Apply rate limiting middleware globally — runs before every route
app.use(rateLimitMiddleware);

/**
 * Health check endpoint
 * Returns server status AND Redis connection status
 * Used by monitoring tools to verify the full service is running
 */
app.get('/health', (req, res) => {
    const redisStatus = isRedisConnected() ? 'connected' : 'disconnected';
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        services: {
            redis: redisStatus,
        },
    });
});

// Mount rate limit API routes under /api
app.use('/api', rateLimitRoutes);

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
