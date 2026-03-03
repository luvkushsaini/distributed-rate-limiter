const { checkFixedWindow } = require('../algorithms/fixedWindow');
const { checkSlidingWindow } = require('../algorithms/slidingWindow');
const { checkTokenBucket } = require("../algorithms/tokenBucket")
const rateLimitConfig = require('../config/rateLimitConfig');
const logger = require('../utils/logger');

/**
 * Pull a client identifier from the request — API key, user ID, or IP.
 */
const extractIdentifier = (req) => {
    return req.headers['x-api-key'] || req.headers['x-user-id'] || req.ip;
};

/**
 * Get the rate limit config for a given endpoint, falling back to defaults.
 */
const getConfigForEndpoint = (endpoint) => {
    return rateLimitConfig.endpoints[endpoint] || rateLimitConfig.default;
};

/**
 * Pick the right algorithm function based on the config's `algorithm` field.
 */
const algorithmHandlers = {
    'fixed-window': checkFixedWindow,
    'sliding-window': checkSlidingWindow,
    'token-bucket': checkTokenBucket,
};

/**
 * Express middleware — enforces rate limits using the configured algorithm.
 */
const rateLimitMiddleware = async (req, res, next) => {
    try {
        const identifier = extractIdentifier(req);
        const endpoint = req.path;
        const config = getConfigForEndpoint(endpoint);

        const algorithm = config.algorithm || 'fixed-window';
        const handler = algorithmHandlers[algorithm] || checkFixedWindow;
        const result = await handler(identifier, endpoint, config);

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
            identifier, endpoint, limit: result.limit, resetAt: result.resetAt,
        });

        return res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Try again after resetAt.',
            remaining: 0,
            resetAt: result.resetAt,
            retryAfter,
        });
    } catch (err) {
        logger.error('Rate limit middleware error — allowing request (fail-open)', {
            error: err.message, path: req.path,
        });
        return next();
    }
};

module.exports = rateLimitMiddleware;
