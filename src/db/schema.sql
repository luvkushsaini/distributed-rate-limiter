CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS rate_limit_rules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier   VARCHAR(255),
    algorithm    VARCHAR(20) NOT NULL DEFAULT 'sliding',
    limit_count  INTEGER NOT NULL,
    window_ms    INTEGER NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blocked_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier   VARCHAR(255),
    algorithm    VARCHAR(20),
    endpoint     VARCHAR(255),
    blocked_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rules_identifier ON rate_limit_rules(identifier);
CREATE INDEX IF NOT EXISTS idx_blocked_identifier ON blocked_requests(identifier);