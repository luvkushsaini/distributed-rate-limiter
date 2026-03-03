const express = require('express');
const { PORT, NODE_ENV } = require('./config');
const { connectRedis } = require('./store/redisClient');
const { connectDB } = require('./db');
const logger = require('./utils/logger');
const rateLimitMiddleware = require('./middleware/rateLimitMiddleware');
const rateLimitRoutes = require('./routes/rateLimitRoutes');

const app = express();

app.use(express.json());
app.use(rateLimitMiddleware);
app.use('/api', rateLimitRoutes);

app.use((err, req, res, next) => {
    logger.error('Unhandled error', { error: err.message });
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
    });
});

const startServer = async () => {
    await connectRedis();
    await connectDB();
    app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
    });
};

startServer();

module.exports = app;
