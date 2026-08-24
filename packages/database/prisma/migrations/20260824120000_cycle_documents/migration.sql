CREATE TABLE "cycle_documents" (
    "cycle_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cycle_documents_pkey" PRIMARY KEY ("cycle_id", "document_id")
);

CREATE INDEX "cycle_documents_document_id_idx" ON "cycle_documents"("document_id");

ALTER TABLE "cycle_documents"
ADD CONSTRAINT "cycle_documents_cycle_id_fkey"
FOREIGN KEY ("cycle_id") REFERENCES "cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cycle_documents"
ADD CONSTRAINT "cycle_documents_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
