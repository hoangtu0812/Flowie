-- Folders form a tree under a team and may belong to a project; names are unique per parent.
ALTER TABLE "document_folders" ADD COLUMN "parent_id" TEXT;
ALTER TABLE "document_folders" ADD COLUMN "project_id" TEXT;
ALTER TABLE "document_folders" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "document_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX "document_folders_team_id_name_key";
CREATE UNIQUE INDEX "document_folders_team_id_parent_id_name_key" ON "document_folders"("team_id", "parent_id", "name");
CREATE INDEX "document_folders_project_id_idx" ON "document_folders"("project_id");

-- Documents carry a type (FDS, TDS, ...) and a review status.
ALTER TABLE "documents" ADD COLUMN "doc_type" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "documents" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT';
