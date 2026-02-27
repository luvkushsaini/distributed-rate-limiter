/**
 * Rate limit middleware
 * Checks rate limit before every request reaches the route handler
 * Uses Fixed Window algorithm with Redis
 * Fail-open: if rate limiting fails, request is allowed through
 *
 * Identifier extraction priority:
 * 1. x-api-key header (API key authentication)
 * 2. x-user-id header (user ID authentication)
 * 3. req.ip (IP address fallback)
 */
const { checkFixedWindow } = require('../algorithms/fixedWindow');
const rateLimitConfig = require('../config/rateLimitConfig');
const logger = require('../utils/logger');

/**
 * Extract the client identifier from the request
 * Priority: x-api-key > x-user-id > req.ip
 *
 * @param {Object} req - Express request object
 * @returns {string} The identifier to use for rate limiting
 */
const extractIdentifier = (req) => {
    return req.headers['x-api-key'] || req.headers['x-user-id'] || req.ip;
};

/**
 * Look up the rate limit configuration for a specific endpoint
 * Falls back to default config if no endpoint-specific rule exists
 *
 * @param {string} endpoint - The API endpoint path
 * @returns {Object} Rate limit config with { limit, windowSeconds }
 */
const getConfigForEndpoint = (endpoint) => {
    return rateLimitConfig.endpoints[endpoint] || rateLimitConfig.default;
};

/**
 * Express middleware that enforces rate limits on every request
 * Sets X-RateLimit headers on every response (allowed or blocked)
 * Returns 429 Too Many Requests when the limit is exceeded
 * Uses fail-open strategy: if anything fails, the request is allowed through
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const rateLimitMiddleware = async (req, res, next) => {
    try {
        // Step 1: Extract the identifier from the request
        const identifier = extractIdentifier(req);

        // Step 2: Get the endpoint from the request path
        const endpoint = req.path;

        // Step 3: Look up the rate limit config for this endpoint
        const config = getConfigForEndpoint(endpoint);

        // Step 4: Check the rate limit using Fixed Window algorithm
        const result = await checkFixedWindow(identifier, endpoint, config);

        // Step 5: Set rate limit headers on EVERY response (allowed or blocked)
        // These headers are an industry standard (RFC 6585 / IETF draft)
        res.set({
            'X-RateLimit-Limit': result.limit,
            'X-RateLimit-Remaining': result.remaining,
            'X-RateLimit-Reset': result.resetAt,
            'X-RateLimit-Algorithm': result.algorithm,
        });

        // Step 6: If allowed, pass the request to the next handler
        if (result.allowed) {
            return next();
        }

        // Step 7: If blocked, return 429 Too Many Requests
        const retryAfter = result.resetAt - Math.floor(Date.now() / 1000);

        // Log the blocked request for monitoring and debugging
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
        // FAIL-OPEN: If anything goes wrong, allow the request through
        // This ensures the rate limiter never takes down the API
        logger.error('Rate limit middleware error — allowing request (fail-open)', {
            error: err.message,
            path: req.path,
        });

        return next();
    }
};

module.exports = rateLimitMiddleware;
