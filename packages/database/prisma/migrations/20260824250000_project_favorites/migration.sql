CREATE TABLE "project_favorites" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_favorites_pkey" PRIMARY KEY ("project_id", "user_id")
);

CREATE INDEX "project_favorites_user_id_created_at_idx" ON "project_favorites"("user_id", "created_at");

ALTER TABLE "project_favorites"
ADD CONSTRAINT "project_favorites_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_favorites"
ADD CONSTRAINT "project_favorites_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
