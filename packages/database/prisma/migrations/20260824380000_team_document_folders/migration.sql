-- CreateTable
CREATE TABLE "document_folders" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📁',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "documents"
ADD COLUMN "folder_id" TEXT,
ADD COLUMN "icon" TEXT NOT NULL DEFAULT '📄',
ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Seed one stable default folder for every existing team.
INSERT INTO "document_folders" (
    "id",
    "workspace_id",
    "team_id",
    "name",
    "icon",
    "position",
    "created_at",
    "updated_at"
)
SELECT
    'team-documents-' || "id",
    "workspace_id",
    "id",
    'Team documents',
    '📁',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "teams";

-- Existing workspace-only documents remain outside a folder.
UPDATE "documents"
SET "folder_id" = 'team-documents-' || "team_id"
WHERE "team_id" IS NOT NULL;

-- Preserve a deterministic order for existing documents.
WITH ranked_documents AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "folder_id"
            ORDER BY "created_at" ASC, "id" ASC
        )::INTEGER - 1 AS "position"
    FROM "documents"
    WHERE "folder_id" IS NOT NULL
)
UPDATE "documents" AS document
SET "position" = ranked_documents."position"
FROM ranked_documents
WHERE document."id" = ranked_documents."id";

-- CreateIndex
CREATE UNIQUE INDEX "document_folders_team_id_name_key" ON "document_folders"("team_id", "name");

-- CreateIndex
CREATE INDEX "document_folders_workspace_id_team_id_position_idx" ON "document_folders"("workspace_id", "team_id", "position");

-- CreateIndex
CREATE INDEX "documents_folder_id_pinned_position_idx" ON "documents"("folder_id", "pinned", "position");

-- AddForeignKey
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
