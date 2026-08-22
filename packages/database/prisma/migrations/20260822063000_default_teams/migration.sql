-- Every workspace needs at least one real team. This repairs workspaces created
-- before teams were introduced and gives their organization owner lead access.
WITH workspaces_without_teams AS (
   SELECT workspace.id AS workspace_id, organization.owner_id
   FROM "workspaces" AS workspace
   INNER JOIN "organizations" AS organization ON organization.id = workspace.organization_id
   WHERE NOT EXISTS (
      SELECT 1 FROM "teams" AS team WHERE team.workspace_id = workspace.id
   )
), inserted_teams AS (
   INSERT INTO "teams" ("id", "workspace_id", "name", "identifier", "description", "updated_at")
   SELECT
      'general-' || md5(workspace_id || '-general'),
      workspace_id,
      'General',
      'GEN',
      'Default team for this workspace.',
      CURRENT_TIMESTAMP
   FROM workspaces_without_teams
   ON CONFLICT ("workspace_id", "identifier") DO NOTHING
   RETURNING "id", "workspace_id"
)
INSERT INTO "team_members" ("team_id", "user_id", "role")
SELECT inserted_teams.id, workspaces_without_teams.owner_id, 'LEAD'::"TeamMemberRole"
FROM inserted_teams
INNER JOIN workspaces_without_teams ON workspaces_without_teams.workspace_id = inserted_teams.workspace_id
ON CONFLICT ("team_id", "user_id") DO NOTHING;
