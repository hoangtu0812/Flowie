CREATE TABLE "workspace_emojis" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_emojis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_emojis_object_key_key" ON "workspace_emojis"("object_key");
CREATE UNIQUE INDEX "workspace_emojis_workspace_id_name_key" ON "workspace_emojis"("workspace_id", "name");
CREATE INDEX "workspace_emojis_workspace_id_archived_at_idx" ON "workspace_emojis"("workspace_id", "archived_at");

ALTER TABLE "workspace_emojis"
ADD CONSTRAINT "workspace_emojis_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_emojis"
ADD CONSTRAINT "workspace_emojis_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
