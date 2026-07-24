-- ─────────────────────────────────────────────────────────────
-- Flowie · 0004 · Worklog & Timesheet (Module 3.3)
-- ─────────────────────────────────────────────────────────────

CREATE TYPE worklog_state AS ENUM ('draft', 'submitted', 'approved', 'rejected');

CREATE TABLE worklogs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    minutes    INTEGER NOT NULL CHECK (minutes > 0),
    note       TEXT NOT NULL DEFAULT '',
    logged_on  DATE NOT NULL DEFAULT CURRENT_DATE,
    source     TEXT NOT NULL DEFAULT 'manual',  -- manual | timer
    state      worklog_state NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_worklogs_task ON worklogs(task_id);
CREATE INDEX idx_worklogs_user_date ON worklogs(user_id, logged_on);

-- Rate lương theo giờ để tính chi phí dự án (Module 5.3).
CREATE TABLE user_rates (
    user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    hourly_rate  NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency     TEXT NOT NULL DEFAULT 'USD',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
