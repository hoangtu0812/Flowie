-- Preserve existing estimates while promoting issue effort to fractional mandays.
ALTER TABLE "issues" RENAME COLUMN "estimate" TO "estimated_effort";
ALTER TABLE "issues"
  ALTER COLUMN "estimated_effort" TYPE DOUBLE PRECISION
  USING "estimated_effort"::DOUBLE PRECISION;
ALTER TABLE "issues" ADD COLUMN "actual_effort" DOUBLE PRECISION;
