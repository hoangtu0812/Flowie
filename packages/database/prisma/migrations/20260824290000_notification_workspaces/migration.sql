-- Scope every notification to the workspace that owns its entity. Existing
-- issue/project notifications can be backfilled without trusting JSON data.
ALTER TABLE "notifications" ADD COLUMN "workspace_id" TEXT;

UPDATE "notifications" AS "notification"
SET "workspace_id" = "issue"."workspace_id"
FROM "issues" AS "issue"
WHERE "notification"."entity_type" = 'issue'
  AND "notification"."entity_id" = "issue"."id";

UPDATE "notifications" AS "notification"
SET "workspace_id" = "project"."workspace_id"
FROM "projects" AS "project"
WHERE "notification"."entity_type" = 'project'
  AND "notification"."entity_id" = "project"."id";

-- Unknown/orphaned legacy rows cannot be scoped safely and must not remain
-- visible after multi-workspace isolation is enabled.
DELETE FROM "notifications" WHERE "workspace_id" IS NULL;

ALTER TABLE "notifications" ALTER COLUMN "workspace_id" SET NOT NULL;

CREATE INDEX "notifications_workspace_id_user_id_read_at_created_at_idx"
ON "notifications"("workspace_id", "user_id", "read_at", "created_at");

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
