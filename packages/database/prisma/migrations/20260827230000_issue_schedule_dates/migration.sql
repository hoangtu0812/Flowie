-- Issue schedule boundaries are independent from a due date: they describe
-- the intended work window rather than the deadline for completing the issue.
ALTER TABLE "issues"
  ADD COLUMN "start_date" TIMESTAMP(3),
  ADD COLUMN "target_date" TIMESTAMP(3);
