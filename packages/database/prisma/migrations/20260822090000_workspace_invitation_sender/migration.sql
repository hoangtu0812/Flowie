ALTER TABLE "workspace_members"
  ADD CONSTRAINT "workspace_members_invited_by_fkey"
  FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
