const express = require('express');
const router = express.Router();
const { checkFixedWindow } = require('../algorithms/fixedWindow');
const { query } = require('../db');
const logger = require('../utils/logger');
const { publishRateLimitEvent } = require('../events/kafkaProducer');

// check if a request should be allowed or blocked
router.post('/check', async (req, res) => {
    try {
        const { identifier, limit, windowMs } = req.body;

        if (!identifier) {
            return res.status(400).json({ error: 'identifier is required' });
        }

        const config = {
            limit:         limit         || 100,
            windowSeconds: windowMs      ? Math.ceil(windowMs / 1000) : 60,
        };

        const endpoint = req.body.endpoint || '/api/check';
        const result   = await checkFixedWindow(identifier, endpoint, config);

        // publish to kafka when someone gets blocked
        if (!result.allowed) {
            await publishRateLimitEvent({
                identifier,
                allowed:   result.allowed,
                remaining: result.remaining,
            });
        }

        // don't fail the request if the audit log doesn't write
        try {
            await query(
                `INSERT INTO rate_limit_logs (identifier, endpoint, algorithm, allowed, remaining)
                 VALUES ($1, $2, $3, $4, $5)`,
                [identifier, endpoint, result.algorithm, result.allowed, result.remaining]
            );
        } catch (dbErr) {
            logger.warn('Audit log write failed', { error: dbErr.message });
        }

        return res.json(result);
    } catch (err) {
        logger.error('Error in /check', { error: err.message });
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// get all the rate limit rules from the database
router.get('/rules', async (req, res) => {
    try {
        const result = await query('SELECT * FROM rate_limit_rules ORDER BY created_at DESC');
        return res.json(result.rows);
    } catch (err) {
        logger.error('Error fetching rules', { error: err.message });
        return res.status(500).json({ error: 'Failed to fetch rules' });
    }
});

// create a new rate limit rule
router.post('/rules', async (req, res) => {
    try {
        const { endpoint, limit, window_seconds } = req.body;

        if (!endpoint || !limit || !window_seconds) {
            return res.status(400).json({ error: 'endpoint, limit, window_seconds are required' });
        }

        const result = await query(
            `INSERT INTO rate_limit_rules (endpoint, limit_count, window_seconds)
             VALUES ($1, $2, $3) RETURNING *`,
            [endpoint, limit, window_seconds]
        );

        return res.status(201).json(result.rows[0]);
    } catch (err) {
        logger.error('Error creating rule', { error: err.message });
        return res.status(500).json({ error: 'Failed to create rule' });
    }
});

// health check - shows if the server and redis are up
router.get('/health', async (req, res) => {
    const { isRedisConnected } = require('../store/redisClient');
    return res.json({
        status:    'ok',
        redis:     isRedisConnected() ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
