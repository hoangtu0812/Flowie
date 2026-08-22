CREATE TABLE "saved_views" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "filters" JSONB NOT NULL DEFAULT '{}',
  "is_shared" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "saved_views_workspace_id_entity_type_idx" ON "saved_views"("workspace_id", "entity_type");
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "initiatives" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "target_date" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "initiatives_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "initiatives_workspace_id_archived_at_idx" ON "initiatives"("workspace_id", "archived_at");
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "initiative_projects" (
  "initiative_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "initiative_projects_pkey" PRIMARY KEY ("initiative_id", "project_id")
);
CREATE INDEX "initiative_projects_project_id_idx" ON "initiative_projects"("project_id");
ALTER TABLE "initiative_projects" ADD CONSTRAINT "initiative_projects_initiative_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "initiative_projects" ADD CONSTRAINT "initiative_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
