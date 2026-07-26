-- ─────────────────────────────────────────────────────────────
-- Flowie · 0025 · Human-readable task numbers (Module 6.3)
-- ─────────────────────────────────────────────────────────────

-- Tasks were only addressable by UUID, which is unusable in a commit message.
-- This adds a per-project counter so a task can be referenced as "SAP-12".
ALTER TABLE tasks ADD COLUMN number INTEGER;

-- Backfill in creation order, per project.
WITH numbered AS (
    SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS n
    FROM tasks
)
UPDATE tasks t SET number = numbered.n
FROM numbered WHERE numbered.id = t.id;

CREATE UNIQUE INDEX idx_tasks_project_number ON tasks(project_id, number);

-- Assign the next number automatically on insert.
CREATE OR REPLACE FUNCTION assign_task_number() RETURNS trigger AS $$
BEGIN
    IF NEW.number IS NULL THEN
        SELECT COALESCE(MAX(number), 0) + 1 INTO NEW.number
        FROM tasks WHERE project_id = NEW.project_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_task_number
    BEFORE INSERT ON tasks
    FOR EACH ROW EXECUTE FUNCTION assign_task_number();
