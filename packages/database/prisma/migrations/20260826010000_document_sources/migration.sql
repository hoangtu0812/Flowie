ALTER TABLE "documents"
ADD COLUMN "source_type" TEXT NOT NULL DEFAULT 'flowie',
ADD COLUMN "source_url" TEXT;
