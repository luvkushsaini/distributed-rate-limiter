const express = require('express');
const router = express.Router();
const { checkFixedWindow } = require('../algorithms/fixedWindow');
const { checkSlidingWindow } = require('../algorithms/slidingWindow');
const { checkTokenBucket } = require('../algorithms/tokenBucket');
const { query } = require('../db');
const logger = require('../utils/logger');

/**
 * @description Picks the right algorithm handler based on the request body
 */
const selectAlgorithm = async (identifier, endpoint, body) => {
    const { algorithm, limit, windowMs, capacity, refillRate } = body;

    switch (algorithm) {
        case 'fixed':
            return await checkFixedWindow(identifier, endpoint, {
                limit,
                windowSeconds: Math.ceil(windowMs / 1000),
            });
        case 'token':
            return await checkTokenBucket(identifier, endpoint, {
                capacity,
                refillRate,
            });
        case 'sliding':
        default:
            return await checkSlidingWindow(identifier, endpoint, {
                limit,
                windowSeconds: Math.ceil(windowMs / 1000),
            });
    }
};

router.post('/check', async (req, res) => {
    try {
        const { identifier, algorithm, limit, windowMs, capacity, refillRate } = req.body;

        if (!identifier) {
            return res.status(400).json({ error: 'identifier is required' });
        }

        const endpoint = req.body.endpoint || '/api/check';
        const result = await selectAlgorithm(identifier, endpoint, req.body);

        if (!result.allowed) {
            await query(
                'INSERT INTO blocked_requests (identifier, algorithm, endpoint) VALUES ($1, $2, $3)',
                [identifier, algorithm || 'sliding', endpoint]
            ).catch(err => logger.error('Failed to log blocked request', { error: err.message }));
        }

        return res.status(200).json(result);
    } catch (err) {
        logger.error('Error in /check endpoint', { error: err.message });
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/rules', async (req, res) => {
    try {
        const result = await query('SELECT * FROM rate_limit_rules ORDER BY created_at DESC');
        return res.status(200).json(result.rows);
    } catch (err) {
        logger.error('Error fetching rules', { error: err.message });
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/rules', async (req, res) => {
    try {
        const { identifier, algorithm, limit_count, window_ms } = req.body;

        if (!algorithm || !limit_count || !window_ms) {
            return res.status(400).json({ error: 'algorithm, limit_count, and window_ms are required' });
        }

        const result = await query(
            'INSERT INTO rate_limit_rules (identifier, algorithm, limit_count, window_ms) VALUES ($1, $2, $3, $4) RETURNING *',
            [identifier || 'global', algorithm, limit_count, window_ms]
        );

        return res.status(201).json(result.rows[0]);
    } catch (err) {
        logger.error('Error creating rule', { error: err.message });
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/health', (req, res) => {
    const { isRedisConnected } = require('../store/redisClient');
    res.status(200).json({
        status: 'ok',
        redis: isRedisConnected() ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
