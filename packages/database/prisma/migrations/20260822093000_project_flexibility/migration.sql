CREATE TYPE "ProjectType" AS ENUM ('GENERAL', 'PRODUCT', 'MARKETING', 'OPERATIONS', 'EVENT', 'CLIENT', 'RESEARCH', 'CUSTOM');
CREATE TYPE "ProjectCustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'URL');

ALTER TABLE "projects" ADD COLUMN "type" "ProjectType" NOT NULL DEFAULT 'GENERAL';

CREATE TABLE "project_custom_fields" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "ProjectCustomFieldType" NOT NULL,
  "description" TEXT,
  "options" JSONB,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_custom_fields_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_custom_fields_workspace_id_name_key" ON "project_custom_fields"("workspace_id", "name");
CREATE INDEX "project_custom_fields_workspace_id_position_idx" ON "project_custom_fields"("workspace_id", "position");
ALTER TABLE "project_custom_fields" ADD CONSTRAINT "project_custom_fields_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "project_custom_field_values" (
  "project_id" TEXT NOT NULL,
  "field_id" TEXT NOT NULL,
  "value" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_custom_field_values_pkey" PRIMARY KEY ("project_id", "field_id")
);
CREATE INDEX "project_custom_field_values_field_id_idx" ON "project_custom_field_values"("field_id");
ALTER TABLE "project_custom_field_values" ADD CONSTRAINT "project_custom_field_values_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_custom_field_values" ADD CONSTRAINT "project_custom_field_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "project_custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "project_milestones" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "target_date" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_milestones_project_id_position_idx" ON "project_milestones"("project_id", "position");
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "project_templates" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "ProjectType" NOT NULL DEFAULT 'GENERAL',
  "config" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_templates_workspace_id_name_key" ON "project_templates"("workspace_id", "name");
CREATE INDEX "project_templates_workspace_id_idx" ON "project_templates"("workspace_id");
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
