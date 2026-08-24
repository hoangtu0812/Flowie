CREATE TABLE "project_statuses" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_statuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_statuses_workspace_id_name_key"
ON "project_statuses"("workspace_id", "name");

CREATE INDEX "project_statuses_workspace_id_category_position_idx"
ON "project_statuses"("workspace_id", "category", "position");

ALTER TABLE "project_statuses"
ADD CONSTRAINT "project_statuses_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "project_statuses" ("id", "workspace_id", "name", "category", "color", "position")
SELECT
    'ps_' || md5(w."id" || defaults."name"),
    w."id",
    defaults."name",
    defaults."category",
    defaults."color",
    defaults."position"
FROM "workspaces" w
CROSS JOIN (VALUES
    ('backlog', 'backlog', '#95a2b3', 0),
    ('planned', 'planned', '#95a2b3', 0),
    ('in-progress', 'in-progress', '#f2c94c', 0),
    ('completed', 'completed', '#5e6ad2', 0),
    ('canceled', 'canceled', '#8f9299', 0)
) AS defaults("name", "category", "color", "position")
ON CONFLICT ("workspace_id", "name") DO NOTHING;

INSERT INTO "project_statuses" ("id", "workspace_id", "name", "category", "color", "position")
SELECT
    'ps_' || md5(p."workspace_id" || p."status"),
    p."workspace_id",
    p."status",
    CASE
        WHEN lower(p."status") IN ('backlog', 'triage') THEN 'backlog'
        WHEN lower(p."status") IN ('completed', 'done') THEN 'completed'
        WHEN lower(p."status") IN ('canceled', 'cancelled') THEN 'canceled'
        WHEN lower(p."status") IN ('active', 'started', 'in-progress') THEN 'in-progress'
        ELSE 'planned'
    END,
    CASE
        WHEN lower(p."status") IN ('completed', 'done') THEN '#5e6ad2'
        WHEN lower(p."status") IN ('active', 'started', 'in-progress') THEN '#f2c94c'
        ELSE '#95a2b3'
    END,
    10
FROM "projects" p
GROUP BY p."workspace_id", p."status"
ON CONFLICT ("workspace_id", "name") DO NOTHING;
