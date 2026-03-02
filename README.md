# Distributed Rate Limiter as a Service

A production-grade distributed rate limiting service built from scratch.

## Tech Stack
- Node.js + Express
- Redis (rate limit store)
- PostgreSQL (rules and audit logs)
- Prometheus + Grafana (observability)
- Docker + AWS (deployment)

## Algorithm Tradeoffs

Three algorithms are implemented. Each one solves a different problem.

### Fixed Window

Simplest implementation — one Redis counter per user per endpoint. Resets at fixed clock boundaries (every 60 seconds).

**The problem:** boundary bursting. A user can fire 100 requests at `11:00:58` and another 100 at `11:01:02`. Both land in separate windows, so both are allowed — effectively doubling the intended limit.

**When to use:** situations where simplicity matters more than perfect accuracy. Internal health checks, low-risk endpoints, anything where occasional bursts won't cause real damage.

---

### Sliding Window Log

Tracks the exact timestamp of every request in a Redis sorted set. The window always covers the last *N* seconds from the current moment — no fixed boundary.

This eliminates the boundary burst problem entirely. The window slides with time, so there's no seam to exploit.

**The cost:** memory. Every request timestamp is stored individually instead of a single counter. At high traffic this adds up.

**Atomicity:** all Redis operations (prune old entries → count → insert) run inside a single Lua script. Two simultaneous requests can't both read the same count and both squeeze through.

**When to use:** endpoints where fair, accurate limiting matters. Search APIs, public-facing routes, anything where a burst could degrade the experience for other users.

---

### Token Bucket

Stores two values per user — current token count and last refill time. Tokens refill at a constant rate. Each request costs one token.

The key difference: idle users accumulate tokens. Someone who hasn't hit the API in five minutes has a full bucket and can legitimately burst. This matches how real traffic works — APIs get hit in batches, not at perfectly even intervals.

**The math:**
```
newTokens = timePassed × refillRate
currentTokens = min(previousTokens + newTokens, capacity)
```

**When to use:** endpoints where occasional bursting is expected and acceptable. Data export endpoints, batch operations, anything where users naturally send requests in clusters.

---

### Quick Comparison

| | Fixed Window | Sliding Window | Token Bucket |
|---|---|---|---|
| **Memory** | Very low (1 counter) | Higher (1 entry per request) | Low (2 values) |
| **Burst handling** | Poor (boundary exploit) | Strict (no bursting) | Good (controlled bursting) |
| **Accuracy** | Approximate | Exact | Smooth average |
| **Complexity** | Trivial | Needs Lua for atomicity | Moderate |
| **Redis structure** | `String` (INCR) | `Sorted Set` (ZADD/ZCARD) | `Hash` (HSET/HGET) |

## Status
🚧 Currently in development

## Setup
Coming soon.
