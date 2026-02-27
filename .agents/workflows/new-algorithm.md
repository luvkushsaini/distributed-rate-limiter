---
description: Implements a new rate limiting algorithm from scratch with Redis, Lua script for atomicity, and unit tests. Use when adding Fixed Window, Sliding Window, or Token Bucket.
---

I need to implement a new rate limiting algorithm. 

Steps to follow:
1. Create the file at /src/algorithms/[algorithmName].js
2. Implement the core logic using Redis. If the operation needs to be atomic (check + increment), write it as a Lua script inside the file.
3. Export a single function: checkLimit(identifier, config) that returns { allowed: boolean, remaining: number, resetAt: timestamp }
4. Create a corresponding test file at /tests/[algorithmName].test.js with at least 5 unit tests covering: normal allow, limit exceeded, edge case at exact limit, multiple identifiers, and TTL expiry behavior.
5. Add a JSDoc comment to every function.
6. Do NOT install any new npm packages without asking me first.