CREATE TABLE "initiative_label_links" (
    "initiative_id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "initiative_label_links_pkey" PRIMARY KEY ("initiative_id", "label_id")
);

CREATE INDEX "initiative_label_links_label_id_idx" ON "initiative_label_links"("label_id");

ALTER TABLE "initiative_label_links"
ADD CONSTRAINT "initiative_label_links_initiative_id_fkey"
FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "initiative_label_links"
ADD CONSTRAINT "initiative_label_links_label_id_fkey"
FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
