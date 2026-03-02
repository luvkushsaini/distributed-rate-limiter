/**
 * Rate limit API routes — manual check, reset, and config viewing.
 */
const express = require('express');
const router = express.Router();
const { checkFixedWindow, resetLimit: resetFixed } = require('../algorithms/fixedWindow');
const { checkSlidingWindow, resetLimit: resetSliding } = require('../algorithms/slidingWindow');
const { checkTokenBucket, resetLimit: resetToken } = require('../algorithms/tokenBucket');
const rateLimitConfig = require('../config/rateLimitConfig');
const logger = require('../utils/logger');

const algorithmHandlers = {
    'fixed-window': { check: checkFixedWindow, reset: resetFixed },
    'sliding-window': { check: checkSlidingWindow, reset: resetSliding },
    'token-bucket': { check: checkTokenBucket, reset: resetToken },
};

/**
 * POST /api/check-rate-limit
 * Manually check rate limit for a userId + endpoint combo.
 */
router.post('/check-rate-limit', async (req, res) => {
    try {
        const { userId, endpoint } = req.body;

        if (!userId || !endpoint) {
            return res.status(400).json({ error: 'userId and endpoint are required' });
        }

        const config = rateLimitConfig.endpoints[endpoint] || rateLimitConfig.default;
        const algorithm = config.algorithm || 'fixed-window';
        const handler = algorithmHandlers[algorithm] || algorithmHandlers['fixed-window'];
        const result = await handler.check(userId, endpoint, config);

        logger.info('Manual rate limit check', {
            userId, endpoint, allowed: result.allowed, remaining: result.remaining,
        });

        return res.status(200).json(result);
    } catch (err) {
        logger.error('Error in check-rate-limit endpoint', { error: err.message });
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

/**
 * DELETE /api/reset-limit
 * Reset the rate limit counter for a userId + endpoint.
 */
router.delete('/reset-limit', async (req, res) => {
    try {
        const { userId, endpoint } = req.body;

        if (!userId || !endpoint) {
            return res.status(400).json({ error: 'userId and endpoint are required' });
        }

        const config = rateLimitConfig.endpoints[endpoint] || rateLimitConfig.default;
        const algorithm = config.algorithm || 'fixed-window';
        const handler = algorithmHandlers[algorithm] || algorithmHandlers['fixed-window'];
        const deleted = await handler.reset(userId, endpoint);

        logger.info('Rate limit reset requested', { userId, endpoint, deleted });

        return res.status(200).json({
            success: true,
            message: `Rate limit reset for ${userId} on ${endpoint}`,
        });
    } catch (err) {
        logger.error('Error in reset-limit endpoint', { error: err.message });
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

/**
 * GET /api/limit-config
 * Returns the current rate limit configuration.
 */
router.get('/limit-config', (req, res) => {
    try {
        logger.info('Rate limit config requested');
        return res.status(200).json(rateLimitConfig);
    } catch (err) {
        logger.error('Error in limit-config endpoint', { error: err.message });
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

module.exports = router;
