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

app.use(express.json());

// Rate limiting runs before all routes — order matters
app.use(rateLimitMiddleware);

/**
 * Health check endpoint
 * Used by monitoring tools and load balancers to verify service availability
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

app.use('/api', rateLimitRoutes);

/**
 * Global error handling middleware
 * Must be last — Express identifies error handlers by their 4-parameter signature
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
 * Connects to Redis first so rate limiting is ready before accepting requests
 */
const startServer = async () => {
    await connectRedis();
    app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
    });
};

startServer();

module.exports = app;
