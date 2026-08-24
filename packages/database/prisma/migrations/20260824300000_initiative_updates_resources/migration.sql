CREATE TABLE "initiative_updates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "initiative_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "health" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "initiative_updates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "initiative_resources" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "initiative_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "initiative_resources_pkey" PRIMARY KEY ("id")
);

INSERT INTO "initiative_updates" (
    "id", "workspace_id", "initiative_id", "author_id", "body", "health", "created_at", "updated_at"
)
SELECT
    audit."id",
    audit."workspace_id",
    audit."entity_id",
    audit."actor_id",
    audit."metadata"->>'body',
    COALESCE(audit."metadata"->>'health', initiative."health"),
    audit."created_at",
    audit."created_at"
FROM "audit_logs" audit
JOIN "initiatives" initiative ON initiative."id" = audit."entity_id"
JOIN "users" author ON author."id" = audit."actor_id"
WHERE audit."action" = 'initiative.update.posted'
  AND initiative."workspace_id" = audit."workspace_id"
  AND audit."workspace_id" IS NOT NULL
  AND audit."entity_id" IS NOT NULL
  AND audit."actor_id" IS NOT NULL
  AND NULLIF(BTRIM(audit."metadata"->>'body'), '') IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "initiative_resources" (
    "id", "workspace_id", "initiative_id", "created_by", "label", "url", "created_at", "updated_at"
)
SELECT
    audit."id",
    audit."workspace_id",
    audit."entity_id",
    audit."actor_id",
    audit."metadata"->>'label',
    audit."metadata"->>'url',
    audit."created_at",
    audit."created_at"
FROM "audit_logs" audit
JOIN "initiatives" initiative ON initiative."id" = audit."entity_id"
JOIN "users" creator ON creator."id" = audit."actor_id"
WHERE audit."action" = 'initiative.resource.added'
  AND initiative."workspace_id" = audit."workspace_id"
  AND audit."workspace_id" IS NOT NULL
  AND audit."entity_id" IS NOT NULL
  AND audit."actor_id" IS NOT NULL
  AND NULLIF(BTRIM(audit."metadata"->>'label'), '') IS NOT NULL
  AND NULLIF(BTRIM(audit."metadata"->>'url'), '') IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

CREATE INDEX "initiative_updates_initiative_id_created_at_idx" ON "initiative_updates"("initiative_id", "created_at");
CREATE INDEX "initiative_updates_workspace_id_created_at_idx" ON "initiative_updates"("workspace_id", "created_at");
CREATE INDEX "initiative_resources_initiative_id_created_at_idx" ON "initiative_resources"("initiative_id", "created_at");
CREATE INDEX "initiative_resources_workspace_id_created_at_idx" ON "initiative_resources"("workspace_id", "created_at");

ALTER TABLE "initiative_updates"
ADD CONSTRAINT "initiative_updates_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "initiative_updates"
ADD CONSTRAINT "initiative_updates_initiative_id_fkey"
FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "initiative_updates"
ADD CONSTRAINT "initiative_updates_author_id_fkey"
FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "initiative_resources"
ADD CONSTRAINT "initiative_resources_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "initiative_resources"
ADD CONSTRAINT "initiative_resources_initiative_id_fkey"
FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "initiative_resources"
ADD CONSTRAINT "initiative_resources_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
