CREATE TABLE "issue_releases" (
    "release_id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_releases_pkey" PRIMARY KEY ("release_id", "issue_id")
);

CREATE INDEX "issue_releases_issue_id_idx" ON "issue_releases"("issue_id");

ALTER TABLE "issue_releases"
ADD CONSTRAINT "issue_releases_release_id_fkey"
FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_releases"
ADD CONSTRAINT "issue_releases_issue_id_fkey"
FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
