-- Built-in skills use stable registry keys. User-authored skills keep their
-- own name and instructions so they can travel with the user across workspaces.
ALTER TABLE "user_agent_skills"
    ADD COLUMN "name" TEXT,
    ADD COLUMN "description" TEXT,
    ADD COLUMN "instructions" TEXT;
