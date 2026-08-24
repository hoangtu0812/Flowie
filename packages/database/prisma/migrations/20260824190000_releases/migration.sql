CREATE TABLE "releases" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "target_date" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "release_projects" (
    "release_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "release_projects_pkey" PRIMARY KEY ("release_id", "project_id")
);

CREATE UNIQUE INDEX "releases_workspace_id_version_key"
ON "releases"("workspace_id", "version");

CREATE INDEX "releases_workspace_id_archived_at_idx"
ON "releases"("workspace_id", "archived_at");

CREATE INDEX "release_projects_project_id_idx"
ON "release_projects"("project_id");

ALTER TABLE "releases"
ADD CONSTRAINT "releases_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "releases"
ADD CONSTRAINT "releases_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "release_projects"
ADD CONSTRAINT "release_projects_release_id_fkey"
FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "release_projects"
ADD CONSTRAINT "release_projects_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
