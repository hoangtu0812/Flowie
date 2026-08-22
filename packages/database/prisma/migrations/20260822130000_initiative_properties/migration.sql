ALTER TABLE "initiatives"
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "health" TEXT NOT NULL DEFAULT 'no-update',
  ADD COLUMN "icon" TEXT DEFAULT '🎯',
  ADD COLUMN "owner_id" TEXT;

CREATE INDEX "initiatives_owner_id_idx" ON "initiatives"("owner_id");

ALTER TABLE "initiatives"
  ADD CONSTRAINT "initiatives_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
