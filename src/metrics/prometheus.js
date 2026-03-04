const promClient = require('prom-client');

/**
 * Collects default Node.js metrics (event loop lag, GC, memory, etc.)
 */
promClient.collectDefaultMetrics();

/**
 * Counter — total requests processed, labelled by algorithm and status.
 */
const requestsTotal = new promClient.Counter({
    name: 'rate_limiter_requests_total',
    help: 'Total number of rate limit check requests',
    labelNames: ['algorithm', 'status'],
});

/**
 * Counter — total blocked requests, labelled by algorithm.
 */
const blockedTotal = new promClient.Counter({
    name: 'rate_limiter_blocked_total',
    help: 'Total number of blocked (rate-limited) requests',
    labelNames: ['algorithm'],
});

/**
 * Histogram — latency of rate limit checks in milliseconds.
 */
const latencyHistogram = new promClient.Histogram({
    name: 'rate_limiter_latency_ms',
    help: 'Latency of rate limit check in milliseconds',
    labelNames: ['algorithm'],
    buckets: [1, 2, 5, 10, 25, 50, 100],
});

/**
 * Gauge — number of currently active rate limit keys.
 */
const activeKeysGauge = new promClient.Gauge({
    name: 'rate_limiter_active_keys',
    help: 'Number of active rate limit keys',
});

module.exports = {
    promClient,
    requestsTotal,
    blockedTotal,
    latencyHistogram,
    activeKeysGauge,
};
