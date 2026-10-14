ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE auth_rate_limits (key TEXT PRIMARY KEY, window_start TIMESTAMP(3) NOT NULL, count INTEGER NOT NULL DEFAULT 0);
CREATE INDEX auth_rate_limits_window_start_idx ON auth_rate_limits(window_start);
