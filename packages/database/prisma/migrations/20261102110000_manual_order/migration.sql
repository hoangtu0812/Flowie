ALTER TABLE "projects" ADD COLUMN "manual_order" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "issues" ADD COLUMN "manual_order" BIGINT NOT NULL DEFAULT 0;

-- Backfill stable logical positions without altering business dates or relationships.
-- VI: Điền vị trí logic ổn định, không thay đổi ngày nghiệp vụ hoặc quan hệ.
WITH ranked AS (
 SELECT id, row_number() OVER (PARTITION BY workspace_id ORDER BY created_at, id) * 1024 AS position
 FROM projects
)
UPDATE projects SET manual_order=ranked.position FROM ranked WHERE projects.id=ranked.id;
WITH ranked AS (
 SELECT id, row_number() OVER (PARTITION BY workspace_id, parent_issue_id ORDER BY created_at, id) * 1024 AS position
 FROM issues
)
UPDATE issues SET manual_order=ranked.position FROM ranked WHERE issues.id=ranked.id;
CREATE INDEX "projects_workspace_id_manual_order_id_idx" ON "projects"("workspace_id", "manual_order", "id");
CREATE INDEX "issues_workspace_id_manual_order_id_idx" ON "issues"("workspace_id", "manual_order", "id");
