-- AlterTable
ALTER TABLE "sharepoint_connections" ADD COLUMN     "publish_attachments" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "attachment_publications" (
    "attachment_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "path" TEXT,
    "item_id" TEXT,
    "web_url" TEXT,
    "published_at" TIMESTAMP(3),
    "attempted_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "attachment_publications_pkey" PRIMARY KEY ("attachment_id")
);

-- CreateIndex
CREATE INDEX "attachment_publications_workspace_id_idx" ON "attachment_publications"("workspace_id");

-- AddForeignKey
ALTER TABLE "attachment_publications" ADD CONSTRAINT "attachment_publications_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_publications" ADD CONSTRAINT "attachment_publications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
