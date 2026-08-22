-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "project_id" TEXT;

-- CreateIndex
CREATE INDEX "activities_project_id_created_at_idx" ON "activities"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
