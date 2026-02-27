---
description: Adds a new Express API endpoint with input validation, rate limit middleware, Prometheus instrumentation, and Winston logging.
---

I need to add a new Express API endpoint.

Steps to follow:
1. Add the route in /src/routes/
2. Add input validation — reject requests missing required fields with a 400 error and clear message
3. Add the rate limit middleware to the route
4. Return consistent response shape: { allowed, remaining, resetAt, error? }
5. Add Prometheus counter/histogram instrumentation for this endpoint
6. Log the request result using Winston structured JSON
7. Do not touch any algorithm files — only routing and middleware layers