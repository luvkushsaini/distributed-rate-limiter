const { checkFixedWindow } = require('../algorithms/fixedWindow');
const logger = require('../utils/logger');

// figure out who's making the request
const extractIdentifier = (req) => {
    return req.headers['x-api-key'] || req.headers['x-user-id'] || req.ip;
};

// rate limit middleware - skip /check and /health since they handle their own logic
const rateLimitMiddleware = async (req, res, next) => {
    if (req.path === '/check' || req.path === '/health') {
        return next();
    }

    try {
        const identifier = extractIdentifier(req);
        const result = await checkFixedWindow(identifier, req.path, {
            limit: 100,
            windowSeconds: 60,
        });

        res.set({
            'X-RateLimit-Limit':     result.limit,
            'X-RateLimit-Remaining': result.remaining,
            'X-RateLimit-Reset':     result.resetAt,
        });

        if (result.allowed) return next();

        logger.warn('Rate limit exceeded', { identifier, path: req.path });

        return res.status(429).json({
            error:      'Too Many Requests',
            remaining:  0,
            resetAt:    result.resetAt,
            retryAfter: result.resetAt - Math.floor(Date.now() / 1000),
        });
    } catch (err) {
        // if something goes wrong, let the request through anyway
        logger.error('Middleware error', { error: err.message });
        return next();
    }
};

module.exports = rateLimitMiddleware;
