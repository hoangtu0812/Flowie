-- Notifications had only task_id, so a chat mention had nowhere to point and a
-- task notification still needed a lookup to find its project. `link` stores
-- the frontend path to open, computed when the notification is written.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link TEXT NOT NULL DEFAULT '';

-- Backfill task notifications so existing rows become clickable too.
UPDATE notifications n
SET link = '/projects/' || t.project_id || '?task=' || n.task_id
FROM tasks t
WHERE n.task_id = t.id AND n.link = '';
