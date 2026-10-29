-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "sharepoint_folder_url" TEXT;

-- CreateTable
CREATE TABLE "document_publications" (
    "document_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "version" INTEGER,
    "path" TEXT,
    "item_id" TEXT,
    "web_url" TEXT,
    "published_at" TIMESTAMP(3),
    "attempted_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "document_publications_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "sharepoint_connections" (
    "workspace_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sharepoint_connections_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateIndex
CREATE INDEX "document_publications_workspace_id_idx" ON "document_publications"("workspace_id");

-- AddForeignKey
ALTER TABLE "document_publications" ADD CONSTRAINT "document_publications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_publications" ADD CONSTRAINT "document_publications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sharepoint_connections" ADD CONSTRAINT "sharepoint_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

