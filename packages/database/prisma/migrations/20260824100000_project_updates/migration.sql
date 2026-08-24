CREATE TABLE "project_subscriptions" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_subscriptions_pkey" PRIMARY KEY ("project_id", "user_id")
);

CREATE INDEX "project_subscriptions_user_id_created_at_idx"
ON "project_subscriptions"("user_id", "created_at");

ALTER TABLE "project_subscriptions"
ADD CONSTRAINT "project_subscriptions_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_subscriptions"
ADD CONSTRAINT "project_subscriptions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "project_updates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_updates_project_id_created_at_idx"
ON "project_updates"("project_id", "created_at");

CREATE INDEX "project_updates_workspace_id_created_at_idx"
ON "project_updates"("workspace_id", "created_at");

ALTER TABLE "project_updates"
ADD CONSTRAINT "project_updates_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_updates"
ADD CONSTRAINT "project_updates_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_updates"
ADD CONSTRAINT "project_updates_author_id_fkey"
FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
