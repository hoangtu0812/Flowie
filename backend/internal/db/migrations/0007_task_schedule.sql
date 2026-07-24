-- ─────────────────────────────────────────────────────────────
-- Flowie · 0007 · Lịch theo giờ (hourly scheduling)
-- start_at/end_at cho phép đặt task vào khung giờ cụ thể (calendar week/day).
-- start_date/due_date (DATE) vẫn giữ cho planning/Gantt/timesheet.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE tasks ADD COLUMN start_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN end_at   TIMESTAMPTZ;

CREATE INDEX idx_tasks_start_at ON tasks(start_at) WHERE start_at IS NOT NULL;
