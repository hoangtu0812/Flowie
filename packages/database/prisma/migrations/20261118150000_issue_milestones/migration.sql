-- Milestone of an issue (DTD-946). Additive only: a nullable column, its index and foreign key;
-- existing issues start without a milestone. Deleting a milestone sets the column to NULL.
-- VI: Milestone của issue (DTD-946). Chỉ thêm mới: một cột cho phép NULL, index và khoá ngoại;
-- VI: issue hiện có bắt đầu không có milestone. Xoá milestone thì cột về NULL.
-- AlterTable
ALTER TABLE "issues" ADD COLUMN "milestone_id" TEXT;

-- CreateIndex
CREATE INDEX "issues_milestone_id_idx" ON "issues"("milestone_id");

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "project_milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
