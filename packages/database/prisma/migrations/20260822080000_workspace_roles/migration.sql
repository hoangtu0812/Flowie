CREATE TYPE "WorkspaceMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
ALTER TABLE "workspace_members" ADD COLUMN "role" "WorkspaceMemberRole" NOT NULL DEFAULT 'MEMBER';
UPDATE "workspace_members" AS member
SET "role" = 'OWNER'
FROM "workspaces" AS workspace
INNER JOIN "organizations" AS organization ON organization.id = workspace.organization_id
WHERE member.workspace_id = workspace.id AND member.user_id = organization.owner_id;
