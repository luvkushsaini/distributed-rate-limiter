# Distributed Rate Limiter

This is a rate limiting API I built to learn how services like Stripe and GitHub limit how many requests a user can make. It uses a **fixed window counter** stored in Redis — every request increments a counter, and if the count goes over the limit within the time window, it returns a `429 Too Many Requests`.

When someone gets rate limited, two things happen:
1. A **Kafka event** gets published to the `rate-limit-events` topic (so other services could react to it)
2. The decision gets **logged in PostgreSQL** in the `rate_limit_logs` table

## How the fixed window algorithm works

```
User sends request
        |
   Redis INCR on key "fixed:{user}:{endpoint}"
        |
   count <= limit?  -->  yes: return { allowed: true, remaining: limit - count }
        |
       no: return { allowed: false, remaining: 0 }
```

If Redis is down, the request goes through anyway so users don't get locked out because of an infrastructure issue.

## Tech stack

- **Express** — handles HTTP requests (port 3000)
- **Redis** — stores the request counters with TTL-based expiry
- **PostgreSQL** — `rate_limit_rules` and `rate_limit_logs` tables
- **KafkaJS** — publishes blocked request events (optional, set `KAFKA_ENABLED=true`)
- **Winston** — structured JSON logging
- **Jest + Supertest** — unit and integration tests
- **Docker Compose** — spins up Redis and Kafka locally
- **GitHub Actions** — runs tests and builds Docker image on every push

## Running it

```bash
npm install
cp .env.example .env         # edit with your redis/postgres credentials
docker-compose up -d          # starts redis + kafka
npm run migrate               # creates the postgres tables
npm run dev                   # server starts on http://localhost:3000
```

## API endpoints

| Method | Endpoint | What it does |
|--------|----------|--------------|
| `POST` | `/api/check` | Check if a user is within their rate limit |
| `GET`  | `/api/rules` | Get all saved rate limit rules |
| `POST` | `/api/rules` | Save a new rate limit rule |
| `GET`  | `/api/health` | Returns server status and redis connection |

### Example — checking a rate limit

```bash
curl -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{ "identifier": "user_123", "limit": 10, "windowMs": 60000 }'
```

Response when allowed:
```json
{ "allowed": true, "remaining": 9, "limit": 10, "windowSeconds": 60, "resetAt": 1709567460, "algorithm": "fixed-window" }
```

Response when blocked:
```json
{ "allowed": false, "remaining": 0, "limit": 10, "windowSeconds": 60, "resetAt": 1709567460, "algorithm": "fixed-window" }
```

## Testing

```bash
npm test
```

- **fixedWindow.test.js** — tests the algorithm logic (allow, block, redis failure, separate users)
- **integration.test.js** — sends real HTTP requests through Express with mocked Redis/Kafka/Postgres
- **kafkaProducer.test.js** — makes sure events don't get published when Kafka is off or disconnected
