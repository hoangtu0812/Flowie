ALTER TABLE "projects"
  ADD CONSTRAINT "projects_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
