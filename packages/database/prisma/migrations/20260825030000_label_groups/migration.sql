CREATE TABLE "label_groups" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "label_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "label_groups_workspace_id_name_key"
ON "label_groups"("workspace_id", "name");

CREATE INDEX "label_groups_workspace_id_idx"
ON "label_groups"("workspace_id");

ALTER TABLE "label_groups"
ADD CONSTRAINT "label_groups_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "labels" ADD COLUMN "group_id" TEXT;

CREATE INDEX "labels_group_id_idx" ON "labels"("group_id");

ALTER TABLE "labels"
ADD CONSTRAINT "labels_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "label_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
