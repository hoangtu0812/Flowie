-- Rename Flowie's ambiguous internal document type to the user-facing Markdown type.
UPDATE "documents" SET "source_type" = 'markdown' WHERE "source_type" = 'flowie';

ALTER TABLE "documents"
ALTER COLUMN "source_type" SET DEFAULT 'markdown';
