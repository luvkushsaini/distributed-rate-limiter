require('dotenv').config();

const express = require('express');
const { PORT, NODE_ENV } = require('./config');
const { connectRedis } = require('./store/redisClient');
const { connectDB } = require('./db/index');
const logger = require('./utils/logger');
const rateLimitMiddleware = require('./middleware/rateLimitMiddleware');
const rateLimitRoutes = require('./routes/rateLimitRoutes');
const { connectKafka, disconnectKafka } = require('./events/kafkaProducer');

const app = express();

app.use(express.json());
app.use(rateLimitMiddleware);
app.use('/api', rateLimitRoutes);

app.use((err, req, res, next) => {
    logger.error('Unhandled error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
});

// connect to redis, postgres, and kafka before starting the server
const startServer = async () => {
    await connectRedis();
    await connectDB();
    await connectKafka();

    app.listen(PORT, '0.0.0.0', () => {
        logger.info(`Server running on port ${PORT} [${NODE_ENV}]`);
    });
};

process.on('SIGTERM', async () => {
    await disconnectKafka();
    process.exit(0);
});

if (require.main === module) {
    startServer();
}

module.exports = app;
