-- AlterTable
ALTER TABLE "issues" ADD COLUMN "reporter_id" TEXT;

-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN "teams_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "issues_reporter_id_idx" ON "issues"("reporter_id");

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
