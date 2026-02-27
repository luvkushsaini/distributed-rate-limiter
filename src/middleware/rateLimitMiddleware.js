/**
 * Rate limit middleware
 *
 * Fail-open: if rate limiting fails, request is allowed through.
 * Identifier priority: x-api-key > x-user-id > req.ip
 */
const { checkFixedWindow } = require('../algorithms/fixedWindow');
const rateLimitConfig = require('../config/rateLimitConfig');
const logger = require('../utils/logger');

/**
 * Extract the client identifier from the request
 *
 * @param {Object} req - Express request object
 * @returns {string} The identifier to use for rate limiting
 */
const extractIdentifier = (req) => {
    return req.headers['x-api-key'] || req.headers['x-user-id'] || req.ip;
};

/**
 * Look up the rate limit config for a specific endpoint
 *
 * @param {string} endpoint - The API endpoint path
 * @returns {Object} Rate limit config with { limit, windowSeconds }
 */
const getConfigForEndpoint = (endpoint) => {
    return rateLimitConfig.endpoints[endpoint] || rateLimitConfig.default;
};

/**
 * Express middleware that enforces rate limits on every request
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const rateLimitMiddleware = async (req, res, next) => {
    try {
        const identifier = extractIdentifier(req);
        const endpoint = req.path;
        const config = getConfigForEndpoint(endpoint);
        const result = await checkFixedWindow(identifier, endpoint, config);

        // Headers follow IETF draft standard for rate limiting
        res.set({
            'X-RateLimit-Limit': result.limit,
            'X-RateLimit-Remaining': result.remaining,
            'X-RateLimit-Reset': result.resetAt,
            'X-RateLimit-Algorithm': result.algorithm,
        });

        if (result.allowed) {
            return next();
        }

        const retryAfter = result.resetAt - Math.floor(Date.now() / 1000);

        logger.warn('Rate limit exceeded', {
            identifier,
            endpoint,
            limit: result.limit,
            resetAt: result.resetAt,
        });

        return res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Try again after resetAt.',
            remaining: 0,
            resetAt: result.resetAt,
            retryAfter,
        });
    } catch (err) {
        // Fail-open: never let the rate limiter take down the API
        logger.error('Rate limit middleware error — allowing request (fail-open)', {
            error: err.message,
            path: req.path,
        });

        return next();
    }
};

module.exports = rateLimitMiddleware;
