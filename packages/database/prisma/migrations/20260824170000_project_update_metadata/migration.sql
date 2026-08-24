ALTER TABLE "project_updates"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'update',
ADD COLUMN "health" TEXT;
