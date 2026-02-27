/**
 * Rate limit API routes
 * Provides endpoints for manual rate limit checking, resetting, and config viewing
 */
const express = require('express');
const router = express.Router();
const { checkFixedWindow, resetLimit } = require('../algorithms/fixedWindow');
const rateLimitConfig = require('../config/rateLimitConfig');
const logger = require('../utils/logger');

/**
 * POST /api/check-rate-limit
 * Manually check the rate limit for a specific userId and endpoint
 * Useful for clients to check before making the actual request
 *
 * @param {Object} req.body - { userId: string, endpoint: string }
 * @returns {Object} Rate limit result with allowed, remaining, resetAt, etc.
 */
router.post('/check-rate-limit', async (req, res) => {
    try {
        const { userId, endpoint } = req.body;

        // Validate required fields
        if (!userId || !endpoint) {
            return res.status(400).json({
                error: 'userId and endpoint are required',
            });
        }

        // Look up config for the requested endpoint
        const config = rateLimitConfig.endpoints[endpoint] || rateLimitConfig.default;

        // Check the rate limit
        const result = await checkFixedWindow(userId, endpoint, config);

        logger.info('Manual rate limit check', {
            userId,
            endpoint,
            allowed: result.allowed,
            remaining: result.remaining,
        });

        return res.status(200).json(result);
    } catch (err) {
        logger.error('Error in check-rate-limit endpoint', {
            error: err.message,
        });

        return res.status(500).json({
            error: 'Internal server error',
            message: err.message,
        });
    }
});

/**
 * DELETE /api/reset-limit
 * Reset the rate limit counter for a specific userId and endpoint
 * Used for testing and admin operations only
 *
 * @param {Object} req.body - { userId: string, endpoint: string }
 * @returns {Object} { success: boolean, message: string }
 */
router.delete('/reset-limit', async (req, res) => {
    try {
        const { userId, endpoint } = req.body;

        // Validate required fields
        if (!userId || !endpoint) {
            return res.status(400).json({
                error: 'userId and endpoint are required',
            });
        }

        // Reset the rate limit counter
        const deleted = await resetLimit(userId, endpoint);

        logger.info('Rate limit reset requested', {
            userId,
            endpoint,
            deleted,
        });

        return res.status(200).json({
            success: true,
            message: `Rate limit reset for ${userId} on ${endpoint}`,
        });
    } catch (err) {
        logger.error('Error in reset-limit endpoint', {
            error: err.message,
        });

        return res.status(500).json({
            error: 'Internal server error',
            message: err.message,
        });
    }
});

/**
 * GET /api/limit-config
 * Returns the current rate limit configuration
 * Useful for clients to know their limits before hitting them
 *
 * @returns {Object} The full rate limit configuration object
 */
router.get('/limit-config', (req, res) => {
    try {
        logger.info('Rate limit config requested');

        return res.status(200).json(rateLimitConfig);
    } catch (err) {
        logger.error('Error in limit-config endpoint', {
            error: err.message,
        });

        return res.status(500).json({
            error: 'Internal server error',
            message: err.message,
        });
    }
});

module.exports = router;
