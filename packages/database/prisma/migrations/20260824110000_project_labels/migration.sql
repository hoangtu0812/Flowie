CREATE TABLE "project_labels" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_labels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_labels_workspace_id_name_key"
ON "project_labels"("workspace_id", "name");

CREATE INDEX "project_labels_workspace_id_idx"
ON "project_labels"("workspace_id");

ALTER TABLE "project_labels"
ADD CONSTRAINT "project_labels_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "project_label_links" (
    "project_id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_label_links_pkey" PRIMARY KEY ("project_id", "label_id")
);

CREATE INDEX "project_label_links_label_id_idx"
ON "project_label_links"("label_id");

ALTER TABLE "project_label_links"
ADD CONSTRAINT "project_label_links_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_label_links"
ADD CONSTRAINT "project_label_links_label_id_fkey"
FOREIGN KEY ("label_id") REFERENCES "project_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
